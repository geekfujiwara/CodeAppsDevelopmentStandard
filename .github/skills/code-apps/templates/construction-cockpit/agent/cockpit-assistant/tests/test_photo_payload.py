"""photo_payload.py: 縮小・向き補正・撮影日時の取り出し・位置情報の除去・エラー処理を確かめる。"""

from __future__ import annotations

import base64
import io
import json
import subprocess
import sys
from pathlib import Path

import pytest

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

SKILL = Path(__file__).resolve().parents[1] / "skills" / "daily-report-intake"
sys.path.insert(0, str(SKILL))

from photo_payload import MAX_BYTES, build_payload  # noqa: E402


def jpeg_with_exif(size=(4000, 3000), taken="2026:10:06 09:15:30", orientation: int | None = None) -> bytes:
    image = Image.new("RGB", size, (120, 140, 160))
    exif = Image.Exif()
    exif[0x0132] = taken
    exif.get_ifd(0x8769)[0x9003] = taken
    exif.get_ifd(0x8825)[2] = (35.0, 41.0, 0.0)  # GPSLatitude
    if orientation:
        exif[0x0112] = orientation
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", exif=exif, quality=90)
    return buffer.getvalue()


def decode(payload: dict) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(payload["base64"])))


def test_resizes_and_keeps_taken_on_but_removes_gps():
    payload = build_payload(jpeg_with_exif())
    image = decode(payload)
    assert max(image.size) == 1600 and payload["resized"] is True
    assert payload["takenOn"] == "2026-10-06T09:15:30"
    assert payload["metadataRemoved"] is True
    exif = image.getexif()
    assert not exif.get_ifd(0x8825), "位置情報が残っている"
    assert payload["bytes"] == len(base64.b64decode(payload["base64"])) <= MAX_BYTES


def test_applies_orientation_before_removing_exif():
    payload = build_payload(jpeg_with_exif(size=(400, 200), orientation=6))
    assert decode(payload).size == (200, 400)


def test_transparent_png_and_small_image_are_not_upscaled():
    buffer = io.BytesIO()
    Image.new("RGBA", (300, 200), (0, 0, 0, 0)).save(buffer, "PNG")
    payload = build_payload(buffer.getvalue())
    assert payload["mime"] == "image/jpeg" and (payload["width"], payload["height"]) == (300, 200)
    assert payload["resized"] is False and payload["takenOn"] is None


def test_rejects_empty_and_non_image():
    with pytest.raises(ValueError):
        build_payload(b"")
    with pytest.raises(ValueError, match="画像として読めません"):
        build_payload(b"not an image at all")


def test_cli_outputs_json_and_error(tmp_path: Path):
    good = tmp_path / "site.jpg"
    good.write_bytes(jpeg_with_exif(size=(800, 600)))
    out = subprocess.run([sys.executable, str(SKILL / "photo_payload.py"), "--file", str(good)], capture_output=True, text=True, encoding="utf-8")
    assert out.returncode == 0 and json.loads(out.stdout)["width"] == 800
    bad = tmp_path / "bad.jpg"
    bad.write_bytes(b"xx")
    out = subprocess.run([sys.executable, str(SKILL / "photo_payload.py"), "--file", str(bad)], capture_output=True, text=True, encoding="utf-8")
    assert out.returncode == 1 and "error" in json.loads(out.stdout)
