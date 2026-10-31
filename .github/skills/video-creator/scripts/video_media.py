"""Probe local recordings explicitly as UTF-8, including Japanese filenames."""

import re
import subprocess
from common import ffmpeg


def probe(path):
    result = subprocess.run(
        [ffmpeg(), '-hide_banner', '-i', str(path)],
        capture_output=True, text=True, encoding='utf-8', check=False,
    )
    output = result.stderr
    duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)', output)
    video = re.search(r'Video: .*?, (\d{2,5})x(\d{2,5})', output)
    fps = re.search(r'([\d.]+) fps', output)
    if not duration or (not video and 'Audio:' not in output):
        raise ValueError(f'Cannot probe media {path}:\n{output}')
    return {
        'duration': int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3]),
        'width': int(video[1]) if video else None, 'height': int(video[2]) if video else None,
        'fps': float(fps[1]) if fps else None, 'has_audio': 'Audio:' in output,
    }
