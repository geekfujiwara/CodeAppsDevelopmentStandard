---
name: spec-to-markdown
description: "office ドキュメントを anthropics/skills で markdown 化し、画像は agent-ocr で処理して /work/staging と /work/output に整理する。"
category: ai
argument-hint: "[任意: input フォルダのパス or ファイルパス]"
user-invocable: true
triggers:
  - "anthropics/skills"
  - "仕様書変換"
  - "仕様書を markdown にしたい"
  - "PDF を markdown"
  - "PowerPoint を markdown"
  - "Excel を markdown"
  - "requirements markdown"
  - "inputフォルダ"
  - "画像をOCR"
  - "staging"
  - "output"
---

# 仕様書→要件 markdown 変換スキル

office ドキュメント（PDF / PowerPoint / Excel / Word など）は **anthropics/skills** で読み取り、  
画像ファイル（PNG/JPG 等）は **agent-ocr** で OCR する。

出力は `/work` 配下の 2 段構成に統一する。

- `/work/staging` : ファイル単位の markdown
- `/work/output` : 業務要件 / 機能要件 / 設計要件 markdown

## 最初の依頼を簡単にする

このスキルは **引数なしでも開始できる**。

- 既定入力: `work/input/`
- 既定 staging 出力: `work/staging/`
- 既定 output 出力: `work/output/`
- `--input` / `--staging` / `--output` を指定した場合はそのパスを優先する

## 基本フロー

1. `scripts/convert_documents.py` で input 配下を走査する
2. 各ファイルの staging ファイルを `/work/staging` に作成する
   - ファイル名は `元のファイル名.元の拡張子.MD`（例: `要件定義.docx.MD`）
3. 画像ファイルは `pending_ocr.json` に記録し、agent-ocr で後続処理する
4. 画像以外の文書は `pending_skills.json` に記録し、anthropics/skills で後続処理する
5. `/work/output` に以下 3 つを作成する
   - `business-requirements.md`
   - `functional-requirements.md`
   - `design-requirements.md`

## agent-ocr 更新方針

画像の出力先とファイル名は新構成に合わせる。

- 出力先: `/work/staging`
- ファイル名: `元のファイル名.元の拡張子.MD`
- OCR 抽出時は表を markdown table 化し、判読不能箇所は `[判読不可]` と明記する

`pending_ocr.json` の `staging_markdown_path` を使って、対象ファイルを更新する。
`pending_ocr.json` の `ocr_prompt_hint` を agent-ocr の抽出指示として利用する。

## anthropics/skills 更新方針

画像以外の文書は `pending_skills.json` を使って処理する。

- `source_path` の元ファイルを anthropics/skills で読み取り
- 抽出 markdown を `staging_markdown_path` に反映
- 処理済み後、`output` の 3 文書を更新

補足: anthropics/skills（Claude）は画像読解も可能だが、このスキルでは OCR の責務を agent-ocr に固定する。

## `/work/output` で整理する観点

### business-requirements.md
- 対象業務 / 目的
- 利用者 / ロール
- 業務フロー
- 未確定事項 / 要確認事項

### functional-requirements.md
- Dataverse テーブル候補
- 主要列 / マスタ / リレーション候補
- Code Apps / Model-Driven Apps の UI 要件
- Power Automate の自動化要件
- Copilot Studio / AI Builder の利用余地
- 外部連携

### design-requirements.md
- Power Platform 全体構成案
- セキュリティ / 権限 / 監査の論点
- 設計上のリスク
- Phase 0 で確認が必要な論点

## 実行例

```bash
cd .github/skills/spec-to-markdown/scripts
python convert_documents.py
```

## 参照

- [変換ガイド](references/conversion-guide.md)
