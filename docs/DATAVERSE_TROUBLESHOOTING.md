# Dataverseエラーのトラブルシューティングガイド

> **📘 はじめに**
>
> このドキュメントは、特定のプロジェクトで発生したエラーとその解決方法を記録したものです。
>
> **Dataverse接続の基本から学びたい方は:**
> - **[Dataverse接続 完全ガイド](./DATAVERSE_CONNECTION_GUIDE.md)** - トラブルシューティングを含む完全ガイド
>
> 上記の完全ガイドにも主要なエラーと解決方法が統合されています。

## 現在のエラー状況

```
❌ Error fetching Dataverse projects: Error: Failed to fetch projects from Dataverse
```

## 考えられる原因と対処法

### 1. Dataverseテーブルが存在しない

**確認方法:**
1. https://make.powerapps.com にアクセス
2. 「テーブル」→「すべて」を選択
3. 以下のテーブルを検索：
   - `geek_projecrt` (プロジェクト)
   - `geek_project_task` (タスク)

**対処法:**
テーブルが存在しない場合は、Dataverseでテーブルを作成してください。

### 2. テーブル名のスペルミス

現在のコードは以下のテーブル名を使用しています：
- `geek_projecrt` (最後の's'がない - これは意図的?)
- `geek_project_task`

**確認するログ:**
```javascript
📦 Dataverse getAll result: {
  success: false,  // ← false の場合はエラー
  error: "..." // ← エラーメッセージを確認
}
```

### 3. アクセス権限の問題

**症状:**
- テーブルは存在するがデータが取得できない
- `projectsResult.success === false`

**確認方法:**
Power Appsポータルでテーブルのセキュリティ設定を確認：
1. テーブルを選択
2. 「設定」→「権限」
3. 現在のユーザーに読み取り権限があるか確認

**対処法:**
必要な権限を付与する、またはテーブルのセキュリティロールを調整

### 4. データソース接続の問題

**確認するログ:**
```javascript
🔍 Dataverse environment check: {
  dataSourcesInfo: "available",
  serviceType: "function",
  getAllMethod: "function"
}
```

**対処法:**
データソースを再生成：
```powershell
pac code add-data-source -a dataverse -t geek_projecrt
pac code add-data-source -a dataverse -t geek_project_task
```

### 5. Power Apps SDKの初期化タイミング

**確認するログ:**
```javascript
🔍 Dataverse fetchProjects called: {
  isPowerApps: true,
  powerAppsInitialized: true  // ← これがfalseの場合は初期化待ち
}
```

**対処法:**
アプリをリロードして、SDK初期化を待つ

### 6. テーブルにデータが存在しない

**これは正常です！**

テーブルが空の場合：
```javascript
📦 Dataverse getAll result: {
  success: true,
  hasData: true,
  dataLength: 0  // ← 0件は正常
}
```

この場合、アプリは空の状態で起動し、「新規プロジェクト」からデータを作成できます。

## デバッグ手順

### ステップ1: コンソールログを確認

Power Appsでアプリを開き、F12でコンソールを開いて以下を確認：

1. **SDK初期化:**
```
✅ Power Platform SDK initialization complete
```

2. **環境検出:**
```
🔍 Dataverse fetchProjects called: { isPowerApps: true, powerAppsInitialized: true }
```

3. **API呼び出し:**
```
📡 Calling Geek_projecrtsService.getAll()...
```

4. **結果:**
```
📦 Dataverse getAll result: { success: true/false, error: "..." }
```

### ステップ2: エラーメッセージを特定

コンソールで以下を確認：
```javascript
❌ Error details: {
  message: "...",  // ← 具体的なエラーメッセージ
  stack: "...",
  error: { ... }
}
```

### ステップ3: Power Appsポータルで確認

1. テーブルの存在確認
2. テーブルのスキーマ確認（列名が一致しているか）
3. データの存在確認
4. セキュリティ権限の確認

### ステップ4: データソースの再生成

問題が解決しない場合：

```powershell
# プロジェクトディレクトリで実行
pac code add-data-source -a dataverse -t geek_projecrt
pac code add-data-source -a dataverse -t geek_project_task

# ビルドして再デプロイ
npm run build
pac code push
```

## よくあるエラーパターン

### エラー1: "Table not found"
**原因:** テーブル名が間違っているか、テーブルが存在しない
**対処:** テーブル名を確認し、必要に応じて作成

### エラー2: "Access denied"
**原因:** 権限不足
**対処:** セキュリティロールを確認

### エラー3: "PowerDataRuntime is not initialized"
**原因:** SDK初期化前にAPIを呼び出している
**対処:** PowerProvider の初期化を待つ（既に修正済み）

### エラー4: "Failed to fetch projects"（success: false）
**原因:** API呼び出しそのものが失敗
**対処:** 
1. ログで具体的なエラーを確認
2. テーブルとフィールドの存在を確認
3. データソース接続を再生成

## 次のステップ

1. **Power Appsでアプリを開く**
2. **F12でコンソールを開く**
3. **上記のログを確認して、どのステップで失敗しているか特定**
4. **エラーメッセージの詳細を確認**
5. **該当する対処法を実施**

## サンプルデータでのテスト

Dataverseに問題がある場合、開発環境（localhost）で動作確認：

```powershell
npm run dev
```

ブラウザで http://localhost:5173 を開くと、サンプルデータでアプリが動作します。

これにより、コード自体の問題かDataverse接続の問題かを切り分けられます。
