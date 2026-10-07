"""材質ライブラリの色テクスチャを 1 枚のシートに並べる（目視確認用）。出力: .tools/matlib_sheet.png"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
m = json.loads((ROOT / "src" / "data" / "material-library.json").read_text(encoding="utf-8"))
W = 256
cols = 5
rows = (len(m["materials"]) + cols - 1) // cols
out = Image.new("RGB", (W * cols, (W + 18) * rows), "white")
d = ImageDraw.Draw(out)
for i, e in enumerate(m["materials"]):
    im = Image.open(ROOT / "public" / e["path"] / "color.jpg").convert("RGB").resize((W, W))
    if e["rotate"]:
        im = im.rotate(-e["rotate"])
    x, y = (i % cols) * W, (i // cols) * (W + 18)
    out.paste(im, (x, y))
    d.text((x + 4, y + W + 3), f"{e['slot']} {e['tile']}m", fill="black")
(ROOT / ".tools").mkdir(exist_ok=True)
out.save(ROOT / ".tools" / "matlib_sheet.png")
print(out.size)
