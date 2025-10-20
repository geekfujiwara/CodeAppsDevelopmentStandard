# Dataverse統合デバッグガイド

## 修正内容（最新）

### PowerDataRuntimeエラーの修正

**エラー内容:**
```
PowerDataRuntimeError: An unknown error occurred: PowerDataRuntime is not initialized. 
Please call initializeRuntime() first.
```

**原因:**
- Power Apps SDKの初期化が完了する前にDataverseへアクセスしていた

**修正内容:**
1. `PowerProvider.tsx`にコンテキストを追加
2. `isInitialized`フラグで初期化完了を追跡
3. `useDataverseProjects`フックで初期化完了を待機
4. 初期化後に自動的にDataverseからデータを取得

**新しいログ出力:**
```
🔄 Initializing Power Platform SDK...
✅ Power Platform App initialized
✅ Power Platform SDK initialization complete
🔍 Dataverse fetchProjects called: { isPowerApps: true, powerAppsInitialized: true, ... }
🔍 Fetching projects from Dataverse...
📦 Dataverse getAll result: { success: true, data: [...] }
```

## アプリケーションがDataverseに接続しているか確認する方法

### 1. ブラウザの開発者ツールを開く
- Power Appsでアプリを開いた状態で、`F12`キーを押す
- または、右クリック → 「検証」を選択

### 2. コンソールログを確認

アプリ起動時に以下のログが表示されます：

#### Power Apps環境の場合（Dataverse接続）
```
🔍 Environment check: 
{
  isPowerApps: true,
  hostname: "apps.powerapps.com",
  nodeEnv: "production",
  dataverseProjectsCount: 0 または数値,
  dataverseLoading: true/false
}

🔍 Dataverse fetchProjects called:
{
  isPowerApps: true,
  hostname: "apps.powerapps.com",
  nodeEnv: "production"
}

🔍 Fetching projects from Dataverse...
📦 Dataverse getAll result: { success: true/false, data: [...] }
```

#### 開発環境の場合（サンプルデータ）
```
🔍 Environment check:
{
  isPowerApps: false,
  hostname: "localhost" または "127.0.0.1",
  nodeEnv: "development",
  dataverseProjectsCount: 0,
  dataverseLoading: false
}

⚠️ Development mode - Dataverse not available
🔧 Development mode - using sample data
```

### 3. UIでの確認

アプリの上部アクションバーに以下のバッジが表示されます：

- **Power Apps環境**: 
  - 🟢 `Dataverse接続済 (X件)` - 緑色のバッジ
  - 件数がDataverseから取得したプロジェクト数を示します

- **開発環境**: 
  - 🟡 `開発モード (サンプルデータ)` - 黄色のバッジ

### 4. データソースの確認方法

#### Power Appsポータルでの確認
1. https://make.powerapps.com にアクセス
2. 「Dataverse」→「テーブル」を選択
3. 以下のテーブルが存在するか確認：
   - `geek_projecrt` (プロジェクトテーブル)
   - `geek_project_task` (タスクテーブル)

#### アプリ設定での確認
1. Power Apps Studioでアプリを開く
2. 「データ」タブを選択
3. 接続されているデータソースを確認

### 5. Dataverseにデータがない場合

Dataverseテーブルは存在するが、データが0件の場合：

1. アプリにはサンプルデータが表示されます
2. 「新規プロジェクト」ボタンでプロジェクトを作成すると、Dataverseに保存されます
3. 「更新」ボタンをクリックするとDataverseから最新データを再取得します

### 6. トラブルシューティング

#### ケース1: 常にサンプルデータが表示される
**原因**: Power Apps環境の検出に失敗している
**確認**:
```javascript
console.log('🔍 Environment check:', {
  isPowerApps: false,  // ← これがfalseになっている
  hostname: "localhost"
});
```
**解決策**: アプリをPower Appsポータルから起動していることを確認

#### ケース2: Dataverseエラーが発生する
**原因**: Dataverseテーブルが存在しない、または権限がない
**確認**:
```javascript
❌ Office 365UsersService error: [エラーメッセージ]
```
**解決策**:
1. `pac code add-data-source -a dataverse -t geek_projecrt` を再実行
2. `pac code add-data-source -a dataverse -t geek_project_task` を再実行
3. Dataverseテーブルへのアクセス権限を確認

#### ケース3: 接続ダイアログが表示されない
**原因**: これは正常な動作です
**説明**: 
- Code Appsでは接続は自動的に確立されます
- 明示的な接続ダイアログは表示されません
- バックグラウンドでDataverseサービスが動作します

### 7. 環境判定ロジック

アプリは以下の条件で自動的にPower Apps環境を検出します：

```typescript
const isPowerApps = 
  window.location.hostname.includes('apps.powerapps.com') ||
  window.location.hostname.includes('make.powerapps.com') ||
  window.location.hostname.includes('create.powerapps.com') ||
  process.env.NODE_ENV === 'production';
```

### 8. データの流れ

```
Power Appsアプリ起動
  ↓
useDataverseProjects フック初期化
  ↓
isPowerAppsEnvironment() で環境判定
  ↓
Power Apps環境の場合:
  ↓
Geek_projecrtsService.getAll() 実行
  ↓
Dataverseからプロジェクトデータ取得
  ↓
各プロジェクトのタスクを取得
  ↓
UI に反映
```

### 9. 確認コマンド

コンソールで以下を実行して現在の状態を確認できます：

```javascript
// 環境情報の確認
console.log('Hostname:', window.location.hostname);
console.log('NODE_ENV:', process.env.NODE_ENV);

// ローカルストレージの確認（もしあれば）
console.log('LocalStorage:', localStorage);
```

### 10. 正常動作の確認チェックリスト

- [ ] Power Appsポータルからアプリを起動している
- [ ] ブラウザコンソールに「Dataverse接続済」バッジが表示される
- [ ] コンソールログに `isPowerApps: true` が表示される
- [ ] コンソールログに `🔍 Fetching projects from Dataverse...` が表示される
- [ ] 新規プロジェクトを作成すると Dataverse に保存される
- [ ] アプリをリロードしても作成したプロジェクトが残っている
