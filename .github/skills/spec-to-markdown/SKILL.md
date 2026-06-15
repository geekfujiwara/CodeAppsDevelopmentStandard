---
name: spec-to-markdown
description: "office ドキュメントを anthropics/skills で markdown 化し、画像は agent-ocr で処理して /spec/output/staging と /spec/output/docs に整理する。"
category: ai
argument-hint: "[省略可: /path/to/specs — 省略時は spec/input/ を使用]"
user-invocable: true
triggers:
  - "anthropics/skills"
  - "仕様書変換"
  - "仕様書を markdown にしたい"
  - "PDF を markdown"
  - "PowerPoint を markdown"
  - "Excel を markdown"
  - "requirements markdown"
  - "spec/input"
  - "画像をOCR"
---

# 仕様書→要件 markdown 変換スキル

office ドキュメント（PDF / PowerPoint / Excel / Word など）は **anthropics/skills** で読み取り、  
画像ファイル（PNG/JPG 等）は **agent-ocr** で OCR する。

## フォルダ構造

```
spec/                          ← スキル専用ディレクトリ
├── input/                     # ここに変換したいファイルを置く（ユーザーが操作）
├── output/                    # 全出力はここに入る（ユーザーが参照）
│   ├── staging/               # ファイル単位の中間 markdown
│   └── docs/                  # 統合要件定義書 5 点
│       ├── index.md           # ドキュメント一覧・開発利用フロー
│       ├── business-requirements.md
│       ├── functional-requirements.md
│       ├── design-requirements.md
│       └── test-requirements.md
└── .cache/                    # システム内部用（ユーザーは触らない）
    ├── conversion-checklist.json
    ├── pending_ocr.json
    └── pending_skills.json
```

## 最初の依頼を簡単にする

このスキルは **引数なしでも開始できる**。

- 既定入力: `spec/input/`
- 既定 staging 出力: `spec/output/staging/`
- 既定 docs 出力: `spec/output/docs/`
- 既定 checklist: `spec/.cache/conversion-checklist.json`
- `--input` / `--staging` / `--docs`（互換: `--output`）/ `--checklist` を指定した場合はそのパスを優先する

## 処理フロー

```
[spec/input/]
     │
     ├─ 画像 (PNG/JPG 等) ──→ spec/.cache/pending_ocr.json    ──→ agent-ocr
     │                                                                  │
     └─ 文書 (PDF/Office)  ──→ spec/.cache/pending_skills.json ──→ anthropics/skills
                                                                        │
                                                          ┌─────────────┘
                                                          ▼
                                              [spec/output/staging/]
                                                          │
                                                 (Claude が統合)
                                                          │
                                              [spec/output/docs/]
                                         ├── index.md
                                         ├── business-requirements.md
                                         ├── functional-requirements.md
                                         ├── design-requirements.md
                                         └── test-requirements.md
```

## 基本フロー

1. `scripts/convert_documents.py` で input 配下を走査する
2. 各ファイルの staging ファイルを `spec/output/staging/` に作成する
   - ファイル名は `元のファイル名.元の拡張子.MD`（例: `要件定義.docx.MD`）
3. 画像ファイルは `spec/.cache/pending_ocr.json` に記録し、agent-ocr で後続処理する
4. 画像以外の文書は `spec/.cache/pending_skills.json` に記録し、anthropics/skills で後続処理する
5. `spec/output/docs/` に以下 5 つを作成する
   - `index.md`（ドキュメント一覧・開発利用フロー）
   - `business-requirements.md`
   - `functional-requirements.md`
   - `design-requirements.md`
   - `test-requirements.md`
6. `spec/.cache/conversion-checklist.json` を更新する
   - 新規ファイルはチェックリストへ追加
   - `is_completed=false` または更新差分ありのファイルのみ再処理
   - 全件完了時は既存 `spec/output/docs/` を参照して開発を継続

## staging → docs 統合フロー

staging の変換完了後、以下の手順で docs を更新する。

1. `spec/.cache/conversion-checklist.json` を読み、`is_completed=false` のファイルがないか確認する
2. `is_completed=false` が残っていれば、対象の staging ファイルを読んで内容を補完する
3. 全 staging ファイルを横断し、各 docs の `要確認` を実際の要件に書き換える：
   - `business-requirements.md` → ステークホルダー・ユーザーストーリー・業務フロー
   - `functional-requirements.md` → 機能一覧(MoSCoW)・データモデル・非機能要件
   - `design-requirements.md` → 全体構成・コンポーネント・リスク・実装タスク分解
   - `test-requirements.md` → テストシナリオ・受け入れ条件（functional の機能一覧 # と対応）
4. `index.md` の処理状況テーブルも合わせて更新する
5. 推測で埋めず、情報不足は `要確認` として残す

## agent-ocr 更新方針

画像の出力先とファイル名は新構成に合わせる。

- 出力先: `spec/output/staging/`
- ファイル名: `元のファイル名.元の拡張子.MD`
- OCR 抽出時は表を markdown table 化し、判読不能箇所は `[判読不可]` と明記する

`pending_ocr.json` の `staging_markdown_path` を使って、対象ファイルを更新する。
`pending_ocr.json` の `ocr_prompt_hint` を agent-ocr の抽出指示として利用する。

## anthropics/skills 更新方針

画像以外の文書は `pending_skills.json` を使って処理する。

- `source_path` の元ファイルを anthropics/skills で読み取り
- `context_hint` を参照してどの観点で内容を抽出するかを確認する
- 抽出 markdown を `staging_markdown_path` に反映
- 処理済み後、`docs` の 5 文書を更新

補足: anthropics/skills（Claude）は画像読解も可能だが、このスキルでは OCR の責務を agent-ocr に固定する。

## `spec/output/docs/` で整理する観点

### index.md
- ドキュメント一覧（各 docs へのリンクと役割）
- 処理状況テーブル
- 開発利用フロー（番号付き手順）

### business-requirements.md
- 概要（対象業務・プロジェクト背景・スコープ）
- ステークホルダー / ロール（ロール・担当業務・関心事の表）
- ユーザーストーリー（As a…I want…so that…形式）
- 業務フロー
- 未確定事項 / 要確認事項（項目・確認先・期限・ステータスの表）
- 要件変更履歴（変更理由を必ず併記）

### functional-requirements.md
- 機能一覧（MoSCoW 優先度・受け入れ条件の表）
- Dataverse テーブル候補（テーブル名・主な列・リレーション）
- Code Apps / Model-Driven Apps の UI 要件
- Power Automate の自動化要件
- Copilot Studio / AI Builder の利用余地
- 外部連携
- 非機能要件（パフォーマンス・セキュリティ・可用性・スケーラビリティ）
- 要件変更履歴（変更理由を必ず併記）

### design-requirements.md
- Power Platform 全体構成案
- コンポーネント設計（種別・役割・依存の表）
- セキュリティ / 権限 / 監査（区分・内容・対応方針の表）
- 設計上のリスク（リスク・影響度・発生確率・対応方針の表）
- Phase 1 で確認が必要な論点
- 実装タスク分解（タスク・依存・優先度・見積の表）
- 要件変更履歴（変更理由を必ず併記）

### test-requirements.md
- テスト戦略（テスト方針・環境・自動化範囲）
- テストシナリオ（シナリオ名・前提条件・操作手順・期待結果・優先度の表）
- 受け入れ条件（functional-requirements の機能 # と対応させた表）
- 非機能テスト（区分・テスト内容・合格基準の表）
- 要件変更履歴（変更理由を必ず併記）

## 実行例

```bash
cd .github/skills/spec-to-markdown/scripts
python convert_documents.py
```

## 参照

- [変換ガイド](references/conversion-guide.md)
