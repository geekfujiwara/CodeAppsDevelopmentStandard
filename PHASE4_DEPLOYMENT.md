# Phase 4: 改修版アプリのPower Apps環境デプロイ

## 📋 概要

このPhaseでは、テンプレートアプリを具体的要件に合わせて改修した後、その変更をPower Apps環境に反映します。

**主な実施内容:**
- 改修内容の最終確認
- 本番ビルドの実行
- 更新版アプリのPower Apps環境へのデプロイ
- デプロイ後の動作確認
- 新機能のテスト

---

## 🚀 クイックリファレンス

> **📘 詳細な実装手順**: 以下のステップバイステップガイドを参照してください。

**実施するStep（概要）:**
1. **改修内容確認** - テンプレートからの変更点確認
2. **最終ビルド** - `npm run build` 本番ビルド確認
3. **最終エラーチェック** - TypeScript・ESLint確認
4. **Power Apps認証テスト** - `npm run dev`でローカル認証確認
5. **デプロイ実行** - `pac code push` で更新デプロイ
6. **動作確認** - Power Apps環境での新機能テスト
7. **変更点文書化** - 実装した機能の文書化

**統合コマンド（すべてのチェック）:**
```bash
# 最終エラーチェック → Power Apps認証テスト → ビルド → デプロイ
npx tsc --noEmit && npm run lint && npm run dev & sleep 10 && curl http://localhost:3000 && npm run build && pac code push
```

**Phase 4 完了条件:**
- ✅ 改修された機能が正常に動作する
- ✅ Power Apps認証がローカル環境（`npm run dev`）で正常に動作する
- ✅ 本番ビルドが成功する
- ✅ すべてのエラーチェックに合格
- ✅ デプロイが正常に完了する
- ✅ Power Apps環境で新機能が動作する
- ✅ テンプレートの既存機能が引き続き動作する
- ✅ ユーザーがアクセスできる
- ✅ 変更内容がドキュメント化されている

---

## 🎯 Phase 4の目標

```mermaid
graph LR
    A[改修内容確認] --> B[最終ビルド]
    B --> C[デプロイ実行]
    C --> D[動作確認]
    D --> E[新機能テスト]
    E --> F[デプロイ完了]
```

**完了条件:**
- ✅ 改修された機能が正常にビルドできる
- ✅ Power Apps認証がローカル環境で正常に動作する
- ✅ デプロイが正常に完了する
- ✅ Power Apps環境で新機能が動作する
- ✅ テンプレートの既存機能が引き続き動作する
- ✅ ユーザーが新機能にアクセスできる

---

## 📝 デプロイ手順

### Step 1: 改修内容の確認

#### 1-1. 変更点の整理

**確認すべき項目:**
- テンプレートから追加した新機能
- 変更したコンポーネント
- 新しく追加したファイル
- 削除または修正した機能

#### 1-2. ローカル動作確認（Power Apps認証環境）

```bash
# Power Apps認証を使用したローカル開発サーバー起動
npm run dev
```

**StarterテンプレートのPower Apps認証機能:**
- ローカル開発時もPower Apps認証が有効
- 実際のPower Apps環境と同じ認証フローでテスト可能
- `npm run dev` で自動的にPower Apps認証環境が構築される

**確認項目:**
- すべての新機能が正常に動作する
- Power Apps認証が正常に動作する（ローカル環境でも）
- テンプレートの既存機能が引き続き動作する
- データソース連携がPower Apps認証下で正常に動作する
- ナビゲーション・ルーティングが正常に動作する
- エラーやコンソール警告がない

**Power Apps認証のローカルテスト手順:**
1. `npm run dev` でローカルサーバー起動
2. ブラウザでhttp://localhost:3000にアクセス
3. Power Apps認証画面が表示されることを確認
4. 正常にサインインできることを確認
5. 認証後、アプリが正常に表示されることを確認

### Step 2: 最終ビルド

```bash
# 本番ビルド実行
npm run build
```

**ビルド成果物:**
- `dist/` フォルダにビルド済みファイルが生成される
- アセットが最適化される
- TypeScriptがJavaScriptに変換される

**ビルドエラーが発生した場合:**
```bash
# 型チェックを実行
npx tsc --noEmit

# リントチェックを実行  
npm run lint

# 依存関係の問題解決
npm ci
```

### Step 3: デプロイ実行

```bash
# Power Apps環境へ更新デプロイ
pac code push
```

**デプロイプロセス:**
1. `dist/` フォルダの内容をアップロード
2. Power Apps環境でアプリを更新
3. 新しいバージョンが公開される

**一括実行:**
```bash
# ビルド・デプロイを一括実行
npm run build && pac code push
```

### Step 4: 動作確認・新機能テスト

#### 4-1. Power Apps環境での確認

1. [Power Apps](https://make.powerapps.com) にアクセス
2. アプリ一覧から対象アプリを選択
3. 「再生」ボタンでアプリを起動
4. 更新内容が反映されていることを確認

#### 4-2. 機能別テスト

**テンプレートの既存機能:**
- [ ] ダッシュボードの表示確認
- [ ] ギャラリー・フィルター機能の動作確認
- [ ] フォーム機能の動作確認
- [ ] プロジェクト管理ツールの動作確認

**新しく追加した機能:**
- [ ] 新機能が正常に動作する
- [ ] データ連携が正常に動作する
- [ ] UIコンポーネントが適切に表示される
- [ ] レスポンシブデザインが正常に動作する

#### 4-3. ユーザー受け入れテスト

**確認項目:**
- [ ] すべての機能が仕様通りに動作する
- [ ] デザインが要件通りに表示される
- [ ] パフォーマンスが適切である
- [ ] エラーが発生しない
- [ ] 複数のブラウザで動作する

---

## 🔧 トラブルシューティング

### デプロイエラーが発生する場合

**エラー: "Build failed"**
```bash
# 解決策: ビルドエラーを確認
npm run build
# エラーメッセージに従って修正
```

**エラー: "Not authenticated"**
```bash
# 解決策: 再認証
pac auth create
pac env select --environment <環境URL>
```

**エラー: "Permission denied"**
- Power Apps環境の権限を確認
- システム管理者に環境カスタマイザーまたは環境作成者の権限を依頼

### デプロイ後にアプリが表示されない

1. ブラウザのキャッシュをクリア
2. Power Appsでアプリを再読み込み
3. `pac code push --force` で強制再デプロイ

### デプロイ時のタイムアウトエラー

**エラー: "Timeout during deployment" または "Deployment failed due to timeout"**

**原因:** Power Apps SDKの初期化が適切に行われていない、またはStarterテンプレートのコードが未修正のまま残っている

**解決策:**

1. **Power Apps SDKの初期化確認**
```bash
# Power Apps SDKの初期化
pac code init --platform PowerApps --name <アプリ名>
```

2. **Starterテンプレートの必須修正確認**
   以下のファイルがStarterテンプレートのデフォルトのままになっていないか確認：

**修正必須ファイル:**
```typescript
// src/providers/PowerProvider.tsx - 必ず環境に合わせて修正
export const PowerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ⚠️ テンプレートのダミーデータではなく、実際の環境設定が必要
  // ⚠️ PowerApps環境URLやAPIエンドポイントの修正確認
}

// src/lib/powerApps.ts - 環境固有設定
const POWER_APPS_CONFIG = {
  // ⚠️ デフォルト設定ではタイムアウトが発生する可能性
  environment: 'YOUR_ENVIRONMENT_URL', // 必須修正
  timeout: 30000, // タイムアウト設定の追加
}
```

3. **環境変数の設定確認**
```bash
# .env.local ファイルの確認
NEXT_PUBLIC_POWER_APPS_ENVIRONMENT_URL=<実際の環境URL>
NEXT_PUBLIC_APP_ID=<実際のアプリID>
```

4. **段階的デプロイの実行**
```bash
# 1. 最小構成でのテストデプロイ
pac code push --incremental

# 2. タイムアウト時間の延長設定
pac code push --timeout 300

# 3. 完全リセット後の再デプロイ
pac code delete
pac code init --platform PowerApps --name <アプリ名>
pac code push
```

**予防策:**
- Starterテンプレートをそのまま使用せず、必ず環境に合わせたカスタマイズを実施
- PowerProvider.tsxの設定を実際の環境に合わせて修正
- デプロイ前に`npm run build`でローカルビルドテストを実行

---

## ✅ 完了チェックリスト

### 改修内容確認
- [ ] テンプレートからの変更点が整理されている
- [ ] 新機能がローカルで正常に動作する
- [ ] Power Apps認証がローカル環境（`npm run dev`）で正常に動作する
- [ ] 既存機能が引き続き動作する

### ビルド・デプロイ
- [ ] `npm run build` が成功する
- [ ] `pac code push` が完了する
- [ ] デプロイ時にエラーが発生しない

### 動作確認
- [ ] Power Apps環境でアプリが起動する
- [ ] 新しく追加した機能が動作する
- [ ] テンプレートの既存機能が引き続き動作する
- [ ] レスポンシブデザインが適切に動作する

### 品質確認
- [ ] すべての機能が仕様通りに動作する
- [ ] パフォーマンスが適切である
- [ ] エラーやバグが発生しない
- [ ] 変更内容がドキュメント化されている
- [ ] Power Apps環境でアプリが起動する
- [ ] 最新の変更が反映されている
- [ ] すべての機能が正常に動作する
- [ ] エラーが発生しない

---

## 📚 関連コマンド

```bash
# ビルドのみ
npm run build

# デプロイのみ
pac code push

# ビルド+デプロイ（推奨）
npm run build && pac code push

# 強制デプロイ
pac code push --force

# デプロイ状態確認
pac code list
```

---

## � 関連リファレンス

### デプロイメント
- **[PAC CLI リファレンス](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/code)** - Power Platform CLI公式ドキュメント

### トラブルシューティング
- **[DATAVERSE_TROUBLESHOOTING.md](./docs/DATAVERSE_TROUBLESHOOTING.md)** - デプロイ時のよくある問題と解決法

---

## �🔄 次のステップ

Phase 4が完了したら、次は **Phase 5: 機能拡張・データソース統合** に進みます。

👉 **[Phase 5 機能拡張・データソース統合](./PHASE5_DATA_INTEGRATION.md)** に進む

