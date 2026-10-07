"""
3D 資産（材質ライブラリ・GLB）を、共通利用の契約に照らして検証する（Code Apps 用）。

  python validate_3d_assets.py --materials src/data/material-library.json --public public
  python validate_3d_assets.py --glb public/models/house.glb --material-keys exteriorWall,roof,floor
  python validate_3d_assets.py --materials ... --glb ... --max-total-bytes 6000000

検証内容（references/3d-asset-sharing.md の契約）
  材質マニフェスト
    - slot が一意 / tile（1 枚の実寸 m）が 0.1〜20 / avgLinear が 3 要素で 0 より大きい（色合わせの 0 除算防止）
    - license と https の source がある（再配布できるか後から追えるように）
    - tint=luminance なら色テクスチャがグレー（写真の色相が残ると、利用者の色で掛けたとき色かぶりする）
    - 非金属・非光沢の素材の粗さ平均が下限以上（空を映して白く見える素材の検出）
    - テクスチャが 2 の累乗の正方形・上限サイズ以下 / 合計サイズの上限
  GLB
    - 外部 URI を持たない（Code Apps の CSP では読めない）・画像を埋め込まない（blob: URL は既定 CSP で表示できない）
    - Draco / meshopt / KTX2 などの拡張は使わない（Worker が必要）
    - 材質名が指定のキー集合（または --material-prefix の接頭辞）に含まれる（読み込み側で共有材質に差し替えるため）
    - ファイルサイズの上限
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

WORKER_EXTENSIONS = {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "EXT_texture_webp"}


def _image_stats(path: Path):
    try:
        from PIL import Image
    except ImportError:
        return None
    with Image.open(path) as im:
        size = im.size
        small = im.convert("RGB").resize((32, 32))
        px = list(small.get_flattened_data()) if hasattr(small, "get_flattened_data") else list(small.getdata())
    chroma = max(max(p) - min(p) for p in px) / 255
    mean = sum(sum(p) / 3 for p in px) / len(px) / 255
    return {"size": size, "chroma": chroma, "mean": mean}


def check_materials(manifest_path: Path, public_dir: Path, *, max_px: int, max_slot_bytes: int, max_total_bytes: int, min_rough: float) -> tuple[list[str], int]:
    errors: list[str] = []
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    entries = data.get("materials", data if isinstance(data, list) else [])
    seen: set[str] = set()
    total = 0
    for e in entries:
        s = str(e.get("slot", "?"))
        if s in seen:
            errors.append(f"[material] {s}: slot が重複")
        seen.add(s)
        if not (0.1 <= float(e.get("tile", 0) or 0) <= 20):
            errors.append(f"[material] {s}: tile（1 枚の実寸 m）が 0.1〜20 の範囲外: {e.get('tile')}")
        avg = e.get("avgLinear") or []
        if len(avg) != 3 or not all(isinstance(v, (int, float)) and 0 < v <= 1 for v in avg):
            errors.append(f"[material] {s}: avgLinear が不正（色合わせで 0 除算になる）: {avg}")
        if not e.get("license") or not str(e.get("source", "")).startswith("https://"):
            errors.append(f"[material] {s}: license と https の source を記録する")
        folder = public_dir / str(e.get("path", ""))
        size = 0
        for name in ("color.jpg", "normal.jpg", "rough.jpg"):
            f = folder / name
            if not f.is_file():
                errors.append(f"[material] {s}: {f} がありません")
                continue
            size += f.stat().st_size
            st = _image_stats(f)
            if not st:
                continue
            w, h = st["size"]
            if w != h or w & (w - 1) or w > max_px:
                errors.append(f"[material] {s}: {name} は {max_px}px 以下の 2 の累乗の正方形にする（実際 {w}x{h}）")
            if name == "color.jpg" and e.get("tint") == "luminance" and st["chroma"] > 0.02:
                errors.append(f"[material] {s}: tint=luminance なのに色テクスチャに色相が残っています（利用者の色で掛けると色かぶりする）")
            is_glossy = e.get("metallic") or e.get("glossy") or str(s).endswith(":metal")
            if name == "rough.jpg" and not is_glossy and st["mean"] < min_rough:
                errors.append(f"[material] {s}: 粗さの平均 {st['mean']:.2f} < {min_rough}（空を映して白っぽく見える）。粗さの下限を焼き込むか glossy: true を付ける")
        if size > max_slot_bytes:
            errors.append(f"[material] {s}: {size:,} bytes > 上限 {max_slot_bytes:,}")
        total += size
    if total > max_total_bytes:
        errors.append(f"[material] 合計 {total:,} bytes > 上限 {max_total_bytes:,}")
    return errors, total


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, _length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2:
        raise ValueError("glTF 2.0 の GLB ではありません")
    chunk_len, chunk_type = struct.unpack("<I4s", data[12:20])
    if chunk_type != b"JSON":
        raise ValueError("最初のチャンクが JSON ではありません")
    return json.loads(data[20:20 + chunk_len])


def check_glb(path: Path, *, material_keys: set[str] | None, key_prefixes: tuple[str, ...] = (), max_bytes: int, allow_embedded_images: bool = False, strip_blender_suffix: bool = False) -> list[str]:
    errors: list[str] = []
    size = path.stat().st_size
    if size > max_bytes:
        errors.append(f"[glb] {path.name}: {size:,} bytes > 上限 {max_bytes:,}")
    try:
        j = read_glb_json(path)
    except (ValueError, struct.error, json.JSONDecodeError) as ex:
        return errors + [f"[glb] {path.name}: {ex}"]
    for b in j.get("buffers", []):
        if "uri" in b:
            errors.append(f"[glb] {path.name}: 外部バッファ {b['uri'][:60]} を参照している（CSP で読めない。自己完結の GLB にする）")
    for im in j.get("images", []):
        label = im.get("name") or im.get("uri", "")[:40]
        if "uri" in im and not str(im["uri"]).startswith("data:"):
            errors.append(f"[glb] {path.name}: 画像 {label} を外部ファイルとして参照している（CSP で読めない。GLB に埋め込む）")
        elif not allow_embedded_images:
            errors.append(f"[glb] {path.name}: 画像 {label} を埋め込んでいる（GLTFLoader は blob: URL で読むため既定 CSP では表示されない。"
                          "材質を共有ライブラリで差し替えるか、createImageBitmap でデコードするローダーで読み --allow-embedded-images を付ける）")
        elif im.get("mimeType") not in ("image/jpeg", "image/png"):
            errors.append(f"[glb] {path.name}: 画像 {label} の形式 {im.get('mimeType')} は JPEG / PNG にする（KTX2 等は Worker が要る）")
    used = set(j.get("extensionsUsed", [])) | set(j.get("extensionsRequired", []))
    for ext in sorted(used & WORKER_EXTENSIONS):
        errors.append(f"[glb] {path.name}: 拡張 {ext} は Web Worker / 追加デコーダーが必要（既定 CSP で使えない）")
    if material_keys is not None:
        for m in j.get("materials", []):
            name = m.get("name", "")
            if strip_blender_suffix:
                # Blender は同名の材質を作れず "floor.001" にする（オブジェクトごとに複製した材質）。読み込み側が末尾を外す前提
                name = re.sub(r"\.\d{3}$", "", name)
            if name not in material_keys and not name.startswith(key_prefixes):
                errors.append(f"[glb] {path.name}: 材質名 '{name}' が共有キー・許可した接頭辞にない（読み込み側で差し替えられない）")
    return errors


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--materials", type=Path, help="材質マニフェスト JSON")
    ap.add_argument("--public", type=Path, default=Path("public"), help="マニフェストの path の基点（Vite の public）")
    ap.add_argument("--glb", type=Path, action="append", default=[], help="検証する GLB（複数可）")
    ap.add_argument("--material-keys", help="GLB の材質名として許すキー（カンマ区切り）")
    ap.add_argument("--material-prefix", action="append", default=[], help="キーの代わりに許す材質名の接頭辞（例: furn_ = 家具カタログの材質）")
    ap.add_argument("--max-px", type=int, default=1024)
    ap.add_argument("--max-slot-bytes", type=int, default=600_000)
    ap.add_argument("--max-total-bytes", type=int, default=6_000_000)
    ap.add_argument("--max-glb-bytes", type=int, default=8_000_000)
    ap.add_argument("--min-rough", type=float, default=0.45)
    ap.add_argument("--allow-embedded-images", action="store_true", help="埋め込み画像を許す（blob: URL を使わずにデコードするローダーで読む場合）")
    ap.add_argument("--strip-blender-suffix", action="store_true", help="材質名の末尾 .NNN（Blender の複製）を外してキーと照合する（読み込み側も外す場合）")
    a = ap.parse_args(argv)
    if not a.materials and not a.glb:
        ap.error("--materials か --glb を指定する")
    errors: list[str] = []
    if a.materials:
        errs, total = check_materials(a.materials, a.public, max_px=a.max_px, max_slot_bytes=a.max_slot_bytes, max_total_bytes=a.max_total_bytes, min_rough=a.min_rough)
        errors += errs
        print(f"[material] {a.materials}: {total:,} bytes")
    keys = set(k.strip() for k in a.material_keys.split(",")) if a.material_keys else None
    for g in a.glb:
        errors += check_glb(g, material_keys=keys, key_prefixes=tuple(a.material_prefix), max_bytes=a.max_glb_bytes, allow_embedded_images=a.allow_embedded_images, strip_blender_suffix=a.strip_blender_suffix)
        print(f"[glb] {g}: checked")
    for e in errors:
        print(f"  NG {e}")
    print("OK" if not errors else f"NG {len(errors)} 件")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
