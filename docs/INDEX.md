# Power Apps Code Apps リファレンス集

> **📘 本ドキュメント群について**  
> このフォルダには、CodeAppsStarter テンプレートを使用した Power Apps Code Apps 開発のリファレンスを格納しています。
> - **テンプレートカスタマイズガイド**: CodeAppsStarterの機能拡張・カスタマイズ手順
> - **デザインシステムリファレンス**: shadcn/ui + Tailwind CSS による実装方法
> - **Dataverse統合ガイド**: テンプレートでのDataverse機能実装
> - **トラブルシューティング**: テンプレート特有の問題解決とデバッグガイド

**最終更新**: 2026年2月26日

---

## 📚 ドキュメント体系

```
📁 CodeAppsDevelopmentStandard/
├── README.md                    ← 【開発標準】テンプレートベース開発フロー・概要
└── docs/                        ← 【リファレンス集】テンプレートカスタマイズの詳細手順
    ├── INDEX.md                 ← このファイル（リファレンスの目次）
    ├── テンプレート活用/        ← CodeAppsStarterの機能拡張・カスタマイズ
    ├── Dataverse統合/           ← テンプレートでのDataverse統合詳細ガイド
    ├── デザインシステム/        ← shadcn/ui + Tailwind CSS カスタマイズガイド
    └── トラブルシューティング/  ← テンプレート特有の問題解決とデバッグ
```

---

## 🎯 このドキュメント群の使い方

### 1️⃣ 開発を始める前に
**→ [メインREADME.md](../README.md) を読む**
- CodeAppsStarterテンプレート活用フローを理解
- Power Apps SDK の基本原則を把握
- テンプレートからのカスタマイズ方針を確認

### 2️⃣ テンプレートのカスタマイズ時
**→ Phase別リファレンスを参照**
- 要件分析（Phase2）：テンプレート機能の確認と拡張計画
- 機能実装：shadcn/ui コンポーネントの活用とカスタマイズ
- デプロイ：カスタマイズしたテンプレートのPower Apps展開

### 3️⃣ 特定機能の実装時
**→ 機能別リファレンスを参照**
- テンプレートでのDataverse Lookupフィールド実装
- デザインシステム（shadcn/ui）のカスタマイズ
- ブランディング：ロゴ・カラーテーマの変更

### 4️⃣ 問題が発生したら
**→ トラブルシューティングガイドを確認**
- テンプレート特有のエラーと解決方法
- shadcn/ui コンポーネントの問題対応
- Power Platform統合のデバッグ方法
- 実際の問題解決事例を参照

---

## 📂 Phase別リファレンス

### 🚀 開発Phase順

| Phase | リファレンス | 説明 | 所要時間 |
|-------|------------|------|---------|
| **Phase 0** | **[PHASE0_ENVIRONMENT_SETUP.md](../PHASE0_ENVIRONMENT_SETUP.md)** | 開発ツールのインストールと設定 | 30分 |
| **Phase 1** | **[CodeAppsStarter（外部リポジトリ）](https://github.com/geekfujiwara/CodeAppsStarter)** | Microsoft標準テンプレートのセットアップ<br>ローカル実行・Power Appsデプロイ | 1時間 |
| **Phase 2** | **[PHASE2_FEATURE_ENHANCEMENT.md](../PHASE2_FEATURE_ENHANCEMENT.md)** | CodeAppsStarter参照型の機能拡張<br>shadcn/ui + Tailwind CSS の活用<br>ブランディング適用 | 2時間 |
| **Phase 3** | **[PHASE3_DATA_INTEGRATION.md](../PHASE3_DATA_INTEGRATION.md)** | Dataverseやコネクター統合<br>データソース接続・CRUD実装 | プロジェクトによる |

---

## 📂 機能別リファレンス

### 🗃️ Dataverse実装ガイド

#### ⭐ 必読ドキュメント（統合版）

| ドキュメント | 説明 | 対象フェーズ |
|------------|------|------------|
| **[DATAVERSE_TABLE_CLI_GUIDE.md](./DATAVERSE_TABLE_CLI_GUIDE.md)** | 🆕 **DataverseテーブルCLIガイド（新フロー）**<br>- CLIでテーブル作成・スキーマ設計<br>- pac solution でソリューション管理<br>- 既存テーブルのCLIエクスポート<br>⭐ **テーブル設計・管理の新標準** | Phase 3: Dataverseテーブル設計 |
| **[DATAVERSE_CONNECTION_GUIDE.md](./DATAVERSE_CONNECTION_GUIDE.md)** | 📘 **Dataverse接続 完全ガイド（統合最終版）**<br>- データソース追加からCRUD実装まで完全網羅<br>- Step-by-Stepで再現性を保証<br>- トラブルシューティング統合<br>- ベストプラクティス集約<br>⭐ **接続実装の統合ドキュメント** | Phase 3: データソース統合 |

#### 📖 詳細リファレンス（必要に応じて参照）

| ドキュメント | 説明 | 対象フェーズ |
|------------|------|------------|
| **[DATAVERSE_INTEGRATION_BEST_PRACTICES.md](./DATAVERSE_INTEGRATION_BEST_PRACTICES.md)** | Dataverse統合のベストプラクティス<br>- プロジェクト初期化からCRUD操作まで<br>- エラーハンドリングとバリデーション<br>- パフォーマンス最適化 | Phase 3: データソース統合 |
| **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** | 🔍 Lookupフィールド実装の完全ガイド<br>- ビュー切り替え機能<br>- `$expand`によるLookup展開<br>- 50以上のテストチェック項目 | Phase 3: データソース統合 |
| **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** | 📋 実際のスキーマリファレンス<br>- テーブル定義<br>- Choice値の完全リスト<br>- リレーション定義 | Phase 3: データソース統合 |
| **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** | 🔎 スキーマ取得方法の完全ガイド<br>- 5つの方法を比較<br>- 実践的なワークフロー | Phase 3: データソース統合前 |

#### トラブルシューティング

| ドキュメント | 説明 | 使用タイミング |
|------------|------|--------------|
| **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** | 🚨 一般的なエラーと解決方法<br>- データ取得エラー<br>- 権限問題<br>- 接続問題 | エラー発生時 |
| **[DATAVERSE_DEBUG.md](./DATAVERSE_DEBUG.md)** | 🐛 デバッグ手順とログ確認方法 | デバッグ時 |

#### 実装履歴（参考資料）

> ⚠️ 以下は過去の問題修正記録です。最新の実装方法は上記の必読ドキュメントを参照してください。

| ドキュメント | 内容 | 状態 |
|------------|------|------|
| [DATAVERSE_CHOICE_FIELD_FIX.md](./DATAVERSE_CHOICE_FIELD_FIX.md) | Choice値マッピングの修正記録 | アーカイブ |
| [DATAVERSE_SYSTEM_FIELDS_FIX.md](./DATAVERSE_SYSTEM_FIELDS_FIX.md) | システムフィールド修正の記録 | アーカイブ |
| [DATAVERSE_LOOKUP_FIELD_FIX.md](./DATAVERSE_LOOKUP_FIELD_FIX.md) | Lookupフィールドの初期修正記録 | 非推奨 → LOOKUP_FIELD_GUIDE.md参照 |
| [DATASOURCE_NAME_FIX.md](./DATASOURCE_NAME_FIX.md) | データソース名修正の記録 | アーカイブ |

---

### 🎨 デザインシステムガイド

#### ⭐ テンプレート活用ガイド

| ドキュメント | 説明 | 対象フェーズ |
|------------|------|------------|
| **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** | 🎨 テンプレートでのロゴ実装ガイド<br>- CodeAppsStarterでの実装方法<br>- shadcn/ui コンポーネント活用<br>- ブランドカスタマイズ手順 | Phase 2: デザインシステム |

#### デザインシステムカスタマイズ

| ドキュメント | 説明 | 使用タイミング |
|------------|------|--------------|
| **[THEME_CUSTOMIZATION_GUIDE.md](./THEME_CUSTOMIZATION_GUIDE.md)** | 🎨 Tailwind CSS カスタマイズガイド<br>- カラーテーマの変更<br>- カスタムコンポーネントの作成 | デザインカスタマイズ時 |
| **[SHADCN_UI_EXTENSION_GUIDE.md](./SHADCN_UI_EXTENSION_GUIDE.md)** | 🔧 shadcn/ui コンポーネント拡張<br>- 新しいコンポーネントの追加<br>- 既存コンポーネントのカスタマイズ | 機能拡張時 |

---

## 📐 開発標準への提案

> ℹ️ 以下のドキュメントは開発標準への提案として作成されましたが、メインREADME.mdに反映済みのためアーカイブされています。

<!--
| ドキュメント | 説明 | 状態 |
|------------|------|------|
| DEVELOPMENT_STANDARD_UPDATES.md | SVGコンポーネント実装ガイドラインの詳細版 | → README.mdに反映済み |
| STANDARD_UPDATE_SUMMARY.md | 開発標準更新提案のサマリー | アーカイブ |
| GITHUB_PROPOSAL.md | GitHub提案 | 検討中 |
-->

---

## 🎯 シナリオ別ガイド

### テンプレート初期化から開発まで

1. **[PHASE0_ENVIRONMENT_SETUP.md](../PHASE0_ENVIRONMENT_SETUP.md)** - 開発環境のセットアップ
2. **[CodeAppsStarter（外部リポジトリ）](https://github.com/geekfujiwara/CodeAppsStarter)** - Microsoft標準テンプレートのセットアップとデプロイ
3. **[PHASE2_FEATURE_ENHANCEMENT.md](../PHASE2_FEATURE_ENHANCEMENT.md)** - CodeAppsStarter参照型の機能拡張
4. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - ロゴの実装方法を確認

### Dataverse接続を実装したい

1. **[DATAVERSE_TABLE_CLI_GUIDE.md](./DATAVERSE_TABLE_CLI_GUIDE.md)** - ⭐ **まずこれを読む**: CLIでテーブル作成・ソリューション管理（新フロー）
   - pac CLIでテーブルを作成（UI操作不要）
   - ソリューションをGitで管理
2. **[DATAVERSE_CONNECTION_GUIDE.md](./DATAVERSE_CONNECTION_GUIDE.md)** - Dataverse接続の完全ガイド（統合最終版）
   - データソース追加からCRUD実装まで完全網羅
   - Step-by-Stepで確実に実装
   - トラブルシューティング統合
3. **[メインREADME.md - Phase 3: データソース統合](../README.md#phase-3-データソース統合)** - 開発標準での位置づけを理解
4. 必要に応じて詳細リファレンスを参照:
   - **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** - CLIベースのスキーマ取得
   - **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** - スキーマ定義リファレンス
   - **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - Lookupフィールド詳細ガイド

### テンプレートでのLookupフィールド実装

1. **[メインREADME.md - Phase 3: データソース統合](../README.md#phase-3-データソース統合)** - テンプレートでの基本パターンを理解
2. **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - 詳細な実装手順（Step 1-5）を確認
3. 実装後 → 同ドキュメントの「テストチェックリスト」で検証

### SVGロゴやアイコンを実装したい

1. **[メインREADME.md - コンポーネント設計](../README.md#コンポーネント設計原則)** - 基本原則を確認
2. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - ロゴの使用方法・SVG ID衝突の回避方法を確認

### エラーが発生したら

1. エラーメッセージを確認
2. **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** - Dataverseエラーを検索
3. **[DATAVERSE_DEBUG.md](./DATAVERSE_DEBUG.md)** - デバッグ方法を確認
4. 解決しない場合 → 各機能別ガイドの「トラブルシューティング」セクションを確認

---

## 📖 メインREADME.mdとの関係

### メインREADME.md（開発標準）の役割
- ✅ 開発プロセス全体のフロー（Phase 0-3）
- ✅ Power Apps SDK の基本原則
- ✅ データソース接続の標準手順
- ✅ プロジェクト構造とアーキテクチャ
- ✅ 品質管理とテスト戦略

### docs/フォルダ（実践ガイド）の役割
- ✅ 具体的な実装方法の詳細
- ✅ 実際の問題とその解決方法
- ✅ コード例とテストケース
- ✅ トラブルシューティング
- ✅ リファレンス情報（スキーマ定義等）

### 相互参照の原則
- **概要・原則 → メインREADME.md**
- **詳細・実践 → docs/フォルダ**
- **問題解決 → docs/トラブルシューティング**

---

## 🔄 ドキュメントの更新フロー

1. **新しい機能を実装したら**
   - docs/に実装ガイドを作成
   - メインREADME.mdに相互参照を追加

2. **ベストプラクティスが確立したら**
   - メインREADME.mdに原則として追加
   - docs/に詳細な実装例を追加
   - テンプレートの更新を検討

3. **問題が発生したら**
   - 解決方法をトラブルシューティングガイドに追加
   - テンプレート使用時の注意事項として記録

4. **テンプレートのアップデートがあったら**
   - 開発標準ドキュメントの更新を確認
   - 新機能の活用方法を検討

---

## 📝 ドキュメント作成のガイドライン

### 新しいドキュメントを作成する場合

1. **ファイル名**: `UPPERCASE_WITH_UNDERSCORES.md`
2. **先頭に含める情報**:
   - バージョン番号
   - 最終更新日
   - 対象（Phase、機能）
3. **構造**:
   - 目次
   - 概要
   - 実装手順（Step by Step）
   - トラブルシューティング
   - 参照ドキュメント
4. **相互参照**: 関連ドキュメントへのリンクを明示

### ドキュメントの分類

- **ガイド系**: `*_GUIDE.md` - 実装方法の完全ガイド
- **リファレンス系**: `*_REFERENCE.md` - 仕様や定義の一覧
- **修正記録系**: `*_FIX.md` - 問題と解決方法の記録
- **トラブルシューティング系**: `*_TROUBLESHOOTING.md`, `*_DEBUG.md`

---

## 🔗 関連リンク

- **[メインREADME.md](../README.md)** - CodeAppsStarter テンプレート開発標準
- **[CodeAppsStarter GitHub Repository](https://github.com/your-org/CodeAppsStarter)** - テンプレートリポジトリ
- **[shadcn/ui Documentation](https://ui.shadcn.com/)** - デザインシステムドキュメント
- **[Tailwind CSS Documentation](https://tailwindcss.com/)** - CSS フレームワークガイド
- **[Microsoft Docs - Power Apps Component Framework](https://learn.microsoft.com/ja-jp/power-apps/developer/component-framework/)**
- **[Microsoft Docs - Dataverse Web API](https://learn.microsoft.com/ja-jp/power-apps/developer/data-platform/webapi/overview)**

---

## 📞 フィードバック

このドキュメントに関する質問や改善提案がある場合は、以下の方法でフィードバックをお願いします:

1. GitHubのIssueを作成
2. プルリクエストを送信
3. チーム内のドキュメント担当者に連絡

---

**Happy Coding! 🚀**
