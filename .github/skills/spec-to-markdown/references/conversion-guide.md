# 仕様書 markdown 変換ガイド（anthropics/skills + agent-ocr）

## 1. 何を作るか

このスキルの出力は `spec/` 配下の構成。

```
spec/
├── input/                     # 変換元ドキュメントを置く
├── output/
│   ├── staging/               # ファイル単位 markdown
│   └── docs/                  # 業務要件 / 機能要件 / 設計要件
└── .cache/                    # システム内部用
    ├── conversion-checklist.json
    ├── pending_ocr.json
    └── pending_skills.json
```

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
python convert_documents.py
```

### Windows (PowerShell)

```powershell
cd .github\skills\spec-to-markdown\scripts
powershell -ExecutionPolicy Bypass -File run_windows.ps1
```

## 3. 既定パス

- 入力: `<repo-root>/spec/input/`
- staging: `<repo-root>/spec/output/staging/`
- docs: `<repo-root>/spec/output/docs/`
- checklist: `<repo-root>/spec/.cache/conversion-checklist.json`
- pending JSON: checklist と同じ `spec/.cache/` に自動配置

オプション（checklist のパスを変えると pending JSON も同じディレクトリに移動する）:

```bash
python convert_documents.py \
  --input /absolute/path/to/input \
  --staging /absolute/path/to/staging \
  --docs /absolute/path/to/docs \
  --checklist /absolute/path/to/.cache/conversion-checklist.json
```

## 4. 出力ファイル命名

`staging` の各ファイルは次の命名に統一する。

- `元のファイル名.元の拡張子.MD`
- 例: `要件定義.docx.MD`, `画面設計.xlsx.MD`, `menu.png.MD`

同名衝突時は相対ディレクトリ由来のサフィックスを自動付与する。

## 5. pending manifest

### pending_ocr.json

画像ファイルを agent-ocr で処理するための manifest。

- `source_path`
- `relative_path`
- `staging_markdown_path`
- `sha256`
- `processor` (`agent-ocr`)
- `ocr_prompt_hint`（抽出時の最小指示）

### pending_skills.json

画像以外を anthropics/skills で処理するための manifest。

- `source_path`
- `relative_path`
- `staging_markdown_path`
- `sha256`
- `processor` (`anthropics/skills`)

## 6. docs の構成

### business-requirements.md
- 対象業務 / 目的
- 利用者 / ロール
- 業務フロー
- 未確定事項 / 要確認事項
- 要件変更履歴（理由を併記）

### functional-requirements.md
- Dataverse テーブル候補
- 主要列 / マスタ / リレーション候補
- Code Apps / Model-Driven Apps の UI 要件
- Power Automate の自動化要件
- Copilot Studio / AI Builder の利用余地
- 外部連携
- 要件変更履歴（理由を併記）

### design-requirements.md
- Power Platform 全体構成案
- セキュリティ / 権限 / 監査の論点
- 設計上のリスク
- Phase 0 で確認が必要な論点
- 要件変更履歴（理由を併記）

## 7. conversion-checklist の運用

- 新規ファイルが `spec/input/` に増えたらチェックリストへ追加
- `is_completed=false` のファイルは再処理対象
- 既存ファイルでも `source_sha256` が変わったら再処理対象
- 全件完了時は `spec/output/docs/` を参照して開発を進める

## 8. 処理ルール

- 画像は必ず agent-ocr
- 画像以外は anthropics/skills
- 推測で埋めず、情報不足は `要確認`
- OCR 抽出では表を markdown table 化し、判読不能箇所は `[判読不可]` とする

補足: anthropics/skills（Claude）も画像読解は可能だが、この運用では OCR を agent-ocr に固定する。

## 9. 備考

`convert_documents.py` は `spec/output/staging/`・`spec/output/docs/` の土台作成と  
`spec/.cache/` への pending manifest 生成を担当する。  
manifest の解消（agent-ocr / anthropics/skills 実行）後、`spec/output/docs/` を確定版に更新する。
