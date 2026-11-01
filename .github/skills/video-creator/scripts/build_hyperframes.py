"""edit-plan.json から HyperFrames プロジェクト（index.html + assets）を生成する。
usage: python build_hyperframes.py PLAN.json OUTDIR [--copy-video] [--zip]
フォントは Noto Sans JP を既定とし、同梱フォントがあれば assets/fonts にコピーして @font-face で読み込む。"""
import argparse, json, os, shutil, zipfile
from common import *
ap = argparse.ArgumentParser(); ap.add_argument("plan"); ap.add_argument("outdir")
ap.add_argument("--copy-video", action="store_true"); ap.add_argument("--zip", action="store_true")
A = ap.parse_args()
P = load_plan(A.plan); SW, SH = P["_src"]["width"], P["_src"]["height"]
OW, OH, FPS = P["output"]["width"], P["output"]["height"], P["output"]["fps"]; ST = P["style"]
K = min(OW/SW, OH/SH); FW, FH = round(SW*K), round(SH*K); OX, OY = (OW-FW)//2, (OH-FH)//2
os.makedirs(os.path.join(A.outdir, "assets", "fonts"), exist_ok=True)
video_name = "assets/" + P.get("hyperframes_video_name", "source" + os.path.splitext(P["source"])[1])
if A.copy_video: shutil.copy2(P["source"], os.path.join(A.outdir, video_name))
font_face = ""; FONT = None
try:
    f = resolve_font(allow_download=False); FONT = f
    if "noto" in os.path.basename(f).lower():
        shutil.copy2(f, os.path.join(A.outdir, "assets", "fonts", os.path.basename(f)))
        lic = os.path.join(os.path.dirname(f), "OFL.txt")
        if os.path.exists(lic): shutil.copy2(lic, os.path.join(A.outdir, "assets", "fonts", "OFL.txt"))
        font_face = f'@font-face {{ font-family:"Noto Sans JP"; src:url("assets/fonts/{os.path.basename(f)}"); font-weight:100 900; }}'
except SystemExit: pass
esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
def tf(r):
    r = fit_rect(r, SW, SH, ST["zoom_margin"]); s = SW/(r[2]-r[0])
    return dict(scale=round(s, 4), x=round(-r[0]*s*K, 1), y=round(-r[1]*s*K, 1))

def fit_px(text, base, weight="Bold", ratio=0.86):
    """タイトル・エンドカードの文字を幅 ratio（既定 86%）に収める font-size(px)。フォントが無ければ概算。"""
    size = base*OH/1080
    while size > 24:
        if FONT: w = load_font(FONT, int(size), weight).getlength(text or "")
        else: w = sum(size if ord(ch) > 0x2e7f else size*0.55 for ch in (text or ""))
        if w <= OW*ratio: break
        size -= 2
    return int(size)

TL, TOTAL = timeline(P); html, js = [], []
for i, (kind, st, d, p) in enumerate(TL):
    if kind != "seg":
        cid = f"card-{kind}"
        html.append(f'  <section id="{cid}" class="clip card" data-start="{st:.2f}" data-duration="{d:.2f}" data-track-index="2">\n'
                    f'    <div class="kicker">{esc(p.get("kicker"))}</div><h1 style="font-size:{fit_px(p.get("title"), 104)}px">{esc(p.get("title"))}</h1><div class="rule"></div><p>{esc(p.get("sub"))}</p>\n  </section>')
        js += [f'tl.from("#{cid} > *", {{opacity:0, y:30, duration:0.7, stagger:0.12, ease:"power3.out"}}, {st:.2f});',
               f'tl.to("#{cid} > *", {{opacity:0, duration:0.4}}, {st+d-0.45:.2f});']
        continue
    sid = f"seg{i}"; s0, s1 = p["src"]
    hls = "".join(f'<div class="hl" id="{sid}-hl{j}" style="left:{h["rect"][0]*K:.0f}px;top:{h["rect"][1]*K:.0f}px;'
                  f'width:{(h["rect"][2]-h["rect"][0])*K:.0f}px;height:{(h["rect"][3]-h["rect"][1])*K:.0f}px"></div>' for j, h in enumerate(p["highlights"]))
    html.append(f'''  <div id="{sid}" class="clip stage" data-start="{st:.2f}" data-duration="{d:.2f}" data-track-index="0">
    <div class="zoom" id="{sid}-zoom">
      <!-- 元動画 {s0}s〜{s1}s -->
      <video id="{sid}-v" src="{video_name}" data-start="{st:.2f}" data-duration="{d:.2f}" data-media-start="{s0}" data-track-index="1"{" muted" if p.get("mute") else ""} playsinline></video>
      {hls}
    </div>
  </div>''')
    js.append(f'tl.set("#{sid}-zoom", {json.dumps(tf(p["zoom"][0][1]))}, {st:.2f});')
    for t, r in p["zoom"][1:]:
        js.append(f'tl.to("#{sid}-zoom", {{...{json.dumps(tf(r))}, duration:{ST["zoom_seconds"]}, ease:"power3.inOut"}}, {st+t:.2f});')
    for j, h in enumerate(p["highlights"]):
        a, b = h["t"]
        js.append(f'tl.fromTo("#{sid}-hl{j}", {{opacity:0, scale:1.06}}, {{opacity:1, scale:1, duration:0.35}}, {st+a:.2f}).to("#{sid}-hl{j}", {{opacity:0, duration:0.35}}, {st+b-0.35:.2f});')
    for j, c in enumerate(p["callouts"]):
        cid = f"{sid}-co{j}"; a, b = c["t"]; pos = c.get("position", "bottom-left")
        step = f'<span class="step">{esc(c["step"])}</span>' if c.get("step") else ""
        sub = f'<div class="sub">{esc(c["sub"])}</div>' if c.get("sub") else ""
        html.append(f'  <div id="{cid}" class="clip callout {pos}" data-start="{st+a:.2f}" data-duration="{b-a:.2f}" data-track-index="3">{step}<div class="ttl">{esc(c["title"])}</div>{sub}</div>')
        js.append(f'tl.from("#{cid}", {{opacity:0, y:40, duration:0.5, ease:"power3.out"}}, {st+a:.2f}).to("#{cid}", {{opacity:0, duration:0.4}}, {st+b-0.4:.2f});')
    for j, c in enumerate(p.get("subtitles", [])):   # 字幕（中央・半透明の箱・最大幅 78%・0.25 秒フェード）
        cid = f"{sid}-sb{j}"; a, b = c["t"]; pos = "top" if c.get("position") == "top" else "bottom"
        html.append(f'  <div id="{cid}" class="clip subtitle {pos}" data-start="{st+a:.2f}" data-duration="{b-a:.2f}" data-track-index="4"><span>{esc(c["text"])}</span></div>')
        js.append(f'tl.fromTo("#{cid}", {{opacity:0}}, {{opacity:1, duration:0.25}}, {st+a:.2f}).to("#{cid}", {{opacity:0, duration:0.25}}, {st+b-0.25:.2f});')

u = OH/1080
doc = f'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>{esc(P.get("name", "demo-video"))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=block" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<style>
  {font_face}
  :root {{ --bg:{ST["background"]}; --accent:{ST["accent"]}; --hl:{ST["highlight"]}; }}
  html,body {{ margin:0; background:var(--bg); }}
  #root {{ position:relative; width:{OW}px; height:{OH}px; overflow:hidden; background:var(--bg);
          font-family:"{ST["font_family"]}","Noto Sans JP",sans-serif; }}
  .clip {{ position:absolute; inset:0; }}
  .stage {{ overflow:hidden; }}
  .zoom {{ position:absolute; left:{OX}px; top:{OY}px; width:{FW}px; height:{FH}px; transform-origin:0 0; }}
  .zoom video {{ position:absolute; inset:0; width:{FW}px; height:{FH}px; }}
  .hl {{ position:absolute; border:4px solid var(--hl); border-radius:12px; opacity:0;
         box-shadow:0 0 0 9999px rgba(0,0,0,.42), 0 0 24px var(--hl); }}
  .card {{ display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff;
          background:radial-gradient(ellipse at 50% 10%, color-mix(in srgb, var(--accent) 35%, var(--bg)) 0%, var(--bg) 60%); }}
  .card .kicker {{ color:var(--accent); font-size:{34*u:.0f}px; font-weight:700; }}
  .card h1 {{ font-size:{104*u:.0f}px; margin:{18*u:.0f}px 0 {26*u:.0f}px; font-weight:700; }}
  .card .rule {{ width:{560*u:.0f}px; height:6px; border-radius:3px; background:var(--accent); }}
  .card p {{ font-size:{40*u:.0f}px; color:#c8d6eb; margin-top:{30*u:.0f}px; font-weight:400; }}
  .callout {{ inset:auto; padding:{22*u:.0f}px {40*u:.0f}px {26*u:.0f}px {36*u:.0f}px; border-radius:22px;
             background:color-mix(in srgb, var(--bg) 93%, transparent); border:2px solid color-mix(in srgb, var(--accent) 45%, transparent);
             {"border-left:10px solid var(--accent); " if ST.get("callout_accent_bar") else ""}box-shadow:0 12px 40px rgba(0,0,0,.55); color:#fff; }}
  .callout.bottom-left {{ left:{60*u:.0f}px; bottom:{60*u:.0f}px; }} .callout.bottom-right {{ right:{60*u:.0f}px; bottom:{60*u:.0f}px; }}
  .callout.top-left {{ left:{60*u:.0f}px; top:{60*u:.0f}px; }} .callout.top-right {{ right:{60*u:.0f}px; top:{60*u:.0f}px; }}
  .callout .step {{ display:inline-block; background:var(--accent); color:var(--bg); font-weight:700; font-size:{22*u:.0f}px; padding:4px 14px; border-radius:999px; }}
  .callout .ttl {{ font-size:{46*u:.0f}px; font-weight:700; margin-top:10px; }}
  .subtitle {{ inset:auto; left:0; right:0; display:flex; justify-content:center; pointer-events:none; }}
  .subtitle.bottom {{ bottom:{36*u:.0f}px; }} .subtitle.top {{ top:{36*u:.0f}px; }}
  .subtitle span {{ max-width:78%; text-align:center; background:rgba(10,18,34,.75); color:#fff; font-size:{38*u:.0f}px; font-weight:500;
                   line-height:1.42; padding:{12*u:.0f}px {30*u:.0f}px; border-radius:{14*u:.0f}px; line-break:strict; overflow-wrap:anywhere; }}
  .card h1 {{ white-space:nowrap; }}
  .callout .sub {{ font-size:{28*u:.0f}px; color:#bed0e6; margin-top:6px; font-weight:400; }}
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-duration="{TOTAL:.2f}" data-width="{OW}" data-height="{OH}">
{chr(10).join(html)}
  <script>
    window.__timelines = window.__timelines || {{}};
    const tl = gsap.timeline({{ paused: true }});
    {(chr(10)+"    ").join(js)}
    window.__timelines["root"] = tl;
  </script>
</div>
</body>
</html>
'''
open(os.path.join(A.outdir, "index.html"), "w", encoding="utf-8").write(doc)
clean = {k: v for k, v in P.items() if not k.startswith("_")}
clean["source"] = video_name; clean.pop("images_meta", None)   # 画像座標は変換済み（segments は source 座標）
json.dump(clean, open(os.path.join(A.outdir, "edit-plan.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(os.path.join(A.outdir, "README.md"), "w", encoding="utf-8").write(f"""# {P.get("name", "demo-video")} — HyperFrames プロジェクト

1. 元動画を `{video_name}` に置く（--copy-video で生成した場合は配置済み）
2. このフォルダで次のコマンドを実行:

```
npx hyperframes lint
npx hyperframes preview
npx hyperframes render --output output.mp4
```
lint で指摘があれば index.html を直してから preview で確認し、render で書き出す。
必要環境: Node.js 22 以上 / FFmpeg / フォント Noto Sans JP（Google Fonts から読み込み）
""")
print("OK", os.path.join(A.outdir, "index.html"), f"{TOTAL:.1f}s")
if A.zip:
    zp = A.outdir.rstrip("/") + ".zip"; root = os.path.basename(A.outdir.rstrip("/"))
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for dp, _, fs in os.walk(A.outdir):
            for f in fs: z.write(os.path.join(dp, f), os.path.join(root, os.path.relpath(os.path.join(dp, f), A.outdir)))
    print("ZIP", zp)
