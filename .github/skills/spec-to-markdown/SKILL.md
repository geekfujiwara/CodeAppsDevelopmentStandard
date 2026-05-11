---
name: spec-to-markdown
description: "PDF・PowerPoint・Excel などの仕様書を MarkItDown ベースで markdown 化し、Power Platform 開発向け factsheet と document を整理する。"
category: ai
argument-hint: "[input フォルダのパス or ファイルパス]"
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
---

# 仕様書→要件 markdown 変換スキル

PDF・PowerPoint・Excel・Word などの仕様書を **MarkItDown ベースで markdown に変換**し、  
Power Platform 開発で使いやすい **factsheet 群** と **全体 document.md** に整理する。

## 最初の依頼を簡単にする

このスキルは **input フォルダを指定するだけ** で開始できるようにする。

### 推奨の始め方

- `@GeekPowerCode input フォルダの仕様書を requirements markdown に変換して`
- `@GeekPowerCode /home/.../input の PDF と Excel を factsheet 化して`
- `@GeekPowerCode spec-to-markdown input`

## 目的

出力は **Power Platform 前提の開発要件整理** に寄せる。
単なる全文変換で終わらせず、Dataverse / Code Apps / Power Automate / Copilot Studio / AI Builder の観点で整理する。

## 基本フロー

1. `scripts/convert_documents.py` で input フォルダ内の仕様書を markdown 化する
2. 各ファイルごとに `factsheets/*.md` を作る
3. 横断要件を `document.md` にまとめる
4. 不明点・矛盾点・未記載事項は推測で埋めず `要確認` として残す

## 出力フォルダ構成

```text
{output}/
  raw/                 # MarkItDown の変換結果
  factsheets/          # ファイル単位の factsheet
  document.md          # 全体統合ドキュメント
```

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
