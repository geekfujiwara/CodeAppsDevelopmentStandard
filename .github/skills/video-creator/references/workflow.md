# video-creator 詳細手順

パスは特記がなければスキルフォルダー基準。安全策は `SKILL.md` を優先する。

デモ動画の「どこを見せるか」を映像から決め、ズーム・強調枠・テロップ・字幕で説明を加えたハイライト動画（MP4）を作るスキル。
静止画（スライド画像）を順に見せる紙芝居動画も同じ仕組みで作れる（→ 手順 1b）。

## When to Use
- 既存の画面録画・製品デモ録画を、要点だけの短いハイライト動画にしたい
- 操作画面の特定箇所を拡大し、日本語の説明テロップ（STEP 形式）を入れたい
- イベント・提案・SNS 用に、デモの見どころを 45〜90 秒程度にまとめたい
- 一度作った編集（edit-plan.json）を、別の録画や文言違いで作り直したい
- スライドや図の静止画（PNG / JPG、解像度が混在していてもよい）を並べ、ズーム・テロップ・字幕付きの紙芝居動画にしたい（英語字幕も可）
- 書き出した動画や手持ちの動画を、メール・Teams・PowerPoint で扱いやすいサイズに圧縮したい（→「圧縮オプション」）

## When NOT to Use
| 依頼 | 代わりに使うもの |
|---|---|
| 話し言葉の「えー」・言い間違い・無音だけを自動で削りたい | video-use などのカット編集ツール |
| 素材のない状態からアニメーション・モーショングラフィックスを作りたい | HyperFrames / Remotion の作成ワークフロー |
| 会議録画から議事録・要約を作りたい | meeting-intel |
| 業務デモにAI音声と同じ原文の字幕を付けたい | [業務デモ制作](./business-demo-workflow.md)。台本の外部送信は許可後のみ。通常編集とは別の任意モード |
| BGMや音声だけを新たに生成したい | 対象外。利用権と外部送信を確認し、別の音声制作手段を選ぶ |
| 実写映像のカラーグレーディングや複数カメラの編集 | 専用の動画編集ソフト |
| 動画ではなくスライドや静止画の資料を作りたい | pptx / create スキル |

## Inputs and Outputs
- **入力**: 元動画ファイル（MP4 / MOV など ffmpeg で読める形式）、または紙芝居用の静止画（PNG / JPG / WebP、複数枚）。任意で強調したい機能、目標の長さ、タイトル文言、字幕・テロップの言語
- **出力（既定）**: ハイライト動画 **MP4 1 本のみ**（1920×1080 / 30fps / H.264 + AAC）
- **圧縮したとき**: `<名前>_compressed.mp4`（MP4 のみ。ユーザーが圧縮を選んだ場合だけ作る）
- **出力しないもの**: zip などのアーカイブ、作業用ファイル（edit-plan.json・静止画・HyperFrames プロジェクト）は成果物として出さない。
  HyperFrames プロジェクトは、ユーザーが明示的に求めた場合のみ生成して渡す

## 同梱物
| パス | 役割 |
|---|---|
| `scripts/inspect_video.py` | 動画情報、コンタクトシート（一定間隔のサムネイル）、指定時刻のフル解像度フレームを書き出す |
| `scripts/images_to_source.py` | 紙芝居モード: 画像の列（自然順）から 1920×1080 のソース動画と meta.json（画像ごとの倍率・配置・開始秒）を作る |
| `scripts/render_preview.py` | edit-plan.json から MP4 を書き出す（字幕対応）。`--stills`（`--grid` で 2×2 にまとめる）で静止画確認、`--part-seconds` で分割書き出し・再開 |
| `scripts/build_hyperframes.py` | （依頼時のみ）edit-plan.json から HyperFrames プロジェクトを生成 |
| `scripts/compress_video.py` | 圧縮（目標サイズ 2-pass／CRF プリセット、品質下限 1080p・30fps、検証・再試行、結果を JSON で出力） |
| `scripts/common.py` | ffmpeg 検出、プラン読込、フォント解決（同梱の Noto Sans JP を最優先） |
| `assets/templates/edit-plan.template.json` | 空のプラン雛形 |
| `assets/templates/edit-plan.example.json` | 架空の動画編集プラン例 |
| `assets/templates/kamishibai-plan.example.json` | 紙芝居モード（画像番号＋元画像座標＋英語字幕）のプラン例 |
| `LICENSE` | このスキルのライセンス（MIT） |
| `references/plan-format.md` | プランの全キーと座標の決め方 |
| `references/editing-guidelines.md` | 構成・ズーム・テロップ・強調枠の基準（必ず読む） |
| `references/hyperframes-notes.md` | HyperFrames の導入・CLI・注意点 |
| `assets/fonts/NotoSansJP-VariableFont_wght.ttf` | 同梱フォント Noto Sans JP（可変ウェイト。テロップ見出しは Bold、補足は Regular で使用） |
| `assets/fonts/OFL.txt` | Noto Sans JP のライセンス（SIL Open Font License 1.1）。フォントを配布・同梱するときは必ず一緒に含める |

必要なツール: `bash`（スクリプト実行）、`view`（コンタクトシート・静止画の目視確認）、成果物の保存（output への MP4 保存）、元動画が OneDrive / SharePoint にある場合はファイル取得ツール。

Required tools（tool ごとの用途）:
- `bash` tool — `inspect_video.py` / `images_to_source.py` / `render_preview.py` / `build_hyperframes.py` を実行する
- `view` tool — `contact_sheet.png`、フル解像度フレーム、紙芝居の元画像、`--stills` / `--grid` の静止画を目視確認する
- `bash` tool — `compress_video.py` で圧縮する（ユーザーが圧縮を選んだ場合のみ）
- `AskUserQuestion` tool — 書き出し後に「圧縮するか」を 1 回だけ選んでもらう
- `CopyArtifact`（surface="output"）— 完成した MP4 を `working/demo-edit/` から output へ保存する
- `ReadFileContent` / `SearchM365` — 元動画が OneDrive / SharePoint にある場合に探して取得する
必要環境: Python 3（Pillow, numpy）、ffmpeg（PATH 上、または imageio-ffmpeg）。ffprobe は任意。編集は `ffmpeg -i` で情報を取得し、圧縮も ffprobe がない場合は `ffmpeg -i` へフォールバックする。

スクリプトはこのスキルのフォルダを `SKILL_DIR` として `python "$SKILL_DIR/scripts/<name>.py"` で実行する。
作業ファイルは作業用フォルダ（例: `working/demo-edit/`）に置き、スキルのフォルダには書き込まない。

## 手順

### 1. 素材を把握する（素材が静止画なら 1b へ）
1. 元動画を特定する（添付ファイル、または OneDrive / SharePoint から取得）
2. `python scripts/inspect_video.py VIDEO working/demo-edit/inspect --every 10` を実行し、`contact_sheet.png` を画像として見る
   - 動画が 5 分を超える場合は `--every 20` 程度に広げる
3. 画面の流れ（どの時刻に何の操作・結果が出るか）を時刻付きで書き出す
4. 候補区間の前後を `--at 秒,秒,...` でフル解像度フレームにし、UI パネルやボタンのピクセル座標と、画面が切り替わる時刻を確認する

### 1b. 紙芝居（静止画）モード — 素材が画像の場合
1. 画像をファイル名の**自然順**で並べる（`image.png` → `image (1).png` → `image (2).png` …）。ユーザーが順番を指定したらそれに従う
2. **すべての画像を `view` で見る**。各画像の見出し・図のブロック・下部の帯などを読み、ズーム先（元画像のピクセル座標）を画像そのものから決める
3. 1 枚あたりの秒数を決め（目安 11〜17 秒。表紙は短め）、ソース動画と meta を作る:
   ```
   python scripts/images_to_source.py input/ --out working/demo-edit/source.mp4 --durations 13,12,11.5,13,16.5,17.5,17.5,16.5
   ```
   - 画像を個別に並べる場合は `IMG1 IMG2 …` を順に渡す。解像度が混在していても比率を保って中央に置き、余白は画像の四隅の色で埋める
   - `working/demo-edit/source.meta.json` に画像ごとの倍率・配置・開始秒が出る
4. プランでは `"images_meta": "source.meta.json"` を指定し、各 segment に `"image": 番号`（0 始まり）を書く。`src` は省略でき、`zoom` / `highlights` は**元画像の座標のまま**書ける（自動変換。`references/plan-format.md`）
5. 以降はステップ 2〜7 と同じ（字幕を入れる場合は segment の `subtitles`）

### 2. 編集プランを決める
`references/editing-guidelines.md` に従い、次の表を作る。

| 出力時刻 | 元動画の区間（紙芝居は画像番号） | ズーム先 | テロップ（STEP・title・sub） | 字幕 |

- 全体の長さ、STEP 数、タイトル文言、架空データかどうか（kicker に明記）を含める。テンプレートの文言・座標は実際の素材から決め直す
- テロップ・字幕には録画やスライドに映っている事実だけを書く
- **書き出し前に確認するかどうか**:
  - 依頼文で素材が特定され、動画の作成まで明示的に頼まれている場合（例:「〜を入れた動画を作成してください」「お任せ」）→ 確認せずに書き出しまで進め、この表は納品時に示す
  - それ以外（素材・範囲・見せ場が曖昧、方針の選択肢がある）→ 表を示して合意を取ってから書き出す

### 3. edit-plan.json を書く
`assets/templates/edit-plan.template.json`（紙芝居は `assets/templates/kamishibai-plan.example.json`）をコピーして埋める（仕様は `references/plan-format.md`）。
フォントは既定の Noto Sans JP のまま。ユーザーが別フォントを指定した場合のみ `style.font_family` と `--font` を変える。

### 4. 静止画で確認する
```
python scripts/render_preview.py PLAN.json working/demo-edit/out.mp4 --stills 2,10,20,... --grid
```
各区間の「ズーム到着後」と「テロップ・字幕表示中」の時刻を選び、生成された静止画を見て次を確認し、必要ならプランを直して再確認する。
`--grid` を付けると 4 枚ずつ 2×2 の `out_grid_NN.png` にまとまるので、まずグリッドを見て、気になる時刻だけ個別の静止画を見る。
- 強調枠が狙った UI に重なっているか（画面のスクロールや遷移でずれていないか）
- テロップ・字幕が重要な情報やズームの注目箇所を隠していないか（隠す場合は `position` を変えるか、そのテロップを出さない）
- 字幕が 2 行以内か（3 行以上は警告が出る）、タイトルが画面からはみ出していないか
- 文字化け（豆腐）がないか

### 5. MP4 を書き出す
60 秒以下なら一度に書き出す:
```
python scripts/render_preview.py PLAN.json working/demo-edit/<名前>.mp4
```
**約 60 秒を超える場合は分割して書き出す**（長い書き出しの途中で実行環境が切れることがあるため）。1 部分を 1 コマンドで実行する:
```
python scripts/render_preview.py PLAN.json working/demo-edit/<名前>.mp4 --part-seconds 30 --list-parts   # 分割を確認
python scripts/render_preview.py PLAN.json working/demo-edit/<名前>.mp4 --part-seconds 30 --only-part 0
python scripts/render_preview.py PLAN.json working/demo-edit/<名前>.mp4 --part-seconds 30 --only-part 1   # … 部分の数だけ
python scripts/render_preview.py PLAN.json working/demo-edit/<名前>.mp4 --part-seconds 30                # 残りを書き出し、連結
```
- 書き出し済みの部分はスキップされるので、止まったら**同じコマンドを再実行するだけで続きから再開**できる。前回の一時ファイル（`.video.mp4` / `.audio.m4a`）は自動で掃除される
- プランを変えると古い部分ファイルは自動で破棄される。連結（ffmpeg concat、再エンコードなし）後、部分ファイルは削除される（`--keep-parts` で残す）
1080p・60 秒でおよそ数分かかる。完成後、数か所のフレームを抜き出して最終確認する。

### 6. 圧縮オプションを提示する
書き出した MP4 について、下の「圧縮オプション」に従い圧縮するかをユーザーに選んでもらう（依頼文で既に指定済みなら確認を省く）。

### 7. 納品する
- **MP4 だけ**を成果物として保存し、ファイル名で伝える（zip などのアーカイブは出力しない）。圧縮した場合は `<名前>_compressed.mp4` を渡す
- 編集内容の表（ステップ 2 の表）を最終版として示す（書き出し前に確認を省いた場合も、ここで必ず示す）
- 紙芝居が 90 秒を超えた場合は、60〜90 秒の短縮版も作れることを一言添える

## 圧縮オプション
編集後の MP4（ステップ 5）と、「動画を圧縮して」など**圧縮だけ**の依頼の両方で使う。圧縮だけの依頼では手順 1〜5 は行わず、ここから始める。
処理は同梱の `scripts/compress_video.py`（ffmpeg。ffprobe は無くてもよい）で行う。

### 1. 圧縮するかを選んでもらう（ユーザーの選択なしに圧縮しない）
1. 対象動画のサイズ・解像度・fps・長さを示す（`python scripts/compress_video.py "<input>" --info` の JSON。ffprobe は使わない）
2. `AskUserQuestion` 等の利用環境の確認ツールで **1 回だけ** 選択肢を出す:
   - 圧縮しない（そのまま納品）
   - 画質プリセットで圧縮（標準・既定／高画質／最小）
   - 目標サイズを指定して圧縮（〇MB 以下）
3. **確認を省く場合**: 依頼文で既に「圧縮して」「20MB 以下に」「圧縮は不要」などと指定されていれば、聞かずにその通りにする。
   圧縮だけの依頼でモードの指定がない場合は、プリセット（標準）か目標サイズかを同じく 1 回だけ確認する
4. 「メールで送れるサイズ」のように数値がない場合は、一般的な目安として 20MB 前後を提案し、実際の上限は組織の設定次第であることを添える（具体的な上限値を断定しない）

### 2. 品質下限（既定ルール）
- **解像度**: 短辺 1080 を下限として維持（横 1920×1080 / 縦 1080×1920 / その他の比率も短辺で判定）。アスペクト比は常に維持し、偶数ピクセルにする
- **fps**: 30fps 相当を下限として維持
- 元が下限を超える（4K・1440p・60fps など）→ 短辺 1080・30fps までの縮小は可。元が下限以下（720p・24fps など）→ 元のまま。拡大・fps の引き上げはしない
- 目標サイズモードでも下限は維持し、**ビットレートだけ**を下げる（自動で解像度・fps を落とさない）
- 下限未満（720p・15fps など）は、**ユーザーが明示的に指示した場合のみ** `--allow-below-floor` で行う

### 3. モードとエンコード
- **(a) 目標サイズ** → 2-pass H.264（VBR）。映像ビットレート = 目標サイズ × 8 × 0.95 ÷ 長さ − 音声ビットレート
- **(b) 画質プリセット** → CRF。

  | プリセット | CRF (H.264) | 用途 |
  |---|---|---|
  | 高画質 | 23 | 見た目をほぼ保つ |
  | 標準（既定） | 28 | 共有用の一般的なバランス |
  | 最小 | 32 | とにかく小さく |
- 既定は H.264（libx264）+ yuv420p + `-movflags +faststart`。H.265 は明示的に求められた場合のみ（`--codec h265`、互換性が下がる点を伝える）
- 画面録画は `--screen`（`-tune animation`）、静止画中心のスライド録画は `--screen --static`（`-tune stillimage`）。このスキルで編集したデモ動画は `--screen` を付ける
- 音声: AAC 96〜128 kbps。依頼があれば削除（`--no-audio`）
```bash
# 画質プリセット（既定で短辺 1080・30fps を維持）
python scripts/compress_video.py working/demo-edit/<名前>.mp4 --preset 標準 --screen
# 目標サイズ
python scripts/compress_video.py working/demo-edit/<名前>.mp4 --target-mb 20 --screen
# ユーザーが明示的に下限未満を指示した場合のみ
python scripts/compress_video.py "<input>" --max-short-side 720 --fps 15 --allow-below-floor
```
主な引数: `input` `[output]` `--info`（情報表示のみ） `--target-mb` `--preset {高画質,標準,最小}` `--max-short-side`（既定 1080） `--fps`（既定 30） `--allow-below-floor` `--no-audio` `--audio-kbps` `--codec {h264,h265}` `--screen` `--static` `--speed` `--max-retries`。
既定の出力名は `<元のファイル名>_compressed.mp4`（入力と同じフォルダ。`working/` 内で作り、output へ公開する）。長い動画は `initial_wait` を長めに取る。

### 4. 検証
スクリプトが JSON で返す `checks` を確認する。
- `target_size_ok`: 目標超過なら自動で低いビットレートで再エンコード（既定で最大 2 回）。それでも超える場合は音声削除を提案し、1080p / 30fps 未満は「指示があれば可能」と伝えるにとどめる
- `duration_ok`: 元と長さが一致（±1 秒 / 1%）。一致しなければ失敗として報告する
- `playable`: ffmpeg で先頭をデコードできる
- `quality_warning` があれば、画質劣化の可能性を必ず報告する
- 出力が元より大きい場合は「既に十分圧縮済み」と伝え、元ファイルの利用か、より強い設定を提案する

### 5. 圧縮結果の報告
次の表（解像度 / fps の前後を必ず含める）+ 1〜2 行のコメント（画質の見込み、品質下限を維持したか、さらに小さくする余地）。

| 項目 | 圧縮前 | 圧縮後 |
|---|---|---|
| サイズ | 68.0 MB | 4.8 MB（-93.0%） |
| 解像度 / fps | 3840×2160 / 60 | 1920×1080 / 30 |
| ビットレート | 27.2 Mbps | 1.9 Mbps |
| コーデック | H.264 / AAC | H.264 / AAC |

## Output Format
納品時のチャット返信は、次の sections で構成した Markdown にする（成果物ファイルは MP4 1 本だけ）。
1. **成果物**: MP4 のファイル名、長さ（秒）、解像度（1920×1080 / 30fps）。圧縮した場合は `<名前>_compressed.mp4`
2. **編集内容の表**（markdown table）: `| 出力時刻 | 元動画の区間（紙芝居は画像番号） | ズーム先 | テロップ（STEP・title・sub） | 字幕 |`（字幕を入れていなければ字幕列は省く）
3. **圧縮結果の表**（圧縮した場合のみ。「圧縮オプション」5 の形式）
4. **確認事項**（bullet）: 代替フォントを使った、架空データ表記の有無など、ユーザーに判断してほしい点。なければ省略
5. HyperFrames プロジェクトを明示的に依頼された場合のみ、そのフォルダ名と「この環境では HyperFrames 未実行」の旨

### （任意）HyperFrames プロジェクト
ユーザーが「HyperFrames でも書き出したい」「プロジェクトがほしい」と明示した場合のみ:
```
python scripts/build_hyperframes.py PLAN.json working/demo-edit/<name>-hyperframes
```
フォントと OFL.txt がプロジェクト内に同梱される。書き出しは利用者の環境で HyperFrames CLI を使って行う（README の手順を参照）。
この環境で HyperFrames 自体を実行していない場合は、そう明記する。

## Guardrails
- **元動画がない・読めない（if the source video is missing or cannot be read）**: 推測で作らない（never fabricate）。ファイル名を示して再添付を依頼する。スクリプトが「元動画が見つかりません」で止まったら source のパスを直す
- **内容を作らない（never invent content）**: テロップ・字幕・タイトルには録画やスライドに映っている事実だけを書く。映っていない製品名・技術名・数値・効果を足さない
- **座標は推測しない（always verify on a full-resolution frame）**: 強調枠とズーム範囲は必ずフル解像度フレーム（紙芝居は元画像）を見て確認してから決める
- **フォント（never bundle OS fonts）**: 同梱の Noto Sans JP（SIL OFL 1.1）を使う。同梱フォントが欠けて代替フォントを使った場合はユーザーに伝える。OS 付属フォント（游ゴシック・メイリオ等）は再配布できないので同梱しない
- **映像内容（no content filtering）**: 元動画に映っている内容のフィルタリングや自動マスキングは行わない。公開前の確認は利用者に委ねる（「利用上の注意」を参照）
- **デザイン既定（do not show the accent bar by default）**: テロップカード左端の装飾帯は既定で表示しない（`style.callout_accent_bar: false`）。ユーザーが求めた場合のみ true にする
- **長い処理（fallback: re-run the same command if rendering fails）**: 元動画全体は読み込まず、区間ごとにデコードする。約 60 秒を超える動画は `--part-seconds 30` で部分ごとに別コマンドで書き出す。止まった場合は同じコマンドを再実行する（済みの部分はスキップ）
- **プラン合意（show the plan before rendering unless the request is explicit）**: 素材・見せ場が曖昧な場合は、書き出す前にステップ 2 の表を示して合意を取る（confirm before rendering）。依頼文で素材が特定され動画の作成まで明示的に頼まれている場合（「〜を入れた動画を作成してください」「お任せ」）は確認を省き、表は納品時に示す。圧縮の確認（書き出し後に 1 回）はこれとは別に従来どおり行う
- **環境の不足（if ffmpeg is not found or Pillow/numpy are unavailable）**: 書き出しを試み続けず、不足しているものを伝えて導入を依頼する（ask the user）。imageio-ffmpeg があればそれを使う。ffprobe が無いのは問題ない（使わない）
- **圧縮はユーザーの選択で（never compress without the user's choice）**: 依頼文で指定がない限り、書き出し後に `AskUserQuestion` で 1 回だけ確認する。元ファイルは上書き・削除せず、圧縮版は別ファイル `<名前>_compressed.mp4` にする
- **圧縮の品質下限（never go below 1080p/30fps by default; never upscale）**: 短辺 1080・30fps を維持しアスペクト比を変えない。下限未満はユーザーが明示的に指示した場合のみ `--allow-below-floor`
- **サイズ上限を断定しない（never fabricate platform limits）**: 確認できないメール・Teams 等の上限値は断定せず「一般に 20〜25MB 前後が目安」程度に留める
- **圧縮の失敗（if encoding fails, report and fall back）**: ffmpeg がエラーになったらエラー要約を示し、品質下限内の代替設定（`--speed fast` など）で再試行する。長さが変わったら失敗として報告する
- **共有しない（never upload or auto-send）**: OneDrive / SharePoint へのアップロードやメール送信は、ユーザーが求めた場合のみ
- **用語**: 体験型の研修は「インタラクティブなワークショップ」と表記する
- **成果物の形式（never output zip archives）**: 既定の成果物は MP4 1 本だけ。edit-plan.json・静止画・HyperFrames プロジェクトは明示的な依頼がない限り渡さない

## 利用上の注意
利用者向けの案内です（このスキルが確認・ブロックするものではありません）。
- 元動画に映っている内容の権利・公開可否は、利用者の責任で判断してください
- 公開前に、顧客名・個人名・メールや通知のポップアップ・URL バー・社内データ・認証情報などが映り込んでいないかを確認することを推奨します
- このスキルは映像内容のフィルタリングや自動マスキングは行いません

## ライセンス
- このスキル（SKILL.md・scripts・references・templates）は MIT License で提供します（`LICENSE` を参照）
- 同梱フォント Noto Sans JP は SIL Open Font License 1.1 のままで、MIT の対象外です（`assets/fonts/OFL.txt` を参照）
