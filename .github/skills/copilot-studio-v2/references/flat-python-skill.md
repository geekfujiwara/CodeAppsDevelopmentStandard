# フラット Python スキルの書き方

cliagent 新ランタイムで動くスキルバンドルの作り方。実機検証で判明した制約に従う。

## 3つの絶対制約

```
❌ JavaScript / pptxgenjs / Node 依存       → ✅ Python のみ（python-pptx, openpyxl, Pillow 等）
❌ サブフォルダ階層（icons/foo.png 等）     → ✅ フラット（全ファイルを同一階層に置く）
❌ バイナリ画像ファイルの同梱読込に依存     → ✅ 画像は assets_b64.py に Base64 で埋め込む
```

## ディレクトリ構成（フラット）

```
skill/                     ← このフォルダ配下を attach_skill.py で添付
├── SKILL.md               ← スキル定義（frontmatter + 手順）。必須
├── build_xxx.py           ← 実処理（python-pptx 等のデザインシステム）
└── assets_b64.py          ← 画像を Base64 文字列で保持するモジュール
```

> サブフォルダを作らない。`icons/logo.png` ではなく `assets_b64.py` の中の `logo` キーで参照する。

## SKILL.md の frontmatter（優先度・上書き宣言）

ビルトインスキル（例 `pptx`）より優先させたい場合は description に明記する。

```markdown
---
name: geek-pptx-py
description: "【ビルトイン pptx より優先】... python-pptx 版。JS 不使用・画像は Base64。Use when: PowerPoint作成, スライド作成, deck, pptx, パワポ ..."
priority: high
overrides: pptx
---

# 手順

1. python-pptx で build_xxx.py を実行する
2. 画像は assets_b64.get_image_stream("logo") で取得して add_picture に渡す
3. JavaScript は使わない
```

## assets_b64.py（画像 Base64 埋め込み）

画像を Base64 化して Python モジュールに固める。バンドル内バイナリの読込不確実性を回避できる。

```python
import base64
import io

# 各画像を base64（改行で分割した隣接文字列リテラルとして保持）
_IMAGES = {
    "logo": (
        "iVBORw0KGgoAAAANSUhEUgAA..."  # 適切な長さで分割した base64 チャンク
        "..."
    ),
    # ...
}

AVAILABLE = tuple(_IMAGES)


def get_image_bytes(key: str) -> bytes:
    return base64.b64decode(_IMAGES[key])


def get_image_stream(key: str) -> io.BytesIO:
    return io.BytesIO(get_image_bytes(key))
```

### 画像から assets_b64.py を生成する補助

```python
import base64
from pathlib import Path

SRC = Path("source_images")   # png/jpg を置く
OUT = Path("skill/assets_b64.py")

lines = ["import base64, io", "", "_IMAGES = {"]
for img in sorted(SRC.iterdir()):
    if img.suffix.lower() not in (".png", ".jpg", ".jpeg"):
        continue
    b64 = base64.b64encode(img.read_bytes()).decode()
    key = img.stem.replace("-", "_")
    # 76 文字ごとに分割して隣接文字列リテラルにする
    chunks = [b64[i:i + 76] for i in range(0, len(b64), 76)]
    body = "\n        ".join(f'"{c}"' for c in chunks)
    lines.append(f'    "{key}": (\n        {body}\n    ),')
lines += [
    "}", "", "AVAILABLE = tuple(_IMAGES)", "",
    "def get_image_bytes(k): return base64.b64decode(_IMAGES[k])", "",
    "def get_image_stream(k): return io.BytesIO(get_image_bytes(k))",
]
OUT.write_text("\n".join(lines), encoding="utf-8")
```

## build_xxx.py（python-pptx の例）

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import assets_b64

THEME = {
    "navy": RGBColor(0x0B, 0x1F, 0x3A),
    "blue": RGBColor(0x25, 0x63, 0xEB),
    "font": "Yu Gothic UI",
}

def new_presentation():
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    return prs

def add_cover(prs, title, subtitle):
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    pic = slide.shapes.add_picture(assets_b64.get_image_stream("logo"), Inches(0.5), Inches(0.5), height=Inches(0.6))
    box = slide.shapes.add_textbox(Inches(0.8), Inches(2.5), Inches(11), Inches(2))
    tf = box.text_frame
    tf.text = title
    tf.paragraphs[0].font.size = Pt(40)
    tf.paragraphs[0].font.name = THEME["font"]
    tf.paragraphs[0].font.color.rgb = THEME["navy"]
    return slide
```

## ローカル検証

添付前に必ずローカルで実行して成果物（.pptx 等）が生成されることを確認する。

```pwsh
cd skill
python -c "import build_pptx; build_pptx.demo()"   # デモ生成関数を用意しておく
```

## 添付

```pwsh
# .env に AGENT_BOTID（または agent_botid.txt）と AGENT_SCHEMA を設定
python ../.github/skills/copilot-studio-v2/scripts/attach_skill.py skill
python ../.github/skills/copilot-studio-v2/scripts/verify_agent.py
```

## 注意

`bic:bundle` マーカーがランタイムでバンドル blob を展開するのか、type=14 子ファイルを
直接読むのかは未確定。**添付後は必ず Preview で動作確認**すること。

### ★出力ファイル名は毎回変える（同名だと UI からダウンロードできない）

Copilot Studio v2 エージェントは、**同じファイル名**でファイルを繰り返し出力すると、
チャット UI 上でダウンロードリンクが機能しないことが実機で確認されている。
`build_xxx.py` 側で日時や UUID をファイル名に含めて **毎回一意のファイル名**にする
（例: `report_20250716_153000.pptx`）。あわせて、エージェントの Instructions（システムプロンプト）にも
「ファイルを出力する際は毎回異なるファイル名にする」旨を明記する（[SKILL.md](../SKILL.md) 参照）。
