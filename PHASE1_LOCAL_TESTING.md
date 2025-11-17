# Phase 3: Power Apps環境からローカル実行

## 📋 概要

このPhaseでは、構築したアプリケーションをローカル環境で実行し、Power Apps環境での動作を確認します。

**主な実施内容:**
- ビルドとエラーチェックの実行
- ローカル開発サーバーの起動
- Power Apps環境での動作確認
- 統合テストの実施

---

## 🚀 クイックリファレンス

> **📘 詳細な実装手順**: 以下のステップバイステップガイドを参照してください。

**実施するStep（概要）:**
1. **ビルド実行** - `npm run build`
2. **エラーチェック** - TypeScript・ESLint確認
3. **Power Appsローカル実行** - `npm run dev` で統合確認
4. **動作確認** - MVP機能の動作とエラーログ確認

**統合コマンド（すべてのチェック）:**
```bash
# ビルド・リント・ローカル実行を一括実行
npm run build && npm run lint && npm run dev
```

**Phase 3 完了条件:**
- ✅ ビルドエラーがない
- ✅ リントエラーがない
- ✅ TypeScriptエラーがない
- ✅ ローカルで正常に起動する
- ✅ Power Apps環境で表示される
- ✅ Power Platform SDKとの統合が確認できる
- ✅ MVP機能が正常に動作する

---

## 🎯 Phase 3の目標

```mermaid
graph LR
    A[ビルド・エラーチェック] --> B[Power Appsローカル実行]
    B --> C[動作確認・テスト]
    C --> D[実行成功]
```

**完了条件:**
- ✅ ビルドエラーがない
- ✅ リントエラーがない
- ✅ TypeScriptエラーがない
- ✅ ローカルで正常に起動する
- ✅ Power Apps環境で表示される

---

## 📝 実行手順

### Step 1: ビルドとエラーチェック

```bash
# TypeScript型チェック
npx tsc --noEmit

# ビルド実行
npm run build

# リント実行
npm run lint
```

**一括実行:**
```bash
npm run build && npm run lint && npx tsc --noEmit
```

### Step 2: ローカル開発サーバー起動

```bash
npm run dev
```

**期待される動作:**
- Power Apps SDKサーバーが起動
- Vite開発サーバーが起動（http://localhost:3000）
- ブラウザが自動的に開く

### Step 3: Power Apps環境での確認

1. [Power Apps](https://make.powerapps.com) にアクセス
2. アプリ一覧から作成したアプリを選択
3. アプリが正常に表示されることを確認

### Step 4: 動作テスト

- [ ] UI要素が正しく表示される
- [ ] ボタンやリンクが機能する
- [ ] レスポンシブデザインが動作する
- [ ] コンソールエラーがない

---

## ✅ 完了チェックリスト

- [ ] `npm run build` が成功する
- [ ] `npm run lint` でエラーがない
- [ ] `npx tsc --noEmit` でエラーがない
- [ ] `npm run dev` でサーバーが起動する
- [ ] http://localhost:3000 にアクセスできる
- [ ] Power Apps環境でアプリが表示される
- [ ] ブラウザコンソールにエラーが表示されない

---

## � 関連リファレンス

### トラブルシューティング
- **[DATAVERSE_DEBUG.md](./docs/DATAVERSE_DEBUG.md)** - デバッグ手順とログ確認方法
- **[DATAVERSE_TROUBLESHOOTING.md](./docs/DATAVERSE_TROUBLESHOOTING.md)** - よくある問題と解決法

---

## �🔄 次のステップ

Phase 3が完了したら、次は **Phase 4: Power Apps環境へのデプロイ** に進みます。

👉 **[Phase 4 リファレンス](./PHASE4_DEPLOYMENT.md)** に進む
