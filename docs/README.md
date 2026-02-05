# ドキュメント目次

**Gantt Chart Project Manager** の技術ドキュメント一覧

**最終更新**: 2025年10月21日

---

## 🗂️ カテゴリ別ドキュメント

### 📘 Dataverse実装ガイド

> **📖 ドキュメント体系について**
> 
> Dataverse関連のドキュメント群の全体像を理解したい方は:
> - **[DATAVERSE_DOCS_OVERVIEW.md](./DATAVERSE_DOCS_OVERVIEW.md)** - ドキュメント体系と活用方法

#### ⭐ 統合ガイド（最初に読むべき）

| ドキュメント | 説明 | 対象者 |
|------------|------|--------|
| **[DATAVERSE_CONNECTION_GUIDE.md](./DATAVERSE_CONNECTION_GUIDE.md)** | 📘 **Dataverse接続 完全ガイド（統合最終版）**<br>- データソース追加からCRUD実装まで完全網羅<br>- Step-by-Stepで再現性を保証<br>- トラブルシューティング統合<br>- ベストプラクティス集約 | 🎯 全開発者必読<br>最初に読む |

#### 📖 詳細リファレンス（必要に応じて参照）

| ドキュメント | 説明 | 対象者 |
|------------|------|--------|
| **[DATAVERSE_INTEGRATION_BEST_PRACTICES.md](./DATAVERSE_INTEGRATION_BEST_PRACTICES.md)** | Dataverse統合のベストプラクティス<br>- 実プロジェクトでの実装例<br>- より詳細なコードパターン | 詳細パターン参照時 |
| **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** | Lookupフィールド実装の完全ガイド<br>- ビュー切り替え機能<br>- `$expand`によるLookup展開<br>- 50以上のテストチェック項目 | Lookup実装時 |
| **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** | スキーマ取得方法の完全ガイド<br>- 5つの方法を比較<br>- 実践的なワークフロー | スキーマ確認時 |
| **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** | このプロジェクトの実際のスキーマ値<br>- テーブル定義<br>- Choice値の完全リスト | リファレンス |

#### トラブルシューティング

| ドキュメント | 説明 |
|------------|------|
| **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** | 一般的なDataverseエラーと解決方法<br>- データ取得エラー<br>- 権限問題<br>- 接続問題 |
| **[DATAVERSE_DEBUG.md](./DATAVERSE_DEBUG.md)** | デバッグ手順とログ確認方法 |

#### 修正履歴（アーカイブ）

> ⚠️ 以下は過去の問題修正記録です。最新の実装方法は上記の推奨ドキュメントを参照してください。

| ドキュメント | 説明 | 状態 |
|------------|------|------|
| ~~DATAVERSE_LOOKUP_FIELD_FIX.md~~ | Lookupフィールドの初期修正記録 | ⚠️ 非推奨<br>→ [LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md) を参照 |
| **[DATAVERSE_CHOICE_FIELD_FIX.md](./DATAVERSE_CHOICE_FIELD_FIX.md)** | Choice値マッピング修正の記録 | アーカイブ |
| **[DATAVERSE_SYSTEM_FIELDS_FIX.md](./DATAVERSE_SYSTEM_FIELDS_FIX.md)** | システムフィールド修正の記録 | アーカイブ |
| **[DATASOURCE_NAME_FIX.md](./DATASOURCE_NAME_FIX.md)** | データソース名修正の記録 | アーカイブ |

#### スキーマ管理

| ドキュメント | 説明 |
|------------|------|
| **[EXTRACT_DATAVERSE_SCHEMA_FROM_XML.md](./EXTRACT_DATAVERSE_SCHEMA_FROM_XML.md)** | XMLからのスキーマ自動抽出方法<br>- PowerShellスクリプト例 |

---

### 🎨 デザイン・ロゴガイド

#### ⭐ マスターガイド

| ドキュメント | 説明 | 対象者 |
|------------|------|--------|
| **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** | ロゴの完全ガイド<br>- デザイン仕様<br>- 使用方法<br>- 実装例<br>- ブランドガイドライン<br>- アセット一覧 | 🎯 ロゴ使用時必読 |

#### 技術ドキュメント

| ドキュメント | 説明 |
|------------|------|
| **[LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md)** | SVG ID衝突問題の詳細と解決方法<br>- `React.useId()`の使用<br>- トラブルシューティング |
| **[DESIGN_REFRESH_v1.0.8.md](./DESIGN_REFRESH_v1.0.8.md)** | デザインリフレッシュの記録<br>- バージョン履歴 |

#### アーカイブ（統合済み）

> ℹ️ 以下のドキュメントは **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** に統合されました。

- ~~LOGO_GUIDE.md~~ → 統合済み
- ~~LOGO_EXAMPLES.md~~ → 統合済み
- ~~LOGO_VISUAL_GUIDE.md~~ → 統合済み
- ~~LOGO_STANDARD_COMPLIANCE.md~~ → 統合済み
- ~~LOGO_ASSETS.md~~ → 統合済み
- ~~LOGO_OUTPUT.md~~ → 統合済み

---

### 📐 開発標準提案

| ドキュメント | 説明 |
|------------|------|
| **[DEVELOPMENT_STANDARD_UPDATES.md](./DEVELOPMENT_STANDARD_UPDATES.md)** | SVGコンポーネント実装ガイドラインの詳細版<br>- 7つの標準更新提案<br>- コード例<br>- 実装ガイドライン |
| **[STANDARD_UPDATE_SUMMARY.md](./STANDARD_UPDATE_SUMMARY.md)** | 開発標準更新提案のエグゼクティブサマリー |
| **[GITHUB_PROPOSAL.md](./GITHUB_PROPOSAL.md)** | GitHub提案 |

---

## 🎯 シナリオ別ガイド

### 新規開発者がプロジェクトに参加したら

1. **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - Dataverse Lookupフィールドの実装方法を理解
2. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - ロゴの使用方法を確認
3. **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** - テーブル構造とChoice値を確認

### Lookupフィールドを実装したい

1. **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - 実装手順（Step 1-5）を確認
2. 実装後に同ドキュメントの「テストチェックリスト」で検証

### Dataverseスキーマを確認したい

1. **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** - 既知のスキーマ値を確認
2. 最新のスキーマが必要な場合は **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** を参照

### Dataverseエラーが発生したら

1. **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** - 一般的なエラーを確認
2. Lookupフィールド関連の場合は **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** のトラブルシューティングを確認
3. **[DATAVERSE_DEBUG.md](./DATAVERSE_DEBUG.md)** - デバッグ手順を実施

### ロゴを実装・使用したい

1. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - 使用方法と実装例を確認
2. 表示されない場合は **[LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md)** を確認

---

## 📊 ドキュメント統計

- **総ドキュメント数**: 15ファイル（統合後）
  - Dataverse関連: 10ファイル
  - Logo関連: 3ファイル
  - 開発標準: 3ファイル
  - その他: 2ファイル（レビュー報告書、このREADME）

- **推奨ドキュメント**: 3ファイル ⭐
  - LOOKUP_FIELD_GUIDE.md
  - LOGO_MASTER_GUIDE.md
  - DATAVERSE_SCHEMA_REFERENCE.md

---

## 🔄 ドキュメント更新履歴

### 2025年10月21日 - ドキュメント統合

- ✅ Logo関連8ファイル → **LOGO_MASTER_GUIDE.md** に統合
- ✅ **DATAVERSE_LOOKUP_FIELD_FIX.md** に非推奨警告を追加
- ✅ スキーマドキュメント間に相互参照を追加
- ✅ **DOCUMENTATION_REVIEW_REPORT.md** でレビュー実施
- ✅ このREADMEを作成

### 2025年10月17日 - Lookupフィールド実装完了

- ✅ **LOOKUP_FIELD_GUIDE.md** 作成（1589行、包括的ガイド）
- ✅ ビュー切り替え機能実装
- ✅ savedQueryパラメータの制限事項を文書化

### 2025年10月17日 - Choice値修正

- ✅ **DATAVERSE_CHOICE_FIELD_FIX.md** 更新
- ✅ Priority値を実際のDataverseスキーマに修正（Critical: 0, High: 1）

---

## 📚 外部リンク

### Power Platform公式ドキュメント

- [Dataverse Web API リファレンス](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)
- [EntityMetadata Web API](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/retrieve-metadata-web-api)
- [Power Platform CLI リファレンス](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/auth)

### 開発標準

- [CodeAppsDevelopmentStandard](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard)

---

## 💡 ドキュメント管理のベストプラクティス

### 命名規則

```
# マスタードキュメント（最新・包括版）
<TOPIC>_GUIDE.md
例: LOOKUP_FIELD_GUIDE.md, LOGO_MASTER_GUIDE.md

# リファレンス（静的な値）
<TOPIC>_REFERENCE.md
例: DATAVERSE_SCHEMA_REFERENCE.md

# トラブルシューティング
<TOPIC>_TROUBLESHOOTING.md

# 修正履歴（アーカイブ）
<TOPIC>_<ISSUE>_FIX.md
例: DATAVERSE_CHOICE_FIELD_FIX.md
```

### ドキュメント更新時のルール

1. **非推奨ドキュメント** には先頭に警告を追加
2. **新しいドキュメント** へのリンクを提供
3. **相互参照** を積極的に使用
4. **このREADME** を最新の状態に保つ

---

**作成者**: GitHub Copilot  
**最終更新**: 2025年10月21日

このREADMEについての質問や提案は、プロジェクトメンテナーにお問い合わせください。
