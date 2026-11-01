"""Resolve writable job paths independently of the read-only installed skill."""

import argparse
import os
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(add_help=False)
parser.add_argument('--project', type=Path, default=Path(os.environ.get('VIDEO_PROJECT_DIR', '.')))
options, _ = parser.parse_known_args()
ROOT = options.project.resolve()
if ROOT.exists() and not ROOT.is_dir():
    raise ValueError(f'Video project must be a directory: {ROOT}')

settings = ROOT / '.env'
if settings.is_file():
    for line in settings.read_text(encoding='utf-8').splitlines():
        if not line.strip() or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key in ('VIDEO_CREATOR_FONT', 'VIDEO_EDITOR_FONT', 'DEMO_VIDEO_FONT') and value:
            os.environ.setdefault(key, str((ROOT / value).resolve()))
