"""edit-plan.json から MP4 を書き出す（ffmpeg + Pillow。ブラウザ不要。ffprobe 不要）。
usage: python render_preview.py PLAN.json OUT.mp4 [--stills 5,20,40 [--grid]] [--font PATH] [--crf 20]
                                [--part-seconds 30 [--only-part K | --list-parts] [--keep-parts]]
--stills: 指定時刻（出力タイムライン秒）の静止画だけ書き出す。--grid を付けると 4 枚ずつ 2x2 の確認用グリッドにまとめる。
--part-seconds: タイムラインを約 N 秒の部分に分けて OUT.parts/ に書き出し（書き出し済みの部分はスキップ）、
  全部そろったら ffmpeg concat (-c copy) で OUT.mp4 に連結する。途中で止まっても同じコマンドの再実行で続きから再開する。
  --only-part K でその部分だけ書き出して終了（1 部分 = 1 コマンドで実行できる）。--list-parts で分割だけ表示。"""
import argparse, hashlib, json, math, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from common import *
from subtitle_style import subtitle_image

ap = argparse.ArgumentParser(); ap.add_argument("plan"); ap.add_argument("out")
ap.add_argument("--stills", default=""); ap.add_argument("--grid", action="store_true")
ap.add_argument("--font"); ap.add_argument("--crf", default="20")
ap.add_argument("--part-seconds", type=float, default=0); ap.add_argument("--only-part", type=int)
ap.add_argument("--list-parts", action="store_true"); ap.add_argument("--keep-parts", action="store_true")
A = ap.parse_args()
P = load_plan(A.plan); FONT = resolve_font(A.font); print("font:", FONT)
SW, SH = P["_src"]["width"], P["_src"]["height"]
OW, OH, FPS = P["output"]["width"], P["output"]["height"], P["output"]["fps"]
ST = P["style"]; ACC = hex2rgb(ST["accent"]); HL = hex2rgb(ST["highlight"]); BG = hex2rgb(ST["background"])
ZD, MARGIN = ST["zoom_seconds"], ST["zoom_margin"]
# fit source into output (letterbox)
K = min(OW/SW, OH/SH); FW, FH = int(round(SW*K/2)*2), int(round(SH*K/2)*2); OX, OY = (OW-FW)//2, (OH-FH)//2
U = OH/1080  # UI scale

def ease(x): x = max(0, min(1, x)); return 4*x**3 if x < .5 else 1-(-2*x+2)**3/2
_fc = {}
def F(sz, w="Bold"):
    k = (int(sz*U), w)
    if k not in _fc: _fc[k] = load_font(FONT, k[0], w)
    return _fc[k]

def Ffit(text, sz, w="Bold", ratio=0.86):
    """タイトル・エンドカードの文字が幅 ratio（既定 86%）に収まるまで縮める（長い英語タイトル対策）。"""
    while sz > 24 and F(sz, w).getlength(text or "") > OW*ratio: sz -= 2
    return F(sz, w)

def zoom_at(kfs, t):
    rects = [(k[0], fit_rect(k[1], SW, SH, MARGIN)) for k in kfs]; cur = rects[0][1]
    for i in range(1, len(rects)):
        ts, r = rects[i]
        if t < ts: break
        p = ease((t-ts)/ZD); prev = rects[i-1][1]; cur = tuple(a+(b-a)*p for a, b in zip(prev, r))
    return cur

_cc = {}
def callout_img(c):
    k = (c.get("step", ""), c["title"], c.get("sub", ""))
    if k in _cc: return _cc[k]
    ft, fs, fc = F(46), F(28, "Regular"), F(24)
    pad = int(36*U); w = int(max(ft.getlength(c["title"]), fs.getlength(c.get("sub", ""))) + pad*2 + 24*U)
    h = int((190 if c.get("sub") else 140)*U); e = int(20*U)
    im = Image.new("RGBA", (w+2*e, h+2*e), (0, 0, 0, 0))
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle((e, e+4, w+e, h+e+4), int(22*U), fill=(0, 0, 0, 150))
    im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(12))); d = ImageDraw.Draw(im)
    d.rounded_rectangle((e, e, w+e, h+e), int(22*U), fill=BG+(236,), outline=ACC+(120,), width=2)
    if ST.get("callout_accent_bar"): d.rounded_rectangle((e, e, e+int(10*U), h+e), 4, fill=ACC+(255,))
    x = e+pad; y = e+int(20*U)
    if c.get("step"):
        cw = fc.getlength(c["step"])+28*U; d.rounded_rectangle((x, y, x+cw, y+38*U), int(19*U), fill=ACC+(255,))
        d.text((x+14*U, y+3*U), c["step"], font=fc, fill=BG); y += int(50*U)
    d.text((x, y), c["title"], font=ft, fill=(255, 255, 255)); y += int(62*U)
    if c.get("sub"): d.text((x+2, y), c["sub"], font=fs, fill=(190, 205, 225))
    _cc[k] = im; return im

def card(p, t, dur):
    im = Image.new("RGB", (OW, OH), BG)
    g = Image.new("L", (OW, OH), 0); ImageDraw.Draw(g).ellipse((OW*.15, -OH*.4, OW*.85, OH*.7), fill=90)
    im.paste(Image.new("RGB", (OW, OH), tuple(min(255, int(c*0.5+40)) for c in ACC)), mask=g.filter(ImageFilter.GaussianBlur(160)))
    d = ImageDraw.Draw(im); a = ease(t/.8); fade = min(1, (dur-t)/.5); al = max(0, min(a, fade)); dy = int((1-a)*30)
    def txt(y, s, f, col):
        if not s: return
        c = tuple(int(BG[i]+(col[i]-BG[i])*al) for i in range(3)); d.text((OW/2-f.getlength(s)/2, y*U+dy), s, font=f, fill=c)
    txt(330, p.get("kicker", ""), Ffit(p.get("kicker", ""), 34), ACC)
    txt(400, p.get("title", ""), Ffit(p.get("title", ""), 104), (255, 255, 255))
    lw = int(560*U*ease((t-.3)/.8)*fade)
    if lw > 0: d.rounded_rectangle((OW/2-lw/2, 560*U+dy, OW/2+lw/2, 566*U+dy), 3, fill=ACC)
    txt(610, p.get("sub", ""), Ffit(p.get("sub", ""), 40, "Regular"), (200, 214, 235)); return im

def seg_frame(arr, s, t):
    r = zoom_at(s["zoom"], t)
    fr = Image.fromarray(arr).crop(tuple(int(round(v)) for v in r)).resize((FW, FH), Image.BICUBIC)
    canvas = Image.new("RGB", (OW, OH), BG); canvas.paste(fr, (OX, OY))
    sx, sy = FW/(r[2]-r[0]), FH/(r[3]-r[1]); ov = None
    for h in s["highlights"]:
        a0, a1 = h["t"]
        if not (a0 <= t <= a1): continue
        al = min(1, (t-a0)/.35, (a1-t)/.35); x0, y0, x1, y1 = h["rect"]
        b = ((x0-r[0])*sx+OX, (y0-r[1])*sy+OY, (x1-r[0])*sx+OX, (y1-r[1])*sy+OY)
        pad = 6+4*(.5+.5*math.sin((t-a0)*5)); bb = (b[0]-pad, b[1]-pad, b[2]+pad, b[3]+pad)
        dim = Image.new("RGBA", (OW, OH), (0, 0, 0, int(110*al))); ImageDraw.Draw(dim).rounded_rectangle(bb, 14, fill=(0, 0, 0, 0))
        ov = dim if ov is None else Image.alpha_composite(ov, dim)
        ImageDraw.Draw(ov).rounded_rectangle(bb, 14, outline=HL+(int(255*al),), width=5)
    for c in s["callouts"]:
        a0, a1 = c["t"]
        if not (a0 <= t <= a1): continue
        ov = ov or Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); ci = callout_img(c)
        al = max(0, min(1, (t-a0)/.4, (a1-t)/.4)); dy = int((1-ease(min(1, (t-a0)/.5)))*40)
        ci2 = ci.copy(); ci2.putalpha(ci.getchannel("A").point(lambda v: int(v*al)))
        pos = c.get("position", "bottom-left"); m = int(40*U)
        x = m if "left" in pos else OW-ci.width-m; y = OH-ci.height-m+dy if "bottom" in pos else m+dy
        ov.alpha_composite(ci2, (x, y))
    for c in s.get("subtitles", []):
        a0, a1 = c["t"]
        if not (a0 <= t <= a1): continue
        ov = ov or Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); si = sub_img(c["text"])
        al = max(0, min(1, (t-a0)/.25, (a1-t)/.25))
        si2 = si.copy(); si2.putalpha(si.getchannel("A").point(lambda v: int(v*al)))
        y = int(36*U) if c.get("position", "bottom") == "top" else int(OH-si.height-36*U)
        ov.alpha_composite(si2, (int(OW/2-si.width/2), y))
    if ov is not None: canvas = Image.alpha_composite(canvas.convert("RGBA"), ov).convert("RGB")
    return canvas

_sc = {}
def sub_img(text):
    """字幕: 中央・半透明の箱、最大幅 78%、英語は単語・日本語は文字で自動折り返し。"""
    if text in _sc: return _sc[text]
    im = subtitle_image(text, F(38, "Medium"), OW, OH)
    _sc[text] = im; return im

def read_seg(s0, d):
    p = subprocess.Popen([ffmpeg(), "-v", "quiet", "-ss", str(s0), "-i", P["source"], "-t", str(d), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-r", str(FPS), "-"], stdout=subprocess.PIPE); n = SW*SH*3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n: break
            yield np.frombuffer(b, np.uint8).reshape(SH, SW, 3)
    finally: p.kill()


TL, TOTAL = timeline(P)
ITEMS, NF = [], 0          # (kind, st, d, p, 先頭フレーム, フレーム数)
for kind, st, d, p in TL:
    nf = int(round(d*FPS)); ITEMS.append((kind, st, d, p, NF, nf)); NF += nf

def grab(p, t):
    try: return next(read_seg(p["src"][0]+t, .2))
    except StopIteration: return next(read_seg(max(0, p["src"][0]+t-1), 1.2))

if A.stills:
    base = os.path.splitext(A.out)[0]; shots = []
    for T in [float(x) for x in A.stills.split(",") if x.strip()]:
        for kind, st, d, p, _, _ in ITEMS:
            if st <= T < st+d:
                t = T-st; im = seg_frame(grab(p, t), p, t) if kind == "seg" else card(p, t, d)
                fn = f"{base}_still_{T:06.2f}.png"; im.save(fn); shots.append((T, fn)); print("still:", fn); break
    if A.grid and shots:   # 4 枚ずつ 2x2 のグリッド（目視確認の回数を減らす）
        cw, ch = OW//2, OH//2; lf = F(30)
        for g in range(0, len(shots), 4):
            sheet = Image.new("RGB", (OW, OH), (30, 30, 30)); d = ImageDraw.Draw(sheet)
            for j, (T, fn) in enumerate(shots[g:g+4]):
                x, y = (j % 2)*cw, (j//2)*ch; sheet.paste(Image.open(fn).resize((cw-4, ch-4), Image.BICUBIC), (x+2, y+2))
                d.rectangle((x+2, y+2, x+130*U, y+46*U), fill=(220, 30, 30)); d.text((x+12*U, y+6*U), f"{T:.1f}s", font=lf, fill="white")
            gn = f"{base}_grid_{g//4+1:02d}.png"; sheet.save(gn); print("grid:", gn)
    sys.exit()

def cleanup(*paths):
    for q in paths:
        if os.path.exists(q): os.remove(q)

def render_range(fa, fb, out):
    """出力フレーム [fa, fb) を out に書き出す（映像 + 音声）。一時ファイルは先に掃除し、最後に置き換える。"""
    tmpv, tmpa, tmpo = out+".video.mp4", out+".audio.m4a", out+".tmp.mp4"; cleanup(tmpv, tmpa, tmpo)
    enc = subprocess.Popen([ffmpeg(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", A.crf, "-pix_fmt", "yuv420p", tmpv], stdin=subprocess.PIPE)
    pieces = []
    for kind, st, d, p, f0, nf in ITEMS:
        j0, j1 = max(f0, fa)-f0, min(f0+nf, fb)-f0
        if j1 <= j0: continue
        pieces.append((kind, p, j0, j1, nf))
        if kind == "seg":
            j, last = j0, None
            for arr in read_seg(p["src"][0]+j0/FPS, (j1-j0)/FPS+.5):
                if j >= j1: break
                enc.stdin.write(seg_frame(arr, p, j/FPS).tobytes()); j += 1; last = arr
            if last is None and j < j1: last = grab(p, j0/FPS)
            while j < j1: enc.stdin.write(seg_frame(last, p, j/FPS).tobytes()); j += 1
        else:
            for j in range(j0, j1): enc.stdin.write(card(p, j/FPS, d).tobytes())
        print(f"{kind} @ {st:.1f}s rendered ({j0/FPS:.1f}-{j1/FPS:.1f}s)", flush=True)
    enc.stdin.close(); enc.wait()
    if enc.returncode: sys.exit("映像のエンコードに失敗しました。同じコマンドを再実行してください。")
    # audio: カードは無音、segment は元音声（本来の区間の端だけ 30 ms フェード）
    ins, lab, flt = [], [], []
    for kind, p, j0, j1, nf in pieces:
        n, dur = len(lab), (j1-j0)/FPS
        if kind != "seg" or not P["_src"]["has_audio"] or p.get("mute"):
            ins += ["-f", "lavfi", "-t", f"{dur}", "-i", "anullsrc=r=48000:cl=stereo"]; lab.append(f"[{n}:a]"); continue
        ins += ["-ss", str(p["src"][0]+j0/FPS), "-t", str(dur), "-i", P["source"]]
        fades = (",afade=t=in:d=0.03" if j0 == 0 else "") + (f",afade=t=out:st={dur-0.03}:d=0.03" if j1 == nf else "")
        flt.append(f"[{n}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{dur}{fades}[a{n}]"); lab.append(f"[a{n}]")
    fc = (";".join(flt)+";" if flt else "")+"".join(lab)+f"concat=n={len(lab)}:v=0:a=1[aout]"
    subprocess.run([ffmpeg(), "-y", "-v", "error", *ins, "-filter_complex", fc, "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", tmpa], check=True)
    subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", tmpv, "-i", tmpa, "-c", "copy", "-shortest", "-movflags", "+faststart", tmpo], check=True)
    os.replace(tmpo, out); cleanup(tmpv, tmpa)

def part_cuts(sec):
    """item の境目で約 sec 秒ごとに区切る（1 item が長すぎる場合は途中でも区切る）。"""
    tgt = max(1, int(sec*FPS)); cuts = [0]
    for _, _, _, _, f0, nf in ITEMS:
        b = f0+nf
        while b-cuts[-1] > 1.5*tgt: cuts.append(cuts[-1]+tgt)
        if b-cuts[-1] >= tgt and b < NF: cuts.append(b)
    if cuts[-1] < NF: cuts.append(NF)
    return list(zip(cuts[:-1], cuts[1:]))

if A.part_seconds <= 0:
    render_range(0, NF, A.out); print(f"OK {A.out} ({TOTAL:.1f}s)"); sys.exit()

parts = part_cuts(A.part_seconds); pdir = A.out+".parts"
if A.list_parts:
    for k, (a, b) in enumerate(parts): print(f"part {k}: {a/FPS:.1f}-{b/FPS:.1f}s")
    sys.exit()
os.makedirs(pdir, exist_ok=True)
sig = hashlib.sha256((open(A.plan, "rb").read().decode("utf-8", "replace") + json.dumps([A.crf, FONT, parts])).encode()).hexdigest()
mf = os.path.join(pdir, "manifest.json")
if not os.path.exists(mf) or json.load(open(mf)).get("sig") != sig:   # プランが変わったら古い部分ファイルを捨てる
    for fn in os.listdir(pdir): os.remove(os.path.join(pdir, fn))
    json.dump(dict(sig=sig, parts=parts), open(mf, "w"))
todo = [A.only_part] if A.only_part is not None else range(len(parts))
for k in todo:
    if not 0 <= k < len(parts): sys.exit(f"--only-part {k} は範囲外です（0〜{len(parts)-1}）")
    pf = os.path.join(pdir, f"part{k:03d}.mp4")
    if os.path.exists(pf): print(f"part {k}: 済み（スキップ）"); continue
    render_range(*parts[k], pf); print(f"part {k}/{len(parts)-1} OK ({parts[k][0]/FPS:.1f}-{parts[k][1]/FPS:.1f}s)", flush=True)
missing = [k for k in range(len(parts)) if not os.path.exists(os.path.join(pdir, f"part{k:03d}.mp4"))]
if missing: print(f"未完了の部分: {missing}（--only-part で順に書き出すか、--only-part なしで再実行すると連結まで行う）"); sys.exit()
lst = os.path.join(pdir, "concat.txt")
with open(lst, "w", encoding="utf-8") as fh:
    fh.write("".join(concat_file(os.path.join(pdir, f"part{k:03d}.mp4")) + "\n" for k in range(len(parts))))
tmpo = A.out+".tmp.mp4"; cleanup(tmpo)
subprocess.run([ffmpeg(), "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", tmpo], check=True)
os.replace(tmpo, A.out)
if not A.keep_parts: shutil.rmtree(pdir, ignore_errors=True)
print(f"OK {A.out} ({TOTAL:.1f}s, {len(parts)} parts)")
