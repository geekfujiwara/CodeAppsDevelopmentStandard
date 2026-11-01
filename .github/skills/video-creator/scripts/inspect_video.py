"""動画の概要を把握する: 情報表示 + コンタクトシート + 指定時刻のフル解像度フレーム。
usage: python inspect_video.py VIDEO OUTDIR [--every 10] [--at 12,45,90]"""
import argparse, os, subprocess, json
from common import ffmpeg, probe, resolve_font, load_font
ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("outdir")
ap.add_argument("--every", type=float, default=10); ap.add_argument("--at", default="")
a = ap.parse_args(); os.makedirs(a.outdir, exist_ok=True)
info = probe(a.video); print(json.dumps(info, ensure_ascii=False))
from PIL import Image, ImageDraw
ts = [round(i*a.every, 2) for i in range(int(info["duration"]//a.every)+1)]
thumbs = []
for t in ts:
    p = os.path.join(a.outdir, f"thumb_{t:07.2f}.png")
    subprocess.run([ffmpeg(), "-v", "error", "-ss", str(t), "-i", a.video, "-frames:v", "1", "-vf", "scale=640:-2", "-y", p])
    if os.path.exists(p): thumbs.append((t, p))
cols = 4; tw, th = Image.open(thumbs[0][1]).size; rows = (len(thumbs)+cols-1)//cols
sheet = Image.new("RGB", (tw*cols, th*rows)); d = ImageDraw.Draw(sheet)
for i, (t, p) in enumerate(thumbs):
    x, y = (i % cols)*tw, (i//cols)*th; sheet.paste(Image.open(p), (x, y))
    d.rectangle([x, y, x+130, y+34], fill=(220, 30, 30)); d.text((x+8, y+6), f"{int(t//60)}:{t%60:05.2f}", fill="white", font_size=22)
sheet.save(os.path.join(a.outdir, "contact_sheet.png")); print("contact sheet:", os.path.join(a.outdir, "contact_sheet.png"))
for t in [float(x) for x in a.at.split(",") if x.strip()]:
    p = os.path.join(a.outdir, f"frame_{t:07.2f}.png")
    subprocess.run([ffmpeg(), "-v", "error", "-ss", str(t), "-i", a.video, "-frames:v", "1", "-y", p]); print("frame:", p)
