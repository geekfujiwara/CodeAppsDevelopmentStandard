---
name: spec-to-markdown
description: "PDF・PowerPoint・Excel などの仕様書を MarkItDown ベースで markdown 化し、Power Platform 開発向け factsheet と document を整理する。"
category: ai
argument-hint: "[任意: input フォルダのパス or ファイルパス]"
user-invocable: true
triggers:
  - "MarkItDown"
  - "仕様書変換"
  - "仕様書を markdown にしたい"
  - "PDF を markdown"
  - "PowerPoint を markdown"
  - "Excel を markdown"
  - "factsheet"
  - "document.md"
  - "requirements markdown"
  - "inputフォルダ"
  - "画像をOCR"
  - "画像を要件"
  - "スクリーンショットを要件"
  - "PNG を markdown"
  - "JPG を markdown"
---

# 仕様書→要件 markdown 変換スキル

PDF・PowerPoint・Excel・Word などの仕様書を **MarkItDown ベースで markdown に変換**し、  
Power Platform 開発で使いやすい **factsheet 群** と **全体 document.md** に整理する。

## 最初の依頼を簡単にする

このスキルは **引数なしでも開始できる** ようにする。

- 既定入力: `work/spec-to-markdown/input/`
- 既定出力: `work/spec-to-markdown/output/<input-set>-<timestamp>/`
- `--input` / `--output` を指定した場合はそのパスを優先する

### 推奨の始め方

- `@GeekPowerCode input フォルダの仕様書を requirements markdown に変換して`
- `@GeekPowerCode /home/.../input の PDF と Excel を factsheet 化して`
- `@GeekPowerCode spec-to-markdown`
- `@GeekPowerCode spec-to-markdown input`

## 目的

出力は **Power Platform 前提の開発要件整理** に寄せる。
単なる全文変換で終わらせず、Dataverse / Code Apps / Power Automate / Copilot Studio / AI Builder の観点で整理する。

## 基本フロー

1. `scripts/convert_documents.py --agent-ocr` で既定 input フォルダ、または指定された input パス内の仕様書を markdown 化する
2. 各ファイルごとに `factsheets/*.md` を作る（画像は `pending-ocr` スタブとして出力される）
3. `@GeekPowerCode pending_ocr.json を処理して` と依頼し、GitHub Copilot が画像を OCR する
4. 横断要件を `document.md` にまとめる
5. 不明点・矛盾点・未記載事項は推測で埋めず `要確認` として残す

## 画像 OCR フロー（GitHub Copilot 使用）

画像ファイル (`.png`, `.jpg` 等) は GitHub Copilot エージェント自身のビジョン機能で OCR する。API キーは不要。

### 手順

**Step 1: スクリプトを `--agent-ocr` で実行**

```bash
python convert_documents.py --agent-ocr
```

- ドキュメントファイル (PDF / Office 系) は通常通り MarkItDown で変換される
- 画像ファイルは `pending-ocr` スタブとして出力される
- 出力フォルダに `pending_ocr.json` が書き出される

**Step 2: エージェントに処理を依頼**

スクリプト完了後、次のように依頼する。

```
@GeekPowerCode pending_ocr.json を処理して
```

エージェントは `pending_ocr.json` を読み、各画像を 1 枚ずつ `view` ツールで読み込んで OCR テキストを抽出し、`raw/<slug>.md` と `factsheets/<slug>.md` を更新する。

### エージェントが pending_ocr.json を処理する際の手順

エージェントは次のステップで処理する:

1. `pending_ocr.json` を読み込み、`source_path` / `raw_markdown_path` / `factsheet_path` を取得する
2. 各画像ファイルを `view` ツールで 1 枚ずつ読み込む
3. 画像から読み取れるテキスト・表・図の説明を抽出する
4. `raw_markdown_path` ファイルの `<!-- pending-ocr -->` マーカー以下を OCR テキストで上書きする
5. `factsheet_path` ファイルの `Status: pending-ocr` を `success` に変更し、Section 3 の pending マーカーを OCR テキストで置き換える
6. 全画像の処理完了後、`document.md` の pending-ocr エントリを更新する

## 出力フォルダ構成

```text
{output}/
  raw/                 # MarkItDown の変換結果
  factsheets/          # ファイル単位の factsheet
  document.md          # 全体統合ドキュメント
```

### 既定フォルダ運用

```text
work/
  spec-to-markdown/
    input/
      customer-a/
      project-x/
    output/
      batch-2026-05-11-20-15-58/
      customer-a-2026-05-11-20-17-42/
```

- `input/` 直下にファイルを置いた場合は `batch-<timestamp>/`
- `input/customer-a/` のような入力セットを指定した場合は `customer-a-<timestamp>/`
- 出力先を固定したい場合だけ `--output /absolute/path/to/output` を使う

## factsheet で必ず整理する項目

- 対象業務 / 目的
- 利用者 / ロール
- Dataverse テーブル候補
- 主要列 / マスタ / リレーション候補
- Code Apps / Model-Driven Apps の UI 要件
- Power Automate の自動化要件
- Copilot Studio / AI Builder の利用余地
- 外部連携
- セキュリティ / 権限 / 監査の論点
- 未確定事項 / 要確認事項

## document.md で必ず整理する項目

- 対象文書一覧
- 文書間の重複 / 差分 / 矛盾
- 共通業務フロー
- Power Platform 全体構成の初期案
- Phase 0 でユーザー確認が必要な論点

## MarkItDown 方針

- 変換の第一候補は **Microsoft MarkItDown**
- 画像ファイル (`.png`, `.jpg` 等) は `--agent-ocr` フラグを使い GitHub Copilot のビジョン機能で OCR する
- スキャン PDF や画像中心資料で精度不足の場合は、OCR や Power Automate / AI Builder を併用する
- 表や箇条書きは markdown として残し、情報欠落時は factsheet に注記する

## 変換後の次アクション

- 全体構成の判断 → `architecture`
- Dataverse テーブル設計 → `dataverse`
- UI 実装 → `code-apps` または `model-driven-app`
- 自動化 → `power-automate`
- エージェント化 → `copilot-studio`
- AI プロンプト化 → `ai-builder`

## 参照

- [変換ガイド](references/conversion-guide.md)
