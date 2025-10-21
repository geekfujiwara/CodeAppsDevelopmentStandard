# Power Apps Code Apps リファレンス集

> **📘 本ドキュメント群について**  
> このフォルダには、実践的な Power Apps Code Apps 開発のリファレンスを格納しています。
> - **Phase別リファレンス**: 各開発Phaseの詳細な実装手順
> - **実装ガイド**: 具体的な機能実装の方法
> - **トラブルシューティング**: 問題解決とデバッグガイド

**最終更新**: 2025年10月21日

---

## 📚 ドキュメント体系

```
📁 CodeAppsDevelopmentStandard/
├── README.md                    ← 【開発標準】全体フロー・概要・ベストプラクティス
└── docs/                        ← 【リファレンス集】詳細な実装手順と解決方法
    ├── INDEX.md                 ← このファイル（リファレンスの目次）
    ├── Phase別リファレンス/      ← 各Phaseの詳細手順
    ├── Dataverse実装/           ← Dataverse統合の詳細ガイド
    ├── デザイン・UI/            ← デザインとUIコンポーネントのガイド
    └── トラブルシューティング/  ← 問題解決とデバッグガイド
```

---

## 🎯 このドキュメント群の使い方

### 1️⃣ 開発を始める前に
**→ [メインREADME.md](../README.md) を読む**
- Phase 0-5の開発フロー全体を理解
- Power Apps SDK の基本原則を把握
- 各Phaseの概要を確認

### 2️⃣ 具体的な実装時
**→ Phase別リファレンスを参照**
- 実施中のPhaseのリファレンスを開く
- Step by Stepの詳細手順に従う
- コード例をコピー&カスタマイズ

### 3️⃣ 特定機能の実装時
**→ 機能別リファレンスを参照**
- Dataverse Lookupフィールドの実装
- ロゴコンポーネントの実装
- Choice値のマッピング

### 4️⃣ 問題が発生したら
**→ トラブルシューティングガイドを確認**
- エラーメッセージから該当ガイドを探す
- 実際の問題解決事例を参照

---

## 📂 Phase別リファレンス

### 🚀 開発Phase順

| Phase | リファレンス | 説明 | 所要時間 |
|-------|------------|------|---------|
| **Phase 0** | **[PHASE0_ENVIRONMENT_SETUP.md](../PHASE0_ENVIRONMENT_SETUP.md)** | 開発ツールのインストールと設定 | 30分 |
| **Phase 1** | **[PHASE1_PROJECT_SETUP.md](../PHASE1_PROJECT_SETUP.md)** | Vite+React+TypeScriptプロジェクトの初期化<br>PowerProviderの実装<br>SDK初期化 | 1時間 |
| **Phase 2** | **[PHASE2_UI_DESIGN_SYSTEM.md](../PHASE2_UI_DESIGN_SYSTEM.md)** | shadcn/ui + TailwindCSSのセットアップ<br>Power Appsテーマ統合<br>レイアウト実装 | 2時間 |
| **Phase 3** | **[PHASE3_LOCAL_TESTING.md](../PHASE3_LOCAL_TESTING.md)** | ローカル環境での実行とテスト<br>動作確認 | 30分 |
| **Phase 4** | **[PHASE4_DEPLOYMENT.md](../PHASE4_DEPLOYMENT.md)** | Power Apps環境へのデプロイ<br>本番環境での確認 | 30分 |
| **Phase 5** | **[PHASE5_DATA_INTEGRATION.md](../PHASE5_DATA_INTEGRATION.md)** | データソース統合<br>機能拡張 | プロジェクトによる |

---

## 📂 機能別リファレンス

### 🗃️ Dataverse実装ガイド

#### ⭐ 必読ドキュメント

| ドキュメント | 説明 | 対象フェーズ |
|------------|------|------------|
| **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** | 🔍 Lookupフィールド実装の完全ガイド<br>- ビュー切り替え機能<br>- `$expand`によるLookup展開<br>- 50以上のテストチェック項目 | Phase 5: データソース統合 |
| **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** | 📋 実際のスキーマリファレンス<br>- テーブル定義<br>- Choice値の完全リスト<br>- リレーション定義 | Phase 5: データソース統合 |
| **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** | 🔎 スキーマ取得方法の完全ガイド<br>- 5つの方法を比較<br>- 実践的なワークフロー | Phase 5: データソース統合前 |

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

### 🎨 デザイン・UIガイド

#### ⭐ マスターガイド

| ドキュメント | 説明 | 対象フェーズ |
|------------|------|------------|
| **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** | 🎨 ロゴの完全ガイド<br>- デザイン仕様<br>- 使用方法<br>- 実装例<br>- ブランドガイドライン | Phase 2: UI・デザイン |

#### 技術ドキュメント

| ドキュメント | 説明 | 使用タイミング |
|------------|------|--------------|
| **[LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md)** | 🔧 SVG ID衝突問題の詳細と解決<br>- `React.useId()`の使用<br>- トラブルシューティング | SVGコンポーネント実装時 |
| **[DESIGN_REFRESH_v1.0.8.md](./DESIGN_REFRESH_v1.0.8.md)** | 📝 デザインリフレッシュの記録 | デザイン変更時 |

---

## 📐 開発標準への提案

| ドキュメント | 説明 | 状態 |
|------------|------|------|
| **[DEVELOPMENT_STANDARD_UPDATES.md](./DEVELOPMENT_STANDARD_UPDATES.md)** | SVGコンポーネント実装ガイドラインの詳細版 | → README.mdに反映済み |
| **[STANDARD_UPDATE_SUMMARY.md](./STANDARD_UPDATE_SUMMARY.md)** | 開発標準更新提案のサマリー | アーカイブ |
| **[GITHUB_PROPOSAL.md](./GITHUB_PROPOSAL.md)** | GitHub提案 | 検討中 |

---

## 🎯 シナリオ別ガイド

### 新規開発者がプロジェクトに参加したら

1. **[メインREADME.md](../README.md)** - 開発プロセス全体を理解
2. **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - Dataverse Lookupフィールドの実装方法を理解
3. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - ロゴの使用方法を確認
4. **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** - テーブル構造とChoice値を確認

### Dataverseテーブルを追加したい

1. **[メインREADME.md - Phase 5: データソース統合](../README.md#phase-5-機能拡張)** - 基本的な接続手順を確認
2. **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./HOW_TO_GET_DATAVERSE_SCHEMA.md)** - スキーマの取得方法を確認
3. **[DATAVERSE_SCHEMA_REFERENCE.md](./DATAVERSE_SCHEMA_REFERENCE.md)** - 既存のスキーマ定義を参照
4. 実装後 → **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** で問題解決

### Lookupフィールドを実装したい

1. **[メインREADME.md - Phase 5: Step 6](../README.md#step-6-カスタムフック作成)** - 基本パターンを理解
2. **[LOOKUP_FIELD_GUIDE.md](./LOOKUP_FIELD_GUIDE.md)** - 詳細な実装手順（Step 1-5）を確認
3. 実装後 → 同ドキュメントの「テストチェックリスト」で検証

### SVGロゴやアイコンを実装したい

1. **[メインREADME.md - コンポーネント設計](../README.md#コンポーネント設計原則)** - 基本原則を確認
2. **[LOGO_MASTER_GUIDE.md](./LOGO_MASTER_GUIDE.md)** - ロゴの使用方法を確認
3. **[LOGO_DISPLAY_FIX.md](./LOGO_DISPLAY_FIX.md)** - SVG ID衝突の回避方法を理解

### エラーが発生したら

1. エラーメッセージを確認
2. **[DATAVERSE_TROUBLESHOOTING.md](./DATAVERSE_TROUBLESHOOTING.md)** - Dataverseエラーを検索
3. **[DATAVERSE_DEBUG.md](./DATAVERSE_DEBUG.md)** - デバッグ方法を確認
4. 解決しない場合 → 各機能別ガイドの「トラブルシューティング」セクションを確認

---

## 📖 メインREADME.mdとの関係

### メインREADME.md（開発標準）の役割
- ✅ 開発プロセス全体のフロー（Phase 1-5）
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

2. **問題を解決したら**
   - docs/トラブルシューティングに追加
   - 関連する実装ガイドに注意事項を追記

3. **ベストプラクティスが確立したら**
   - メインREADME.mdに原則として追加
   - docs/に詳細な実装例を追加

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

- **[メインREADME.md](../README.md)** - Power Apps Code Apps 開発標準
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
