"""Fail closed on narrated MP4 duration, format, decode, or missing/silent audio."""
import argparse
import json
import math
import re
import subprocess
from pathlib import Path

from common import ffmpeg


def faststart(path):
    atoms = []
    with Path(path).open("rb") as stream:
        length = Path(path).stat().st_size
        while stream.tell() < length:
            beginning = stream.tell()
            header = stream.read(8)
            if len(header) != 8:
                raise ValueError("Truncated MP4 atom header.")
            size, kind = int.from_bytes(header[:4], "big"), header[4:]
            header_size = 8
            if size == 1:
                extended = stream.read(8)
                if len(extended) != 8:
                    raise ValueError("Truncated MP4 extended atom header.")
                size, header_size = int.from_bytes(extended, "big"), 16
            elif size == 0:
                size = length - beginning
            if size < header_size or beginning + size > length:
                raise ValueError("Invalid MP4 atom length.")
            atoms.append(kind)
            stream.seek(beginning + size)
    return b"moov" in atoms and b"mdat" in atoms and atoms.index(b"moov") < atoms.index(b"mdat")


def verify_video(path, maximum=90, language="eng", expected_duration=None):
    result = subprocess.run([ffmpeg(), "-hide_banner", "-i", str(path)],
                            capture_output=True, text=True)
    text = result.stderr
    duration_match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", text)
    if not duration_match:
        raise ValueError("Cannot read the output duration.")
    duration = int(duration_match[1]) * 3600 + int(duration_match[2]) * 60 + float(duration_match[3])
    video = next((line for line in text.splitlines() if "Video:" in line), "")
    audio = next((line for line in text.splitlines() if "Audio:" in line), "")
    decode = subprocess.run(
        [ffmpeg(), "-hide_banner", "-loglevel", "error", "-xerror", "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True)
    volume = subprocess.run(
        [ffmpeg(), "-hide_banner", "-i", str(path), "-map", "0:a:0",
         "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    mean = re.search(r"mean_volume:\s*(-?[\d.]+|-inf) dB", volume.stderr)
    peak = re.search(r"max_volume:\s*(-?[\d.]+|-inf) dB", volume.stderr)
    mean_db, peak_db = float(mean[1]) if mean else -math.inf, float(peak[1]) if peak else -math.inf
    checks = {
        "duration_s": duration,
        "duration_ok": 0 < duration <= maximum,
        "timeline_ok": expected_duration is None or abs(duration - expected_duration) <= .06,
        "resolution_ok": bool(re.search(r"\b1920x1080\b", video)),
        "fps_ok": bool(re.search(r"\b30 fps\b", video)),
        "h264_ok": "Video: h264" in video,
        "aac_default_language_ok": "Audio: aac" in audio and "(default)" in audio and f"({language})" in audio,
        "faststart_ok": faststart(path),
        "full_decode_ok": decode.returncode == 0 and not decode.stderr.strip(),
        "audio_audible_ok": volume.returncode == 0 and mean_db > -60 and -60 < peak_db < 0,
        "mean_db": mean_db if math.isfinite(mean_db) else None,
        "peak_db": peak_db if math.isfinite(peak_db) else None,
    }
    if not all(value for key, value in checks.items() if key.endswith("_ok")):
        raise ValueError("Narrated video verification failed:\n" + json.dumps(checks, indent=2))
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--max-duration", type=float, default=90)
    parser.add_argument("--language", default="eng")
    parser.add_argument("--expected-duration", type=float)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    checks = verify_video(args.video, args.max_duration, args.language, args.expected_duration)
    text = json.dumps(checks, indent=2)
    if args.report:
        args.report.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
