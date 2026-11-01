"""Receive approved existing-browser captures on loopback, never in the skill folder."""

import argparse
import base64
import json
import math
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from io import BytesIO
from urllib.parse import urlparse

from PIL import Image
from project_paths import ROOT

CAPTURE = ROOT / 'capture'
RELAY_ORIGIN = 'http://127.0.0.1:5191'


def decoded_image(data, formats):
    with Image.open(BytesIO(data)) as image:
        if image.format not in formats:
            raise ValueError(f'Expected {"/".join(formats)}')
        size, extension = image.size, image.format.lower()
        image.verify()
    return size, extension


def save_recording(name, payload):
    frames = payload['frames']
    if not isinstance(frames, list) or not 2 <= len(frames) <= 1500:
        raise ValueError('Recording needs 2 to 1500 real frames')
    folder = CAPTURE / name.removesuffix('.frames')
    path = CAPTURE / f'{name}.json'
    if folder.exists() or path.exists():
        raise FileExistsError('Refusing to overwrite a recording or mix old frames')
    validated, previous, size = [], -1, None
    for frame in frames:
        timestamp = frame['timestamp']
        if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp) or timestamp < 0 or timestamp <= previous:
            raise ValueError('Frame timestamps must be finite, nonnegative and increasing')
        data = base64.b64decode(frame['data'], validate=True)
        dimensions, extension = decoded_image(data, ('JPEG', 'PNG'))
        if size is not None and dimensions != size:
            raise ValueError('Recording dimensions changed')
        size, previous = dimensions, timestamp
        validated.append((timestamp, data, extension))
    duration = payload.get('duration', validated[-1][0] - validated[0][0] + .5)
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or duration <= validated[-1][0] - validated[0][0]:
        raise ValueError('Duration must be finite and cover the last frame')
    folder.mkdir(parents=True, exist_ok=False)
    manifest = {'provenance': 'Approved existing integrated browser / timestamped screen recording', 'frames': [], 'duration': duration}
    for index, (timestamp, data, extension) in enumerate(validated):
        frame_path = folder / f'{index:05d}.{extension}'
        with frame_path.open('xb') as stream:
            stream.write(data)
        manifest['frames'].append({'path': str(frame_path), 'at': timestamp - validated[0][0], 'size': size})
    with path.open('x', encoding='utf-8') as stream:
        json.dump(manifest, stream, indent=2)
    return {'file': path.name, 'frames': len(frames), 'duration': duration, 'size': size}


class CaptureHandler(BaseHTTPRequestHandler):
    def allowed_origin(self):
        return self.headers.get('Origin') == RELAY_ORIGIN

    def do_OPTIONS(self):
        if not self.allowed_origin():
            self.send_error(403, 'Only the approved loopback relay origin is allowed')
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if not self.allowed_origin():
            self.send_error(403, 'Only the approved loopback relay origin is allowed')
            return
        name = self.path.removeprefix('/')
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not re.fullmatch(r'[a-z0-9-]+-v[0-9]+\.(png|frames)', name) or not 0 < length < 100_000_000:
                raise ValueError('Invalid versioned capture name or body size')
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('Incomplete request body')
            if name.endswith('.frames'):
                result = save_recording(name, json.loads(data))
            else:
                if data.startswith(b'{'):
                    data = base64.b64decode(json.loads(data)['data'], validate=True)
                size, _ = decoded_image(data, ('PNG',))
                CAPTURE.mkdir(parents=True, exist_ok=True)
                with (CAPTURE / name).open('xb') as stream:
                    stream.write(data)
                result = {'file': name, 'size': size}
        except FileExistsError as error:
            self.log_error('%s', error)
            self.send_error(409, str(error))
            return
        except (OSError, ValueError, KeyError, TypeError) as error:
            self.log_error('%s', error)
            self.send_error(400, str(error))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(result).encode('utf-8'))

    def end_headers(self):
        if self.allowed_origin():
            self.send_header('Access-Control-Allow-Origin', RELAY_ORIGIN)
        super().end_headers()


def main():
    global CAPTURE, RELAY_ORIGIN
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default=ROOT)
    parser.add_argument('--port', type=int, default=5192)
    parser.add_argument('--relay-origin', default=RELAY_ORIGIN)
    args = parser.parse_args()
    origin = urlparse(args.relay_origin)
    if origin.scheme != 'http' or origin.hostname != '127.0.0.1' or origin.path or origin.query or origin.fragment:
        parser.error('Relay must be an approved HTTP origin on 127.0.0.1, with no path/query')
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535')
    RELAY_ORIGIN = args.relay_origin
    from pathlib import Path
    CAPTURE = Path(args.project).resolve() / 'capture'
    with HTTPServer(('127.0.0.1', args.port), CaptureHandler) as server:
        print(f'Capture receiver ready: http://127.0.0.1:{args.port}; destination={CAPTURE}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
