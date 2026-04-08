---
name: power-platform-standard
description: "Power Platform コードファースト開発標準を参照して開発する。Use when: Power Platform 開発, Dataverse テーブル作成, Code Apps, Copilot Studio, エージェント開発, ソリューション, デプロイ, トラブルシューティング, スキーマ設計, ローカライズ, SystemUser, createdby, 生成オーケストレーション"
argument-hint: "開発標準に基づいた Power Platform 開発の指示を入力してください"
---

# Power Platform コードファースト開発標準スキル

## いつ使うか
- Dataverse テーブルの設計・作成
- Code Apps の初期化・デプロイ
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
