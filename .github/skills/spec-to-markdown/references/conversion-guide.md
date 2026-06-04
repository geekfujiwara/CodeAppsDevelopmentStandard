# 仕様書 markdown 変換ガイド

## 1. 何を作るか

このスキルの最初のゴールは次の 2 つ。

1. **各入力ファイルの factsheet**
2. **全体統合 document.md**

Power Platform 向け要件整理に使えるよう、出力は raw markdown の貼り付けではなく **要件の分類軸** を固定する。

## 2. 推奨コマンド

まずリポジトリルートで preflight/bootstrap を実行する。

```bash
npm install
# または再実行時
npm run setup
```

### macOS / Linux

```bash
cd .github/skills/spec-to-markdown/scripts
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# 画像を GitHub Copilot エージェントで OCR する場合（--agent-ocr は画像がある場合は必須）
python convert_documents.py --agent-ocr
```

### Windows (PowerShell)

```powershell
cd .github\skills\spec-to-markdown\scripts
# 画像を GitHub Copilot エージェントで OCR する場合（--agent-ocr は画像がある場合は必須）
powershell -ExecutionPolicy Bypass -File run_windows.ps1 --agent-ocr
```

`run_windows.ps1` は初回実行時に仮想環境の作成とパッケージのインストールを自動で行う。  
引数も透過的に渡せる。

```powershell
# 入力フォルダを指定する場合
powershell -ExecutionPolicy Bypass -File run_windows.ps1 --input C:\Users\user\Documents\specs
```

Windows で手動セットアップする場合:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python convert_documents.py
```

既定では次を使う。

- 入力: `<repo-root>/work/spec-to-markdown/input/`
- 出力: `<repo-root>/work/spec-to-markdown/output/<input-set>-<timestamp>/`

入力や出力を明示したい場合だけ override する。

```bash
# macOS / Linux
python convert_documents.py \
  --input /absolute/path/to/input \
  --output /absolute/path/to/output

# Windows
python convert_documents.py `
  --input C:\absolute\path\to\input `
  --output C:\absolute\path\to\output
```

### 入力セット運用の例

```text
work/spec-to-markdown/input/
  customer-a/
    要件定義書.pdf
    画面一覧.xlsx
    UI_mockup.png
  project-x/
    業務フロー.pptx
```

- `python convert_documents.py` の既定入力は `input/` 全体
- `python convert_documents.py --input <repo-root>/work/spec-to-markdown/input/customer-a` とすると `customer-a-<timestamp>/` 配下へ出力される
- `--output` を省略すると、毎回タイムスタンプ付きの別フォルダになるため上書き事故を避けやすい

## 3. 対応対象

- PDF
- PowerPoint (`.ppt`, `.pptx`)
- Excel (`.xls`, `.xlsx`)
- Word (`.doc`, `.docx`)
- markdown / text / html
- **画像** (`.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`, `.tiff`, `.tif`)

> Word / markdown / html まで含めるのは、添付仕様や補足メモが混在しやすいため。  
> 画像は `--agent-ocr` フラグを使い GitHub Copilot のビジョン機能でテキストを抽出する。

## 4. factsheet テンプレート

各 factsheet は最低限次の構造にする。

```markdown
# {タイトル} factsheet

## 1. Source
- File:
- Relative path:
- Converted at:

## 2. Power Platform requirement summary
### Business objective
### Users / roles
### Dataverse tables
### Main columns / master data
### UI / app requirements
### Automations
### Agent / AI opportunities
### External integrations
### Security / compliance
### Open questions

## 3. Extracted markdown
```

## 5. document.md テンプレート

```markdown
# Power Platform requirements document

## 1. Conversion summary

## 2. Source documents

## 3. Cross-document requirements summary
### Business scope
### Users / roles
### Dataverse design candidates
### App design candidates
### Automation candidates
### Agent / AI candidates
### Integration candidates
### Risks / open questions

## 4. Factsheet index
```

## 6. 要件整理ルール

- **推測で補完しない**
- 文書間で表現が違う場合は `差分あり` と記録する
- Power Platform 用語に正規化する
  - 業務データ → Dataverse テーブル候補
  - 入力 / 一覧 / ダッシュボード → App/UI 要件
  - 通知 / 承認 / 定期処理 → Power Automate
  - 対話 / 検索 / 要約 → Copilot Studio / AI Builder
- 画面名・帳票名・マスタ名・外部システム名はそのまま残す

## 7. MarkItDown を使う理由

- PDF / Office 系ファイルを markdown に寄せて扱える
- 見出し・箇条書き・表の構造を比較的保ちやすい
- 後段の LLM 要約や requirements 整理に渡しやすい
- 画像は GitHub Copilot のビジョン機能（`--agent-ocr`）で OCR することで、スキャン図・スクリーンショットも対象にできる

## 8. 限界と補完方針

- スキャン PDF や画像中心の資料は抽出精度が落ちる
- 複雑な表は崩れることがある
- 図そのものの意味は取りきれないため、図番号やキャプションを優先して残す
- 必要に応じて Power Automate + OneDrive PDF 変換、または AI Builder の document input を組み合わせる
