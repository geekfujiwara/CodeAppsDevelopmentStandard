---
name: power-platform-standard
description: "Power Platform 包括開発標準を参照して開発する。Use when: Power Platform 開発, Dataverse テーブル作成, Code Apps, Power Automate, フロー作成, Copilot Studio, エージェント開発, ソリューション, デプロイ, トラブルシューティング, スキーマ設計, ローカライズ, SystemUser, createdby, 生成オーケストレーション"
argument-hint: "開発標準に基づいた Power Platform 開発の指示を入力してください"
---

# Power Platform 包括開発標準スキル

## いつ使うか
- Dataverse テーブルの設計・作成
- Code Apps の初期化・デプロイ
- Power Automate クラウドフローの作成・デプロイ
- Copilot Studio エージェントの構築
- Power Platform ソリューション全般の開発
- トラブルシューティング

## 手順

1. まず [開発標準ドキュメント](../../docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md) を読み込む
2. プロジェクトの `.env` ファイルを確認
3. 開発フェーズ（Phase 0〜3）に従って作業を進める
4. チェックリストで確認

## 参照ドキュメント
- [Power Platform コードファースト開発標準](../../docs/POWER_PLATFORM_DEVELOPMENT_STANDARD.md): 全体の開発標準・設計原則・トラブルシューティング
- [Dataverse 統合ガイド](../../docs/DATAVERSE_GUIDE.md): CRUD操作・Lookup・Choice・エラーハンドリング

## 補足リファレンス: awesome-copilot スキル

以下の [github/awesome-copilot](https://github.com/github/awesome-copilot) スキルを**補足的に**利用できます。
**開発標準が常に最優先です。** 競合する場合は開発標準に従ってください。

| カテゴリ | スキル名 | 用途 |
|---|---|---|
| Dataverse | [`dataverse-python-quickstart`](https://github.com/github/awesome-copilot/tree/main/skills/dataverse-python-quickstart) | SDK セットアップ・CRUD・ページング |
| Dataverse | [`dataverse-python-advanced-patterns`](https://github.com/github/awesome-copilot/tree/main/skills/dataverse-python-advanced-patterns) | エラーハンドリング・リトライ・OData最適化 |
| Dataverse | [`dataverse-python-production-code`](https://github.com/github/awesome-copilot/tree/main/skills/dataverse-python-production-code) | 本番向けコードパターン |
| Dataverse | [`dataverse-python-usecase-builder`](https://github.com/github/awesome-copilot/tree/main/skills/dataverse-python-usecase-builder) | ユースケース別ソリューション設計 |
| Copilot Studio | [`mcp-copilot-studio-server-generator`](https://github.com/github/awesome-copilot/tree/main/skills/mcp-copilot-studio-server-generator) | MCP Server コネクタ生成 |
| Power Automate | [`flowstudio-power-automate-mcp`](https://github.com/github/awesome-copilot/tree/main/skills/flowstudio-power-automate-mcp) | FlowStudio MCP 接続・操作 |
| Power Automate | [`flowstudio-power-automate-build`](https://github.com/github/awesome-copilot/tree/main/skills/flowstudio-power-automate-build) | フロー構築・デプロイ |
| Power Automate | [`flowstudio-power-automate-debug`](https://github.com/github/awesome-copilot/tree/main/skills/flowstudio-power-automate-debug) | フローデバッグ・診断 |

> **重要**: Copilot Studio は生成オーケストレーションモード一択（トピックベース開発は非推奨）。FlowStudio MCP の利用には別途サブスクリプションが必要。

## クイックリファレンス: 絶対に守るルール

| ルール | 理由 |
|---|---|
| スキーマ名は英語のみ | `pac code add-data-source` が日本語で失敗 |
| SystemUser を Lookup 先に | カスタムユーザーテーブル不要 |
| createdby を報告者として使用 | カスタム ReportedBy Lookup 不要 |
| Choice 値は 100000000 始まり | Dataverse の仕様 |
| 先にデプロイしてから開発 | Dataverse 接続確立が必要 |
| 生成オーケストレーションモード | トピックベース開発は非推奨 |
| PUT + MetadataId でローカライズ | PATCH では反映されないケースあり |
| テーブル作成はリトライ付き | 0x80040237 メタデータロック対策 |
| Flow API は専用スコープで認証 | Dataverse トークンの使い回し不可 |
| 接続は環境内に事前作成 | API での接続自動作成は不可 |
| フローはべき等パターンでデプロイ | displayName で検索 → 更新 or 新規作成 |
