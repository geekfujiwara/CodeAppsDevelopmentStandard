# Phase 4: Power Apps環境へのデプロイ

## 📋 概要

このPhaseでは、ローカルで動作確認したアプリケーションを本番のPower Apps環境にデプロイします。

**主な実施内容:**
- 本番ビルドの実行
- Power Apps環境へのデプロイ
- デプロイ後の動作確認
- エラーハンドリング

---

## 🚀 クイックリファレンス

> **📘 詳細な実装手順**: 以下のステップバイステップガイドを参照してください。

**実施するStep（概要）:**
1. **最終ビルド** - `npm run build` 本番ビルド確認
2. **最終エラーチェック** - TypeScript・ESLint確認
3. **デプロイ実行** - `pac code push`
4. **動作確認** - Power Apps環境での動作テスト
5. **未実装機能記載** - MVP完了機能の文書化

**統合コマンド（すべてのチェック）:**
```bash
# 最終エラーチェック → ビルド → デプロイ
npx tsc --noEmit && npm run lint && npm run build && pac code push
```

**Phase 4 完了条件:**
- ✅ 本番ビルドが成功する
- ✅ すべてのエラーチェックに合格
- ✅ デプロイが正常に完了する
- ✅ Power Apps環境で動作する
- ✅ Power Apps環境でアプリが正常に動作する
- ✅ ユーザーがアクセスできる
- ✅ 未実装機能がREADME.mdに記載されている

---

## 🎯 Phase 4の目標

```mermaid
graph LR
    A[最終ビルド] --> B[デプロイ実行]
    B --> C[動作確認]
    C --> D[デプロイ完了]
```

**完了条件:**
- ✅ 本番ビルドが成功する
- ✅ デプロイが正常に完了する
- ✅ Power Apps環境で動作する
- ✅ ユーザーがアクセスできる

---

## 📝 デプロイ手順

### Step 1: 最終ビルド

```bash
# 本番ビルド実行
npm run build
```

**ビルド成果物:**
- `dist/` フォルダにビルド済みファイルが生成される
- アセットが最適化される
- JavaScriptがバンドルされる

### Step 2: デプロイ実行

```bash
# Power Apps環境へデプロイ
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

### Step 3: デプロイ確認

1. [Power Apps](https://make.powerapps.com) にアクセス
2. アプリ一覧から対象アプリを選択
3. 「再生」ボタンでアプリを起動
4. 最新の変更が反映されていることを確認

### Step 4: ユーザーテスト

- [ ] すべての機能が正常に動作する
- [ ] デザインが正しく表示される
- [ ] データが正しく取得/更新される
- [ ] エラーが発生しない

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

---

## ✅ 完了チェックリスト

- [ ] `npm run build` が成功する
- [ ] `pac code push` が完了する
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

👉 **[Phase 5 リファレンス](./PHASE5_DATA_INTEGRATION.md)** に進む
