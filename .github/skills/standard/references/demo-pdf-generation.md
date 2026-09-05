# デモ用の日本語 PDF 生成（reportlab）

デモ・PoC で「本物っぽい帳票／図面／報告書の PDF」が必要になったときの標準手順。
テキスト（JSON / CSV / Markdown）しか持っていないデータから、**決定論的に** PDF を生成する。

> 対象例: 図面（JIS 風の A3 横）、検査成績書、作業指示書、見積書、点検報告書。

## 1. 前提

```powershell
pip install reportlab
```

## 2. 日本語フォントは CID フォントを使う（埋め込み不要・ライセンス懸念なし）

TTF を埋め込むとフォントのライセンス確認が必要になる。reportlab に同梱の **Adobe-Japan1 CID フォント**を使えば
外部ファイル不要・埋め込み不要で日本語が出せる。

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont

JP     = "HeiseiKakuGo-W5"  # ゴシック
JP_MIN = "HeiseiMin-W3"     # 明朝

def register_fonts():
    pdfmetrics.registerFont(UnicodeCIDFont(JP))
    pdfmetrics.registerFont(UnicodeCIDFont(JP_MIN))
```

### 太字は「テキストレンダリングモード」で擬似的に出す

CID フォントに Bold のウェイトは無い。塗り＋輪郭線（mode=2）で太らせる。

```python
def bold_text(c, x, y, text, size, font=JP, width=0.28):
    c.saveState()
    t = c.beginText(x, y)
    t.setFont(font, size)
    t.setTextRenderMode(2)   # fill + stroke
    c.setLineWidth(width)
    t.textLine(text)
    c.drawText(t)
    c.restoreState()
```

### 折り返しは 1 文字ずつ幅を測る

日本語には単語境界が無いので `simpleSplit` の空白分割では折り返せない。

```python
def wrap_jp(text, font, size, max_w):
    lines, cur = [], ""
    for ch in text:
        if pdfmetrics.stringWidth(cur + ch, font, size) > max_w and cur:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines
```

## 3. レイアウト崩れを防ぐ 4 原則

実際に生成した PDF は、ほぼ必ず最初の版で「重なり」「はみ出し」「余白だらけ」が出る。次の順序で組む。

1. **周辺の固定要素（枠線・表題欄・注記欄・フッター）を先に確定**し、残りを「作図可能領域」として矩形で持つ
   （`lim_x0 / lim_y0 / lim_x1 / lim_y1`）。
2. **可変ブロックは「先に高さを測る関数」と「描く関数」に分ける**（`measure_note_list()` / `draw_note_list()`）。
   描画してから高さが分かる作りだと、他の要素と必ず衝突する。
3. **要素の中心座標は作図領域にクランプする**。要素サイズを先に求める関数（`component_size()`）を用意し、
   `x = min(max(x, lim_x0 + w/2), lim_x1 - w/2)` で押し込む。
4. **元データの座標は正規化して引き伸ばす**。元データの x/y が 0–100 でも実際は 20–70 にしか分布しないことが多く、
   そのまま使うと紙の半分が空白になる。**実データの min/max を取って作図領域いっぱいに線形写像**する。

```python
def norm(v, lo, hi, out_lo, out_hi):
    if hi - lo < 1e-6:
        return (out_lo + out_hi) / 2
    return out_lo + (v - lo) / (hi - lo) * (out_hi - out_lo)
```

> CAD 由来のデータは **y が下からの座標**であることが多い。PDF も下から座標なのでそのまま使えるが、
> Web の UI 座標（上から）を流用すると上下反転するので必ず確認する。

## 4. 生成結果は必ず画像化して目視レビューする

PDF はバイナリなので、生成できた＝正しく見える、ではない。**PyMuPDF で PNG にして必ず目で見る**。

```powershell
pip install pymupdf
```

```python
import fitz  # PyMuPDF
doc = fitz.open(pdf_path)
for i, page in enumerate(doc, start=1):
    page.get_pixmap(dpi=110).save(f"{out_dir}/{stem}_p{i}.png")
```

生成 → PNG 化 → 目視 → 修正 を **3〜4 周**するつもりで見積もる。典型的な指摘は次の通り。

| 症状 | 原因 | 対処 |
|---|---|---|
| ブロックが注記枠の下に隠れる | 塗り潰しブロックを最後に描いている | 高さを先に測り、その帯を配置領域から除外する |
| セル内の文字が枠線で切れる | ベースラインをセル上端基準で置いている | ベースラインをセル上端から明示オフセット（例 `-3.2mm`）で置く |
| 紙の上半分が真っ白 | 元データの座標分布が狭い | min/max 正規化で引き伸ばす |
| 接続線が自分のブロックに戻る | 出入り辺を固定している | `abs(dx) >= abs(dy)` で左右辺／上下辺を切り替える |
| 寸法値が寸法線に重なる | ラベルを線と同じ y に置いている | ラベルを線から 4mm 以上離す |
| 図がほぼ空のページがある | そのページに描画対象データが無い | データが無いときのフォールバック図形を用意する |

## 5. アップロード時はバイナリで読む

生成した PDF を Azure Files / Blob / SharePoint へ上げるスクリプトで、
テキスト前提の読み込みをしていると**静かに破損**する。

```ts
// ❌ PDF が壊れる
const content = Buffer.from(readFileSync(full, "utf-8"), "utf-8")

// ✅ バイト列のまま読む
const content = readFileSync(full)
```

アップロード後は**必ずバイトサイズが一致するか**確認する。

## 6. 再現性

デモ資産は「再実行しても同じ結果になる」ことが重要。乱数を使う場合は必ずシードを固定し、
日付・改訂記号・担当者名などは辞書で固定値にする（`REV_DATES = {"A": "2024-11-15", ...}`）。
