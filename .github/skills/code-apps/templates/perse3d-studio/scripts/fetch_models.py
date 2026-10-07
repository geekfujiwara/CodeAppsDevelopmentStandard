"""家具の 3D モデル（CC0）を取得し、カタログで使える GLB と manifest を作る。

  python scripts/fetch_models.py            # 取得 → Blender で整形 → src/assets/models/*.glb と src/data/model-library.json
  python scripts/fetch_models.py --check    # 同梱物の契約を確認（npm test から実行。ネットワーク・Blender 不要）

manifest の各モデルは家具カタログ（src/data/furniture-catalog.json）のアイテムとして読み込まれる
（TS: src/lib/furniture.ts / Python: blender/furniture.py の load_catalog が統合する）。
読み込めない環境では parts（外形の箱）で表示する。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "assets" / "models"
MANIFEST = ROOT / "src" / "data" / "model-library.json"
CACHE = ROOT / ".tools" / "models-src"
BLENDER = ROOT / ".tools" / "blender-4.5.14-windows-x64" / "blender.exe"
UA = {"User-Agent": "perse3d-studio-asset-fetch"}

# type: カタログのキー / base: 置き換え元（同じ配置ルール） / rot: 正面を +z に向ける回転（度）
MODELS = [
    {"type": "sofaModel", "base": "sofa", "id": "Sofa_01", "label": "ソファ（3D モデル）", "category": "living", "place": "wall", "rot": 0, "fallback": "fabric"},
    {"type": "coffeeTableModel", "base": "coffeeTable", "id": "modern_coffee_table_01", "label": "センターテーブル（3D モデル）", "category": "living", "place": "free", "rot": 90, "fallback": "wood"},
]
MAX_GLB_BYTES = 1_200_000
MAX_TOTAL_BYTES = 3_000_000


def http_json(url: str):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


def download(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        dest.write_bytes(r.read())


def fetch_polyhaven(asset_id: str) -> tuple[Path, dict]:
    files = http_json(f"https://api.polyhaven.com/files/{asset_id}")
    info = http_json(f"https://api.polyhaven.com/info/{asset_id}")
    g = files["gltf"]["1k"]["gltf"]
    base = CACHE / asset_id
    main = base / Path(g["url"]).name
    download(g["url"], main)
    for rel, f in (g.get("include") or {}).items():
        download(f["url"], base / rel)
    meta = {
        "license": "CC0-1.0",
        "author": ", ".join(info.get("authors", {}).keys()),
        "source": f"https://polyhaven.com/a/{asset_id}",
    }
    return main, meta


def normalize(src: Path, out: Path, m: dict) -> dict:
    cmd = [str(BLENDER), "-b", "--factory-startup", "--python", str(ROOT / "blender" / "normalize_model.py"), "--",
           "--in", str(src), "--out", str(out), "--type", m["type"], "--rot", str(m.get("rot", 0)), "--tex", str(m.get("tex", 512))]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    line = next((l for l in res.stdout.splitlines() if l.startswith("NORMALIZED ")), None)
    if res.returncode != 0 or not line:
        sys.stderr.write(res.stdout[-3000:] + res.stderr[-3000:])
        raise SystemExit(f"{m['id']}: Blender での整形に失敗しました")
    return json.loads(line[len("NORMALIZED "):])


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def build() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict = {"_comment": "家具カタログに追加する 3D モデル（scripts/fetch_models.py が生成）。file は src/assets/models/ からの名前", "models": {}}
    for m in MODELS:
        src, meta = fetch_polyhaven(m["id"])
        name = re.sub(r"[^a-z0-9_]+", "_", m["id"].lower()) + ".glb"
        out = OUT_DIR / name
        dims = normalize(src, out, m)
        w, d, h = dims["w"], dims["d"], dims["h"]
        manifest["models"][m["type"]] = {
            "label": m["label"], "category": m["category"], "place": m["place"], "base": m["base"],
            "w": w, "d": d, "h": h,
            "model": {"file": name, **meta, "bytes": out.stat().st_size, "sha256": sha256(out), "polys": dims["polys"], "materials": dims["materials"]},
            # 読み込めないときの代わり（外形の箱）。当たり判定・自動配置は w / d で行う
            "parts": [{"s": "box", "p": [0, round(h / 2, 3), 0], "z": [w, h, d], "r": 0.02, "m": m["fallback"]}],
        }
        print(f"{m['type']}: {name} {out.stat().st_size:,} bytes {w}x{d}x{h}m polys={dims['polys']}")
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def check() -> int:
    errors: list[str] = []
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    total = 0
    for t, it in data["models"].items():
        mdl = it["model"]
        p = OUT_DIR / mdl["file"]
        if not p.exists():
            errors.append(f"{t}: {p.name} がありません")
            continue
        total += p.stat().st_size
        if sha256(p) != mdl["sha256"]:
            errors.append(f"{t}: {p.name} が manifest と一致しません（再取得した場合は fetch_models.py を通す）")
        if p.stat().st_size > MAX_GLB_BYTES:
            errors.append(f"{t}: {p.stat().st_size:,} bytes が上限 {MAX_GLB_BYTES:,} を超えます")
        for k in ("license", "author", "source"):
            if not mdl.get(k):
                errors.append(f"{t}: model.{k} がありません（再配布できるか後から辿れるように）")
        if not str(mdl.get("source", "")).startswith("https://"):
            errors.append(f"{t}: model.source は https の URL にする")
        for k in ("w", "d", "h"):
            if not 0.05 <= float(it[k]) <= 6:
                errors.append(f"{t}: {k}={it[k]} m は家具の寸法として不自然（単位・回転を確認）")
        if not all(m.startswith(f"furn_{t}_") for m in mdl.get("materials", [])):
            errors.append(f"{t}: 材質名は furn_{t}_ で始める")
    if total > MAX_TOTAL_BYTES:
        errors.append(f"合計 {total:,} bytes が上限 {MAX_TOTAL_BYTES:,} を超えます")
    for e in errors:
        print("NG", e)
    print(f"{len(data['models'])} models, {total:,} bytes")
    return 1 if errors else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.exit(check() if a.check else build() or 0)
