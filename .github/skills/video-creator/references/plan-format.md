# edit-plan.json の仕様

| キー | 内容 |
|---|---|
| `name` | 動画名（HyperFrames の title にも使用） |
| `source` | 元動画パス（plan ファイルからの相対パス可） |
| `output` | `width` / `height` / `fps`（既定 1920×1080 / 30）。元動画と比率が違う場合は上下左右に余白を入れる |
| `style` | `font_family`（既定 **Noto Sans JP**）、`accent`（STEP チップ・左帯）、`highlight`（強調枠）、`background`、`callout_accent_bar`（テロップカード左端の装飾帯。既定 false＝表示しない）、`zoom_seconds`（ズーム遷移秒、既定 0.9）、`zoom_margin`（ズーム範囲の余白 px、既定 24） |
| `title` / `end` | タイトル・エンドカード（省略可）。`duration` `kicker` `title` `sub`。文字が画面幅の約 86% を超える場合は自動で縮小する（長い英語タイトル対策） |
| `images_meta` | 紙芝居モードのみ。`images_to_source.py` が書き出した meta.json（plan からの相対パス可）。segment の `image` を使うときに必須 |
| `segments[]` | 元動画から切り出す区間。出力では順に連結 |

## segments[] の各要素
- `src`: `[開始秒, 終了秒]`（元動画の時刻）
- `mute`: true で音声を消す（任意）
- `zoom`: `[[区間内秒, 範囲], ...]`。範囲は `"full"` か元動画ピクセル座標 `[x0, y0, x1, y1]`。指定時刻から `zoom_seconds` かけて移動。元動画の縦横比に自動で広げてから拡大する
- `callouts`: `[{t:[開始,終了], step, title, sub, position}]`。区間内秒。position は `bottom-left`（既定）/`bottom-right`/`top-left`/`top-right`
- `highlights`: `[{t:[開始,終了], rect:[x0,y0,x1,y1]}]`。元動画ピクセル座標。枠の外側を少し暗くする
- `subtitles`: `[{t:[開始,終了], text, position}]`。区間内秒。字幕（ナレーション代わりの文章）。position は `bottom`（既定）/`top`。
  画面中央・半透明の箱、最大幅は画面の約 78%、英語は単語単位・日本語は文字単位で自動改行、0.25 秒でフェード。3 行以上になると警告する（2 行以内にする）。
  `render_preview.py` と `build_hyperframes.py` の両方で対応
- `image`（紙芝居モード）: 画像番号（0 始まり、`images_to_source.py` の並び順）。指定すると
  - `src` を省略でき、自動で `[start+0.2, start+0.2+dur]`（その画像の表示区間）になる。`duration` で短くもできる
  - `zoom` と `highlights.rect` を**元画像のピクセル座標**で書ける（meta の倍率 k・オフセット ox/oy で自動変換）。
    すでにソース動画座標で書いた場合は `"coords": "source"` を付ける

## 紙芝居（静止画）モードの例
```json
{
  "source": "source.mp4",
  "images_meta": "source.meta.json",
  "style": {"zoom_margin": 40},
  "segments": [
    {"image": 0,
     "zoom": [[0, "full"], [1.0, [20, 380, 830, 700]], [12.0, "full"]],
     "callouts": [{"t": [1.6, 5.0], "step": "THE JOURNEY", "title": "From alert to context", "position": "top-right"}],
     "highlights": [{"t": [2.2, 4.8], "rect": [355, 455, 485, 590]}],
     "subtitles": [{"t": [0.2, 4.0], "text": "Existing monitoring raises an alert."},
                   {"t": [4.1, 7.8], "text": "Bottom-edge note shown while zoomed to the bottom bar.", "position": "top"}]}
  ]
}
```
座標は元画像（例: 1536×1024 の PNG）を `view` で見て読む。画像ごとに解像度が違っても、meta で個別に変換される。
全体の例は `assets/templates/kamishibai-plan.example.json`（スキルフォルダー基準）。

## 座標の決め方
紙芝居モードでは元画像そのものを `view` で見て座標を読む（動画からフレームを抜く必要はない）。以下は動画素材の場合。
`inspect_video.py --at 秒` で書き出したフル解像度フレームを見て、パネルやボタンの左上・右下のピクセル座標を読み取る。
画面が切り替わる（スクロール・遷移する）時刻をまたいで同じ座標を使わないこと。前後 1 秒刻みでフレームを確認する。
