"""日報に添付する現場写真を、Dataverse の画像列（${PUBLISHER_PREFIX}_reportphoto.${PUBLISHER_PREFIX}_photo）に登録できる形にする。

Teams で添付された画像ファイルを読み、長辺 1600px 以内の JPEG に縮小して base64 にする。
撮影日時（EXIF DateTimeOriginal）は取り出してから、位置情報を含むメタデータは捨てる（再エンコードで除去）。

    python photo_payload.py --file <画像ファイル> [--max-edge 1600] [--quality 82]

出力（JSON 1 行）: {"base64", "mime", "width", "height", "bytes", "sha256", "takenOn"|null, "resized", "metadataRemoved"}
エラー時は {"error": "..."} を出して終了コード 1。
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import sys
from datetime import datetime
from pathlib import Path

MAX_BYTES = 9 * 1024 * 1024  # 画像列の上限（10 MB）より少し小さくする
JPEG, PNG = b"\xff\xd8", b"\x89PNG"


def _taken_on(image) -> str | None:
    try:
        exif = image.getexif()
        raw = exif.get_ifd(0x8769).get(0x9003) or exif.get(0x0132)  # DateTimeOriginal / DateTime
        return datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S").isoformat() if raw else None
    except Exception:  # noqa: BLE001 — EXIF が壊れていても写真の登録は止めない
        return None


def build_payload(data: bytes, max_edge: int = 1600, quality: int = 82) -> dict:
    if not data:
        raise ValueError("画像ファイルが空です")
    try:
        from PIL import Image, ImageOps
    except ImportError:
        # Pillow が無い環境: 縮小もメタデータ除去もできないため、JPEG / PNG をそのまま使う（上限内に限る）
        if not (data.startswith(JPEG) or data.startswith(PNG)):
            raise ValueError("JPEG / PNG 以外の画像は変換できません（Pillow がありません）")
        if len(data) > MAX_BYTES:
            raise ValueError("画像が大きすぎます（Pillow が無いため縮小できません）")
        return {
            "base64": base64.b64encode(data).decode("ascii"), "mime": "image/jpeg" if data.startswith(JPEG) else "image/png",
            "width": None, "height": None, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "takenOn": None, "resized": False, "metadataRemoved": False,
        }
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as error:  # noqa: BLE001
        raise ValueError(f"画像として読めません: {error}") from error
    taken = _taken_on(image)
    image = ImageOps.exif_transpose(image)  # 縦横の向きを EXIF に合わせてから捨てる
    if image.mode not in ("RGB", "L"):
        rgba = image.convert("RGBA")
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    original = image.size
    image.thumbnail((max_edge, max_edge))
    out = b""
    for q in (quality, 72, 60, 50):
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, "JPEG", quality=q, optimize=True)
        out = buffer.getvalue()
        if len(out) <= MAX_BYTES:
            break
    else:
        raise ValueError("画像を上限以下に縮小できません")
    return {
        "base64": base64.b64encode(out).decode("ascii"), "mime": "image/jpeg",
        "width": image.size[0], "height": image.size[1], "bytes": len(out), "sha256": hashlib.sha256(out).hexdigest(),
        "takenOn": taken, "resized": image.size != original, "metadataRemoved": True,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--file", required=True)
    parser.add_argument("--max-edge", type=int, default=1600)
    parser.add_argument("--quality", type=int, default=82)
    args = parser.parse_args()
    try:
        payload = build_payload(Path(args.file).read_bytes(), args.max_edge, args.quality)
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
