"""Import actual screen recordings into the timestamped frame playback format."""

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image
from video_media import ffmpeg, probe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--fps', type=int, default=5)
    parser.add_argument('--start', type=float, default=0)
    parser.add_argument('--end', type=float)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.fps <= 0:
        parser.error('--fps must be positive')
    info = probe(str(args.video))
    if not info['width'] or not info['height'] or not info['fps']:
        parser.error('Import requires a real video stream with dimensions and native frame rate')
    end = info['duration'] if args.end is None else args.end
    if not 0 <= args.start < end <= info['duration']:
        parser.error('Require 0 <= start < end <= source duration')
    if args.fps > info['fps']:
        parser.error('--fps must not exceed the native source frame rate')
    output = args.output or args.video.with_suffix('.frames.json')
    if not output.name.endswith('.frames.json'):
        parser.error('--output must end in .frames.json')
    folder = output.with_name(output.name.removesuffix('.frames.json'))
    if output.exists() or folder.exists():
        parser.error(f'Refusing to mix a new import with existing output: {output}')
    folder.mkdir(parents=True)
    duration = end - args.start
    subprocess.run([
        ffmpeg(), '-v', 'error', '-ss', str(args.start), '-i', str(args.video),
        '-t', str(duration), '-vf', f'fps={args.fps}:round=up:start_time=0',
        '-q:v', '2', str(folder / 'frame-%05d.jpg'),
    ], check=True)
    paths = sorted(folder.glob('frame-*.jpg'))
    frames = []
    for index, path in enumerate(paths):
        at = index / args.fps
        if at >= duration:
            raise ValueError('Imported frame lies outside the requested trim')
        with Image.open(path) as image:
            if image.size != (info['width'], info['height']):
                raise ValueError('Import must retain the native source dimensions')
            size = image.size
        frames.append({
            'path': str(path.resolve()), 'at': at,
            'source_at': args.start + at, 'size': size,
        })
    if len(frames) < 2:
        raise ValueError('The actual recording must contain at least two frames')
    with args.video.open('rb') as source:
        source_hash = hashlib.file_digest(source, 'sha256').hexdigest()
    manifest = {'provenance': 'Actual native screen recording', 'source': str(args.video.resolve()),
                'source_sha256': source_hash, 'source_info': info,
                'trim': {'start': args.start, 'end': end}, 'sample_fps': args.fps,
                'duration': duration, 'frames': frames}
    output.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print(json.dumps({'manifest': str(output), 'frames': len(frames), 'duration': duration}))


if __name__ == '__main__':
    main()