"""紙芝居（静止画スライドショー）モード: 画像の列から 1920x1080 のソース動画と meta.json を作る。
usage:
  python images_to_source.py IMG_OR_DIR [IMG ...] --out working/demo-edit/source.mp4 [--durations 13,12,11.5] [--dur 12]
         [--buffer 1] [--size 1920x1080] [--bg auto|#RRGGBB] [--meta PATH]
- ディレクトリを渡すと png/jpg/jpeg/webp を自然順（image.png → image (1).png → image (2).png …）で並べる
- 各画像は比率を保って中央に配置し、余白は画像の四隅から採った背景色で埋める（--bg で固定色も可）
- 各画像を「秒数 + buffer 秒」表示する（buffer はズーム・フェードの端の余裕。plan の src は自動で start+0.2〜+dur）
- meta.json（既定 <out の名前>.meta.json）に 画像ごとの k（倍率）/ ox, oy（配置オフセット）/ start / dur を書く。
  edit-plan.json で "images_meta" にこのファイルを指定し、segment に "image": 番号（0 始まり）を書くと、
  zoom / highlights の座標を「元画像のピクセル座標」で書ける（render_preview.py / build_hyperframes.py が自動変換）。"""
import argparse, glob, json, os, subprocess, sys, tempfile
from PIL import Image
from common import concat_file, ffmpeg, natural_key

EXT = (".png", ".jpg", ".jpeg", ".webp", ".bmp")
ap = argparse.ArgumentParser()
ap.add_argument("inputs", nargs="+"); ap.add_argument("--out", required=True)
ap.add_argument("--durations", default="", help="画像ごとの表示秒（カンマ区切り。足りない分は --dur）")
ap.add_argument("--dur", type=float, default=12.0); ap.add_argument("--buffer", type=float, default=1.0)
ap.add_argument("--size", default="1920x1080"); ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--bg", default="auto"); ap.add_argument("--meta", default="")
A = ap.parse_args()

files = []
for p in A.inputs:
    if os.path.isdir(p):
        files += sorted((f for f in glob.glob(os.path.join(p, "*")) if f.lower().endswith(EXT)), key=natural_key)
    elif os.path.exists(p): files.append(p)
    else: sys.exit(f"画像が見つかりません: {p}")
if not files: sys.exit("画像がありません（png/jpg/jpeg/webp）")
W, H = (int(v) for v in A.size.lower().split("x"))
durs = [float(x) for x in A.durations.split(",") if x.strip()]
durs += [A.dur] * (len(files) - len(durs))

def corner_bg(im):
    px = [im.getpixel((x, y)) for x, y in ((5, 5), (im.width-6, 5), (5, im.height-6), (im.width-6, im.height-6))]
    return tuple(sorted(c[i] for c in px)[1] for i in range(3))   # 四隅の中央値寄り

def hex2rgb(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

out = os.path.abspath(A.out); os.makedirs(os.path.dirname(out), exist_ok=True)
meta_path = A.meta or os.path.splitext(out)[0] + ".meta.json"
tmp = tempfile.mkdtemp(prefix="kamishibai_", dir=os.path.dirname(out))
meta, start, lines = [], 0.0, []
for i, (f, d) in enumerate(zip(files, durs[:len(files)])):
    im = Image.open(f).convert("RGB")
    k = min(W/im.width, H/im.height); w, h = round(im.width*k), round(im.height*k)
    bg = corner_bg(im) if A.bg == "auto" else hex2rgb(A.bg)
    can = Image.new("RGB", (W, H), bg); ox, oy = (W-w)//2, (H-h)//2
    can.paste(im.resize((w, h), Image.LANCZOS), (ox, oy))
    fp = os.path.join(tmp, f"f{i:03d}.png"); can.save(fp)
    lines += [concat_file(fp), f"duration {d + A.buffer}"]
    meta.append(dict(index=i, file=os.path.basename(f), width=im.width, height=im.height,
                     k=k, ox=ox, oy=oy, start=round(start, 3), dur=d, bg="#%02x%02x%02x" % bg))
    start += d + A.buffer
lines.append(concat_file(fp))   # concat demuxer: 最後の画像の duration を有効にするため再掲
lst = os.path.join(tmp, "list.txt")
with open(lst, "w", encoding="utf-8") as fh: fh.write("\n".join(lines) + "\n")
r = subprocess.run([ffmpeg(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst,
                    "-vf", f"fps={A.fps},format=yuv420p", "-c:v", "libx264", "-tune", "stillimage", "-crf", "12", out])
for fn in os.listdir(tmp): os.remove(os.path.join(tmp, fn))
os.rmdir(tmp)
if r.returncode: sys.exit("ffmpeg でソース動画を作れませんでした")
json.dump(dict(source=os.path.basename(out), width=W, height=H, fps=A.fps, buffer=A.buffer, images=meta),
          open(meta_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(dict(source=out, meta=meta_path, total=round(start, 2),
                      images=[f"{m['index']}: {m['file']} {m['width']}x{m['height']} start={m['start']} dur={m['dur']}" for m in meta]),
                 ensure_ascii=False, indent=1))
