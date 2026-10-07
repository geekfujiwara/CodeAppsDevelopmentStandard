"""
実写 PBR 材質ライブラリ（CC0）を取得し、Code App と Blender が共有する形式で同梱する。

  python scripts/fetch_materials.py            # 取得 → 変換 → public/materials/ と src/data/material-library.json を生成
  python scripts/fetch_materials.py --check    # 取得せず、同梱済みファイルとマニフェストを検証だけする

出典: ambientCG（https://ambientcg.com、CC0 1.0）。クレジット不要だが、マニフェストに出典 URL とライセンスを残す。

出力
  public/materials/<slot>/color.jpg     … 色（sRGB、長辺 1024px）
  public/materials/<slot>/normal.jpg    … 法線（OpenGL 規約 = +Y、512px）
  public/materials/<slot>/rough.jpg     … 粗さ（512px）
  src/data/material-library.json        … スロット → 実寸（m）・平均色（リニア）・回転・ライセンス

平均色（リニア）は「ユーザーが選んだ色 / 平均色」をマテリアル色に掛けて、写真の質感を保ったまま色だけ合わせるために使う。
tint=luminance のスロット（塗装・金属・屋根材）は色テクスチャをグレーにして同梱する。写真の色相が残っていると、
色比で掛けたときに黄ばみ・緑かぶりが出る（例: 黄色い羽目板 × 生成り色 → 黄緑）。ratio は焼きむら・木目の色差を残したい素材だけ
（Three.js: material.color、Blender: Multiply ノード。どちらも同じ値を使うので見え方が揃う）。
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "materials"
MANIFEST = ROOT / "src" / "data" / "material-library.json"

# スロット = BuildingSpec の仕上げ材キー（wall:siding など）。tile = テクスチャ 1 枚の実寸（m）。
# ambientCG の dimensionX が 0（未登録）の素材は、テクスチャ内の繰り返し（板幅・目地）を数えて実寸を決めた。
LIBRARY: list[dict] = [
    {"slot": "wall:siding", "asset": "WoodSiding009", "tile": 1.6, "note": "横張りの羽目板。窯業系サイディングの代表として色合わせで使う"},
    {"slot": "wall:plaster", "asset": "Plaster001", "tile": 2.0, "note": "塗り壁"},
    {"slot": "wall:brick", "asset": "Bricks101", "tile": 1.2, "tint": "ratio", "note": "レンガタイル（焼きむらを残すため色比で合わせる）"},
    {"slot": "wall:wood", "asset": "WoodSiding008", "tile": 1.6, "rotate": 90, "note": "板張り。縦張りにするため 90° 回転"},
    {"slot": "wall:metal", "asset": "CorrugatedSteel005", "tile": 1.2, "note": "ガルバリウム波板・角波"},
    {"slot": "roof:slate", "asset": "RoofingTiles003", "tile": 1.6, "note": "化粧スレート相当（平板の段葺き）"},
    {"slot": "roof:kawara", "asset": "RoofingTiles006", "tile": 3.2, "note": "瓦（波形）。色は利用者の屋根色で乗算する"},
    {"slot": "roof:metal", "asset": "CorrugatedSteel004", "tile": 1.6, "note": "立平葺き相当（流れ方向の筋）"},
    {"slot": "floor:oak", "asset": "WoodFloor051", "tile": 1.8, "tint": "ratio", "glossy": True, "note": "フローリング（ウレタン塗装の艶。木目の色差を残す）"},
    {"slot": "floor:tile", "asset": "Tiles143", "tile": 2.0, "tint": "ratio", "glossy": True, "note": "大判タイル（磨き）"},
    {"slot": "grass", "asset": "Grass004", "tile": 1.4, "tint": "ratio", "minRough": 0.8, "normalStrength": 0.35, "specular": 0.1, "albedoScale": 0.55, "note": "芝（選ばれた色は明るすぎるので 0.55 倍、粗さの下限 0.8、法線と鏡面反射を弱めないと低い角度で白く光る）"},
    {"slot": "concrete", "asset": "Concrete034", "tile": 2.2, "note": "土間・基礎・縁石"},
    {"slot": "road", "asset": "Asphalt033", "tile": 2.5, "note": "道路"},
]

COLOR_PX = 1024
DETAIL_PX = 512
# 同梱サイズの上限（Code Apps のパッケージを重くしすぎない）。超えたら失敗させる
BUDGET_PER_SLOT = 600_000
BUDGET_TOTAL = 6_000_000
# 色相のばらつきの上限（chroma_spread）。草など元の色を活かす素材は keepColor で除外する
CHROMA_LIMIT = 0.06
# 非金属の建材の粗さ平均の下限。これより低い素材は空を映して白っぽく見える（磨いた床など艶のある素材は LIBRARY に glossy: True）
MIN_MEAN_ROUGH = 0.45


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def fetch_zip(asset: str) -> zipfile.ZipFile:
    url = f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"
    req = urllib.request.Request(url, headers={"User-Agent": "perse3d-material-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    return zipfile.ZipFile(io.BytesIO(data))


def pick(z: zipfile.ZipFile, suffix: str) -> Image.Image:
    name = next((n for n in z.namelist() if n.endswith(suffix)), None)
    if not name:
        raise RuntimeError(f"{suffix} が zip にありません: {z.namelist()}")
    return Image.open(io.BytesIO(z.read(name)))


def average_linear(img: Image.Image) -> list[float]:
    small = img.convert("RGB").resize((64, 64), Image.BILINEAR)
    px = list(small.get_flattened_data()) if hasattr(small, "get_flattened_data") else list(small.getdata())
    n = len(px)
    return [round(sum(srgb_to_linear(p[i] / 255) for p in px) / n, 5) for i in range(3)]


def chroma_spread(img: Image.Image) -> float:
    """色合わせ（利用者の色で乗算）で破綻する、色相がばらつく素材（錆・苔・塗装剥げ）を検出する指標。
    各画素の色度（r, g を明るさで正規化）の標準偏差。単色系の素材は 0.03 前後、錆や苔が混じると 0.06 を超える"""
    small = img.convert("RGB").resize((64, 64), Image.BILINEAR)
    px = list(small.get_flattened_data()) if hasattr(small, "get_flattened_data") else list(small.getdata())
    rs, gs = [], []
    for r, g, b in px:
        s = r + g + b + 1e-6
        rs.append(r / s)
        gs.append(g / s)
    def sd(v):
        m = sum(v) / len(v)
        return (sum((x - m) ** 2 for x in v) / len(v)) ** 0.5
    return round((sd(rs) ** 2 + sd(gs) ** 2) ** 0.5, 4)


def save_jpg(img: Image.Image, path: Path, size: int, quality: int, mode: str = "RGB") -> int:
    img = img.convert(mode).resize((size, size), Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    return path.stat().st_size


def build() -> dict:
    entries = []
    for item in LIBRARY:
        slot = item["slot"]
        folder = OUT_DIR / slot.replace(":", "-")
        print(f"[fetch] {slot} <- {item['asset']}", flush=True)
        z = fetch_zip(item["asset"])
        color = pick(z, "_Color.jpg")
        tint = item.get("tint", "luminance")
        if tint == "luminance":
            # 塗装・金属・屋根材は写真の色相を捨て、明暗（陰影・目地）だけを残す。利用者の色をそのまま掛けられる
            color = color.convert("L").convert("RGB")
        normal = pick(z, "_NormalGL.jpg")
        rough = pick(z, "_Roughness.jpg")
        if item.get("minRough"):
            # 粗さの下限を焼き込む（素材ごとに粗さの基準がばらつくため、屋外の非金属が鏡面になるのを防ぐ）
            lo = int(item["minRough"] * 255)
            rough = rough.convert("L").point(lambda v: lo + v * (255 - lo) // 255)
        size = save_jpg(color, folder / "color.jpg", COLOR_PX, 80)
        size += save_jpg(normal, folder / "normal.jpg", DETAIL_PX, 85)
        size += save_jpg(rough, folder / "rough.jpg", DETAIL_PX, 80, "L")
        entries.append({
            **{k: item[k] for k in ("slot", "asset", "tile", "note")},
            "rotate": item.get("rotate", 0),
            "tint": item.get("tint", "luminance"),
            "normalStrength": item.get("normalStrength", 1.0),
            "specular": item.get("specular", 0.5),
            "albedoScale": item.get("albedoScale", 1.0),
            **({"keepColor": True} if item.get("keepColor") else {}),
            **({"glossy": True} if item.get("glossy") else {}),
            "path": f"materials/{slot.replace(':', '-')}",
            "avgLinear": average_linear(color),
            "chromaSpread": chroma_spread(color),
            "bytes": size,
            "license": "CC0-1.0",
            "source": f"https://ambientcg.com/view?id={item['asset']}",
        })
    manifest = {
        "version": 1,
        "_comment": "scripts/fetch_materials.py が生成する。手で編集しない。Code App（src/lib/material-library.ts）と Blender（blender/materials.py）が共有する",
        "materials": entries,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return manifest


def check(manifest: dict) -> list[str]:
    """同梱物の検証（共通利用の契約: 実寸・平均色・ライセンス・ファイル・サイズ上限）"""
    errors: list[str] = []
    total = 0
    slots = set()
    for e in manifest.get("materials", []):
        s = e.get("slot", "?")
        if s in slots:
            errors.append(f"{s}: スロットが重複しています")
        slots.add(s)
        if not (0.1 <= float(e.get("tile", 0)) <= 20):
            errors.append(f"{s}: tile（実寸 m）が範囲外: {e.get('tile')}")
        avg = e.get("avgLinear") or []
        if len(avg) != 3 or not all(0.0005 < v <= 1 for v in avg):
            errors.append(f"{s}: avgLinear が不正（色合わせで 0 除算になる）: {avg}")
        if e.get("license") != "CC0-1.0" or not str(e.get("source", "")).startswith("https://"):
            errors.append(f"{s}: ライセンス・出典が記録されていません")
        if float(e.get("chromaSpread", 1)) > CHROMA_LIMIT and not e.get("keepColor"):
            errors.append(f"{s}: 色相のばらつき {e.get('chromaSpread')} が大きく、利用者の色で乗算すると錆・苔などが残る（上限 {CHROMA_LIMIT}）")
        if not (0.2 <= float(e.get("albedoScale", 1.0)) <= 1.5):
            errors.append(f"{s}: albedoScale は 0.2〜1.5")
        if e.get("tint") not in ("luminance", "ratio"):
            errors.append(f"{s}: tint は luminance（明暗のみ）か ratio（色比）")
        if e.get("tint") == "luminance" and float(e.get("chromaSpread", 1)) > 0.001:
            errors.append(f"{s}: luminance なのに色テクスチャがグレーになっていません（chromaSpread {e.get('chromaSpread')}）")
        if e.get("rotate", 0) not in (0, 90, 180, 270):
            errors.append(f"{s}: rotate は 0/90/180/270 のみ")
        folder = ROOT / "public" / e.get("path", "")
        size = 0
        for name, px in (("color.jpg", COLOR_PX), ("normal.jpg", DETAIL_PX), ("rough.jpg", DETAIL_PX)):
            f = folder / name
            if not f.is_file():
                errors.append(f"{s}: {f.relative_to(ROOT)} がありません")
                continue
            size += f.stat().st_size
            with Image.open(f) as im:
                w, h = im.size
            if w != h or w & (w - 1) or w > px:
                errors.append(f"{s}: {name} は {px}px 以下の 2 の累乗の正方形にする（実際 {w}x{h}）")
        rough_f = folder / "rough.jpg"
        if rough_f.is_file() and not s.endswith(":metal") and not e.get("glossy"):
            with Image.open(rough_f) as im:
                g = im.convert("L").resize((32, 32))
                vals = list(g.get_flattened_data()) if hasattr(g, "get_flattened_data") else list(g.getdata())
            mean = sum(vals) / len(vals) / 255
            if mean < MIN_MEAN_ROUGH:
                errors.append(f"{s}: 粗さの平均 {mean:.2f} が低すぎます（空を映して白く見える）。LIBRARY に minRough を指定する")
        if size > BUDGET_PER_SLOT:
            errors.append(f"{s}: {size:,} bytes が上限 {BUDGET_PER_SLOT:,} を超えています")
        total += size
    if total > BUDGET_TOTAL:
        errors.append(f"合計 {total:,} bytes が上限 {BUDGET_TOTAL:,} を超えています")
    print(f"[check] {len(slots)} slots, {total:,} bytes")
    return errors


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="取得せずに検証だけ行う")
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if args.check else build()
    errors = check(manifest)
    for e in errors:
        print(f"  NG {e}")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
