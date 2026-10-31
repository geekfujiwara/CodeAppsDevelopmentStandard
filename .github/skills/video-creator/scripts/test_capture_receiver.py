import base64
import json
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import HTTPServer
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image
import capture_receiver as receiver


def png(size=(64, 48)):
    stream = BytesIO()
    Image.new('RGB', size, 'navy').save(stream, format='PNG')
    return stream.getvalue()


class CaptureReceiverTests(unittest.TestCase):
    def test_recording_validation_and_no_overwrite(self):
        data = base64.b64encode(png()).decode('ascii')
        payload = {'frames': [{'timestamp': .1, 'data': data}, {'timestamp': .3, 'data': data}], 'duration': .5}
        with tempfile.TemporaryDirectory() as folder, patch.object(receiver, 'CAPTURE', Path(folder)):
            result = receiver.save_recording('actual-v1.frames', payload)
            self.assertEqual(result['size'], (64, 48))
            manifest = json.loads((Path(folder) / result['file']).read_text())
            self.assertTrue(manifest['frames'][0]['path'].endswith('.png'))
            self.assertAlmostEqual(manifest['frames'][1]['at'], .2)
            with self.assertRaises(FileExistsError):
                receiver.save_recording('actual-v1.frames', payload)
            for timestamp in (.1, float('nan'), -1):
                invalid = {**payload, 'frames': [payload['frames'][0], {'timestamp': timestamp, 'data': data}]}
                with self.assertRaisesRegex(ValueError, 'timestamps'):
                    receiver.save_recording('invalid-v1.frames', invalid)
            changed = {**payload, 'frames': [payload['frames'][0], {'timestamp': .3, 'data': base64.b64encode(png((32, 24))).decode()}]}
            with self.assertRaisesRegex(ValueError, 'dimensions'):
                receiver.save_recording('changed-v1.frames', changed)
            self.assertFalse((Path(folder) / 'invalid-v1').exists())
            self.assertFalse((Path(folder) / 'changed-v1').exists())

    def test_http_saved_dimensions_cors_errors_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(receiver, 'CAPTURE', Path(folder)):
            with HTTPServer(('127.0.0.1', 0), receiver.CaptureHandler) as server:
                thread = threading.Thread(target=server.serve_forever)
                thread.start()
                try:
                    connection = HTTPConnection(*server.server_address, timeout=5)
                    for origin, expected in (('https://example.org', 403), (receiver.RELAY_ORIGIN, 200), (receiver.RELAY_ORIGIN, 409)):
                        connection.request('POST', '/actual-v1.png', body=png(), headers={'Origin': origin})
                        response = connection.getresponse()
                        content = response.read()
                        self.assertEqual(response.status, expected, content)
                        if expected == 200:
                            self.assertEqual(json.loads(content)['size'], [64, 48])
                            self.assertEqual(response.getheader('Access-Control-Allow-Origin'), receiver.RELAY_ORIGIN)
                    connection.close()
                finally:
                    server.shutdown()
                    thread.join()


if __name__ == '__main__':
    unittest.main()
