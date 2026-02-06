# Phase 3: データソース統合

## 📋 概要

このPhaseでは、Power Apps Code AppsにDataverseやその他のコネクターを統合し、実際のビジネスデータと連携する機能を実装します。

> **⚠️ 重要: Phase 3開始の前提条件**
>
> **このPhaseを開始する前に、Phase 1とPhase 2が完了していることを確認してください:**
> - ✅ **Phase 1完了**: Microsoft標準テンプレートがデプロイされ、SDK初期化エラーがない
> - ✅ **Phase 2完了**: 必要な機能がCodeAppsStarter参照で実装されている
>
> Phase 3はデータソース統合の**最後のステップ**です。基盤が安定している状態で実施してください。

> **⭐ Dataverse接続を始める方へ**
>
> このドキュメントを読む前に、まず **[Dataverse接続 完全ガイド](./docs/DATAVERSE_CONNECTION_GUIDE.md)** を参照することを強く推奨します。
> これまでの知見を統合した最終版ガイドとして、データソース追加からCRUD操作、トラブルシューティングまで、Step-by-Stepで完全に網羅しています。
>
> より詳細な実装パターンは **[Dataverse統合ベストプラクティス](./docs/DATAVERSE_INTEGRATION_BEST_PRACTICES.md)** も参照してください。

**主な実施内容:**
- データソース接続の設定
- Dataverseテーブルへのアクセス
- カスタムフックの作成
- UI統合とエラーハンドリング
- Phase 2で実装した機能へのデータ統合

---

## 🚀 クイックリファレンス

### **実施するStep（概要）:**

1. **接続作成** - Power Appsポータルでコネクター接続を手動作成
2. **接続ID取得** - ブラウザURLから接続IDをコピー
3. **サービスクラス生成** - `pac code add-data-source` でTypeScript型定義を自動生成
4. **SDK初期化確認** - `usePowerPlatform().isInitialized` でPower Apps SDK初期化を確認
5. **カスタムフック作成** - ビジネスロジックをカプセル化（CRUD操作）
6. **UI統合** - Reactコンポーネントでデータを表示・操作
7. **エラーハンドリング** - `IOperationResult.isSuccess` でエラー処理

### **統合コマンド（Office 365 Users）:**

```bash
# 接続作成（Power Appsポータル）→ 接続ID取得
pac code add-data-source -a "shared_office365users" -c "{接続ID}"
npm run build && npm run lint
```

### **統合コマンド（Dataverse）:**

```bash
# 接続作成（Power Appsポータル）→ 接続ID取得
pac code add-data-source -a "shared_commondataserviceforapps" -c "{接続ID}" -t "systemusers"
npm run build && npm run lint
```

### **Phase 3 完了条件:**

- ✅ Power Appsポータルでコネクター接続が作成されている
- ✅ 接続IDが正しく取得できている
- ✅ `pac code add-data-source` が成功し、サービスクラスが生成されている
- ✅ カスタムフックが作成され、`isInitialized` チェックが実装されている
- ✅ エラーハンドリングが実装されている（`IOperationResult.isSuccess` 確認）
- ✅ データの読み取りが成功する
- ✅ CRUD操作が正常に動作する（該当する場合）
- ✅ UI統合が完了し、データが正しく表示される
- ✅ Power Apps環境でアプリが正常に動作する

> **⚠️ 重要原則**: Power Apps Code Appsでは、**必ずPower Apps SDK経由で自動生成されたサービスクラス**を使用します。Dataverse Web API、Xrm.WebApi、直接REST APIは使用しないでください。

---

## 🎯 Phase 3の目標

**Phase 3では、モックデータから実データへの完全移行を実現します。**

**完了条件:**
- ✅ データソースが正常に接続されている
- ✅ Dataverseテーブルからデータを取得できる
- ✅ CRUD操作が正常に動作する
- ✅ エラーハンドリングが適切に実装されている
- ✅ モックデータが完全に削除されている

---

## 🏗️ リアルデータ接続のアーキテクチャ

### アーキテクチャ概要

Power Apps Code Appsにおける実データ接続は、以下の4つのステップで実現されます。

```mermaid
graph TB
    subgraph "Step 1: 環境認証"
        A1[Power Platform環境URL] --> A2[pac auth create]
        A2 --> A3[認証完了]
    end
    
    subgraph "Step 2: データソース追加"
        B1[テーブル論理名確認] --> B2[pac code add-data-source]
        B2 --> B3[TypeScript型定義自動生成]
    end
    
    subgraph "Step 3: メタデータ取得"
        C1[getMetadata API] --> C2[テーブルスキーマ取得]
        C2 --> C3[型定義とインターフェース生成]
    end
    
    subgraph "Step 4: データ統合"
        D1[モックデータ削除] --> D2[サービスクラス呼び出し]
        D2 --> D3[Dataverseデータ表示]
    end
    
    A3 --> B1
    B3 --> C1
    C3 --> D1
    
    style A3 fill:#e3f2fd
    style B3 fill:#e8f5e9
    style C3 fill:#fff3e0
    style D3 fill:#f3e5f5
```

### データフロー

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant CLI as PAC CLI
    participant App as Code Apps
    participant SDK as Power Apps SDK
    participant API as Dataverse Web API
    participant DV as Dataverse
    
    User->>CLI: 1. pac auth create
    Note over CLI: 環境URLで認証
    CLI-->>User: 認証完了
    
    User->>CLI: 2. pac code add-data-source
    Note over CLI: テーブル論理名を指定
    CLI->>API: メタデータ取得リクエスト
    API->>DV: EntityDefinitions取得
    DV-->>API: テーブルスキーマ返却
    API-->>CLI: メタデータ (JSON)
    CLI-->>App: TypeScriptサービスクラス生成
    
    User->>App: 3. getMetadata()呼び出し
    App->>SDK: メタデータ取得要求
    SDK->>API: GET EntityDefinitions
    API-->>SDK: スキーマ情報 (JSON)
    SDK-->>App: 型定義生成
    
    User->>App: 4. データ取得
    App->>SDK: サービスクラス経由でデータ要求
    SDK->>API: OData APIリクエスト
    API->>DV: クエリ実行
    DV-->>API: データ返却
    API-->>SDK: JSON応答
    SDK-->>App: TypeScript型付きデータ
    App-->>User: UIに実データ表示
```

### 4ステップの詳細

| ステップ | 実施内容 | 成果物 | 所要時間 |
|---------|---------|-------|---------|
| **1. 環境認証** | `pac auth create` で Power Platform環境に認証 | 認証済みセッション | 1分 |
| **2. データソース追加** | `pac code add-data-source` でテーブル論理名を指定 → TypeScriptコード自動生成 | サービスクラス (.ts) | 1-2分 |
| **3. メタデータ取得** | `getMetadata` API でテーブルスキーマを取得 → 型定義生成 | 型定義ファイル | 2-3分 |
| **4. データ統合** | モックデータ削除 → サービスクラス呼び出しでDataverseデータ取得 | 実データ表示 | 10-30分 |

### 重要な技術要素

#### Power Apps SDK の役割

```typescript
// Power Apps SDKが提供する主要な機能
import { usePowerPlatform } from '@microsoft/power-apps';
import type { IOperationResult } from '@microsoft/power-apps/data';

// 1. SDK初期化状態の確認
const { isInitialized } = usePowerPlatform();

// 2. サービスクラスを通じたデータアクセス
const result: IOperationResult<SystemUsers[]> = await SystemUsersService.getAll({
  select: ['systemuserid', 'fullname'],
  filter: 'isdisabled eq false'
});

// 3. 型安全なエラーハンドリング
if (result.isSuccess && result.value) {
  // データ取得成功
  console.log(result.value);
} else {
  // エラー処理
  console.error(result.error);
}
```

#### customization.xml の重要性（非推奨）

> **❌ 非推奨**: customization.xmlを使用したスキーマ情報取得は、以下の理由により推奨されません:
> - 手動エクスポートが必要で、自動化が困難
> - ファイルサイズが大きく、XMLパースが複雑
> - Dataverse側の更新に手動で追従する必要がある

**✅ 推奨アプローチ**: 以下の公式API を使用してください:

1. **`pac code add-data-source` コマンド**
   - テーブル論理名を指定するだけで自動的にメタデータを取得
   - TypeScript型定義とサービスクラスを自動生成
   - XMLファイル不要

2. **`getMetadata` API (ランタイム)**
   - プログラムから直接Dataverseメタデータを取得
   - 最新のスキーマ情報をリアルタイムで取得
   - JSON形式で扱いやすい

詳細は以下のセクションを参照してください:
- [公式API-based メタデータ取得方法](#step-2-公式api-basedメタデータ取得方法)
- [getMetadata関数の使用方法](#2-4-方法2-getmetadata-api-でランタイム取得)

この情報を基に、`pac code add-data-source` がTypeScript型定義を自動生成します。

---

## 📐 実装方針と設計ノート

### 使用API

Power Apps Code Appsでは、以下の公式APIを使用してDataverseに接続します:

1. **PAC CLI (`pac code add-data-source`)**
   - **用途**: 開発時のテーブル追加とメタデータ取得
   - **動作**: Dataverse Web API経由でEntityDefinitionsを取得し、TypeScript型定義を自動生成
   - **参考**: [Microsoft Learn - Connect to Dataverse](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-dataverse)

2. **getMetadata() 関数**
   - **用途**: ランタイムでのメタデータ取得
   - **動作**: Power Apps SDK経由でテーブルスキーマをJSON形式で取得
   - **参考**: [Microsoft Learn - Get Table Metadata](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/get-table-metadata)

3. **Dataverse Web API (OData)**
   - **用途**: 高度なメタデータクエリ（必要時のみ）
   - **動作**: REST API経由で直接EntityDefinitionsにアクセス
   - **参考**: [Microsoft Learn - Query Metadata Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api)

### 処理フロー

```mermaid
sequenceDiagram
    participant Dev as 開発者
    participant CLI as PAC CLI
    participant API as Dataverse Web API
    participant App as Code Apps
    participant SDK as Power Apps SDK
    
    Note over Dev,API: 開発時（型定義生成）
    Dev->>CLI: pac auth create
    CLI->>API: OAuth認証
    API-->>CLI: アクセストークン
    
    Dev->>CLI: pac code add-data-source -t tablename
    CLI->>API: GET /EntityDefinitions(LogicalName='tablename')
    API-->>CLI: テーブルスキーマ (JSON)
    CLI->>CLI: TypeScript型定義生成
    CLI-->>Dev: generated/models/ & services/
    
    Note over Dev,SDK: ランタイム（アプリ実行時）
    Dev->>App: アプリ起動
    App->>SDK: initialize()
    SDK-->>App: isInitialized = true
    
    App->>SDK: Service.getMetadata()
    SDK->>API: GET /EntityDefinitions
    API-->>SDK: スキーマ情報 (JSON)
    SDK-->>App: 型安全なメタデータ
    
    App->>SDK: Service.getAll()
    SDK->>API: GET /tablename
    API-->>SDK: データ (JSON)
    SDK-->>App: 型付きデータ
```

### 認証フロー

Power Apps Code Appsは、Microsoft標準のOAuth 2.0認証を使用します:

1. **開発時認証**:
   ```bash
   pac auth create --url https://environment.crm.dynamics.com
   ```
   - デバイスコードフローまたはブラウザベース認証
   - アクセストークンはPAC CLIが自動管理
   - 環境ごとに認証が必要

2. **ランタイム認証**:
   - Power Apps SDKが自動的に処理
   - ユーザーの現在の認証コンテキストを使用
   - 追加の認証コード不要

### XML方式との比較

| 項目 | ❌ 旧方式 (XML) | ✅ 新方式 (API) |
|------|----------------|----------------|
| **メタデータ取得** | ソリューションエクスポート → XML抽出 | `pac code add-data-source` コマンド |
| **手動作業** | 必要（エクスポート、解凍、配置） | 不要（完全自動化） |
| **最新性** | 手動更新が必要 | 常に最新を取得 |
| **ファイル管理** | customization.xml (数MB〜数十MB) | 不要 |
| **データ形式** | XML（パース複雑） | JSON（扱いやすい） |
| **CI/CD統合** | 困難（手動ステップあり） | 容易（コマンド化可能） |
| **エラー検知** | 実行時まで不明 | 型チェック時に検知 |
| **メンテナンス性** | 低い | 高い |

### 設計上の利点

1. **型安全性**: TypeScript型定義が自動生成され、コンパイル時にエラー検知
2. **自動化**: スキーマ変更時もコマンド再実行で即座に反映
3. **保守性**: XMLファイル管理が不要で、Gitリポジトリがクリーン
4. **スケーラビリティ**: CI/CDパイプラインに統合しやすい
5. **開発者体験**: IDEの補完機能が完全に機能

### トラブルシューティング設計

公式API方式では、エラーメッセージが明確で診断が容易:

- **認証エラー**: `pac auth list` で状態確認
- **スキーマエラー**: `getMetadata()` で最新スキーマを確認
- **権限エラー**: セキュリティロールの設定を確認
- **接続エラー**: 環境URLの正確性を確認

---

## ⚠️ 重要: SDK初期化とコネクター接続のタイミング

DataverseやOffice 365コネクターなどに接続する場合、**Power Apps SDKの初期化が完了してから**コネクターに接続する必要があります。

### よくあるエラー

```
Error fetching SystemUsers: PowerDataRuntimeError: An unknown error occurred: 
PowerDataRuntime is not initialized. Please call initializeRuntime() first.
```

**原因:**  
PowerDataRuntime（Power Apps SDK）が初期化される前にDataverseテーブルにアクセスしようとした

### 正しい実装パターン

```typescript
import { usePowerPlatform } from '@microsoft/power-apps';
import { useEffect, useState } from 'react';

export function App() {
  const { isInitialized } = usePowerPlatform();
  const [data, setData] = useState([]);

  useEffect(() => {
    // ✅ SDK初期化完了後にのみデータ取得
    if (!isInitialized) {
      console.log('Power Apps SDK 初期化中...');
      return;
    }

    loadData();
  }, [isInitialized]);

  // ❌ 初期化前にレンダリングしない
  if (!isInitialized) {
    return <div>初期化中...</div>;
  }

  return <YourApp data={data} />;
}
```

**重要なポイント:**
- ✅ `usePowerPlatform().isInitialized` で初期化状態をチェック
- ✅ `isInitialized === false` の間はLoading表示
- ✅ `isInitialized === true` になってからDataverseアクセス
- ✅ `useEffect` の依存配列に `isInitialized` を含める
- ❌ 初期化前にサービスクラスのメソッドを呼び出さない

---

## 📝 Phase 3の実装手順

### Step 1: 接続IDの取得

**Power Appsポータルで接続を作成し、URLから接続IDを取得します。**

#### 1-1. Power Appsポータルで接続を作成

1. **Power Apps Maker Portalにアクセス**
   ```
   https://make.powerapps.com
   ```

2. **環境を選択**
   - 画面右上で適切な環境を選択

3. **接続ページに移動**
   - 左側メニュー: **データ** → **接続**

4. **新しい接続を作成**
   - 「**+ 新しい接続**」ボタンをクリック
   - 検索ボックスで「**Dataverse**」を検索
   - 「**Microsoft Dataverse**」を選択
   - 「**作成**」ボタンをクリック

5. **認証完了を確認**
   - サインインが求められた場合は認証を完了
   - 接続が作成されると「接続」ページに表示されます

#### 1-2. URLから接続IDを取得 ⭐重要

接続IDは**ブラウザのURLから直接取得**します。

**手順:**

1. 作成した接続をクリックして詳細ページを開く
2. ブラウザのアドレスバーのURLを確認
3. URLの末尾にあるGUID形式の文字列が接続ID

**URLの例:**
```
https://make.powerapps.com/environments/12345678-abcd-1234-abcd-123456789012/connections/shared_commondataserviceforapps/a1b2c3d4-e5f6-7890-abcd-ef1234567890/details
                                                                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                                                                              これが接続ID
```

**接続IDのフォーマット:**
```
a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**📋 接続IDをメモ帳にコピーしてください。Step 3で使用します。**

#### 1-3. (代替方法) PAC CLIでの確認

コマンドラインで接続を確認することもできます:

```powershell
# 接続一覧を表示
pac connector list

# 出力例:
# Connector Display Name: Microsoft Dataverse
# Connector Name: shared_commondataserviceforapps  
# Connection Id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

> **💡 ヒント**: URLからの取得が最も確実な方法です。

---

### Step 2: 公式API-basedメタデータ取得方法

**✅ 推奨**: XMLファイルを使用せず、公式APIを使用してDataverseスキーマ情報を取得します。

Microsoft Learn公式ドキュメント:
- [Dataverseに接続する方法](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- [テーブルメタデータを取得する方法](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/get-table-metadata)

#### 2-1. 認証と環境接続

最初に Power Platform 環境に認証します:

```bash
# Power Platform環境に接続
pac auth create --url https://your-environment.crm.dynamics.com

# 認証状態の確認
pac auth list
```

**環境URLの確認方法:**
1. Power Apps Maker Portal (https://make.powerapps.com) にアクセス
2. 右上の設定アイコン → セッション詳細
3. インスタンスURLをコピー

#### 2-2. テーブル論理名の確認

Dataverseテーブルの論理名を確認します:

**Power Apps Maker Portalで確認:**
1. Power Apps Maker Portal にアクセス
2. **データ** → **テーブル** を選択
3. 対象テーブルをクリック
4. **プロパティ** で「**論理名**」を確認

**論理名の例:**
- `account` - 取引先企業
- `contact` - 取引先担当者
- `systemuser` - システムユーザー
- `geek_project_task` - カスタムテーブル（プレフィックス付き）

#### 2-3. 方法1: pac code add-data-source で自動取得（推奨）

`pac code add-data-source` コマンドは、指定したテーブルのメタデータを自動的に取得し、TypeScript型定義とサービスクラスを生成します。

```bash
# Dataverseテーブルを追加（メタデータ自動取得）
pac code add-data-source -a dataverse -t <table-logical-name>

# 例: accountテーブルを追加
pac code add-data-source -a dataverse -t account

# 例: カスタムテーブルを追加
pac code add-data-source -a dataverse -t geek_project_task
```

**このコマンドが実行すること:**
1. ✅ Dataverse Web APIに接続
2. ✅ 指定テーブルのEntityDefinitionsを取得
3. ✅ フィールド定義（Attributes）を解析
4. ✅ Choice値（OptionSet）を抽出
5. ✅ TypeScript型定義を自動生成
6. ✅ CRUD操作用サービスクラスを生成

**生成されるファイル:**
```
generated/
├── models/
│   └── AccountsModel.ts      # テーブル型定義
└── services/
    └── AccountsService.ts    # CRUD操作サービス
```

#### 2-4. 方法2: getMetadata API でランタイム取得

プログラムから直接メタデータを取得することもできます:

```typescript
import { AccountsService } from './generated/services/AccountsService';

/**
 * Dataverseテーブルのメタデータを取得
 * 
 * 参考: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/get-table-metadata
 */
async function getTableMetadata() {
  try {
    // getMetadata APIを呼び出し
    const result = await AccountsService.getMetadata({
      schema: { 
        columns: 'all',      // 全カラム情報を取得
        relationships: true  // リレーションシップ情報も取得
      }
    });

    if (result.isSuccess && result.value) {
      const metadata = result.value;
      
      console.log('テーブル論理名:', metadata.LogicalName);
      console.log('テーブル表示名:', metadata.DisplayName);
      
      // フィールド情報を列挙
      metadata.Attributes?.forEach(attr => {
        console.log(`- ${attr.LogicalName}: ${attr.AttributeType}`);
        
        // Choice (OptionSet) フィールドの場合
        if (attr.AttributeType === 'Picklist' && attr.OptionSet) {
          console.log('  Choice値:');
          attr.OptionSet.Options?.forEach(opt => {
            console.log(`    ${opt.Value}: ${opt.Label}`);
          });
        }
      });
      
      return metadata;
    } else {
      console.error('メタデータ取得エラー:', result.error);
    }
  } catch (error) {
    console.error('エラー:', error);
  }
}

// 使用例
await getTableMetadata();
```

**出力例:**
```
テーブル論理名: account
テーブル表示名: 取引先企業
- accountid: Uniqueidentifier
- name: String
- accountnumber: String
- industrycode: Picklist
  Choice値:
    1: 農業
    2: 金融
    3: 製造業
```

#### 2-5. 方法3: Dataverse Web API で直接取得（高度な用途）

より詳細な制御が必要な場合は、Dataverse Web APIを直接使用できます:

```bash
# EntityDefinitionsエンドポイント経由でメタデータ取得
curl -X GET \
  "https://your-environment.crm.dynamics.com/api/data/v9.2/EntityDefinitions(LogicalName='account')?$select=DisplayName,LogicalName&$expand=Attributes($select=LogicalName,AttributeType)" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Accept: application/json"
```

**TypeScriptでの実装例:**

```typescript
/**
 * Dataverse Web API経由でメタデータ取得
 * 
 * 参考: https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api
 */
async function fetchMetadataViaWebAPI(tableName: string) {
  const environmentUrl = 'https://your-environment.crm.dynamics.com';
  const apiVersion = 'v9.2';
  
  const url = `${environmentUrl}/api/data/${apiVersion}/EntityDefinitions(LogicalName='${tableName}')?` +
    `$select=LogicalName,DisplayName,PrimaryIdAttribute&` +
    `$expand=Attributes($select=LogicalName,AttributeType,DisplayName)`;
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }
  });
  
  if (response.ok) {
    const metadata = await response.json();
    return metadata;
  } else {
    throw new Error(`メタデータ取得失敗: ${response.statusText}`);
  }
}
```

#### 2-6. XMLベース方法との比較

| 比較項目 | ❌ XML方式（非推奨） | ✅ 公式API方式（推奨） |
|---------|---------------------|----------------------|
| **データ取得** | 手動エクスポート必要 | 自動取得 |
| **自動化** | 困難 | 完全自動化可能 |
| **最新性** | 手動更新が必要 | 常に最新 |
| **ファイルサイズ** | 数MB〜数十MB | JSON (軽量) |
| **パース複雑度** | 高い（XMLパース） | 低い（JSON） |
| **CI/CD統合** | 困難 | 容易 |
| **認証** | 不要（ファイル） | 標準OAuth |
| **メンテナンス** | 低い | 高い |

#### 2-7. 実装方針まとめ

**開発フロー:**

```mermaid
graph LR
    A[環境認証<br/>pac auth create] --> B[テーブル論理名確認<br/>Maker Portal]
    B --> C[データソース追加<br/>pac code add-data-source]
    C --> D[型定義自動生成<br/>generated/]
    D --> E[アプリ実装<br/>型安全なコード]
    
    style C fill:#4CAF50,color:#fff
    style D fill:#2196F3,color:#fff
```

**使用API:**
- **開発時**: `pac code add-data-source` コマンド（CLI）
- **ランタイム**: `getMetadata()` 関数（TypeScript SDK）
- **高度な用途**: Dataverse Web API（REST）

**認証フロー:**
1. `pac auth create` でPower Platform環境に接続
2. OAuth 2.0による標準的な認証
3. アクセストークンは自動管理（CLIが処理）

**設計メモ:**
- メタデータはJSON形式で取得され、型安全なTypeScriptコードに変換される
- スキーマ変更時は `pac code add-data-source` を再実行するだけで更新可能
- XMLファイルの管理は不要で、Git管理もシンプル
- CI/CDパイプラインに統合しやすい（認証情報を環境変数で管理）

---

### Step 3: サービスクラスの生成

**`pac code add-data-source` コマンドで、Power Apps SDKベースのTypeScriptサービスクラスを自動生成します。**

#### 3-1. データソース追加コマンド実行

**基本コマンド:**
```powershell
pac code add-data-source `
  --connector "shared_commondataserviceforapps" `
  --connection-id "<Step 1で取得した接続ID>"
```

**実行例:**
```powershell
pac code add-data-source `
  --connector "shared_commondataserviceforapps" `
  --connection-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

**テーブルを指定する場合:**
```powershell
# SystemUsersテーブルのみ生成
pac code add-data-source `
  --connector "shared_commondataserviceforapps" `
  --connection-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890" `
  --table "systemusers"

# カスタムテーブル (geek_project_task) を生成
pac code add-data-source `
  --connector "shared_commondataserviceforapps" `
  --connection-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890" `
  --table "geek_project_task"
```

#### 3-2. 生成されるファイル

コマンド実行後、以下のファイルが自動生成されます:

```
src/
└── generated/
    ├── models/
    │   ├── SystemUsersModel.ts           # SystemUsers型定義
    │   └── GeekProjectTasksModel.ts      # カスタムテーブル型定義
    └── services/
        ├── SystemUsersService.ts         # SystemUsersサービスクラス
        └── GeekProjectTasksService.ts    # カスタムテーブルサービスクラス
```

#### 3-3. 生成されたコードの確認

**Model例 (SystemUsersModel.ts):**
```typescript
export interface SystemUsers {
  systemuserid: string;
  fullname: string;
  internalemailaddress: string;
  isdisabled: boolean;
  // ... 他のフィールド
}
```

**Service例 (SystemUsersService.ts):**
```typescript
import { getClient } from '@microsoft/power-apps/data';
import type { IOperationResult } from '@microsoft/power-apps/data';
import type { SystemUsers } from '../models/SystemUsersModel';

export class SystemUsersService {
  static async getAll(options?: {
    select?: string[];
    filter?: string;
    orderBy?: string;
    top?: number;
    expand?: Array<{ navigationProperty: string; select?: string[] }>;
  }): Promise<IOperationResult<SystemUsers[]>> {
    const client = getClient();
    // Power Apps SDK経由でデータ取得
    return await client.retrieveMultipleRecords('systemuser', options);
  }

  static async getById(id: string): Promise<IOperationResult<SystemUsers>> {
    const client = getClient();
    return await client.retrieveRecord('systemuser', id);
  }

  // ... create, update, delete メソッド
}
```

#### 3-4. ビルドとLint確認

生成されたコードをビルドして確認します:

```powershell
# ビルド
npm run build

# Lint確認
npm run lint

# 両方を実行
npm run build; npm run lint
```

エラーがなければ、サービスクラスの生成は完了です。

---

---

### Step 4: モックデータの削除とDataverseデータ統合

**カスタムフックとReactコンポーネントを実装し、モックデータを完全に削除してDataverseの実データに接続します。**

#### 4-1. カスタムフックの作成

**ファイルパス:** `src/hooks/useSystemUsers.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { SystemUsersService } from '../generated/services/SystemUsersService';
import type { SystemUsers } from '../generated/models/SystemUsersModel';

export const useSystemUsers = () => {
  const { isInitialized } = usePowerPlatform();
  const [users, setUsers] = useState<SystemUsers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    // ❌ SDK初期化前は実行しない
    if (!isInitialized) {
      console.warn('Power Apps SDK not initialized yet');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // ✅ Power Apps SDK経由でデータ取得
      const result = await SystemUsersService.getAll({
        select: ['systemuserid', 'fullname', 'internalemailaddress', 'isdisabled'],
        filter: 'isdisabled eq false',
        orderBy: 'fullname asc',
        top: 100
      });
      
      // ✅ IOperationResult で型安全なエラーハンドリング
      if (result.isSuccess && result.value) {
        setUsers(result.value);
      } else {
        throw new Error(result.error?.message || 'ユーザー一覧の取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Error fetching SystemUsers:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  // SDK初期化完了後に自動でデータ取得
  useEffect(() => {
    if (isInitialized) {
      loadUsers();
    }
  }, [isInitialized, loadUsers]);

  return { 
    users, 
    loading, 
    error, 
    refetch: loadUsers, 
    isInitialized 
  };
};
```

**重要なポイント:**
- ✅ `usePowerPlatform().isInitialized` でSDK初期化状態を確認
- ✅ `IOperationResult.isSuccess` で型安全なエラーハンドリング
- ✅ `useEffect` の依存配列に `isInitialized` を含める
- ❌ 初期化前にサービスクラスのメソッドを呼び出さない

#### 4-2. Reactコンポーネントでの使用

**ファイルパス:** `src/pages/UsersPage.tsx`

```typescript
import { useSystemUsers } from '../hooks/useSystemUsers';
import { Card } from '@/components/ui/card';

export function UsersPage() {
  const { users, loading, error, isInitialized } = useSystemUsers();

  // 1. SDK初期化中の表示
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Power Platform 初期化中...</p>
        </div>
      </div>
    );
  }

  // 2. データ読み込み中の表示
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4">ユーザー読み込み中...</p>
        </div>
      </div>
    );
  }

  // 3. エラー発生時の表示
  if (error) {
    return (
      <Card className="p-6 bg-red-50 border-red-200">
        <h3 className="text-red-800 font-semibold">エラーが発生しました</h3>
        <p className="text-red-600">{error}</p>
      </Card>
    );
  }

  // 4. データ表示 (モックデータではなく実データ)
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-2xl font-bold">ユーザー一覧 (Dataverse)</h2>
      <p className="text-sm text-muted-foreground">
        全 {users.length} 件のユーザー
      </p>
      <div className="grid gap-4">
        {users.map(user => (
          <Card key={user.systemuserid} className="p-4">
            <h3 className="font-semibold">{user.fullname}</h3>
            <p className="text-sm text-muted-foreground">{user.internalemailaddress}</p>
            <p className="text-xs text-muted-foreground">ID: {user.systemuserid}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

#### 4-3. モックデータの完全削除

以下のモックデータファイルを削除してください:

**削除対象:**
```
src/
├── data/
│   ├── mockUsers.ts          ← 削除
│   ├── mockTasks.ts          ← 削除
│   └── mockData.json         ← 削除
├── hooks/
│   └── useMockData.ts        ← 削除 (Dataverse用のhookに置き換え)
└── utils/
    └── mockDataGenerator.ts  ← 削除
```

**削除コマンド (PowerShell):**
```powershell
# モックデータフォルダを削除
Remove-Item -Path ".\src\data" -Recurse -Force

# モック用のhookを削除 (必要に応じて)
Remove-Item -Path ".\src\hooks\useMockData.ts" -Force
```

**App.tsxの更新例:**

```typescript
// ❌ Before: モックデータ使用
import { mockUsers } from './data/mockUsers';

function App() {
  const [users] = useState(mockUsers);
  // ...
}

// ✅ After: Dataverseデータ使用
import { useSystemUsers } from './hooks/useSystemUsers';

function App() {
  const { users, loading, error, isInitialized } = useSystemUsers();
  
  if (!isInitialized) return <div>初期化中...</div>;
  if (loading) return <div>読み込み中...</div>;
  if (error) return <div>エラー: {error}</div>;
  
  // 実データを使用
  return <div>{users.map(u => <div key={u.systemuserid}>{u.fullname}</div>)}</div>;
}
```

#### 4-4. 動作確認

1. **ローカルで確認**
   ```powershell
   npm run dev
   ```
   - ブラウザで http://localhost:5173 を開く
   - Dataverseからデータが表示されることを確認

2. **ブラウザコンソールで確認**
   - F12を押して開発者ツールを開く
   - Console タブで以下を確認:
     ```
     Power Apps SDK 初期化中...
     Power Apps SDK initialized successfully
     Fetched 10 SystemUsers from Dataverse
     ```

3. **エラーがないことを確認**
   - コンソールにエラーが表示されていないこと
   - データが正しく表示されていること

#### 4-5. CRUD操作の実装 (必要に応じて)

データの作成・更新・削除が必要な場合は、以下のように実装します:

```typescript
// hooks/useDataverseTable.ts
export const useDataverseTable = <T>(
  serviceName: string,
  Service: any
) => {
  const { isInitialized } = usePowerPlatform();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 読み取り
  const fetchItems = useCallback(async (options?) => {
    if (!isInitialized) return;
    
    setLoading(true);
    try {
      const result = await Service.getAll(options);
      if (result.isSuccess && result.value) {
        setItems(result.value);
      } else {
        throw new Error(result.error?.message || 'データ取得失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [isInitialized, Service]);

  // 作成
  const createItem = useCallback(async (data: Partial<T>) => {
    if (!isInitialized) return null;
    
    try {
      const result = await Service.create(data);
      if (result.isSuccess) {
        await fetchItems(); // 再読み込み
        return result.value;
      }
      throw new Error(result.error?.message || '作成失敗');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, [isInitialized, fetchItems, Service]);

  // 更新
  const updateItem = useCallback(async (id: string, data: Partial<T>) => {
    if (!isInitialized) return false;
    
    try {
      const result = await Service.update(id, data);
      if (result.isSuccess) {
        await fetchItems(); // 再読み込み
        return true;
      }
      throw new Error(result.error?.message || '更新失敗');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [isInitialized, fetchItems, Service]);

  // 削除
  const deleteItem = useCallback(async (id: string) => {
    if (!isInitialized) return false;
    
    try {
      const result = await Service.delete(id);
      if (result.isSuccess) {
        await fetchItems(); // 再読み込み
        return true;
      }
      throw new Error(result.error?.message || '削除失敗');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [isInitialized, fetchItems, Service]);

  useEffect(() => {
    if (isInitialized) {
      fetchItems();
    }
  }, [isInitialized, fetchItems]);

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
    create: createItem,
    update: updateItem,
    delete: deleteItem,
    isInitialized
  };
};
```

**使用例:**

```typescript
import { useDataverseTable } from '../hooks/useDataverseTable';
import { GeekProjectTasksService } from '../generated/services/GeekProjectTasksService';

function TasksPage() {
  const { 
    items: tasks, 
    loading, 
    create, 
    update, 
    delete: deleteTask 
  } = useDataverseTable('geek_project_task', GeekProjectTasksService);

  const handleCreate = async () => {
    await create({ geek_name: '新しいタスク', geek_status: 100000000 });
  };

  const handleComplete = async (taskId: string) => {
    await update(taskId, { geek_status: 100000001 });
  };

  const handleDelete = async (taskId: string) => {
    if (confirm('削除しますか?')) {
      await deleteTask(taskId);
    }
  };

  // ... UI実装
}
```

---

---

## � 実装例

### 例1: SystemUsersテーブルの統合

**目的:** Dataverseの標準テーブル (SystemUsers) からユーザー一覧を取得して表示

**実装手順:**

1. **接続作成とID取得**
   - Power Appsポータルで Dataverse 接続を作成
   - URLから接続ID取得: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`

2. **サービスクラス生成**
   ```powershell
   pac code add-data-source `
     --connector "shared_commondataserviceforapps" `
     --connection-id "a1b2c3d4-e5f6-7890-abcd-ef1234567890" `
     --table "systemusers"
   ```

3. **カスタムフック作成** (`src/hooks/useSystemUsers.ts`)
   ```typescript
   import { useState, useEffect, useCallback } from 'react';
   import { usePowerPlatform } from '@microsoft/power-apps';
   import { SystemUsersService } from '../generated/services/SystemUsersService';
   
   export const useSystemUsers = () => {
     const { isInitialized } = usePowerPlatform();
     const [users, setUsers] = useState([]);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState(null);
   
     const loadUsers = useCallback(async () => {
       if (!isInitialized) return;
       
       try {
         const result = await SystemUsersService.getAll({
           select: ['systemuserid', 'fullname', 'internalemailaddress'],
           filter: 'isdisabled eq false'
         });
         
         if (result.isSuccess && result.value) {
           setUsers(result.value);
         }
       } catch (err) {
         setError(err.message);
       } finally {
         setLoading(false);
       }
     }, [isInitialized]);
   
     useEffect(() => {
       if (isInitialized) loadUsers();
     }, [isInitialized, loadUsers]);
   
     return { users, loading, error, isInitialized };
   };
   ```

4. **コンポーネント実装**
   ```typescript
   export function UsersPage() {
     const { users, loading, error, isInitialized } = useSystemUsers();
     
     if (!isInitialized) return <div>初期化中...</div>;
     if (loading) return <div>読み込み中...</div>;
     if (error) return <div>エラー: {error}</div>;
     
     return (
       <div>
         <h2>ユーザー一覧 ({users.length}件)</h2>
         {users.map(u => (
           <div key={u.systemuserid}>{u.fullname} - {u.internalemailaddress}</div>
         ))}
       </div>
     );
   }
   ```

---

### 例2: カスタムテーブル (Project Tasks) の統合

**目的:** カスタムテーブルでCRUD操作を実装

**前提条件:**
- カスタムテーブル `geek_project_task` が作成済み
- フィールド: `geek_name` (タスク名), `geek_status` (ステータス)

**実装手順:**

1. **環境認証**
   ```bash
   pac auth create --url https://your-environment.crm.dynamics.com
   ```

2. **サービスクラス生成（メタデータ自動取得）**
   ```bash
   pac code add-data-source -a dataverse -t geek_project_task
   ```

3. **カスタムフック作成** (`src/hooks/useProjectTasks.ts`)
   ```typescript
   import { useState, useEffect, useCallback } from 'react';
   import { usePowerPlatform } from '@microsoft/power-apps';
   import { GeekProjectTaskService } from '../generated/services/GeekProjectTaskService';
   
   export const useProjectTasks = () => {
     const { isInitialized } = usePowerPlatform();
     const [tasks, setTasks] = useState([]);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState(null);
   
     const loadTasks = useCallback(async () => {
       if (!isInitialized) return;
       
       setLoading(true);
       try {
         const result = await GeekProjectTasksService.getAll({
           select: ['geek_project_taskid', 'geek_name', 'geek_status'],
           orderBy: 'createdon desc'
         });
         
         if (result.isSuccess && result.value) {
           setTasks(result.value);
         }
       } catch (err) {
         setError(err.message);
       } finally {
         setLoading(false);
       }
     }, [isInitialized]);
   
     const createTask = useCallback(async (name: string) => {
       if (!isInitialized) return false;
       
       try {
         const result = await GeekProjectTasksService.create({
           geek_name: name,
           geek_status: 100000000 // 新規
         });
         
         if (result.isSuccess) {
           await loadTasks();
           return true;
         }
       } catch (err) {
         setError(err.message);
       }
       return false;
     }, [isInitialized, loadTasks]);
   
     const updateTask = useCallback(async (id: string, status: number) => {
       if (!isInitialized) return false;
       
       try {
         const result = await GeekProjectTasksService.update(id, {
           geek_status: status
         });
         
         if (result.isSuccess) {
           await loadTasks();
           return true;
         }
       } catch (err) {
         setError(err.message);
       }
       return false;
     }, [isInitialized, loadTasks]);
   
     const deleteTask = useCallback(async (id: string) => {
       if (!isInitialized) return false;
       
       try {
         const result = await GeekProjectTasksService.delete(id);
         
         if (result.isSuccess) {
           await loadTasks();
           return true;
         }
       } catch (err) {
         setError(err.message);
       }
       return false;
     }, [isInitialized, loadTasks]);
   
     useEffect(() => {
       if (isInitialized) loadTasks();
     }, [isInitialized, loadTasks]);
   
     return { tasks, loading, error, createTask, updateTask, deleteTask };
   };
   ```

4. **コンポーネント実装**
   ```typescript
   import { useState } from 'react';
   import { useProjectTasks } from '../hooks/useProjectTasks';
   
   export function TasksPage() {
     const { tasks, loading, createTask, updateTask, deleteTask } = useProjectTasks();
     const [newTaskName, setNewTaskName] = useState('');
   
     const handleCreate = async () => {
       if (newTaskName.trim()) {
         await createTask(newTaskName);
         setNewTaskName('');
       }
     };
   
     const handleComplete = async (taskId: string) => {
       await updateTask(taskId, 100000001); // 完了
     };
   
     const handleDelete = async (taskId: string) => {
       if (confirm('削除しますか?')) {
         await deleteTask(taskId);
       }
     };
   
     if (loading) return <div>読み込み中...</div>;
   
     return (
       <div>
         <h2>プロジェクトタスク</h2>
         
         {/* 新規作成 */}
         <div>
           <input
             value={newTaskName}
             onChange={(e) => setNewTaskName(e.target.value)}
             placeholder="新しいタスク"
           />
           <button onClick={handleCreate}>追加</button>
         </div>
   
         {/* タスク一覧 */}
         {tasks.map(task => (
           <div key={task.geek_project_taskid}>
             <span>{task.geek_name}</span>
             <button onClick={() => handleComplete(task.geek_project_taskid)}>完了</button>
             <button onClick={() => handleDelete(task.geek_project_taskid)}>削除</button>
           </div>
         ))}
       </div>
     );
   }
   ```

---

### 例3: Lookupフィールドの処理

**目的:** タスクに担当者 (Lookup to SystemUsers) を設定

**前提条件:**
- `geek_project_task` テーブルに Lookup フィールド `geek_AssignedTo` が存在

> **📘 詳細ガイド**  
> Lookupフィールドの完全な実装方法は **[LOOKUP_FIELD_GUIDE.md](./docs/LOOKUP_FIELD_GUIDE.md)** を参照してください。

**実装例:**

```typescript
// Lookupフィールドを$expandで展開して取得
const result = await GeekProjectTasksService.getAll({
  select: ['geek_project_taskid', 'geek_name', '_geek_assignedto_value'],
  expand: [
    {
      navigationProperty: 'geek_AssignedTo',
      select: ['systemuserid', 'fullname']
    }
  ]
});

// データ整形
const tasks = result.value.map(task => ({
  id: task.geek_project_taskid,
  name: task.geek_name,
  assignedToId: task._geek_assignedto_value,
  assignedToName: task.geek_AssignedTo?.fullname || '未割り当て'
}));

// 担当者を設定
await GeekProjectTasksService.update(taskId, {
  'geek_AssignedTo@odata.bind': `/systemusers(${userId})`
});
```

---

---

## � トラブルシューティング

### よくある問題と解決法

#### 問題1: PowerDataRuntime is not initialized

**エラーメッセージ:**
```
PowerDataRuntimeError: An unknown error occurred: 
PowerDataRuntime is not initialized. Please call initializeRuntime() first.
```

**原因:**  
Power Apps SDKの初期化が完了する前にDataverseにアクセスしようとした

**解決方法:**
```typescript
import { usePowerPlatform } from '@microsoft/power-apps';

export function App() {
  const { isInitialized } = usePowerPlatform();

  // ✅ 初期化完了を待つ
  if (!isInitialized) {
    return <div>初期化中...</div>;
  }

  // ✅ 初期化完了後にコンポーネントをレンダリング
  return <YourDataComponent />;
}
```

---

#### 問題2: 接続IDが見つからない

**症状:**  
`pac code add-data-source` 実行時に「接続が見つかりません」エラー

**原因:**
- 接続IDが間違っている
- 環境が異なる
- 接続が削除された

**解決方法:**

1. **Power Appsポータルで再確認**
   - https://make.powerapps.com → データ → 接続
   - 接続をクリックしてURLから接続IDを再取得
   ```
   https://make.powerapps.com/.../connections/shared_commondataserviceforapps/a1b2c3d4-e5f6-7890-abcd-ef1234567890/details
                                                                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```

2. **環境を確認**
   ```powershell
   # 現在の環境を確認
   pac org who
   
   # 環境を切り替え
   pac org select --environment <環境ID>
   ```

3. **接続を再作成**
   - Power Appsポータルで接続を削除
   - 新しい接続を作成
   - 新しい接続IDで再試行

---

#### 問題3: テーブルメタデータが取得できない

**症状:**  
`pac code add-data-source` 実行時にスキーマ情報が取得できない

**原因:**
- テーブル論理名が間違っている
- テーブルがDataverseで公開されていない
- 認証が切れている

**解決方法:**

1. **テーブル論理名を確認**
   - Power Apps Maker Portal → データ → テーブル
   - 対象テーブルをクリック → プロパティで論理名を確認
   - 論理名は小文字とアンダースコアのみ（例: `geek_project_task`）

2. **認証状態を確認**
   ```bash
   # 認証一覧を表示
   pac auth list
   
   # 必要に応じて再認証
   pac auth create --url https://your-environment.crm.dynamics.com
   ```

3. **メタデータをランタイムで確認**
   ```typescript
   // アプリ内でメタデータを取得して確認
   const result = await YourTableService.getMetadata({
     schema: { columns: 'all' }
   });
   
   if (result.isSuccess) {
     console.log('テーブル情報:', result.value);
   } else {
     console.error('エラー:', result.error);
   }
   ```

---

#### 問題4: データが取得できない (空配列が返る)

**症状:**  
エラーは出ないが、データが0件

**原因と解決方法:**

**原因1: filterが厳しすぎる**
```typescript
// ❌ 全てフィルタで除外されている
const result = await SystemUsersService.getAll({
  filter: 'isdisabled eq false and fullname eq "存在しない名前"'
});

// ✅ フィルタを緩める or 削除
const result = await SystemUsersService.getAll({
  filter: 'isdisabled eq false'
});
```

**原因2: テーブルにデータが存在しない**
```powershell
# Power Appsポータルで確認
# https://make.powerapps.com → データ → テーブル → 該当テーブル
```

**原因3: セキュリティロールの権限不足**
- Dataverseのセキュリティロール設定を確認
- 読み取り権限が付与されているか確認

---

#### 問題5: IOperationResult.isSuccess が false

**症状:**  
`result.isSuccess` が常に `false` を返す

**デバッグ方法:**

```typescript
const result = await SystemUsersService.getAll();

if (!result.isSuccess) {
  // ✅ エラー詳細を確認
  console.error('Error Code:', result.error?.code);
  console.error('Error Message:', result.error?.message);
  console.error('Error Details:', result.error?.details);
  console.error('Full Error:', JSON.stringify(result.error, null, 2));
}
```

**よくあるエラーコードと解決法:**

| エラーコード | 原因 | 解決方法 |
|------------|------|---------|
| `0x80040217` | レコードが存在しない | IDを確認、削除済みの可能性 |
| `0x80048306` | 権限不足 | セキュリティロールを確認 |
| `0x8004037a` | ビジネスルール違反 | 必須フィールドを確認 |
| `0x80040220` | 重複検出ルール | レコードが既に存在 |

---

#### 問題6: Lookupフィールドが null

**症状:**  
Lookupフィールドを取得しようとすると `null` になる

**原因:**
- `$expand` を使用していない
- navigationProperty名が間違っている

**解決方法:**

```typescript
// ❌ expandなしでは _geek_assignedto_value (GUID) のみ取得
const result = await GeekProjectTasksService.getAll({
  select: ['geek_name', '_geek_assignedto_value']
});
// task.geek_AssignedTo は undefined

// ✅ $expandでLookupデータを展開
const result = await GeekProjectTasksService.getAll({
  select: ['geek_name', '_geek_assignedto_value'],
  expand: [
    {
      navigationProperty: 'geek_AssignedTo',  // 大文字小文字に注意
      select: ['systemuserid', 'fullname']
    }
  ]
});
// task.geek_AssignedTo.fullname でアクセス可能
```

> **📘 詳細ガイド**  
> Lookupフィールドのトラブルシューティングは **[LOOKUP_FIELD_GUIDE.md](./docs/LOOKUP_FIELD_GUIDE.md)** を参照してください。

---

#### 問題7: Choice (オプションセット) の値が数値で表示される

**症状:**  
ステータスが `100000000` のような数値で表示される

**原因:**  
Choiceフィールドは内部的に整数値で管理されている

**解決方法:**

```typescript
// Choice値のマッピングを定義
const STATUS_LABELS = {
  100000000: '新規',
  100000001: '進行中',
  100000002: '完了',
  100000003: 'キャンセル'
} as const;

// コンポーネントで使用
function TaskCard({ task }) {
  const statusLabel = STATUS_LABELS[task.geek_status] || '不明';
  
  return (
    <div>
      <h3>{task.geek_name}</h3>
      <p>ステータス: {statusLabel}</p>
    </div>
  );
}
```

> **📘 スキーマリファレンス**  
> Choice値の定義は **[DATAVERSE_SCHEMA_REFERENCE.md](./docs/DATAVERSE_SCHEMA_REFERENCE.md)** を参照してください。

---

### デバッグ方法

#### ブラウザコンソールでの確認

```typescript
// 初期化状態を確認
console.log('SDK Initialized:', isInitialized);

// データ取得結果を確認
const result = await SystemUsersService.getAll();
console.log('Result:', result);
console.log('Is Success:', result.isSuccess);
console.log('Value:', result.value);
console.log('Error:', result.error);

// データ件数を確認
console.log('Data count:', result.value?.length);
```

#### Network タブでの確認

1. F12で開発者ツールを開く
2. **Network** タブを選択
3. データ取得操作を実行
4. OData APIリクエストを確認

**確認ポイント:**
- リクエストURL: `/api/data/v9.2/systemusers`
- Status Code: 200 (成功)
- Response: 返されたJSONデータ

#### Power Apps Monitorでの確認

1. Power Apps Maker Portal → モニター
2. Code Appsを起動
3. 実行されたODataクエリを確認

> **📘 詳細なデバッグ方法**  
> **[DATAVERSE_DEBUG.md](./docs/DATAVERSE_DEBUG.md)** と **[DATAVERSE_TROUBLESHOOTING.md](./docs/DATAVERSE_TROUBLESHOOTING.md)** を参照してください。

---

## ✅ Phase 5 完了チェックリスト

### データソース接続
- [ ] Power Appsポータルで接続が作成されている
- [ ] 接続IDが取得できている
- [ ] `pac code add-data-source` が成功している
- [ ] サービスクラスが生成されている

### カスタムフック
- [ ] カスタムフックが作成されている
- [ ] `isInitialized` チェックが実装されている
- [ ] エラーハンドリングが実装されている
- [ ] ローディング状態の管理が実装されている

### UI統合
- [ ] コンポーネントでカスタムフックを使用している
- [ ] 初期化中の表示が実装されている
- [ ] ローディング中の表示が実装されている
- [ ] エラー表示が実装されている
- [ ] データが正しく表示される

### 動作確認
- [ ] データの読み取りが成功する
- [ ] データの作成が成功する（該当する場合）
- [ ] データの更新が成功する（該当する場合）
- [ ] データの削除が成功する（該当する場合）
- [ ] エラーハンドリングが正常に動作する

---

## � 関連リファレンス

### Dataverse実装
- **[LOOKUP_FIELD_GUIDE.md](./docs/LOOKUP_FIELD_GUIDE.md)** - Lookupフィールド完全ガイド
- **[DATAVERSE_SCHEMA_REFERENCE.md](./docs/DATAVERSE_SCHEMA_REFERENCE.md)** - スキーマ定義とChoice値
- **[HOW_TO_GET_DATAVERSE_SCHEMA.md](./docs/HOW_TO_GET_DATAVERSE_SCHEMA.md)** - スキーマ取得方法

### トラブルシューティング
- **[DATAVERSE_TROUBLESHOOTING.md](./docs/DATAVERSE_TROUBLESHOOTING.md)** - よくある問題と解決法
- **[DATAVERSE_DEBUG.md](./docs/DATAVERSE_DEBUG.md)** - デバッグ方法

---

## ✅ Phase 5 完了チェックリスト

### Step 1: 接続ID取得
- [ ] Power Appsポータルで Dataverse 接続が作成されている
- [ ] 接続をクリックして詳細ページを開いた
- [ ] ブラウザURLから接続IDをコピーした
- [ ] 接続IDがGUID形式 (例: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`) である

### Step 2: メタデータ取得
- [ ] Power Platform環境に認証した (`pac auth create`)
- [ ] テーブルの論理名を確認した（Power Apps Maker Portal）
- [ ] 論理名が小文字とアンダースコアのみであることを確認した

### Step 3: サービスクラス生成
- [ ] `pac code add-data-source -a dataverse -t <table-name>` コマンドが成功した
- [ ] `generated/models/` にModel定義が生成されている
- [ ] `generated/services/` にServiceクラスが生成されている
- [ ] `npm run build` が成功した
- [ ] `npm run lint` でエラーがない

### Step 4: データ統合
- [ ] カスタムフックを作成した
- [ ] `usePowerPlatform().isInitialized` チェックを実装した
- [ ] `IOperationResult.isSuccess` でエラーハンドリングを実装した
- [ ] Reactコンポーネントでカスタムフックを使用した
- [ ] モックデータファイルを削除した
- [ ] モックデータへの参照を削除した

### 動作確認
- [ ] ローカル環境でアプリが起動する (`npm run dev`)
- [ ] SDK初期化中の表示が正しく表示される
- [ ] データ読み込み中の表示が正しく表示される
- [ ] Dataverseから実データが取得できる
- [ ] データが正しくUIに表示される
- [ ] エラーハンドリングが正常に動作する
- [ ] ブラウザコンソールにエラーが出ていない

### CRUD操作 (該当する場合)
- [ ] データの作成が成功する
- [ ] データの更新が成功する
- [ ] データの削除が成功する
- [ ] 操作後にデータが再読み込みされる

### Power Apps環境での確認
- [ ] `pac code build` が成功する
- [ ] `pac code push` が成功する
- [ ] Power Apps環境でアプリが正常に起動する
- [ ] Power Apps環境で実データが表示される

---

## �🔄 次のステップ

Phase 5が完了したら、継続的な機能拡張サイクルに入ります。

**継続開発サイクル:**

```mermaid
graph LR
    A[要件定義] --> B[データモデル設計]
    B --> C[カスタムフック実装]
    C --> D[UI実装]
    D --> E[テスト]
    E --> F[デプロイ]
    F --> A
    
    style A fill:#e3f2fd
    style B fill:#e8f5e9
    style C fill:#fff3e0
    style D fill:#f3e5f5
    style E fill:#fce4ec
    style F fill:#e0f2f1
```

**具体的な次のアクション:**

1. **新機能の要件定義**
   - ユーザーストーリーの作成
   - 必要なデータの特定
   - UI/UXデザイン

2. **データモデルの設計**
   - 新しいテーブルの作成 (必要に応じて)
   - リレーションシップの定義
   - ビジネスルールの設定

3. **カスタムフックの実装**
   - 新しいサービスクラスの生成
   - ビジネスロジックの実装
   - エラーハンドリングの追加

4. **UIコンポーネントの実装**
   - Reactコンポーネントの作成
   - デザインシステムの適用
   - レスポンシブ対応

5. **テスト**
   - ローカルでの動作確認
   - エッジケースのテスト
   - エラーハンドリングの確認

6. **デプロイ (Phase 4に戻る)**
   - `pac code build`
   - `pac code push`
   - Power Apps環境での動作確認

---

## 💡 ベストプラクティス

### コード品質
- ✅ TypeScript型定義を活用する
- ✅ エラーハンドリングを徹底する
- ✅ ローディング状態を適切に管理する
- ✅ コンポーネントを小さく保つ
- ✅ カスタムフックでロジックを分離する

### パフォーマンス
- ✅ `select` で必要なフィールドのみ取得する
- ✅ `filter` でデータを絞り込む
- ✅ `top` で取得件数を制限する
- ✅ 不要な再レンダリングを避ける (`useMemo`, `useCallback`)
- ✅ Lookup展開は必要な場合のみ使用する

### セキュリティ
- ✅ Dataverseのセキュリティロールを適切に設定する
- ✅ フィールドレベルセキュリティを活用する
- ✅ ビジネスルールで入力値を検証する
- ✅ クライアント側で機密情報を保持しない

### 保守性
- ✅ コードにコメントを追加する
- ✅ 定数を別ファイルに分離する
- ✅ ユーティリティ関数を再利用する
- ✅ ドキュメントを更新する
- ✅ バージョン管理を活用する

---

🎉 **Phase 5完了おめでとうございます！**

モックデータから実データへの移行が完了し、Power Apps Code Appsで本格的なビジネスアプリケーションが稼働しています。

**今後の展開:**
- 📊 レポート機能の追加
- 🔔 通知機能の実装
- 📱 モバイル対応の強化
- 🔗 外部サービスとの統合
- 🚀 パフォーマンス最適化

継続的に改善を重ね、ユーザーに価値を提供し続けましょう！
```

**生成されるファイル:**
```
src/generated/services/Office365UsersService.ts
src/generated/models/Office365UsersModel.ts
```

**自動生成されるメソッド:**
- `MyProfile_V2()` - 現在のユーザープロファイル
- `UserProfile_V2(id)` - 特定ユーザーのプロファイル
- `SearchUserV2(searchTerm)` - ユーザー検索
- `Manager_V2(id)` - マネージャー情報
- `DirectReports_V2(id)` - 直属の部下

### **3.3 Dataverse: SystemUsers テーブル**

```bash
# SystemUsers テーブルのサービスクラスを生成
pac code add-data-source -a "shared_commondataserviceforapps" -c "a1b2c3d4-e5f6-7890-1234-567890abcdef" -t "systemusers"
```

**生成されるファイル:**
```
src/generated/services/SystemusersService.ts
src/generated/models/SystemusersModel.ts
```

**自動生成されるメソッド:**
- `getAll(options)` - ODataクエリで取得
- `get(id)` - IDで1件取得
- `create(data)` - 新規作成
- `update(id, data)` - 更新
- `delete(id)` - 削除

### **3.4 Dataverse: 複数の標準テーブル**

```bash
# 環境変数に接続IDを設定 (PowerShell)
$connectionId = "a1b2c3d4-e5f6-7890-1234-567890abcdef"

# SystemUsers (システムユーザー)
pac code add-data-source -a "shared_commondataserviceforapps" -c $connectionId -t "systemusers"

# Accounts (取引先企業)
pac code add-data-source -a "shared_commondataserviceforapps" -c $connectionId -t "accounts"

# Contacts (取引先担当者)
pac code add-data-source -a "shared_commondataserviceforapps" -c $connectionId -t "contacts"

# Tasks (タスク)
pac code add-data-source -a "shared_commondataserviceforapps" -c $connectionId -t "tasks"

# カスタムテーブル (例: geek_project_task)
pac code add-data-source -a "shared_commondataserviceforapps" -c $connectionId -t "geek_project_task"
```

**生成されるサービスクラス名規則:**
- テーブル論理名: `geek_project_task`
- サービスクラス: `Geek_project_tasksService` (先頭大文字、末尾にs追加)

**🔧 トラブルシューティング:**

| 問題 | 原因 | 対策 |
|------|------|------|
| `Connection not found` | 接続IDが無効 | Step 2で接続IDを再確認 |
| `Table not found` | テーブル論理名が間違い | 小文字・アンダースコア区切りを確認 |
| `Authentication failed` | pac認証が期限切れ | `pac auth create` で再認証 |
| ファイルが生成されない | コマンド実行エラー | エラーメッセージを確認 |

---

### **Step 4: 自動生成されたサービスクラスの確認**

pac code add-data-source 実行後、以下のファイルが自動生成されます。

**生成されるファイル構造:**

```
src/
  generated/
    services/
      Office365UsersService.ts        # Office 365 Users
      SystemusersService.ts            # Dataverse: SystemUsers
      AccountsService.ts               # Dataverse: Accounts
      Geek_project_tasksService.ts     # カスタムテーブル
    models/
      Office365UsersModel.ts
      SystemusersModel.ts
      AccountsModel.ts
      Geek_project_tasksModel.ts
```

**サービスクラスの基本構造 (例: Office365UsersService):**

```typescript
export class Office365UsersService {
  private static readonly dataSourceName = 'office365users';
  private static readonly client = getClient(dataSourcesInfo);

  public static async MyProfile_V2($select?: string): Promise<IOperationResult<GraphUser_V1>> {
    const params: { $select?: string } = { $select };
    const result = await Office365UsersService.client.executeAsync<{ $select?: string }, GraphUser_V1>({
      connectorOperation: {
        tableName: Office365UsersService.dataSourceName,
        operationName: 'MyProfile_V2',
        parameters: params
      },
    });
    return result;
  }
  // ... その他のメソッド
}
```

**重要なポイント:**
- ✅ すべてのメソッドが `static` (インスタンス化不要)
- ✅ `IOperationResult<T>` で統一されたレスポンス型
- ✅ TypeScript型定義が自動生成
- ✅ Power Apps SDK の `getClient()` を使用

**🔧 トラブルシューティング:**

| 問題 | 原因 | 対策 |
|------|------|------|
| 生成されたファイルが見つからない | コマンド実行失敗 | エラーメッセージを確認 |
| TypeScriptエラーが出る | 型定義の不一致 | `npm run build` でビルドエラーを確認 |
| メソッドが見つからない | コネクターバージョン違い | 生成されたファイルを直接確認 |

---

### **Step 5: PowerDataRuntime 初期化確認パターン実装**

**⚠️ 重要:** Power Apps SDK を使用する前に、**必ず PowerDataRuntime の初期化完了を確認**してください。

**基本パターン:**

```typescript
import { usePowerPlatform } from '@microsoft/power-apps';
import { SystemUsersService } from '../generated/services/SystemUsersService';

export function DataPage() {
  const { isInitialized } = usePowerPlatform();
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // ❌ 初期化前にアクセスするとエラー
    if (!isInitialized) {
      console.log('SDK not initialized, waiting...');
      return;
    }

    // ✅ 初期化後にデータ取得
    const loadUsers = async () => {
      const result = await SystemUsersService.getAll();
      if (result.isSuccess && result.value) {
        setUsers(result.value);
      }
    };
    loadUsers();
  }, [isInitialized]); // 依存配列に isInitialized を含める

  // ローディング表示
  if (!isInitialized) {
    return <div>Power Apps SDK 初期化中...</div>;
  }

  return <div>{/* データ表示 */}</div>;
}
```

**PowerProvider の設定確認:**

```typescript
// src/main.tsx
import { PowerProvider } from '@microsoft/power-apps';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PowerProvider>  {/* ← 必須 */}
    <App />
  </PowerProvider>
);
```

**🔧 トラブルシューティング:**

| エラーメッセージ | 原因 | 対策 |
|----------------|------|------|
| `PowerDataRuntime is not initialized` | SDK未初期化 | `usePowerPlatform().isInitialized` を確認 |
| `PowerProvider not found` | PowerProvider未設定 | main.tsx で PowerProvider を追加 |
| 初期化が完了しない | `pac code run` 未実行 | `pac code run` でアプリを起動 |

**初期化確認のデバッグ:**

```typescript
const { isInitialized } = usePowerPlatform();

useEffect(() => {
  console.log('SDK初期化状態:', isInitialized);
}, [isInitialized]);

// npm run dev → isInitialized: false (Power Platform統合なし)
// pac code run → isInitialized: true (Power Platform統合あり)
```

---

### **Step 6: カスタムフック作成**

ビジネスロジックをカスタムフックにカプセル化します。

**Office 365 Users カスタムフック:**

```typescript
// src/hooks/useOffice365Users.ts
import { useState, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import type { GraphUser_V1 } from '../generated/models/Office365UsersModel';

export const useOffice365Users = () => {
  const { isInitialized } = usePowerPlatform();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 現在のユーザープロファイル取得
  const getMyProfile = useCallback(async () => {
    if (!isInitialized) throw new Error('SDK not initialized');
    
    try {
      setLoading(true);
      const result = await Office365UsersService.MyProfile_V2();
      
      if (result.isSuccess && result.value) {
        return result.value;
      } else {
        throw new Error('プロファイル取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  // ユーザー検索
  const searchUsers = useCallback(async (searchTerm: string, top: number = 10) => {
    if (!isInitialized) throw new Error('SDK not initialized');
    
    try {
      setLoading(true);
      const result = await Office365UsersService.SearchUserV2(searchTerm, top, false);
      
      if (result.isSuccess && result.value) {
        return result.value.value || [];
      } else {
        throw new Error('ユーザー検索に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  return { getMyProfile, searchUsers, loading, error, isInitialized };
};
```

### **5.2 Dataverse: SystemUsers カスタムフック実装**

```typescript
// src/hooks/useSystemUsers.ts
import { useState, useEffect, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { SystemUsersService } from '../generated/services/SystemUsersService';

export const useSystemUsers = () => {
  const { isInitialized } = usePowerPlatform();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isInitialized) return;

    try {
      setLoading(true);
      const result = await SystemUsersService.getAll({
        select: ['systemuserid', 'fullname', 'internalemailaddress'],
        filter: 'isdisabled eq false',
        orderBy: 'fullname asc',
        top: 50
      });

      if (result.isSuccess && result.value) {
        setUsers(result.value);
      } else {
        throw new Error('ユーザー検索に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  return { getMyProfile, searchUsers, loading, error, isInitialized };
};
```

**Dataverse: SystemUsers カスタムフック:**

```typescript
// src/hooks/useSystemUsers.ts
import { useState, useEffect, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { SystemUsersService } from '../generated/services/SystemUsersService';

export const useSystemUsers = () => {
  const { isInitialized } = usePowerPlatform();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!isInitialized) return;

    try {
      setLoading(true);
      const result = await SystemUsersService.getAll({
        select: ['systemuserid', 'fullname', 'internalemailaddress'],
        filter: 'isdisabled eq false',
        orderBy: 'fullname asc',
        top: 50
      });

      if (result.isSuccess && result.value) {
        setUsers(result.value);
      } else {
        throw new Error('ユーザーの取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      fetchUsers();
    }
  }, [isInitialized, fetchUsers]);

  return { users, loading, error, refetch: fetchUsers, isInitialized };
};
```

---

### **Step 7: Reactコンポーネントでの使用**

カスタムフックを使用してReactコンポーネントを実装します。

**基本的な使用例:**

```typescript
// src/pages/UsersPage.tsx
import React from 'react';
import { useSystemUsers } from '../hooks/useSystemUsers';

export const UsersPage: React.FC = () => {
  const { users, loading, error, isInitialized } = useSystemUsers();

  if (!isInitialized) {
    return <div>Power Apps SDK 初期化中...</div>;
  }

  if (loading) {
    return <div>読み込み中...</div>;
  }

  if (error) {
    return <div>エラー: {error}</div>;
  }

  return (
    <div>
      <h1>システムユーザー ({users.length})</h1>
      {users.map(user => (
        <div key={user.systemuserid}>
          {user.fullname} - {user.internalemailaddress}
        </div>
      ))}
    </div>
  );
};
```

**🔧 トラブルシューティング:**

| 問題 | 原因 | 対策 |
|------|------|------|
| データが表示されない | `isInitialized` が false | `pac code run` で起動しているか確認 |
| エラーが表示される | サービスクラスのエラー | `result.isSuccess` を確認、エラーログを確認 |
| 型エラーが出る | 自動生成された型と不一致 | 生成されたModel.tsファイルを確認 |

---

## **📋 まとめ: データソース接続の完全フロー**

**7つのステップで完了:**

1. ✅ **Power Apps ポータルで接続作成** → 認証完了
2. ✅ **ブラウザURLから接続ID取得** → コピー
3. ✅ **pac code add-data-source 実行** → サービスクラス自動生成
4. ✅ **自動生成されたファイル確認** → src/generated/ 配下を確認
5. ✅ **PowerDataRuntime 初期化確認** → `isInitialized` チェック
6. ✅ **カスタムフック作成** → ビジネスロジックをカプセル化
7. ✅ **Reactコンポーネントで使用** → UI実装

**重要原則:**
- ✅ **Power Apps SDK 経由のみ使用** - ユーザー認証が自動処理
- ❌ **他の接続方法は使用禁止** - Web API、Power Fx、直接REST APIは使用しない
- ✅ **必ず isInitialized を確認** - 初期化前のアクセスはエラー
- ✅ **IOperationResult で結果確認** - `isSuccess` プロパティで成功/失敗を判定
- ✅ **カスタムフックでカプセル化** - 再利用可能なロジック実装

**実行コマンドまとめ:**

```bash
# 1. 認証 (初回のみ)
pac auth create

# 2. Office 365 Users 追加
pac code add-data-source -a "shared_office365users" -c "{接続ID}"

# 3. Dataverse テーブル追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "{接続ID}" -t "systemusers"

# 4. アプリ実行 (Power Platform統合)
pac code run

# 5. ビルド
npm run build

# 6. デプロイ
pac code push
```

---

### **6.1 GitHub Copilot によるスキーマ情報取得**

**公式APIでメタデータを取得:**
```typescript
// getMetadata APIでスキーマ情報を取得
const result = await GeekProjectTaskService.getMetadata({
  schema: { columns: 'all' }
});

if (result.isSuccess && result.value) {
  console.log('=== テーブルスキーマ情報 ===');
  console.log('論理名:', result.value.LogicalName);
  console.log('プライマリキー:', result.value.PrimaryIdAttribute);
  
  result.value.Attributes?.forEach(attr => {
    console.log(`- ${attr.LogicalName} (${attr.AttributeType})`);
    
    // Choice フィールドの場合
    if (attr.AttributeType === 'Picklist' && attr.OptionSet) {
      console.log(`  Choice: ${attr.LogicalName}`);
      attr.OptionSet.Options?.forEach(opt => {
        console.log(`    ${opt.Value} : ${opt.Label}`);
      });
    }
  });
}
```

**出力例:**
```
=== テーブルスキーマ情報 ===
論理名: geek_project_task
プライマリキー: geek_project_taskid
- geek_project_taskid (Uniqueidentifier)
- geek_name (String)
- geek_priority (Picklist)
  Choice: geek_priority
    0 : Critical
    1 : High
    2 : Medium
    3 : Low
- geek_status (Picklist)
  Choice: geek_status
    0 : Completed
    1 : InProgress
    2 : NotStarted
```

### **6.2 TypeScript スキーマ定義の作成**

```typescript
// src/types/dataverse.ts

/**
 * geek_project_task テーブル
 * 
 * スキーマ名規則:
 * - テーブル論理名: geek_project_task (小文字、アンダースコア)
 * - 主キー: geek_project_taskid
 * - 属性プレフィックス: geek_
 */

// Choice値の定義
export enum TaskPriority {
  Critical = 0,
  High = 1,
  Medium = 2,
  Low = 3
}

export enum TaskStatus {
  Completed = 0,
  InProgress = 1,
  NotStarted = 2
}

// テーブル型定義
export interface ProjectTask {
  geek_project_taskid?: string;  // 主キー
  geek_name: string;              // 必須: タスク名
  geek_priority: TaskPriority;    // Choice
  geek_status: TaskStatus;        // Choice
  geek_description?: string;      // オプション
  geek_duedate?: Date;            // オプション
}

// 作成リクエスト型
export interface CreateProjectTaskRequest {
  geek_name: string;
  geek_priority: TaskPriority;
  geek_status: TaskStatus;
  geek_description?: string;
  geek_duedate?: string; // ISO 8601形式
}

// 更新リクエスト型
export interface UpdateProjectTaskRequest {
  geek_name?: string;
  geek_priority?: TaskPriority;
  geek_status?: TaskStatus;
  geek_description?: string;
  geek_duedate?: string;
}
```

### **6.3 カスタムテーブル用カスタムフック**

```typescript
// src/hooks/useProjectTasks.ts
import { useState, useEffect, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';
import { Geek_project_tasksService } from '../generated/services/Geek_project_tasksService';
import type { ProjectTask, CreateProjectTaskRequest, UpdateProjectTaskRequest } from '../types/dataverse';

export const useProjectTasks = () => {
  const { isInitialized } = usePowerPlatform();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 全タスク取得
  const getAllTasks = useCallback(async () => {
    if (!isInitialized) return;

    try {
      setLoading(true);
      const result = await Geek_project_tasksService.getAll({
        select: ['geek_project_taskid', 'geek_name', 'geek_priority', 'geek_status', 'geek_duedate'],
        orderBy: 'geek_duedate asc',
        top: 100
      });

      if (result.isSuccess && result.value) {
        setTasks(result.value);
      } else {
        throw new Error('タスクの取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isInitialized]);

  // タスク作成
  const createTask = useCallback(async (taskData: CreateProjectTaskRequest) => {
    if (!isInitialized) throw new Error('SDK not initialized');

    try {
      setLoading(true);
      const result = await Geek_project_tasksService.create(taskData);

      if (result.isSuccess && result.value) {
        await getAllTasks(); // 一覧を再取得
        return result.value;
      } else {
        throw new Error('タスクの作成に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized, getAllTasks]);

  // タスク更新
  const updateTask = useCallback(async (taskId: string, taskData: UpdateProjectTaskRequest) => {
    if (!isInitialized) throw new Error('SDK not initialized');

    try {
      setLoading(true);
      const result = await Geek_project_tasksService.update(taskId, taskData);

      if (result.isSuccess && result.value) {
        await getAllTasks(); // 一覧を再取得
        return result.value;
      } else {
        throw new Error('タスクの更新に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized, getAllTasks]);

  // タスク削除
  const deleteTask = useCallback(async (taskId: string) => {
    if (!isInitialized) throw new Error('SDK not initialized');

    try {
      setLoading(true);
      const result = await Geek_project_tasksService.delete(taskId);

      if (result.isSuccess) {
        await getAllTasks(); // 一覧を再取得
      } else {
        throw new Error('タスクの削除に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isInitialized, getAllTasks]);

  useEffect(() => {
    if (isInitialized) {
      getAllTasks();
    }
  }, [isInitialized, getAllTasks]);

  return { 
    tasks, 
    loading, 
    error, 
    getAllTasks,
    createTask, 
    updateTask, 
    deleteTask,
    isInitialized 
  };
};
```

---

## **📋 Step 7: トラブルシューティング**

### **7.1 よくあるエラーと対策**

| エラーメッセージ | 原因 | 対策 |
|----------------|------|------|
| `PowerDataRuntime is not initialized` | SDK未初期化 | `usePowerPlatform().isInitialized` を確認 |
| `Connection not found` | 接続IDが無効 | Power Apps ポータルで接続IDを再確認 |
| `Table not found` | テーブル論理名が間違い | `getMetadata` APIでテーブル論理名を確認、または Power Apps Maker Portalで確認 |
| `Unauthorized` | 権限不足 | ユーザーのセキュリティロールを確認 |
| `CORS error` | Web API直接呼び出し | Power Apps SDK経由に変更 |

### **7.2 デバッグのベストプラクティス**

```typescript
// IOperationResult を必ず確認
const result = await SystemUsersService.getAll();

if (result.isSuccess) {
  console.log('成功:', result.value);
} else {
  console.error('失敗:', result.error);
  // error.message, error.code などを確認
}
```

---

## **📋 まとめ: データソース接続フロー**

1. **Power Apps ポータルで接続作成** → 認証完了
2. **ブラウザURLから接続ID取得** → コピー
3. **pac code add-data-source 実行** → サービスクラス自動生成
4. **PowerDataRuntime 初期化確認** → `isInitialized` チェック
5. **カスタムフック作成** → ビジネスロジックをカプセル化
6. **Reactコンポーネントで使用** → UI実装

**重要:** すべてのデータアクセスは **Power Apps SDK 経由**で行い、他の接続方法は使用しないでください。

---

### **未実装機能開発・ユーザー提案**

**Dataverse コネクター:**
```bash
# 1. Power Apps で接続作成（手動）
# Power Apps Maker Portal (make.powerapps.com) で:
# a. 「データ」 > 「接続」 > 「+ 新しい接続」
# b. 「Microsoft Dataverse」を選択
# c. 認証完了と接続確認

# 2. 接続IDを取得
# a. 作成した接続をクリック
# b. ブラウザのURLから接続IDをコピー
# URL形式: /connections/shared_commondataserviceforapps/{接続ID}/details

# 3. ユーザーに接続IDを確認
# 開発時は以下を確認:
# - 接続ID (GUID形式): a1b2c3d4-e5f6-7890-1234-567890abcdef

# 4. サービスクラス生成
pac code add-data-source -a "shared_commondataserviceforapps" -c "{接続ID}" -t "systemusers"
pac code add-data-source -a "shared_commondataserviceforapps" -c "{接続ID}" -t "accounts"

# 5. GitHub Copilot でスキーマ確認（カスタムテーブルの場合）
# GitHub Copilot Chat で以下のように依頼:
# 「Dataverseテーブル {論理名} のスキーマ情報を教えてください」

# 6. カスタムフック作成
# src/hooks/useDataverse{TableName}.ts
# - {Prefix}_{TableName}Service を使用
# - CRUD 操作実装 (create, update, delete, get, getAll)
# - Choice フィールドの型マッピング
# - usePowerPlatform().isInitialized でSDK初期化チェック

# 7. コンポーネントから使用
# const { tasks, createTask, updateTask, deleteTask } = useDataverse{TableName}();

# スキーマ名のプレースホルダー:
# - サービスクラス: {Prefix}_{TableName}Service (例: Geek_project_tasksService)
# - dataSourceName: {prefix}_{table_name} (例: geek_project_tasks)
# - プライマリキー: {prefix}_{table_name}id (例: geek_project_taskid)

# 標準テーブル:
# - SystemUsers: systemusers (ユーザー一覧)
# - Accounts: accounts (取引先企業)
# - Contacts: contacts (取引先担当者)
```

**主要なポイント:**
- ✅ `pac code add-data-source` で自動生成されたサービスクラスを使用
- ✅ カスタムフックでビジネスロジックをカプセル化
- ✅ TypeScript 型定義で型安全性を確保
- ✅ IOperationResult の isSuccess でエラーチェック
- ❌ 直接 `useConnector('office365users')` は使用しない (非推奨)

#### 2. 未実装機能のユーザーへの開発提案
- 優先順位の提案
- 実装工数の見積もり
- 技術的制約の説明

### 🎯 AI提案例
- *"データソース接続が完了しました。どの未実装機能から開発しますか？"*
- *"機能拡張が完了しました。次の開発サイクルを開始しますか？"*

### 🔍 Phase 2 完了時のエラーチェック・修正手順

#### 1. ランタイムエラーチェック
```pwsh
# ローカル実行での動作確認
npm run dev

# ブラウザの開発者ツールでエラー確認
# - Console エラーをすべて解消
# - Network タブでリクエストエラー確認
# - PowerProvider 初期化ログ確認
```

#### 2. 機能動作テスト
```pwsh
# 基本機能のテスト手順
# 1. アプリケーションの読み込み確認
# 2. ナビゲーション動作確認  
# 3. UI コンポーネント表示確認
# 4. Power Platform SDK 初期化確認
```

#### 3. デプロイ前チェック
```pwsh
# 本番ビルドエラーチェック
npm run build

# dist フォルダの生成確認
# - index.html の存在確認
# - assets フォルダの確認
# - 相対パス設定の確認
```

#### 4. Power Apps デプロイテスト
```pwsh
# Power Apps環境への安全なデプロイ
pac code push

# デプロイ後の動作確認
# - Power Apps URL でのアクセス確認
# - ローカルと同じ動作確認
# - エラーログ確認
```

#### ✅ Phase 2 完了チェックリスト
- [ ] ローカル実行: 正常動作
- [ ] ブラウザConsole: エラーなし  
- [ ] 基本機能: すべて動作
- [ ] 本番ビルド: 成功
- [ ] Power Apps デプロイ: 成功
- [ ] 本番環境: 正常動作

**AI提案**: *"Phase 2のMVPが正常に動作しています。機能拡張・データ統合を開始しますか？"*

### ⚠️ トラブルシューティング
- "fetching your app"で停止する場合:
  1. `npm run build`の実行確認
  2. PowerProvider.tsxのエラー確認  
  3. 環境の必要コネクター有効化確認

---

### **AI 提案メッセージ テンプレート**

#### **Phase 1: 初期セットアップ**
```
✅ 環境構築が完了しました！
🎯 次のアクション: PowerProvider実装
📝 説明: Power Apps SDKとの接続を確立します
❓ PowerProvider実装を開始しますか？
```

### 🎨 **Code Apps ロゴ・アイコン統合**

#### **プロジェクトロゴ設計**

開発プロジェクト用に最適化されたCode Appsロゴを提供：

```
assets/
├── logo.svg          # メインロゴ (64x64)
├── favicon.svg       # ファビコン (32x32)
└── logo-variants/    # サイズ別バリエーション
```

**ロゴの構成要素:**
- 🔵 **Microsoft ブルー背景** (`#0078D4`) - Power Platform 一貫性
- ⚡ **ライトニングアイコン** - Power Apps の象徴
- `< >` **コード括弧** - 開発・Code Apps アイデンティティ
- ⚙️ **ギアアイコン** - アプリケーション機能
- **"CA"テキスト** - Code Apps 略称

#### **MVPフェーズでの利用**

**1. pac code init での自動設定**
```bash
# プロジェクト初期化時にロゴを指定
pac code init --displayName "My Code App" -l "./assets/logo.svg"

# power.config.json に自動登録
{
  "appInfo": {
    "displayName": "My Code App",
    "logoPath": "./assets/logo.svg"
  }
}
```

**2. Vite プロジェクトでの統合**
```typescript
// vite.config.ts
export default defineConfig({
  // ファビコン設定
  publicDir: 'public',
  // ...
});
```

```html
<!-- public/index.html -->
<head>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <title>My Code App</title>
</head>
```

**3. React コンポーネントでの利用**
```typescript
// src/components/AppHeader.tsx
import React from 'react';

export const AppHeader: React.FC = () => {
  return (
    <header className="flex items-center gap-3 p-4 bg-blue-600 text-white">
      <img 
        src="/assets/logo.svg" 
        alt="Code App Logo" 
        className="w-8 h-8"
      />
      <h1 className="text-xl font-semibold">My Code App</h1>
    </header>
  );
};
```

#### **ブランディング統合パターン**

**4. TailwindCSS テーマ連携**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'code-apps': {
          primary: '#0078D4',    // ロゴメインカラー
          secondary: '#005A9E',  // ロゴボーダー
          accent: '#FFD700',     // ライトニング
        }
      }
    }
  }
}
```

**5. Loading Spinner カスタマイズ**
```typescript
// src/components/LoadingSpinner.tsx
import React from 'react';

export const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="relative">
        <img 
          src="/assets/logo.svg" 
          alt="Loading..." 
          className="w-16 h-16 animate-pulse"
        />
        <div className="absolute inset-0 border-4 border-code-apps-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
      <p className="mt-4 text-code-apps-primary font-medium">Loading Code App...</p>
    </div>
  );
};
```

#### **Power Apps 公開時の最適化**

**6. マニフェスト最適化**
```json
// power.config.json (自動生成・参考)
{
  "appInfo": {
    "displayName": "My Code App",
    "description": "Modern Code App built with React + TailwindCSS",
    "logoPath": "./assets/logo.svg",
    "version": "1.0.0"
  },
  "branding": {
    "primaryColor": "#0078D4",
    "accentColor": "#FFD700"
  }
}
```

**7. 404・エラーページ統合**
```typescript
// src/pages/ErrorPage.tsx
import React from 'react';

export const ErrorPage: React.FC<{ error: string }> = ({ error }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <img 
        src="/assets/logo.svg" 
        alt="Code App" 
        className="w-24 h-24 mb-6 opacity-50"
      />
      <h1 className="text-2xl font-bold text-gray-800 mb-2">接続エラー</h1>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        {error}
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="px-6 py-2 bg-code-apps-primary text-white rounded-lg hover:bg-code-apps-secondary transition-colors"
      >
        再試行
      </button>
    </div>
  );
};
```

#### **開発フローでの自動統合**

MVPフェーズで既に利用可能にするための設定：

```bash
# 1. プロジェクト作成時
# Microsoft公式手順準拠
mkdir C:\CodeApps -Force
cd C:\CodeApps
npm create vite@latest AppFromScratch -- --template react-ts
cd C:\CodeApps\AppFromScratch
npm install
npm i --save-dev @types/node

# 2. アセットディレクトリ作成とロゴ配置
mkdir -p public/assets
# ロゴファイルをコピー

# 3. Code Apps 初期化（ロゴ付き）
pac code init --displayName "My Code App" -l "./public/assets/logo.svg"

# 4. 開発開始
npm run dev
```

これにより、MVPフェーズの開始時点で既にプロフェッショナルなロゴとブランディングが統合された状態でCode Appsの開発を開始できます。

#### **Phase 2: MVP開発**
```
✅ PowerProvider実装が完了しました！
🎯 次のアクション: 基本UI構築
📝 説明: shadcn/ui + TailwindCSSでモダンなUIを作成します
❓ 基本レイアウトとコンポーネントを作成しますか？
```

#### **Phase 3: 動作検証**
```
✅ 基本UI構築が完了しました！
🎯 次のアクション: ローカル実行テスト
📝 説明: 開発環境でアプリケーションをテストします
❓ ローカル環境でアプリを実行しますか？
```

#### **Phase 4: デプロイメント**
```
✅ ローカルテストが成功しました！
🎯 次のアクション: Power Apps環境へデプロイ
📝 説明: 本番環境でCode Appsとして公開します
❓ Power Apps環境にデプロイしますか？
```

#### **Phase 5: 機能拡張選択**
```
🎉 MVP完了おめでとうございます！
🎯 次の機能拡張を選択してください:

1️⃣ Office 365 Users統合 (難易度: 易、時間: 30分)
   → ユーザー情報、プロファイル表示、組織階層

2️⃣ Dataverse統合 (難易度: 中、時間: 1-2時間)  
   → データ永続化、CRUD操作、リレーション

3️⃣ Azure SQL統合 (難易度: 高、時間: 2-4時間)
   → 既存システム統合、高性能クエリ

❓ どの機能を実装しますか？
```

#### **Phase 6: 継続開発**
```
✅ [選択した機能]の統合が完了しました！
🎯 推奨される次のステップ:

• 🔧 追加機能開発 (他のコネクター統合)
• 🧪 テスト自動化 (品質向上)  
• 🚀 CI/CDパイプライン (自動デプロイ)
• 📊 監視・ログ実装 (運用最適化)

❓ 次はどの領域を強化しますか？
```

### **スキルレベル別推奨パス**

#### **初心者向け (Beginner Path)**
```
1. 環境構築 → PowerProvider → 基本UI → ローカルテスト → デプロイ
2. Office 365 Users統合 (最も簡単)
3. 基本的なテスト追加
4. 段階的な機能拡張
```

#### **中級者向け (Intermediate Path)**  
```
1. 標準MVP開発
2. Dataverse統合 + CRUD操作
3. TanStack Query実装
4. 自動テスト + CI/CD
```

#### **上級者向け (Advanced Path)**
```
1. 高速MVP開発
2. 複数データソース統合 (Dataverse + Azure SQL)
3. 高度なアーキテクチャパターン
4. 本格的な運用監視実装
```

### **進捗追跡インターフェース**

開発状態を追跡し、適切な提案を行うための構造：

```typescript
interface ProjectProgress {
  // 現在の開発段階
  currentPhase: 'setup' | 'mvp' | 'integration' | 'optimization' | 'production';
  
  // 完了した項目
  completedSteps: {
    environmentSetup: boolean;
    powerProviderImpl: boolean;
    basicUI: boolean;
    localTesting: boolean;
    powerAppsDeployment: boolean;
    dataIntegration: DataIntegrationType[];
    testAutomation: boolean;
    cicdSetup: boolean;
  };
  
  // 開発者スキルレベル
  developerLevel: 'beginner' | 'intermediate' | 'advanced';
  
  // 利用可能時間
  availableTime: 'quick' | 'standard' | 'extended';
  
  // 推奨する次のアクション
  recommendedActions: NextActionSuggestion[];
}

interface NextActionSuggestion {
  id: string;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedTime: string;
  prerequisites: string[];
  benefits: string[];
  implementationGuide: string;
}
```

これにより、AIは開発者の現在の状況を正確に把握し、最適な次のステップを提案できます。

#### 🎯 実際の統合方式 (Microsoft 公式)
1. **Power Platform SDK 初期化** (`@microsoft/power-apps/app` の `initialize()`)
2. **静的データ開発** (UI/UX 先行開発)
3. **コネクタ統合** (`connector()` 関数でデータ接続)
4. **ローカル開発** (`pac code run` でテスト)
5. **Power Apps デプロイ** (`pac code push` で公開)

#### 📋 実装要件

**1. Power Platform SDK 初期化**
- `@microsoft/power-apps` パッケージ使用
- `initialize()` 関数でプラットフォーム初期化のみ
- **認証は Power Platform が自動処理** (カスタム認証コード不要)

**2. 静的データによる開発**
- まず `src/data/` に静的データを配置
- UI/UX コンポーネントを実装
- 実データ統合前にユーザビリティ検証

**3. データ接続 (段階的移行)**
- 第1段階: 静的データ (`const assets`)
- 第2段階: `connector()` 関数で Power Platform コネクタ統合
- Office 365、SQL Database、SharePoint 等の標準コネクタ利用

**4. 認証・セキュリティ**
- **カスタム認証実装は不要**
- Power Platform 環境が全認証を処理
- アプリは認証済みユーザーとして動作
- データアクセス権限は Power Platform コネクタが制御

**5. 開発・デプロイ**
- ローカル: `npm run dev` (Vite + pac code run の同時起動)
- 本番: `pac code push` で Power Apps 環境にデプロイ
- **Azure Functions や App Service は不要**

### MVP 実装ガイド

#### Step 1: プロジェクト初期化

**実装項目チェックリスト:**
- [ ] React + TypeScript プロジェクト作成
- [ ] `@microsoft/power-apps` SDK インストール
- [ ] PowerProvider コンポーネント実装
- [ ] 基本的な React アプリ構造作成
- [ ] ローカル開発環境設定

**PowerProvider 実装例 (Microsoft 公式パターン):**
```typescript
// src/PowerProvider.tsx
import { initialize } from "@microsoft/power-apps/app";
import { useEffect, type ReactNode } from "react";

interface PowerProviderProps {
    children: ReactNode;
}

export default function PowerProvider({ children }: PowerProviderProps) {
    useEffect(() => {
        const initApp = async () => {
            try {
                await initialize();
                console.log('Power Platform SDK initialized successfully');
            } catch (error) {
                console.error('Failed to initialize Power Platform SDK:', error);
            }
        };
        
        initApp();
    }, []);

    return <>{children}</>;
}
```

**重要**: これは Microsoft の公式サンプルで使われている標準パターンです。カスタム認証や追加のエラーハンドリングは不要です。

**メインアプリ初期化 (Microsoft 公式パターン):**
```typescript
// src/main.tsx
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { StrictMode } from 'react';
import PowerProvider from './PowerProvider.tsx';

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PowerProvider>
      <App />
    </PowerProvider>
  </StrictMode>
);
```

**App.tsx の実装例:**
```typescript
// src/App.tsx  
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./pages/Index";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <Index />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
```

**重要**: 
- PowerProvider は最外側で SDK を初期化
- App.tsx で UI ライブラリとクエリクライアント設定
- pages/Index.tsx でメイン機能実装

## 📊 データソース接続 (段階的開発アプローチ)

> **参考**: Microsoft [FluentSample](https://github.com/microsoft/PowerAppsCodeApps/blob/main/samples/FluentSample/README.md) 公式パターン

### 🚀 **3段階開発フロー**

```mermaid
graph LR
    A[1. Mockデータ開発] --> B[2. Power Platform接続作成]
    B --> C[3. リアルデータ統合]
    C --> D[Power Apps デプロイ]
    
    subgraph "ローカル開発"
        A
    end
    
    subgraph "Power Platform"
        B
        D
    end
    
    subgraph "統合テスト"
        C
    end
```

### 🏗️ **Phase 1: Mockデータで開発開始**

#### **1.1 Mockデータ構造設計**

**Office 365 Users Mock データ例 (Microsoft公式スキーマ準拠):**
```typescript
// src/mockData/office365Data.ts
// Microsoft FluentSample準拠のOffice 365 Userスキーマ
export interface User {
  Id: string;
  AccountEnabled: boolean;
  BusinessPhones: string[];
  City: string;
  CompanyName: string;
  Country: string;
  Department: string;
  DisplayName: string;
  GivenName: string;
  JobTitle: string;
  Mail: string;
  MailNickname: string;
  mobilePhone?: string;
  OfficeLocation: string;
  PostalCode: string;
  Surname: string;
  TelephoneNumber: string;
  UserPrincipalName: string;
}

export const mockUsers: User[] = [
  {
    Id: "550e8400-e29b-41d4-a716-446655440001",
    AccountEnabled: true,
    BusinessPhones: ["+81-3-1234-5678"],
    City: "東京",
    CompanyName: "コントソ株式会社",
    Country: "日本",
    Department: "エンジニアリング",
    DisplayName: "田中 太郎",
    GivenName: "太郎",
    JobTitle: "シニアソフトウェアエンジニア",
    Mail: "tanaka.taro@contoso.co.jp",
    MailNickname: "tarot",
    mobilePhone: "+81-90-1234-5678",
    OfficeLocation: "東京オフィス 3階",
    PostalCode: "100-0001",
    Surname: "田中",
    TelephoneNumber: "+81-3-1234-5678",
    UserPrincipalName: "tanaka.taro@contoso.co.jp"
  },
  {
    Id: "550e8400-e29b-41d4-a716-446655440002",
    AccountEnabled: true,
    BusinessPhones: ["+81-6-9876-5432"],
    City: "大阪",
    CompanyName: "コントソ株式会社",
    Country: "日本",
    Department: "プロダクト管理",
    DisplayName: "佐藤 花子",
    GivenName: "花子",
    JobTitle: "シニアプロダクトマネージャー",
    Mail: "sato.hanako@contoso.co.jp",
    MailNickname: "hanakos",
    mobilePhone: "+81-90-9876-5432",
    OfficeLocation: "大阪オフィス 5階",
    PostalCode: "530-0001",
    Surname: "佐藤",
    TelephoneNumber: "+81-6-9876-5432",
    UserPrincipalName: "sato.hanako@contoso.co.jp"
  },
  {
    Id: "550e8400-e29b-41d4-a716-446655440003",
    AccountEnabled: true,
    BusinessPhones: ["+81-52-1111-2222"],
    City: "名古屋",
    CompanyName: "コントソ株式会社",
    Country: "日本",
    Department: "デザイン",
    DisplayName: "山田 次郎",
    GivenName: "次郎",
    JobTitle: "プリンシパルUXデザイナー",
    Mail: "yamada.jiro@contoso.co.jp",
    MailNickname: "jiroy",
    mobilePhone: "+81-90-1111-2222",
    OfficeLocation: "名古屋オフィス 2階",
    PostalCode: "460-0001",
    Surname: "山田",
    TelephoneNumber: "+81-52-1111-2222",
    UserPrincipalName: "yamada.jiro@contoso.co.jp"
  },
  {
    Id: "550e8400-e29b-41d4-a716-446655440004",
    AccountEnabled: true,
    BusinessPhones: ["+81-45-3333-4444"],
    City: "横浜",
    CompanyName: "コントソ株式会社",
    Country: "日本",
    Department: "マーケティング",
    DisplayName: "鈴木 美咲",
    GivenName: "美咲",
    JobTitle: "マーケティングディレクター",
    Mail: "suzuki.misaki@contoso.co.jp",
    MailNickname: "misakis",
    mobilePhone: "+81-90-3333-4444",
    OfficeLocation: "横浜オフィス 4階",
    PostalCode: "220-0001",
    Surname: "鈴木",
    TelephoneNumber: "+81-45-3333-4444",
    UserPrincipalName: "suzuki.misaki@contoso.co.jp"
  },
  {
    Id: "550e8400-e29b-41d4-a716-446655440005",
    AccountEnabled: false, // 無効アカウント例
    BusinessPhones: ["+81-75-5555-6666"],
    City: "京都",
    CompanyName: "コントソ株式会社",
    Country: "日本",
    Department: "人事",
    DisplayName: "高橋 健太",
    GivenName: "健太",
    JobTitle: "HRビジネスパートナー",
    Mail: "takahashi.kenta@contoso.co.jp",
    MailNickname: "kentat",
    mobilePhone: "+81-90-5555-6666",
    OfficeLocation: "京都オフィス 1階",
    PostalCode: "600-0001",
    Surname: "高橋",
    TelephoneNumber: "+81-75-5555-6666",
    UserPrincipalName: "takahashi.kenta@contoso.co.jp"
  }
];

// Microsoft公式準拠のヘルパー関数
export const getUserById = (id: string): User | undefined => {
  return mockUsers.find(user => user.Id === id);
};

export const searchUsers = (query: string, top: number = 50): User[] => {
  if (!query.trim()) {
    return [];
  }
  
  const lowercaseQuery = query.toLowerCase();
  const filtered = mockUsers.filter(user => 
    user.DisplayName?.toLowerCase().includes(lowercaseQuery) ||
    user.Mail?.toLowerCase().includes(lowercaseQuery) ||
    user.Department?.toLowerCase().includes(lowercaseQuery) ||
    user.JobTitle?.toLowerCase().includes(lowercaseQuery) ||
    user.GivenName?.toLowerCase().includes(lowercaseQuery) ||
    user.Surname?.toLowerCase().includes(lowercaseQuery)
  );
  
  return filtered.slice(0, top);
};

export const getUsersByDepartment = (department: string): User[] => {
  return mockUsers.filter(user => user.Department === department);
};

// 現在のユーザー (MyProfile機能用)
export const mockCurrentUser: User = mockUsers[0];

// カレンダーイベントとメール用の追加インターフェース
export interface CalendarEvent {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    type: string;
  }>;
}

export const mockCalendarEvents: CalendarEvent[] = [
  {
    id: "event-001",
    subject: "週次プロジェクト会議",
    start: { dateTime: "2025-10-16T10:00:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2025-10-16T11:00:00", timeZone: "Asia/Tokyo" },
    organizer: { 
      emailAddress: { 
        name: "田中 太郎", 
        address: "tanaka.taro@contoso.co.jp" 
      }
    },
    attendees: [
      {
        emailAddress: { name: "佐藤 花子", address: "sato.hanako@contoso.co.jp" },
        type: "required"
      },
      {
        emailAddress: { name: "山田 次郎", address: "yamada.jiro@contoso.co.jp" },
        type: "optional"
      }
    ]
  },
  {
    id: "event-002",
    subject: "デザインレビュー",
    start: { dateTime: "2025-10-17T14:00:00", timeZone: "Asia/Tokyo" },
    end: { dateTime: "2025-10-17T15:30:00", timeZone: "Asia/Tokyo" },
    organizer: { 
      emailAddress: { 
        name: "山田 次郎", 
        address: "yamada.jiro@contoso.co.jp" 
      }
    }
  }
];

export interface Email {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  bodyPreview: string;
  isRead: boolean;
  importance: 'low' | 'normal' | 'high';
}

export const mockEmails: Email[] = [
  {
    id: "email-001",
    subject: "プロジェクト進捗レポート",
    from: {
      emailAddress: {
        name: "佐藤 花子",
        address: "sato.hanako@contoso.co.jp"
      }
    },
    receivedDateTime: "2025-10-16T08:30:00Z",
    bodyPreview: "今週のプロジェクト進捗をお知らせします。主要なマイルストーンは予定通り...",
    isRead: false,
    importance: 'high'
  },
  {
    id: "email-002", 
    subject: "来週の会議室予約について",
    from: {
      emailAddress: {
        name: "鈴木 美咲",
        address: "suzuki.misaki@contoso.co.jp"
      }
    },
    receivedDateTime: "2025-10-16T09:15:00Z",
    bodyPreview: "来週の会議室予約状況をご確認ください...",
    isRead: true,
    importance: 'normal'
  }
];
```

**SQL Database Mock データ例:**
```typescript
// src/mockData/sqlData.ts
export interface Project {
  Id: number;
  Name: string;
  Description?: string;
  Status: 'Planning' | 'Active' | 'On Hold' | 'Completed' | 'Cancelled';
  Priority: 'Low' | 'Medium' | 'High' | 'Critical';
  CreatedDate: string;
  DueDate?: string;
  AssignedTo?: number;
  Budget?: number;
}

export const mockProjects: Project[] = [
  {
    Id: 1,
    Name: "Webサイトリニューアル",
    Description: "企業サイトのモダン化とUI/UX改善",
    Status: "Active",
    Priority: "High", 
    CreatedDate: "2025-10-01T09:00:00Z",
    DueDate: "2025-12-31T17:00:00Z",
    Budget: 5000000
  },
  {
    Id: 2,
    Name: "データベース移行",
    Description: "レガシーシステムのクラウド移行",
    Status: "Planning",
    Priority: "Critical",
    CreatedDate: "2025-10-15T14:30:00Z",
    Budget: 8000000
  }
];

export interface Task {
  Id: number;
  ProjectId: number;
  Title: string;
  Description?: string;
  Priority: 'Low' | 'Medium' | 'High';
  Status: 'Todo' | 'InProgress' | 'Review' | 'Done';
  AssignedTo?: number;
  CreatedDate: string;
}

export const mockTasks: Task[] = [
  {
    Id: 1,
    ProjectId: 1,
    Title: "要件定義書作成",
    Description: "新しいWebサイトの要件を詳細に定義",
    Priority: "High",
    Status: "InProgress", 
    AssignedTo: 1,
    CreatedDate: "2025-10-02T10:00:00Z"
  }
];
```

#### **1.2 Mockデータを使用したコンポーネント実装**

```typescript
// src/pages/Office365Page.tsx (Mock版)
import React, { useState, useEffect } from 'react';
import { mockUsers, mockCalendarEvents, UserProfile } from '../mockData/office365Data';

export const Office365Page: React.FC = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mockデータロード（実際のAPI呼び出しをシミュレート）
    const loadMockData = async () => {
      setLoading(true);
      await new Promise(resolve => setTimeout(resolve, 500)); // 遅延シミュレート
      setUsers(mockUsers);
      setLoading(false);
    };

    loadMockData();
  }, []);

  if (loading) return <div>Loading users...</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Office 365 Users (Mock Data)</h1>
      <div className="grid gap-4">
        {users.map(user => (
          <div key={user.id} className="border rounded-lg p-4 bg-white shadow">
            <h3 className="font-semibold">{user.displayName}</h3>
            <p className="text-gray-600">{user.jobTitle}</p>
            <p className="text-sm text-gray-500">{user.mail}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### **1.3 ローカルビルド・実行テスト**

```bash
# 依存関係インストール
npm install

# ビルド実行
npm run build

# ローカル開発サーバー起動
npm run dev

# ✅ Mockデータでの動作確認
# - UI表示確認
# - データ構造検証  
# - エラーハンドリング確認
```

### 📋 **サポートされているコネクター (Microsoft 公式)**

- ✅ **Office 365 Users** - ユーザープロファイル・組織情報
- ✅ **Office 365 Outlook** - メール・カレンダー・連絡先
- ✅ **SQL Server / Azure SQL** - リレーショナルデータベース
- ✅ **SharePoint** - ドキュメント・リスト管理  
- ✅ **Dataverse** - Power Platform ネイティブデータ
- ✅ **Microsoft Teams** - チーム・チャンネル情報
- ✅ **OneDrive for Business** - ファイルストレージ

### � **Phase 2: Power Platform 接続作成**

> **前提**: Mockデータでの動作確認が完了していること

#### **2.1 Power Apps 接続ページでの設定**

**接続作成手順:**
```bash
# 1. Power Apps Maker Portal にアクセス
https://make.powerapps.com/

# 2. 左ナビゲーション「データ」→「接続」
# 3. 「+ 新しい接続」をクリック
```

#### **2.2 Office 365 Users 接続作成**

```bash
# Power Apps UI での操作:
1. 「Office 365 Users」を検索・選択
2. 「作成」ボタンをクリック  
3. Microsoft アカウントでサインイン
4. アクセス許可を承認
5. 接続の作成完了を確認

# ✅ 成功時の確認事項:
# - 接続一覧に「Office 365 Users」が表示される
# - 状態が「接続済み」になっている
```

#### **2.3 SQL Server 接続作成 (オプション)**

**前提条件:**
- Azure SQL Database または SQL Server インスタンス
- データベースへのアクセス権限
- ネットワーク接続性 (ファイアウォール設定)

```bash
# Power Apps UI での操作:
1. 「SQL Server」を検索・選択
2. 認証方法を選択:
   ✅ Azure AD統合認証 (推奨)
   ⚠️ SQL Server認証
   ⚠️ Windows認証

3. 接続情報を入力:
   サーバー名: your-server.database.windows.net
   データベース名: YourAppDatabase
   
4. 「作成」をクリックして接続テスト
5. 成功時は接続一覧に表示される
```

**必要なSQL スキーマ例:**
```sql
-- Projects テーブル (必須)
CREATE TABLE [dbo].[Projects](
    [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [Name] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [Status] [nvarchar](50) NOT NULL DEFAULT ('Planning'),
    [Priority] [nvarchar](20) NOT NULL DEFAULT ('Medium'),
    [CreatedDate] [datetime2](7) NOT NULL DEFAULT (getutcdate()),
    [DueDate] [datetime2](7) NULL,
    [Budget] [decimal](18, 2) NULL,
    [AssignedTo] [int] NULL,
    
    -- 制約
    CONSTRAINT [CK_Projects_Status] CHECK ([Status] IN ('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled')),
    CONSTRAINT [CK_Projects_Priority] CHECK ([Priority] IN ('Low', 'Medium', 'High', 'Critical'))
);

-- Tasks テーブル (オプション)
CREATE TABLE [dbo].[Tasks](
    [Id] [int] IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [ProjectId] [int] NOT NULL,
    [Title] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [Priority] [nvarchar](20) NOT NULL DEFAULT ('Medium'),
    [Status] [nvarchar](50) NOT NULL DEFAULT ('Todo'),
    [AssignedTo] [int] NULL,
    [CreatedDate] [datetime2](7) NOT NULL DEFAULT (getutcdate()),
    
    FOREIGN KEY ([ProjectId]) REFERENCES [dbo].[Projects]([Id]),
    CONSTRAINT [CK_Tasks_Priority] CHECK ([Priority] IN ('Low', 'Medium', 'High')),
    CONSTRAINT [CK_Tasks_Status] CHECK ([Status] IN ('Todo', 'InProgress', 'Review', 'Done'))
);

-- サンプルデータ挿入
INSERT INTO [dbo].[Projects] ([Name], [Description], [Status], [Priority], [Budget]) VALUES
('Webサイトリニューアル', '企業サイトのモダン化', 'Active', 'High', 5000000),
('データベース移行', 'クラウド移行プロジェクト', 'Planning', 'Critical', 8000000);
```

#### **2.4 Dataverse 接続作成 (推奨)**

```bash
# Power Apps UI での操作:
1. 「Microsoft Dataverse」を検索・選択
2. 「作成」をクリック (認証は自動)
3. 環境のDataverseインスタンスに自動接続

# ✅ 自動で利用可能: 
# - 標準テーブル (Account, Contact, User等)
# - カスタムテーブル作成可能
# - Power Platform ネイティブ統合
```

**推奨 Dataverse テーブル構造:**
```bash
# Power Apps UI でカスタムテーブル作成:
1. 「テーブル」→「+ 新しいテーブル」
2. テーブル名: "Projects" 
3. 列の追加:
   - Name (単一行テキスト, 必須)
   - Description (複数行テキスト)  
   - Status (選択肢: Planning/Active/OnHold/Completed)
   - Priority (選択肢: Low/Medium/High/Critical)
   - DueDate (日付のみ)
   - Budget (通貨)

4. 「保存」してテーブル作成完了
```

## 🔧 **Dataverse接続設定手順とトラブルシューティング**

### **データソース追加の正しい手順**

#### **Step 1: データソース追加**
```powershell
# Dataverseテーブルを追加
pac code add-data-source -a dataverse -t your_table_name

# 例: プロジェクトテーブルを追加
pac code add-data-source -a dataverse -t geek_projecrt
```

#### **Step 2: 生成ファイルの確認と修正**

⚠️ **重要な問題**: `pac code add-data-source`で生成されたサービスファイルの`dataSourceName`が`______`（アンダースコア）になり、実際のデータソース名にマッピングされない問題があります。

**問題のあるコード (自動生成):**
```typescript
// src/generated/services/Geek_projecrtsService.ts
export class Geek_projecrtsService {
  private static readonly dataSourceName = '______';  // ← 問題
  // ...
}
```

**正しい修正 (手動):**
```typescript
// src/generated/services/Geek_projecrtsService.ts  
export class Geek_projecrtsService {
  private static readonly dataSourceName = 'geek_projecrts';  // ← 修正
  // ...
}
```

#### **Step 3: dataSourcesInfoとの整合性確認**

生成されたデータソース名は`dataSourcesInfo`オブジェクトのキー名と一致する必要があります：

```typescript
// .power/appschemas/dataSourcesInfo.ts
export const dataSourcesInfo = {
  "geek_projecrts": {              // ← サービスファイルで使用する名前
    "tableId": "",
    "version": "",
    "primaryKey": "geek_projecrtid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "office365users": { ... }
}
```

### **トラブルシューティングガイド**

#### **エラー 1: Data source not found**
```
❌ エラー: Dataverse API call failed: Error: Retrieve multiple records operation failed: 
Data source not found: ______
```

**原因**: サービスファイルの`dataSourceName`が正しくない

**解決方法**:
1. 生成されたサービスファイルを確認
2. `dataSourceName`を`dataSourcesInfo`のキー名に修正
3. ビルドと再デプロイ

#### **エラー 2: SDK初期化前のコネクター使用**
```
❌ エラー: Cannot read properties of undefined (reading 'getRecords')
```

**原因**: Power Apps SDK初期化前にDataverseコネクターを使用

**解決方法**: SDK初期化確認パターンを使用
```typescript
import { usePowerPlatform } from '@microsoft/power-apps';

export function DataverseComponent() {
  const { isInitialized } = usePowerPlatform();
  
  useEffect(() => {
    if (isInitialized) {
      loadDataverseData();  // ✅ 初期化後に実行
    }
  }, [isInitialized]);
  
  if (!isInitialized) {
    return <div>Power Platform初期化中...</div>;
  }
  
  return <YourComponent />;
}
```

#### **エラー 3: 認証エラー**
```
❌ エラー: Unauthorized access to Dataverse
```

**解決方法**:
1. Power Platform環境の権限確認
2. Dataverse接続の再認証
3. 環境変数の確認

### **動作確認方法**

#### **成功パターン**
```
✅ ブラウザコンソール出力:
📡 Calling Geek_projecrtsService.getAll()...
📦 Dataverse getAll result: { success: true, dataLength: 5 }
```

#### **デバッグ手順**
```typescript
// デバッグ用コンソール出力
console.log('📡 Calling Geek_projecrtsService.getAll()...');
const result = await Geek_projecrtsService.getAll();
console.log('📦 Dataverse getAll result:', { 
  success: result !== null, 
  dataLength: result?.length || 0 
});
```

### **再生成時の注意事項**

⚠️ **重要**: `pac code add-data-source`を再実行すると、手動修正が**上書き**されます。

**対処法**:
1. 再生成後に必ずサービスファイルを確認
2. `dataSourceName`を正しい値に再修正
3. チーム開発時は修正手順をドキュメント化

**修正チェックリスト**:
- [ ] `Geek_projecrtsService.ts`の`dataSourceName`修正
- [ ] `dataSourcesInfo.ts`との整合性確認  
- [ ] ビルドエラーなし
- [ ] ブラウザコンソールでの動作確認

### 🔍 **接続確認とメタデータ取得**

#### **PAC CLI による接続一覧確認:**
```bash
# 認証確認
pac auth list

# 環境選択  
pac env select --environment [Environment-URL]

# 接続一覧表示
pac connection list

# 出力例:
# ┌─────────────────────────────────┬───────────────────────┬──────────────────────────────────┐
# │ Display Name                    │ API Name              │ Connection Id                    │  
# ├─────────────────────────────────┼───────────────────────┼──────────────────────────────────┤
# │ Office 365 Users               │ shared_office365users │ 12345678-abcd-efgh-ijkl-mnopqrst │
# │ Microsoft Dataverse            │ shared_commondataserv │ 87654321-zyxw-vuts-rqpo-nmlkjihg │
# │ SQL Server                     │ shared_sql            │ abcdef12-3456-7890-abcd-ef1234567890 │
# └─────────────────────────────────┴───────────────────────┴──────────────────────────────────┘
```

#### **2.2 Power Apps UIによる接続ID取得（必須手順）**

> **⚠️ 重要**: `pac code add-data-source` コマンドを実行するには、**接続ID（Connection ID）** が必要です。以下の手順で取得してください。

**手順 1: Power Apps ポータルで接続を手動作成**

```bash
# Power Apps Maker Portal (make.powerapps.com) にアクセス
# 1. 左メニュー > 「データ」 > 「接続」をクリック
# 2. 「+ 新しい接続」をクリック
# 3. 接続したいコネクターを選択:
#    - Dataverse (Microsoft Dataverse)
#    - Office 365 Users
#    - SQL Server
#    など
# 4. 認証情報を入力して接続を作成
# 5. 「接続の作成が完了しました」を確認
```

**手順 2: 接続IDをURLから取得**

```bash
# Power Apps ポータルでの操作:
# 1. 「データ」 > 「接続」 一覧で目的の接続をクリック
# 2. ブラウザのアドレスバーのURLを確認
# 3. URLから接続IDをコピー

# URL形式:
https://make.powerapps.com/environments/{環境ID}/connections/{API名}/{接続ID}/details

# 例 (Dataverseの場合):
https://make.powerapps.com/environments/12345678-abcd-1234-efgh-123456789abc/connections/shared_commondataserviceforapps/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6/details

# この場合の接続ID:
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**手順 3: API名と接続IDを記録**

```bash
# 取得する情報:
# - API名: shared_commondataserviceforapps (Dataverseの場合)
# - 接続ID: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6 (例)

# コネクター別のAPI名:
# - Dataverse: shared_commondataserviceforapps
# - Office 365 Users: shared_office365users
# - SQL Server: shared_sql
# - SharePoint: shared_sharepointonline
# - Outlook: shared_office365outlook
```

**手順 4: ユーザーに接続情報を確認**

開発時には、以下をユーザーに確認してください:

```markdown
## 接続情報の確認

以下の情報を提供してください:

### Dataverse 接続
1. Power Apps ポータル (make.powerapps.com) にアクセス
2. 「データ」 > 「接続」 > 「Microsoft Dataverse」を選択
3. ブラウザのURLから接続IDをコピー
4. 接続ID: [ここに貼り付け]

### 接続ID取得のスクリーンショット
[ブラウザのURLバーのスクリーンショットを添付]
```

**手順 5: pac code add-data-source コマンド実行**

```bash
# 取得した接続IDを使用してデータソースを追加

# Dataverse の場合:
pac code add-data-source -a "shared_commondataserviceforapps" -c "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

# Office 365 Users の場合:
pac code add-data-source -a "shared_office365users" -c "接続ID"

# SQL Server の場合:
pac code add-data-source -a "shared_sql" -c "接続ID"
```

**手順 6: Dataverse テーブルを追加**

Dataverse の場合、テーブルを指定して追加することも可能です:

```bash
# SystemUsers テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "systemusers"

# カスタムテーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "geek_project_task"

# Accounts (取引先企業) テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "accounts"

# Contacts (取引先担当者) テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "contacts"
```

**生成されるファイル:**

```bash
# コマンド実行後、以下のファイルが自動生成されます:

# SystemUsers テーブルの場合:
src/generated/services/SystemusersService.ts
src/generated/models/SystemusersModel.ts

# カスタムテーブルの場合:
src/generated/services/Geek_project_tasksService.ts
src/generated/models/Geek_project_tasksModel.ts
```

**⚠️ よくあるエラーと対処法:**

```bash
# エラー 1: 接続IDが見つからない
Error: Connection with id 'xxx' not found

対処法:
1. Power Apps ポータルで接続が正しく作成されているか確認
2. URLから接続IDを正確にコピー
3. 環境が正しく選択されているか確認 (pac env select)

# エラー 2: 認証エラー
Error: Unauthorized

対処法:
1. pac auth list で認証状態を確認
2. pac auth create で再認証
3. Power Apps ポータルでログイン状態を確認

# エラー 3: テーブルが見つからない
Error: Table 'tablename' not found

対処法:
1. テーブルの論理名を確認（小文字、アンダースコア）
2. Power Apps Maker Portalでテーブル論理名を確認、またはgetMetadata APIで取得
3. Dataverse でテーブルが公開されているか確認
```

**チェックリスト:**

- [ ] Power Apps ポータルで接続を手動作成
- [ ] ブラウザのURLから接続IDを取得
- [ ] API名を確認（shared_commondataserviceforapps 等）
- [ ] `pac auth list` で認証状態を確認
- [ ] `pac env select` で環境を選択
- [ ] `pac code add-data-source` コマンドを実行
- [ ] 生成されたサービスファイルを確認
- [ ] `npm run build` でビルド成功を確認

### ⚡ **Phase 3: Mockデータからリアルデータへの移行**

> **📖 詳細なデータソース接続手順は Phase 5 を参照してください**

#### **3.1 Power Apps SDK による統一接続パターン**

> **⚠️ 重要原則**: Power Apps Code Apps では、**必ず Power Apps SDK経由で自動生成されたサービスクラス**を使用してデータソースに接続します。これにより、Power Apps のユーザー認証とセキュリティが保証されます。

**✅ 唯一の正しいアプローチ（Power Apps SDK使用）:**

```typescript
// ❌ 他の接続方法は使用しない:
// - Dataverse Web API (fetch) - CORS制限、認証問題
// - Xrm.WebApi - Model-driven Apps専用
// - Power Fx評価 - Canvas Apps環境専用
// - 直接REST API - 認証とセキュリティの問題

// ✅ Power Apps SDK経由のサービスクラスのみ使用:
import { SystemUsersService } from '../generated/services/SystemUsersService';
import { Office365UsersService } from '../generated/services/Office365UsersService';

// Power Apps SDK がユーザー認証を自動処理
const result = await SystemUsersService.getAll({
  select: ['systemuserid', 'fullname', 'internalemailaddress'],
  filter: 'isdisabled eq false',
  top: 50
});
```

#### **3.2 基本的なデータソース追加フロー**

**Step 1: 接続作成とサービスクラス生成**
```bash
# 1. Power Apps ポータルで接続を手動作成
# 2. ブラウザのURLから接続IDを取得
# 3. pac code コマンドでサービスクラスを自動生成

# Dataverse (SystemUsers テーブル)
pac code add-data-source -a "shared_commondataserviceforapps" -c "{接続ID}" -t "systemusers"

# Office 365 Users
pac code add-data-source -a "shared_office365users" -c "{接続ID}"
```

**Step 2: SDK初期化確認と使用**
```typescript
import { usePowerPlatform } from '@microsoft/power-apps';
import { SystemUsersService } from '../generated/services/SystemUsersService';

export function DataversePage() {
  const { isInitialized } = usePowerPlatform();

  useEffect(() => {
    if (!isInitialized) return; // SDK初期化待機
    
    // ✅ SDK初期化後にサービスクラス使用
    const loadData = async () => {
      const result = await SystemUsersService.getAll();
      if (result.isSuccess && result.value) {
        setUsers(result.value);
      }
    };
    loadData();
  }, [isInitialized]);

  if (!isInitialized) {
    return <div>Power Apps SDK 初期化中...</div>;
  }
  
  return <div>{/* データ表示 */}</div>;
}
```

**主要なポイント:**
- ✅ **Power Apps SDK経由のみ使用** - ユーザー認証が自動処理される
- ✅ **自動生成サービスクラス** - `pac code add-data-source` で生成
- ✅ **SDK初期化チェック** - `usePowerPlatform().isInitialized` で確認
- ✅ **TypeScript型安全性** - 自動生成された型定義を使用
- ❌ **他の接続方法は使用禁止** - 認証・セキュリティ問題のため

#### **3.3 完全なデータソース接続ガイド**

**詳細な手順は Phase 5 を参照:**
- 接続ID の取得方法（Power Apps ポータルのURL）
- コネクター別の追加手順（Dataverse, Office 365, SQL Server）
- Dataverse テーブルの追加（SystemUsers, Accounts, Contacts等）
- カスタムテーブルの追加（GitHub Copilot でメタデータ取得）
- トラブルシューティング（接続エラー、SDK初期化エラー）

> **→ [Phase 5: データソース統合の詳細](#phase-5-機能拡張) を参照**

---

## 🗃️ **Dataverse 接続統合 (Microsoft 公式仕様)**

> **参考ドキュメント**: [Connect your code app to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)

### ⚠️ **重要: PowerDataRuntime 初期化の必須要件**

Dataverse テーブル（例: SystemUsers, Accounts, Contacts など）にアクセスする際は、**必ず Power Apps SDK の初期化が完了してから**データ操作を行う必要があります。

> **詳細な実装パターンと初期化方法は Phase 5 を参照してください。**

---

## 🔧 **Dataverse接続設定手順とトラブルシューティング**
    searchTerm?: string, 
    top?: number, 
    isSearchTermRequired?: boolean, 
    skipToken?: string
  ): Promise<IOperationResult<EntityListResponse_IReadOnlyList_User>> {
    const params = { searchTerm, top, isSearchTermRequired, skipToken };
    const result = await Office365UsersService.client.executeAsync(
      {
        connectorOperation: {
          tableName: Office365UsersService.dataSourceName,
          operationName: 'SearchUserV2',
          parameters: params
        },
      });
    return result;
  }

  /**
   * Get manager (V2)
   * Retrieves the profile of the specified user's manager.
   */
  public static async Manager_V2(id: string, $select?: string): Promise<IOperationResult<GraphUser_V1>> {
    const params: { id: string, $select?: string } = { id, $select };
    const result = await Office365UsersService.client.executeAsync<{ id: string, $select?: string }, GraphUser_V1>(
      {
        connectorOperation: {
          tableName: Office365UsersService.dataSourceName,
          operationName: 'Manager_V2',
          parameters: params
        },
      });
    return result;
  }

  /**
   * Get direct reports (V2)
   * Retrieves the user profiles of the specified user's direct reports.
   */
  public static async DirectReports_V2(
    id: string, 
    $select?: string, 
    $top?: number
  ): Promise<IOperationResult<{ value: GraphUser_V1[] }>> {
    const params: { id: string, $select?: string, $top?: number } = { id, $select, $top };
    const result = await Office365UsersService.client.executeAsync(
      {
        connectorOperation: {
          tableName: Office365UsersService.dataSourceName,
          operationName: 'DirectReports_V2',
          parameters: params
        },
      });
    return result;
  }
}
```

**主要なポイント:**
- ✅ すべてのメソッドが `static` で定義される
- ✅ `dataSourceName` は自動的に設定される
- ✅ `getClient(dataSourcesInfo)` で Power Platform クライアントを取得
- ✅ `executeAsync()` で非同期にコネクター操作を実行
- ✅ TypeScript型定義が自動生成される

#### **3.3 カスタムフックでサービスクラスをラップ**

**Step 1: Office 365 Users カスタムフック作成**
```typescript
// src/hooks/useOffice365.ts
import { useState, useEffect, useCallback } from 'react';
import { Office365UsersService } from '../generated/services/Office365UsersService';
import type { GraphUser_V1 } from '../generated/models/Office365UsersModel';

export const useOffice365Users = () => {
  const [users, setUsers] = useState<GraphUser_V1[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 現在のユーザープロファイル取得
  const getMyProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.MyProfile_V2();
      
      if (result.isSuccess && result.value) {
        return result.value;
      } else {
        throw new Error('プロファイル取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // ユーザー検索
  const searchUsers = useCallback(async (searchTerm: string, top: number = 10) => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.SearchUserV2(searchTerm, top, false);
      
      if (result.isSuccess && result.value) {
        setUsers(result.value.value || []);
        return result.value.value;
      } else {
        throw new Error('ユーザー検索に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 特定ユーザーのプロファイル取得
  const getUserProfile = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.UserProfile_V2(userId);
      
      if (result.isSuccess && result.value) {
        return result.value;
      } else {
        throw new Error('ユーザー情報の取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // マネージャー情報取得
  const getManager = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.Manager_V2(userId);
      
      if (result.isSuccess && result.value) {
        return result.value;
      } else {
        throw new Error('マネージャー情報の取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 直属の部下取得
  const getDirectReports = useCallback(async (userId: string, top: number = 50) => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.DirectReports_V2(userId, undefined, top);
      
      if (result.isSuccess && result.value) {
        return result.value.value || [];
      } else {
        throw new Error('部下情報の取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { 
    users,
    loading, 
    error,
    getMyProfile,
    searchUsers,
    getUserProfile,
    getManager,
    getDirectReports
  };
};
```

**Step 2: Reactコンポーネントでの使用例**
```typescript
// src/pages/Office365Page.tsx
import React, { useState, useEffect } from 'react';
import { useOffice365Users } from '../hooks/useOffice365';
import type { GraphUser_V1 } from '../generated/models/Office365UsersModel';

export const Office365Page: React.FC = () => {
  const { 
    users, 
    loading, 
    error, 
    getMyProfile, 
    searchUsers, 
    getUserProfile,
    getManager,
    getDirectReports
  } = useOffice365Users();

  const [myProfile, setMyProfile] = useState<GraphUser_V1 | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<GraphUser_V1 | null>(null);
  const [manager, setManager] = useState<GraphUser_V1 | null>(null);
  const [directReports, setDirectReports] = useState<GraphUser_V1[]>([]);

  // 初期化時に自分のプロファイルを取得
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await getMyProfile();
        setMyProfile(profile);
      } catch (err) {
        console.error('プロファイル取得エラー:', err);
      }
    };
    loadProfile();
  }, [getMyProfile]);

  // ユーザー検索処理
  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    try {
      await searchUsers(searchTerm, 20);
    } catch (err) {
      console.error('検索エラー:', err);
    }
  };

  // ユーザー選択時の詳細取得
  const handleUserSelect = async (userId: string) => {
    try {
      const [userProfile, userManager, reports] = await Promise.all([
        getUserProfile(userId),
        getManager(userId).catch(() => null), // マネージャーがいない場合もある
        getDirectReports(userId).catch(() => []) // 部下がいない場合もある
      ]);

      setSelectedUser(userProfile);
      setManager(userManager);
      setDirectReports(reports);
    } catch (err) {
      console.error('ユーザー詳細取得エラー:', err);
    }
  };

  if (loading && !myProfile) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Office 365 Users</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* 自分のプロファイル表示 */}
      {myProfile && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">My Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Display Name</p>
              <p className="font-medium">{myProfile.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{myProfile.mail || myProfile.userPrincipalName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Job Title</p>
              <p className="font-medium">{myProfile.jobTitle || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Department</p>
              <p className="font-medium">{myProfile.department || 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {/* ユーザー検索 */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Search Users</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter name or email..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* 検索結果 */}
        {users.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="font-semibold">Search Results ({users.length})</h3>
            {users.map((user) => (
              <div
                key={user.id}
                onClick={() => handleUserSelect(user.id!)}
                className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <p className="font-medium">{user.displayName}</p>
                <p className="text-sm text-gray-600">{user.mail || user.userPrincipalName}</p>
                {user.jobTitle && (
                  <p className="text-sm text-gray-500">{user.jobTitle}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 選択したユーザーの詳細 */}
      {selectedUser && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">User Details</h2>
          
          {/* 基本情報 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Display Name</p>
                <p className="font-medium">{selectedUser.displayName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium">{selectedUser.mail || selectedUser.userPrincipalName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Job Title</p>
                <p className="font-medium">{selectedUser.jobTitle || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Department</p>
                <p className="font-medium">{selectedUser.department || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Office Location</p>
                <p className="font-medium">{selectedUser.officeLocation || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Mobile Phone</p>
                <p className="font-medium">{selectedUser.mobilePhone || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* マネージャー情報 */}
          {manager && (
            <div className="mb-6">
              <h3 className="font-semibold mb-2">Manager</h3>
              <div className="p-4 border rounded-lg bg-gray-50">
                <p className="font-medium">{manager.displayName}</p>
                <p className="text-sm text-gray-600">{manager.mail || manager.userPrincipalName}</p>
                {manager.jobTitle && (
                  <p className="text-sm text-gray-500">{manager.jobTitle}</p>
                )}
              </div>
            </div>
          )}

          {/* 直属の部下 */}
          {directReports.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Direct Reports ({directReports.length})</h3>
              <div className="space-y-2">
                {directReports.map((report) => (
                  <div key={report.id} className="p-4 border rounded-lg bg-gray-50">
                    <p className="font-medium">{report.displayName}</p>
                    <p className="text-sm text-gray-600">{report.mail || report.userPrincipalName}</p>
                    {report.jobTitle && (
                      <p className="text-sm text-gray-500">{report.jobTitle}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

**主要なポイント:**
- ✅ **自動生成サービスクラス** を直接使用
- ✅ **カスタムフック** でビジネスロジックをカプセル化
- ✅ **TypeScript型定義** で型安全性を確保
- ✅ **エラーハンドリング** を各操作で実装
- ✅ **ローディング状態** を適切に管理

#### **3.4 SQL Server コネクターの統合パターン**
```typescript
// src/hooks/useSqlProjects.ts  
import { useConnector } from '@microsoft/power-apps';
import { useState, useCallback } from 'react';

export const useSqlProjects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const sqlConnector = useConnector('sql');

  const loadProjects = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      // ✅ 正しいSQL APIメソッド (FluentSampleパターン)
      const result = await sqlConnector.getTable('Projects', {
        skip: 0,
        take: 50,
        orderBy: 'CreatedDate desc',
        ...options
      });
      
      setProjects(result.data || []);
    } catch (err) {
      console.error('SQL Error:', err);
      setError(`Database Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [sqlConnector]);

  const createProject = useCallback(async (projectData) => {
    try {
      await sqlConnector.insertTable('Projects', projectData);
      await loadProjects(); // 再読み込み
    } catch (err) {
      setError(`Create Error: ${err.message}`);
      throw err;
    }
  }, [sqlConnector, loadProjects]);

  const updateProject = useCallback(async (id, data) => {
    try {
      await sqlConnector.updateTable('Projects', id, data);
      await loadProjects(); // 再読み込み
    } catch (err) {
      setError(`Update Error: ${err.message}`);
      throw err;
    }
  }, [sqlConnector, loadProjects]);

  const deleteProject = useCallback(async (id) => {
    try {
      await sqlConnector.deleteTable('Projects', id);
      await loadProjects(); // 再読み込み  
    } catch (err) {
      setError(`Delete Error: ${err.message}`);
      throw err;
    }
  }, [sqlConnector, loadProjects]);

  return { 
    projects, 
    loading, 
    error, 
    loadProjects,
    createProject,
    updateProject,
    deleteProject
  };
};
```

#### **3.5 Mockデータからコネクター呼び出しへの置換**

**Office 365 Users の変更例:**
```typescript
// src/pages/Office365Page.tsx (リアルデータ版)
import React, { useState, useEffect } from 'react';
import { useOffice365Users } from '../hooks/useOffice365';
import type { GraphUser_V1 } from '../generated/models/Office365UsersModel';

export const Office365Page: React.FC = () => {
  const { getMyProfile, searchUsers, loading, error } = useOffice365Users();
  const [myProfile, setMyProfile] = useState<GraphUser_V1 | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await getMyProfile();
        setMyProfile(profile);
      } catch (err) {
        console.error('プロファイル取得エラー:', err);
      }
    };
    loadProfile();
  }, [getMyProfile]);

  if (loading && !myProfile) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading Office 365 profile...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Connection Error</h3>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Office 365 User Profile</h1>
      {myProfile && (
        <div className="border rounded-lg p-4 bg-white shadow">
          <h3 className="font-semibold text-lg">{myProfile.displayName}</h3>
          <p className="text-gray-600">{myProfile.jobTitle || '職位未設定'}</p>
          <p className="text-sm text-blue-600">{myProfile.mail || myProfile.userPrincipalName}</p>
          <p className="text-xs text-gray-400">{myProfile.department || '部署未設定'}</p>
        </div>
      )}
    </div>
  );
};
```
    } catch (err) {
      console.error('SQL Server API Error:', err);
      setError(`データベース接続エラー: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRealProjects();
  }, [sqlConnector]);

  const handleCreateProject = async (projectData: any) => {
    try {
      // ✅ 正しいSQL作成API
      const result = await sqlConnector.insertTable('Projects', projectData);
      
      if (result) {
        // データ再読み込み
        await loadRealProjects();
      }
    } catch (err) {
      console.error('Project creation failed:', err);
      setError(`プロジェクト作成エラー: ${err.message}`);
    }
  };

  const handleUpdateProject = async (projectId: number, updatedData: any) => {
    try {
      // ✅ 正しいSQL更新API
      await sqlConnector.updateTable('Projects', projectId, updatedData);
      await loadRealProjects();
    } catch (err) {
      console.error('Project update failed:', err);
      setError(`プロジェクト更新エラー: ${err.message}`);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      // ✅ 正しいSQL削除API
      await sqlConnector.deleteTable('Projects', projectId);
      await loadRealProjects();
    } catch (err) {
      console.error('Project deletion failed:', err);
      setError(`プロジェクト削除エラー: ${err.message}`);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-2">Loading projects from database...</span>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Projects (SQL Database)</h1>
        <span className="text-sm text-gray-600">{totalCount} total projects</span>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <h3 className="text-red-800 font-semibold">Database Error</h3>
          <p className="text-red-600">{error}</p>
        </div>
      )}
      
      <div className="grid gap-4">
        {projects.map((project: any) => (
          <div key={project.Id} className="border rounded-lg p-4 bg-white shadow">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{project.Name}</h3>
                <p className="text-gray-600 mt-1">{project.Description}</p>
                <div className="flex gap-4 mt-2">
                  <span className={`px-2 py-1 rounded text-sm ${
                    project.Status === 'Active' ? 'bg-green-100 text-green-800' :
                    project.Status === 'Planning' ? 'bg-blue-100 text-blue-800' :
                    project.Status === 'On Hold' ? 'bg-yellow-100 text-yellow-800' :
                    project.Status === 'Completed' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {project.Status}
                  </span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    project.Priority === 'Critical' ? 'bg-red-100 text-red-800' :
                    project.Priority === 'High' ? 'bg-orange-100 text-orange-800' :
                    project.Priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {project.Priority}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleUpdateProject(project.Id, {...project, Status: 'Active'})}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Edit
                </button>
                <button 
                  onClick={() => handleDeleteProject(project.Id)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
            {project.Budget && (
              <p className="text-sm text-gray-500 mt-2">
                Budget: ¥{project.Budget.toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

#### **3.3 エラーハンドリングとデバッグ**

```typescript
// src/utils/errorHandler.ts - 共通エラーハンドリング
export const handleConnectorError = (error: any, connectorName: string) => {
  console.error(`${connectorName} Error:`, error);
  
  // よくあるエラーパターンの処理
  if (error?.message?.includes('Unauthorized')) {
    return 'コネクターへの認証が必要です。Power Apps で接続を確認してください。';
  }
  
  if (error?.message?.includes('Network')) {
    return 'ネットワーク接続を確認してください。';
  }
  
  if (error?.message?.includes('Not Found')) {
    return 'データが見つかりません。';
  }
  
  return `${connectorName}への接続でエラーが発生しました: ${error?.message || 'Unknown error'}`;
};
```

#### **3.8 統合テスト手順**

**ローカルテスト (Mock → Real データ切り替え)**
```bash
# 1. Mockデータでの動作確認
npm install
npm run build
npm run dev
# → Mockデータ版で全機能テスト

# 2. Power Platform接続作成
# Power Apps Maker Portal で:
# - Office 365 Users 接続作成
# - Dataverse 接続作成
# - SQL Server 接続作成 (必要に応じて)

# 3. サービスクラス生成
pac code add-data-source -a "shared_office365users" -c "接続ID"
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID"

# 4. 自動生成されたサービスクラスを使用
# src/hooks/ にカスタムフックを実装
# src/pages/ でコンポーネントから呼び出し

# 5. Power Platform環境テスト  
pac code init  # 初回のみ
pac code run   # ローカル + Power Platform統合
# → 認証ダイアログ確認
# → リアルデータ取得確認
```

**⚠️ 重要なトラブルシューティング:**
```bash
# 推奨される確認項目:
# 1. npm run build が成功していること
# 2. PowerProvider.tsx にエラーがないこと  
# 3. 環境で必要なコネクターが有効になっていること
# 4. dataSourcesInfo.ts にコネクター情報が含まれていること
# 5. サービスクラスの dataSourceName が正しいこと

# よくある問題と解決方法:
# - App timed out → PowerProvider実装確認
# - Connection failed → Power Apps接続確認
# - Data source not found → dataSourceName の値を確認
# - Data not loading → IOperationResult.isSuccess を確認
```

#### **3.9 本番デプロイ手順**

```bash
# 最終ビルド & デプロイ
npm run build
pac code push

# ✅ デプロイ成功確認:
# 1. Power Apps URL の取得
# 2. make.powerapps.com でアプリ確認
# 3. エンドユーザーでの動作テスト
# 4. すべてのコネクター操作が正常動作することを確認
```

**デプロイ後の確認項目:**
- [ ] アプリが正常に起動する
- [ ] Office 365 Users データが取得できる
- [ ] Dataverse データの CRUD 操作が正常動作
- [ ] エラーハンドリングが適切に動作
- [ ] Loading 状態が適切に表示される
- [ ] すべての画面で認証エラーが発生しない

#### **3.6 コネクター統合のベストプラクティス**

**✅ Microsoft推奨のコネクター統合パターン:**

**コード品質:**
- [ ] **自動生成サービスクラス** を使用 (Office365UsersService, DataverseService等)
- [ ] **カスタムフック** でビジネスロジックをカプセル化
- [ ] 適切な **TypeScript型定義** を活用
- [ ] **エラーハンドリング** を各操作で実装
- [ ] **Loading状態** の適切な表示
- [ ] **IOperationResult** の `isSuccess` プロパティでエラーチェック

**統合確認項目:**
- [ ] `pac code add-data-source` で正しくサービスクラスを生成
- [ ] `dataSourcesInfo.ts` にコネクター情報が含まれている
- [ ] `getClient(dataSourcesInfo)` でクライアントを取得
- [ ] Power Apps環境で接続が正常に作成されている
- [ ] ローカル開発で `pac code run` が正常動作

**デプロイ前チェック:**
- [ ] すべてのコネクター操作でエラーハンドリング実装
- [ ] Loading/Error状態のUI表示を実装
- [ ] `npm run build` が成功
- [ ] `pac code push` でデプロイ成功
- [ ] Power Apps環境でアプリが正常起動

#### **3.7 エラーハンドリングのベストプラクティス**

```typescript
// src/utils/connectorErrorHandler.ts
import type { IOperationResult } from '@microsoft/power-apps/data';

/**
 * コネクター操作結果のエラーハンドリング
 */
export const handleOperationResult = <T>(
  result: IOperationResult<T>,
  connectorName: string
): T => {
  if (!result.isSuccess) {
    const errorMessage = result.error?.message || 'Unknown error';
    console.error(`${connectorName} Error:`, result.error);
    
    // よくあるエラーパターンの処理
    if (errorMessage.includes('Unauthorized')) {
      throw new Error(`${connectorName}への認証が必要です。Power Apps で接続を確認してください。`);
    }
    
    if (errorMessage.includes('Network')) {
      throw new Error('ネットワーク接続を確認してください。');
    }
    
    if (errorMessage.includes('Not Found')) {
      throw new Error('データが見つかりません。');
    }
    
    throw new Error(`${connectorName}への接続でエラーが発生しました: ${errorMessage}`);
  }
  
  return result.value!;
};

/**
 * カスタムフックでの使用例
 */
export const useOffice365WithErrorHandling = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getMyProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await Office365UsersService.MyProfile_V2();
      return handleOperationResult(result, 'Office 365 Users');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getMyProfile, loading, error };
};
```
- [ ] TypeScript型安全性の確保

**データ接続:**
- [ ] Office 365 Users: `getUserProfiles()` メソッド使用
- [ ] SQL Server: `getTable()`, `insertTable()`, `updateTable()`, `deleteTable()` 使用
- [ ] Outlook: `getCalendarEvents()`, `getEmails()` 使用
- [ ] 適切な認証フロー確認

**UI/UX:**
- [ ] Fluent UI v9 コンポーネント使用
- [ ] レスポンシブデザイン対応  
- [ ] アクセシビリティ考慮
- [ ] 適切なローディング/エラー表示

**パフォーマンス:**
- [ ] React.memo による最適化
- [ ] 適切なuseCallback/useMemo使用
- [ ] データページング実装
- [ ] エラーバウンダリ設定

**セキュリティ:**
- [ ] 機密データの適切な取り扱い
- [ ] 権限チェック実装
- [ ] ログ出力の最適化
- [ ] XSS/CSRF対策確認

**デプロイ:**
- [ ] ローカルビルド成功
- [ ] Power Platform統合テスト完了
- [ ] エンドユーザーテスト完了
- [ ] パフォーマンス確認完了

## 🧪 **モックデータからリアルデータ移行テスト（重要）**

### **📋 移行テストチェックリスト**

モックデータからリアルデータに変更した際には、以下の項目を必ずテストしてください：

#### **🔍 データスキーマ検証**

**Office 365 コネクター:**
- [ ] **スキーマ整合性**: モックデータとOffice 365 APIのスキーマが一致しているか
  ```typescript
  // ✅ 確認項目: 実際のAPI応答がモックと同じ構造か
  console.log('Office 365 API Response:', JSON.stringify(realUser, null, 2));
  console.log('Mock Data Structure:', JSON.stringify(mockUser, null, 2));
  ```

- [ ] **プロパティ名の一致**: `displayName`, `mail`, `jobTitle`, `department` 等
- [ ] **データ型の確認**: 文字列、配列、boolean、日付型が正しいか
- [ ] **null/undefined処理**: 実際のAPIで空値が返される場合の処理

**Dataverse コネクター:**
- [ ] **テーブルスキーマ**: Dataverseテーブルのカラム名・型がモックと一致
  ```typescript
  // ✅ 確認: Dataverse実データのスキーマ
  console.log('Dataverse Entity:', JSON.stringify(realProject, null, 2));
  ```

- [ ] **主キーの正確性**: `Id`フィールドの形式（GUID vs 数値）
- [ ] **選択肢フィールド**: StatusやPriorityの値がモックと一致
- [ ] **関連レコード**: Lookup/関連テーブルのデータ構造

**SQL Server コネクター:**
- [ ] **データベーススキーマ**: テーブル構造がモック定義と一致
  ```sql
  -- ✅ 確認: 実際のテーブル構造
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'Projects';
  ```

- [ ] **カラム名の一致**: 大文字小文字、アンダースコア、キャメルケース
- [ ] **データ型互換性**: VARCHAR, INT, DATETIME, DECIMAL等
- [ ] **NULL制約**: NOT NULL制約がモック仕様と一致

#### **🎨 UI表示検証**

**データ表示の正確性:**
- [ ] **全フィールド表示**: モックで表示していた全項目がリアルデータでも表示
- [ ] **日本語文字化け**: 日本語データが正しく表示されるか
- [ ] **数値フォーマット**: 通貨、日付、パーセンテージの表示形式
- [ ] **画像・ファイル**: プロフィール画像やアイコンが正しく表示

**リストビュー検証:**
- [ ] **ソート機能**: 名前、日付、ステータス等のソートが動作
- [ ] **フィルター機能**: 検索・絞り込みがリアルデータで動作
- [ ] **ページング**: 大量データでのページング動作
- [ ] **空データ処理**: データが0件の場合の表示

**詳細ビュー検証:**
- [ ] **詳細画面**: 個別レコードの詳細表示が正常
- [ ] **編集フォーム**: フォーム項目がリアルデータ構造に対応
- [ ] **バリデーション**: 必須項目、文字数制限等が正しく動作

#### **📝 フォーム関連テスト（重要）**

**新規作成フォームテスト:**
- [ ] **フィールド構造**: モックデータ定義とリアルAPIスキーマが一致
  ```typescript
  // ✅ 確認項目: 新規作成フォームの全フィールド
  const createFormFields = [
    'displayName', 'jobTitle', 'department', 'mail', 
    'businessPhones', 'officeLocation', 'city', 'country'
  ];
  // リアルAPIで作成可能な全フィールドがフォームに含まれているか
  ```

- [ ] **必須フィールド**: リアル環境での必須項目がフォームで適切に設定
- [ ] **デフォルト値**: 新規作成時のデフォルト値がリアル環境に適合
- [ ] **選択肢データ**: ドロップダウン等の選択肢がリアルデータから取得
- [ ] **Auto-Complete**: ユーザー入力時の候補表示がリアルデータベース
- [ ] **関連データ取得**: 部署一覧、役職一覧等がリアルソースから取得

**編集フォームテスト:**
- [ ] **既存データ表示**: リアルデータがフォームに正確に読み込まれる
  ```typescript
  // ✅ 確認項目: 編集フォームでのデータ読み込み
  console.log('Original Data:', originalRecord);
  console.log('Form Initial Values:', formInitialValues);
  // 全フィールドが正確にフォームに反映されているか
  ```

- [ ] **部分更新**: 変更した項目のみがリアルデータベースに保存される
- [ ] **競合制御**: 同時編集時の適切な競合処理
- [ ] **変更検知**: 未保存変更の警告表示
- [ ] **リアルタイム検証**: 入力中のリアルタイムバリデーション
- [ ] **関連データ更新**: 関連レコードの自動更新

**フォーム共通テスト:**
- [ ] **データ型変換**: 文字列⇔数値⇔日付の適切な変換
  ```typescript
  // ✅ データ型マッピング確認
  const typeMapping = {
    'budget': 'number',      // 予算: 数値型
    'dueDate': 'Date',       // 期限: 日付型  
    'priority': 'string',    // 優先度: 文字列型
    'isActive': 'boolean'    // 有効: 真偽値型
  };
  ```

- [ ] **文字エンコーディング**: 日本語文字の正確な保存・表示
- [ ] **特殊文字処理**: 記号、絵文字、改行等の適切な処理
- [ ] **ファイルアップロード**: 画像やドキュメントのアップロード機能
- [ ] **複数値フィールド**: 配列データ（電話番号、タグ等）の処理

#### **🎯 コネクター別フォームテスト**

**Office 365 フォームテスト:**
- [ ] **ユーザープロフィール作成**: Office 365環境での新規ユーザー作成
- [ ] **プロフィール更新**: 既存ユーザーの情報更新
- [ ] **組織情報連携**: 部署、管理者情報の自動取得・設定
- [ ] **ライセンス管理**: ユーザーライセンスの割り当て・変更
- [ ] **グループ所属**: セキュリティグループ、配布リストの管理

**Dataverse フォームテスト:**
- [ ] **エンティティ作成**: カスタムエンティティでの新規レコード作成
  ```typescript
  // ✅ Dataverse作成テスト
  const projectData = {
    name: 'テストプロジェクト',
    description: '移行テスト用プロジェクト',
    statuscode: 1,           // ステータス選択肢
    prioritycode: 100000002, // 優先度選択肢
    estimatedbudget: 5000000 // 通貨フィールド
  };
  ```

- [ ] **ルックアップフィールド**: 関連レコードの選択・表示
- [ ] **選択肢フィールド**: OptionSetの値が正確に保存
- [ ] **計算フィールド**: 計算式が適切に動作
- [ ] **ワークフロー連携**: フォーム送信時のワークフロー実行

**SQL Server フォームテスト:**
- [ ] **テーブル作成**: SQL Serverでの新規レコード挿入
  ```sql
  -- ✅ SQL Server作成テスト
  INSERT INTO Projects (Name, Description, Status, Priority, Budget, CreatedDate)
  VALUES ('移行テストプロジェクト', 'フォームからのテスト作成', 'Planning', 'High', 3000000, GETDATE());
  ```

- [ ] **制約チェック**: NOT NULL、UNIQUE、CHECK制約の動作
- [ ] **外部キー**: 関連テーブルとの整合性
- [ ] **トランザクション**: 複数テーブル更新の原子性
- [ ] **ストアドプロシージャ**: 複雑な業務ロジックの実行

#### **🔧 フォームバリデーションテスト**

**クライアントサイドバリデーション:**
- [ ] **必須チェック**: 必須フィールドの空白チェック
- [ ] **形式チェック**: メールアドレス、電話番号の形式検証
- [ ] **文字数チェック**: 最小・最大文字数の制限
- [ ] **数値範囲**: 予算、年齢等の数値範囲チェック
- [ ] **日付妥当性**: 開始日≤終了日等の日付ロジック

**サーバーサイドバリデーション:**
- [ ] **重複チェック**: メールアドレス、ID等の一意性確認
- [ ] **権限チェック**: 作成・編集権限の確認
- [ ] **ビジネスルール**: 業務固有の制約事項
- [ ] **整合性チェック**: 関連データとの整合性確認

#### **📱 フォームUI/UXテスト**

**応答性テスト:**
- [ ] **保存速度**: フォーム送信後3秒以内での応答
- [ ] **バリデーション速度**: リアルタイム検証の応答性
- [ ] **データ読み込み**: 編集フォーム表示時間
- [ ] **大量データ**: 選択肢が1000件以上の場合の性能

**ユーザビリティテスト:**
- [ ] **エラー表示**: わかりやすいエラーメッセージ
- [ ] **成功通知**: 保存完了の明確な通知
- [ ] **進行状況**: 長時間処理での進捗表示
- [ ] **自動保存**: 一定間隔での下書き保存
- [ ] **復元機能**: ブラウザクラッシュ時の入力内容復元

#### **🧪 フォーム移行テスト実行手順**

**Step 1: フォーム機能の棚卸し**
```typescript
// src/tests/formMigration.test.ts
describe('Form Migration Tests', () => {
  // 新規作成フォームテスト
  test('Create Form - All fields work with real data', async () => {
    const formData = {
      // モックデータ構造と同じフィールド
      displayName: 'テストユーザー',
      jobTitle: 'テストエンジニア',
      department: 'IT部門',
      mail: 'test@company.com'
    };
    
    const result = await createUser(formData);
    expect(result.success).toBe(true);
    expect(result.data.id).toBeDefined();
  });
  
  // 編集フォームテスト  
  test('Edit Form - Loads and saves real data correctly', async () => {
    const existingUser = await getUser('test-user-id');
    const updatedData = { ...existingUser, jobTitle: '更新された職種' };
    
    const result = await updateUser(existingUser.id, updatedData);
    expect(result.success).toBe(true);
    expect(result.data.jobTitle).toBe('更新された職種');
  });
});
```

**Step 2: フォーム別動作確認**
```bash
# 各フォームでの実動作テスト
npm run test:forms:create   # 新規作成フォーム
npm run test:forms:edit     # 編集フォーム  
npm run test:forms:bulk     # 一括操作フォーム
npm run test:forms:import   # データインポートフォーム
```

**Step 3: エンドツーエンドテスト**
```typescript
// e2e/formWorkflow.test.ts  
test('Complete form workflow with real data', async () => {
  // 1. 新規作成
  await page.click('[data-testid="create-button"]');
  await page.fill('[name="displayName"]', 'E2Eテストユーザー');
  await page.click('[type="submit"]');
  
  // 2. 作成確認
  await expect(page.locator('.success-message')).toBeVisible();
  
  // 3. 編集
  await page.click('[data-testid="edit-button"]');
  await page.fill('[name="jobTitle"]', '更新された職種');
  await page.click('[type="submit"]');
  
  // 4. 更新確認  
  await expect(page.locator('.success-message')).toBeVisible();
});
```

この詳細なフォームテストにより、モックデータからリアルデータへの移行時に、全てのフォーム機能が正常に動作することを確実に検証できます。

#### **⚡ 機能動作テスト**

**CRUD操作テスト:**
- [ ] **作成（Create）**: 新規データ作成がリアル環境で動作
- [ ] **読み取り（Read）**: データ取得・表示が正常
- [ ] **更新（Update）**: データ編集・保存が正常
- [ ] **削除（Delete）**: データ削除が正常（※要注意）

**検索・フィルター機能:**
- [ ] **キーワード検索**: 実際のデータで検索機能が動作
- [ ] **高度な検索**: 複数条件での絞り込み
- [ ] **オートコンプリート**: 候補表示機能

**統合機能テスト:**
- [ ] **クロスコネクター**: Office 365 + SQL等の複合処理
- [ ] **データ同期**: 複数ソース間のデータ整合性
- [ ] **リアルタイム更新**: データ変更の即座反映

#### **🚨 エラーハンドリング検証**

**接続エラー対応:**
- [ ] **認証エラー**: 権限不足時の適切なエラー表示
- [ ] **ネットワークエラー**: 接続断時の処理
- [ ] **データ不整合**: 想定外のデータ形式への対応

**ユーザビリティ:**
- [ ] **ローディング表示**: データ取得中の適切な表示
- [ ] **エラーメッセージ**: わかりやすいエラー通知
- [ ] **リトライ機能**: 失敗時の再試行オプション

#### **📊 パフォーマンステスト**

**レスポンス時間:**
- [ ] **初期表示**: 5秒以内でのデータ表示
- [ ] **検索応答**: 3秒以内での検索結果表示
- [ ] **ページング**: スムーズなページ切り替え

**大量データ対応:**
- [ ] **100件以上**: 大量データでの表示性能
- [ ] **1000件以上**: 検索・フィルター性能
- [ ] **メモリ使用量**: ブラウザでのメモリリーク確認

### **🔧 移行テスト実行手順**

#### **Step 1: 段階的切り替えテスト**
```typescript
// src/config/dataSource.ts - 切り替え用設定
export const DATA_SOURCE_CONFIG = {
  useRealData: process.env.NODE_ENV === 'production', // 環境による自動切り替え
  office365: {
    useMock: false, // リアルデータ使用
    mockFallback: true // エラー時はモック使用
  },
  dataverse: {
    useMock: false,
    mockFallback: true
  },
  sql: {
    useMock: false,
    mockFallback: true
  }
};
```

#### **Step 2: A/Bテスト比較**
```typescript
// 同じ画面でモックとリアルデータを比較表示
const ComparisonTest = () => {
  const [showMock, setShowMock] = useState(true);
  
  return (
    <div className="flex gap-4">
      <div className="w-1/2">
        <h3>Mock Data</h3>
        <UserListMock />
      </div>
      <div className="w-1/2">
        <h3>Real Data</h3>
        <UserListReal />
      </div>
    </div>
  );
};
```

#### **Step 3: 自動テスト実行**
```bash
# 移行テスト用のテストスイート実行
npm run test:migration

# 各コネクター別テスト
npm run test:office365
npm run test:dataverse  
npm run test:sql

# 統合テスト
npm run test:integration
```

### **⚠️ 移行時の重要な注意事項**

1. **バックアップ**: 本番データを扱う場合は必ずバックアップを取得
2. **段階的移行**: 一度に全コネクターを切り替えず、段階的に実施
3. **モニタリング**: 移行後しばらくはエラーログを注意深く監視
4. **ロールバック計画**: 問題発生時の元に戻す手順を準備
5. **ユーザーテスト**: 技術的テストだけでなく、実際のユーザーでの動作確認

この移行テストを完了することで、モックデータとリアルデータ間でのギャップを最小化し、本番環境での安定動作を確保できます。

### 🗑️ **データソース削除 (必要時)**

```bash
# データソース削除
pac code delete-data-source -a "shared_office365users" -ds "Office365Users"

# 重要: 接続のスキーマが変更された場合、
#       データソースを削除してから再追加する必要があります
```

### 🚀 **Step 4: アプリでの接続呼び出し実装**

#### **4.1 Office 365 Users 実装パターン (Microsoft 公式)**

**React Hook での実装**:

```typescript
// src/hooks/useCurrentUser.ts
import { useState, useEffect } from 'react';
import { Office365UsersService } from '../generated/services/Office365UsersService';

export interface UserProfile {
  id?: string;
  displayName?: string;
  jobTitle?: string;
  userPrincipalName?: string;
  photo?: string;
}

export const useCurrentUser = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        
        // Microsoft 公式 API パターン - プロフィール取得
        const profile = (await Office365UsersService.MyProfile_V2(
          "id,displayName,jobTitle,userPrincipalName"
        )).data;
        
        setUser(profile);
        
            if (profile.userPrincipalName) {
              try {
                photoData = (await Office365UsersService.UserPhoto_V2(
                  profile.userPrincipalName
                )).data;
              } catch {
                console.log('ユーザー写真が利用できません');
              }
            }
          }
          
          if (photoData) {
            setUser(prev => ({ 
              ...prev, 
              ...profile, 
              photo: `data:image/jpeg;base64,${photoData}` 
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError('プロフィールの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return { user, loading, error };
};
```

**コンポーネントでの使用例**:

```typescript
// src/components/UserProfile.tsx  
import React from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';

export const UserProfile: React.FC = () => {
  const { user, loading, error } = useCurrentUser();

  if (loading) return <div>プロフィール読み込み中...</div>;
  if (error) return <div>エラー: {error}</div>;
  if (!user) return <div>プロフィールが見つかりません</div>;

  return (
    <div className="user-profile">
      {user.photo && (
        <img 
          src={user.photo} 
          alt="User Avatar" 
          className="w-12 h-12 rounded-full"
        />
      )}
      <div>
        <h3>{user.displayName}</h3>
        <p>{user.jobTitle}</p>
        <p>{user.userPrincipalName}</p>
      </div>
    </div>
  );
};
```

#### **4.2 表形式データソース実装パターン (SQL Server)**

```typescript
// src/hooks/useProjects.ts - SQL Server テーブル操作
import { useState, useEffect } from 'react';
import { MobileDeviceInventoryService } from '../generated/services/MobileDeviceInventoryService';

export const useDeviceInventory = () => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  // 全件取得
  const fetchDevices = async () => {
    try {
      const result = await MobileDeviceInventoryService.getall();
      setDevices(result.data);
    } catch (error) {
      console.error('デバイス一覧取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  // 新規作成
  const createDevice = async (deviceData: any) => {
    try {
      await MobileDeviceInventoryService.create(deviceData);
      await fetchDevices(); // 再読み込み
    } catch (error) {
      console.error('デバイス作成エラー:', error);
    }
  };

  // 更新
  const updateDevice = async (id: string, changes: any) => {
    try {
      await MobileDeviceInventoryService.update(id, changes);
      setDevices(prevDevices => 
        prevDevices.map(device => 
          device.id === id ? { ...device, ...changes } : device
        )
      );
    } catch (error) {
      console.error('デバイス更新エラー:', error);
    }
  };

  // 削除
  const deleteDevice = async (id: string) => {
    try {
      await MobileDeviceInventoryService.delete(id);
      setDevices(prev => prev.filter(device => device.id !== id));
    } catch (error) {
      console.error('デバイス削除エラー:', error);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  return {
    devices,
    loading,
    createDevice,
    updateDevice,
    deleteDevice,
    refresh: fetchDevices
  };
};
```

### 🧪 **Step 5: ローカルテストと実行**

```bash
# ローカル開発サーバー起動
npm run dev

# ブラウザで確認: http://localhost:3000
# コネクターが正常に動作することを確認
```

### 🚀 **Step 6: Power Apps へのデプロイ**

```bash
# アプリをビルドしてPower Appsにプッシュ
npm run build
pac code push

# デプロイ完了後:
# 1. Power Apps ポータルでアプリを確認
# 2. 実際の環境でコネクター接続をテスト
# 3. ユーザーにアクセス権限を付与
```

### ⚠️ **重要な注意事項**

- **初回リリースでは既存接続のみ利用可能**: PAC CLIによる新しい接続作成は今後のリリースで対応予定
- **スキーマ変更時**: 接続のスキーマが変更された場合は、データソースを削除してから再追加が必要
- **表形式データの取得**: データセット名とテーブルIDが不明な場合は、キャンバスアプリ経由でブラウザーのネットワークインスペクターから取得可能

## 🗃️ **Dataverse 接続統合 (Microsoft 公式仕様)**

> **参考ドキュメント**: [Connect your code app to Dataverse](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)

### ⚠️ **重要: PowerDataRuntime 初期化の必須要件**

Dataverse テーブル（例: SystemUsers, Accounts, Contacts など）にアクセスする際は、**必ず Power Apps SDK の初期化が完了してから**データ操作を行う必要があります。

**❌ よくあるエラー:**
```
Error fetching SystemUsers: PowerDataRuntimeError: An unknown error occurred: 
PowerDataRuntime is not initialized. Please call initializeRuntime() first.
```

**原因:**
- Power Apps SDK（PowerDataRuntime）が初期化される前に Dataverse サービスクラスのメソッドを呼び出した
- `usePowerPlatform().isInitialized` の状態確認をせずにデータ取得を試みた
- コンポーネントのマウント時に即座にデータフェッチを実行した

**✅ 正しい実装パターン:**
```typescript
import { usePowerPlatform } from '@microsoft/power-apps';
import { useEffect, useState } from 'react';
import { SystemUsersService } from '../generated/services/SystemUsersService';

export function DataversePage() {
  const { isInitialized } = usePowerPlatform();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ❌ 初期化前は何もしない
    if (!isInitialized) {
      console.log('Waiting for Power Apps SDK initialization...');
      return;
    }

    // ✅ 初期化完了後にデータ取得
    const loadData = async () => {
      try {
        setLoading(true);
        const result = await SystemUsersService.getAll({
          select: ['systemuserid', 'fullname', 'internalemailaddress'],
          filter: 'isdisabled eq false',
          top: 50
        });

        if (result.isSuccess && result.value) {
          setUsers(result.value);
        } else {
          throw new Error('SystemUsers の取得に失敗しました');
        }
      } catch (err) {
        console.error('Error fetching SystemUsers:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isInitialized]); // 依存配列に isInitialized を含める

  // SDK 初期化中
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Power Apps SDK 初期化中...</p>
        </div>
      </div>
    );
  }

  // データ読み込み中
  if (loading) {
    return <div>データ読み込み中...</div>;
  }

  // エラー発生
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-semibold">エラー</h3>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // データ表示
  return (
    <div>
      <h1>システムユーザー ({users.length})</h1>
      {users.map(user => (
        <div key={user.systemuserid}>
          {user.fullname} - {user.internalemailaddress}
        </div>
      ))}
    </div>
  );
}
```

**カスタムフックでの実装（推奨パターン）:**
```typescript
// src/hooks/useDataverseTable.ts
import { useState, useEffect, useCallback } from 'react';
import { usePowerPlatform } from '@microsoft/power-apps';

export const useDataverseTable = <T,>(
  serviceClass: any,
  options?: { select?: string[]; filter?: string; orderBy?: string; top?: number }
) => {
  const { isInitialized } = usePowerPlatform();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // ❌ SDK未初期化時は実行しない
    if (!isInitialized) {
      console.warn('SDK not initialized, skipping fetch');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await serviceClass.getAll(options);

      if (result.isSuccess && result.value) {
        setData(result.value);
      } else {
        throw new Error('データの取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse fetch error:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, serviceClass, options]);

  useEffect(() => {
    if (isInitialized) {
      fetchData();
    }
  }, [isInitialized, fetchData]);

  return { data, loading, error, refetch: fetchData, isInitialized };
};

// 使用例
import { SystemUsersService } from '../generated/services/SystemUsersService';

export function UsersPage() {
  const { data: users, loading, error, isInitialized } = useDataverseTable(
    SystemUsersService,
    {
      select: ['systemuserid', 'fullname', 'internalemailaddress'],
      filter: 'isdisabled eq false',
      top: 100
    }
  );

  if (!isInitialized) return <div>初期化中...</div>;
  if (loading) return <div>読み込み中...</div>;
  if (error) return <div>エラー: {error}</div>;

  return <div>{/* ユーザー表示 */}</div>;
}
```

**チェックリスト:**
- [ ] `usePowerPlatform()` で `isInitialized` 状態を取得
- [ ] `isInitialized === false` の間は Loading 表示
- [ ] `useEffect` の依存配列に `isInitialized` を含める
- [ ] Dataverse サービスクラスの呼び出しは `isInitialized === true` 後のみ
- [ ] エラーハンドリングを適切に実装

### 📋 **前提条件**

- **Power Apps Code Apps SDK**: `@microsoft/power-apps` (npm package)
- **PAC CLI**: バージョン 1.46 以上
- **Dataverse 有効化環境**: Power Platform環境にDataverseが有効化されている
- **PAC CLI 認証**: 環境に正しく接続されている
- **PowerProvider 実装**: アプリのルートに PowerProvider がラップされている

### ⚡ **Dataverse データソース追加（完全ガイド）**

#### **方法1: 接続IDを使用した追加（推奨）**

> **⚠️ 重要**: Dataverse テーブルをデータソースとして追加するには、**Power Apps ポータルで接続を手動作成し、接続IDを取得**する必要があります。

**Step 1: Power Apps ポータルでDataverse接続を作成**

```bash
# 1. Power Apps Maker Portal (make.powerapps.com) にアクセス
# 2. 左メニュー > 「データ」 > 「接続」
# 3. 「+ 新しい接続」をクリック
# 4. 「Microsoft Dataverse」を検索して選択
# 5. 「作成」をクリック（認証は自動で完了）
# 6. 接続が正常に作成されたことを確認
```

**Step 2: 接続IDを取得**

```bash
# Power Apps ポータルで:
# 1. 「データ」 > 「接続」 > 「Microsoft Dataverse」をクリック
# 2. ブラウザのアドレスバーのURLを確認
# 3. URLから接続IDをコピー

# URL形式:
https://make.powerapps.com/environments/{環境ID}/connections/shared_commondataserviceforapps/{接続ID}/details

# 例:
https://make.powerapps.com/environments/12345678-abcd-1234-efgh-123456789abc/connections/shared_commondataserviceforapps/a1b2c3d4-e5f6-7890-1234-567890abcdef/details

# 接続ID: a1b2c3d4-e5f6-7890-1234-567890abcdef
```

**Step 3: pac code add-data-source コマンド実行**

```bash
# ユーザーに接続IDを確認した後、以下のコマンドを実行

# SystemUsers テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "a1b2c3d4-e5f6-7890-1234-567890abcdef" -t "systemusers"

# Accounts (取引先企業) テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "accounts"

# Contacts (取引先担当者) テーブルを追加
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "contacts"

# カスタムテーブルを追加（例: geek_project_task）
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "geek_project_task"
```

**コマンドパラメータ:**
- `-a`: API名（Dataverseの場合は `shared_commondataserviceforapps`）
- `-c`: 接続ID（Power Apps ポータルのURLから取得）
- `-t`: テーブルの論理名（小文字、アンダースコア区切り）

**Step 4: 生成されたファイルを確認**

```bash
# コマンド実行後、以下のファイルが自動生成されます:

# SystemUsers テーブルの場合:
src/generated/services/SystemusersService.ts
src/generated/models/SystemusersModel.ts

# Accounts テーブルの場合:
src/generated/services/AccountsService.ts
src/generated/models/AccountsModel.ts

# カスタムテーブル（geek_project_task）の場合:
src/generated/services/Geek_project_tasksService.ts
src/generated/models/Geek_project_tasksModel.ts
```

#### **方法2: 簡易追加（接続が既に存在する場合）**

```bash
# Dataverse接続が既に作成されている場合、テーブル名のみで追加可能
pac code add-data-source -a dataverse -t <table-logical-name>

# 例: Accountsテーブルの追加
pac code add-data-source -a dataverse -t accounts

# 例: Contactsテーブルの追加
pac code add-data-source -a dataverse -t contacts

# ⚠️ 注意: この方法はデフォルトのDataverse接続を使用します
# 接続が見つからない場合はエラーになるため、方法1を推奨します
```

#### **ユーザーへの依頼テンプレート**

開発時にユーザーに接続IDを確認する際は、以下のテンプレートを使用してください:

```markdown
## Dataverse 接続ID の取得方法

以下の手順で接続IDを取得し、提供してください:

### 手順
1. Power Apps ポータル (https://make.powerapps.com) にアクセス
2. 左メニュー > 「データ」 > 「接続」をクリック
3. 「Microsoft Dataverse」接続をクリック
4. ブラウザのアドレスバーのURLをコピー
5. URLから接続ID（GUID形式）を抽出

### URL例
https://make.powerapps.com/environments/xxx/connections/shared_commondataserviceforapps/**[ここが接続ID]**/details

### 接続ID
[ここに貼り付けてください]

### スクリーンショット
[URLバーのスクリーンショットを添付してください]
```

#### **⚠️ よくあるエラーと対処法**

**エラー 1: 接続が見つからない**
```bash
Error: Connection with id 'xxx' not found

対処法:
1. Power Apps ポータルでDataverse接続が作成されているか確認
2. URLから接続IDを正確にコピー（ハイフンを含むGUID形式）
3. pac env select で正しい環境を選択しているか確認
```

**エラー 2: テーブルが見つからない**
```bash
Error: Table 'tablename' not found

対処法:
1. テーブルの論理名を確認（小文字、アンダースコア）
   - 正: systemuser, account, contact
   - 誤: SystemUsers, Account, Contact
2. Power Apps Maker Portalでテーブル論理名を確認、またはgetMetadata APIで取得
3. Dataverse でテーブルが公開されているか確認
```

**エラー 3: データソースが見つからない（実行時エラー）**
```bash
Error: Data source 'systemusers' not found
PowerDataRuntimeError: PowerDataRuntime is not initialized

対処法:
1. pac code add-data-source コマンドが正常に完了したか確認
2. src/generated/services にサービスファイルが生成されているか確認
3. npm run build でビルド成功を確認
4. usePowerPlatform().isInitialized の確認を実装
```

#### **チェックリスト**

- [ ] Power Apps ポータルでDataverse接続を手動作成
- [ ] ブラウザのURLから接続ID（GUID）を取得
- [ ] ユーザーに接続IDを確認（必要に応じて）
- [ ] `pac auth list` で認証状態を確認
- [ ] `pac env select` で正しい環境を選択
- [ ] `pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID" -t "テーブル名"` を実行
- [ ] src/generated フォルダにサービスファイルが生成されたことを確認
- [ ] `npm run build` でビルド成功を確認
- [ ] コンポーネントで `usePowerPlatform().isInitialized` をチェック
- [ ] `pac code push` でデプロイして動作確認

## 📋 **Dataverse接続前の必須手順: スキーマ確認とドキュメント化**

> **⚠️ 重要**: モックデータからDataverseリアルデータに移行する際は、公式APIを使用してメタデータを取得します。

### **新しい開発プロセス: 公式API による自動メタデータ取得**

**従来の方法 (非推奨):**
- ❌ customizations.xmlファイルの手動エクスポート
- ❌ PowerShellスクリプトによる手動スキーマ抽出
- ❌ TypeScript型定義の手動作成

**公式推奨方法:**
- ✅ `pac code add-data-source` コマンドでテーブル論理名を指定するだけ
- ✅ Dataverse Web APIが自動的にメタデータを取得
- ✅ TypeScript型定義とサービスクラスを自動生成
- ✅ Choice値のマッピングを自動作成
- ✅ XMLファイル不要で、常に最新のスキーマを取得

**参考ドキュメント:**
- [Microsoft Learn: Dataverseに接続する方法](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- [Microsoft Learn: テーブルメタデータを取得する方法](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/get-table-metadata)

### **Step 1: テーブル論理名の確認**

テーブルの論理名は以下の方法で確認できます:

#### **Power Apps Maker Portal で確認**
```bash
# 1. Power Apps Maker Portal (make.powerapps.com) にアクセス
# 2. データ → テーブル → 対象テーブルを選択
# 3. テーブルのプロパティで「論理名」を確認
```

**論理名の例:**
- `systemuser` - システムユーザー
- `account` - 取引先企業
- `contact` - 取引先担当者
- `geek_project_task` - カスタムテーブル (プレフィックス付き)

### **Step 2: pac code add-data-source でメタデータ自動取得**

公式CLIコマンドでテーブルを追加すると、自動的にメタデータが取得されます:

```bash
# Power Platform環境に認証
pac auth create --url https://your-environment.crm.dynamics.com

# Dataverseテーブルを追加（メタデータ自動取得）
pac code add-data-source -a dataverse -t geek_project_task

# ビルドして確認
npm run build
```

**このコマンドが実行すること:**
1. ✅ Dataverse EntityDefinitions APIに接続
2. ✅ テーブルスキーマをJSON形式で取得
3. ✅ フィールド定義（Attributes）を解析
4. ✅ Choice値（OptionSet）を抽出
5. ✅ TypeScript型定義を自動生成
6. ✅ CRUD操作用サービスクラスを生成

### **Step 3: 生成されたTypeScript型定義の確認**

`pac code add-data-source` が自動生成した型定義ファイル例:

**generated/models/GeekProjectTaskModel.ts (自動生成):**
```typescript
/**
 * Dataverse テーブル型定義 (自動生成)
 * 
 * テーブル論理名: geek_project_task
 * 生成方法: pac code add-data-source コマンド
 * 生成元: Dataverse EntityDefinitions API
 */

// メインエンティティインターフェース
export interface GeekProjectTask {
  // 主キー (GUID)
  geek_project_taskid?: string;
  
  // 基本フィールド
  geek_name: string;                    // 名前 (必須)
  geek_description?: string;            // 説明 (任意)
  
  // Choice (選択肢) フィールド
  geek_priority?: number;               // 優先度
  geek_status?: number;                 // 状態  
  geek_category?: number;               // カテゴリ
  
  // 日付フィールド
  geek_duedate?: Date;                  // 期限日
  createdon?: Date;                     // 作成日時 (システム)
  modifiedon?: Date;                    // 更新日時 (システム)
  
  // ルックアップフィールド (他テーブルとの関連)
  _geek_projectid_value?: string;       // プロジェクトへの参照
  _ownerid_value?: string;              // 所有者
}
```

**generated/services/GeekProjectTaskService.ts (自動生成):**
```typescript
/**
 * Dataverse CRUD操作サービス (自動生成)
 * 
 * 生成方法: pac code add-data-source コマンド
 */

import type { IOperationResult } from '@microsoft/power-apps/data';
import type { GeekProjectTask } from '../models/GeekProjectTaskModel';
import { getClient } from '@microsoft/power-apps';

export class GeekProjectTaskService {
  /**
   * 全レコード取得
   */
  static async getAll(options?: {
    select?: string[];
    filter?: string;
    orderBy?: string;
    top?: number;
  }): Promise<IOperationResult<GeekProjectTask[]>> {
    const client = getClient();
    return await client.retrieveMultipleRecords('geek_project_task', options);
  }

  /**
   * 単一レコード取得
   */
  static async getById(id: string): Promise<IOperationResult<GeekProjectTask>> {
    const client = getClient();
    return await client.retrieveRecord('geek_project_task', id);
  }

  /**
   * レコード作成
   */
  static async create(record: Partial<GeekProjectTask>): Promise<IOperationResult<string>> {
    const client = getClient();
    return await client.createRecord('geek_project_task', record);
  }

  /**
   * レコード更新
   */
  static async update(id: string, record: Partial<GeekProjectTask>): Promise<IOperationResult<void>> {
    const client = getClient();
    return await client.updateRecord('geek_project_task', id, record);
  }

  /**
   * レコード削除
   */
  static async delete(id: string): Promise<IOperationResult<void>> {
    const client = getClient();
    return await client.deleteRecord('geek_project_task', id);
  }

  /**
   * メタデータ取得（ランタイム）
   * 
   * 参考: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/get-table-metadata
   */
  static async getMetadata(options?: {
    schema?: { 
      columns?: 'all' | string[];
      relationships?: boolean;
    }
  }): Promise<IOperationResult<any>> {
    const client = getClient();
    return await client.getEntityMetadata('geek_project_task', options);
  }
}
```

**Choice値の使用例:**

```typescript
// Choice値のマッピング (フォーム用)
export const TaskPriorityReverseMap: Record<string, TaskPriority> = {
  'Critical': 0,
  'High': 1,
  'Medium': 2,
  'Low': 3
};

export const TaskStatusReverseMap: Record<string, TaskStatus> = {
  'Completed': 0,
  'InProgress': 1,
  'NotStarted': 2
};

export const TaskCategoryReverseMap: Record<string, TaskCategory> = {
  'Planning': 0,
  'Development': 1,
  'Testing': 2,
  'Deployment': 3
};

// 新規作成用のインターフェース (システムフィールド除外)
export interface CreateProjectTaskRequest {
  geek_name: string;
  geek_description?: string;
  geek_priority: TaskPriority;
  geek_status: TaskStatus;
  geek_category: TaskCategory;
  geek_duedate?: Date;
  geek_projectid?: string;
  ownerid: string;
}

// 更新用のインターフェース (部分更新対応)
export interface UpdateProjectTaskRequest {
  geek_name?: string;
  geek_description?: string;
  geek_priority?: TaskPriority;
  geek_status?: TaskStatus;
  geek_category?: TaskCategory;
  geek_duedate?: Date;
}
```

### **Step 4: Dataverse サービスクラスの生成と接続**

#### **4.1 pac code コマンドでサービスクラスを生成**

```bash
# Power Apps で Dataverse 接続を作成後、サービスクラスを生成
pac code add-data-source -a "shared_commondataserviceforapps" -c "接続ID"

# 以下のファイルが自動生成されます:
# - src/generated/services/{テーブル名}Service.ts
# - src/generated/models/{テーブル名}Model.ts
```

#### **4.2 自動生成される Dataverse サービスクラスの構造**

**例: Geek_project_tasksService.ts (自動生成)**
```typescript
/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is autogenerated. Do not edit this file directly.
 */

import { dataSourcesInfo } from '../../../.power/appschemas/dataSourcesInfo';
import type { IOperationResult } from '@microsoft/power-apps/data';
import { getClient } from '@microsoft/power-apps/data';
import type { IGetOptions, IGetAllOptions } from '../models/CommonModels';
import type { Geek_project_tasks } from '../models/Geek_project_tasksModel';

export class Geek_project_tasksService {
  // ⚠️ 重要: dataSourceName はテーブルの論理名（小文字・アンダースコア）
  private static readonly dataSourceName = 'geek_project_tasks';

  private static readonly client = getClient(dataSourcesInfo);

  /**
   * レコード作成
   * @param record 新規レコードデータ（ID以外）
   * @returns 作成されたレコード
   */
  public static async create(
    record: Omit<Geek_project_tasks, 'geek_project_taskid'>
  ): Promise<IOperationResult<Geek_project_tasks>> {
    const result = await Geek_project_tasksService.client.createRecordAsync<
      Omit<Geek_project_tasks, 'geek_project_taskid'>, 
      Geek_project_tasks
    >(
      Geek_project_tasksService.dataSourceName,
      record
    );
    return result;
  }

  /**
   * レコード更新
   * @param id レコードID
   * @param changedFields 変更するフィールド（部分更新）
   * @returns 更新されたレコード
   */
  public static async update(
    id: string, 
    changedFields: Partial<Omit<Geek_project_tasks, 'geek_project_taskid'>>
  ): Promise<IOperationResult<Geek_project_tasks>> {
    const result = await Geek_project_tasksService.client.updateRecordAsync<
      Partial<Omit<Geek_project_tasks, 'geek_project_taskid'>>, 
      Geek_project_tasks
    >(
      Geek_project_tasksService.dataSourceName,
      id.toString(),
      changedFields
    );
    return result;
  }

  /**
   * レコード削除
   * @param id レコードID
   */
  public static async delete(id: string): Promise<void> {
    await Geek_project_tasksService.client.deleteRecordAsync(
      Geek_project_tasksService.dataSourceName,
      id.toString()
    );
  }

  /**
   * 単一レコード取得
   * @param id レコードID
   * @param options 取得オプション（select, expand等）
   * @returns レコードデータ
   */
  public static async get(
    id: string, 
    options?: IGetOptions
  ): Promise<IOperationResult<Geek_project_tasks>> {
    const result = await Geek_project_tasksService.client.retrieveRecordAsync<Geek_project_tasks>(
      Geek_project_tasksService.dataSourceName,
      id.toString(),
      options
    );
    return result;
  }

  /**
   * 複数レコード取得
   * @param options 取得オプション（filter, select, orderBy, top等）
   * @returns レコード配列
   */
  public static async getAll(
    options?: IGetAllOptions
  ): Promise<IOperationResult<Geek_project_tasks[]>> {
    const result = await Geek_project_tasksService.client.retrieveMultipleRecordsAsync<Geek_project_tasks>(
      Geek_project_tasksService.dataSourceName,
      options
    );
    return result;
  }
}
```

**重要なポイント:**
- ✅ クラス名: `{テーブル名}Service` (例: `GeekProjectTaskService`)
- ✅ dataSourceName: テーブルの論理名（小文字・アンダースコア）
- ✅ すべてのメソッドが `static` で定義される
- ✅ TypeScript型定義が自動生成される
- ✅ CRUD操作が完備: `create`, `update`, `delete`, `getById`, `getAll`
- ✅ メタデータ取得: `getMetadata` メソッドでランタイムにスキーマ情報を取得可能

#### **4.3 テーブルスキーマ名の確認方法**

**公式APIでメタデータを取得:**

```typescript
import { GeekProjectTaskService } from './generated/services/GeekProjectTaskService';

/**
 * テーブルメタデータをランタイムで取得
 * 
 * 参考: https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/get-table-metadata
 */
async function inspectTableSchema() {
  const result = await GeekProjectTaskService.getMetadata({
    schema: { 
      columns: 'all',      // 全フィールド情報を取得
      relationships: true  // リレーションシップ情報も取得
    }
  });

  if (result.isSuccess && result.value) {
    const metadata = result.value;
    
    console.log('テーブル論理名:', metadata.LogicalName);
    console.log('プライマリキー:', metadata.PrimaryIdAttribute);
    console.log('スキーマ名:', metadata.SchemaName);
    
    // フィールド一覧
    metadata.Attributes?.forEach(attr => {
      console.log(`- ${attr.LogicalName}: ${attr.AttributeType}`);
    });
  }
}
```

**スキーマ名のルール:**
- パブリッシャープレフィックス + アンダースコア + テーブル名
- 例: `geek_project_task` → プレフィックス `geek`, テーブル名 `project_task`
- サービスクラス名: `GeekProjectTaskService`
- dataSourceName: `geek_project_task` (小文字)

#### **4.4 カスタムフックでサービスクラスをラップ**

**src/hooks/useDataverseProjectTasks.ts の作成:**
**src/hooks/useDataverseProjectTasks.ts の作成:**
```typescript
import { useState, useCallback } from 'react';
import { Geek_project_tasksService } from '../generated/services/Geek_project_tasksService';
import type { Geek_project_tasks } from '../generated/models/Geek_project_tasksModel';
import type { 
  CreateProjectTaskRequest, 
  UpdateProjectTaskRequest,
  TaskPriority,
  TaskStatus,
  TaskCategory
} from '@/types/dataverse';

export const useDataverseProjectTasks = () => {
  const [tasks, setTasks] = useState<Geek_project_tasks[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 全タスク取得
  const getAllTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await Geek_project_tasksService.getAll({
        select: [
          'geek_project_taskid',
          'geek_name', 
          'geek_description',
          'geek_priority',
          'geek_status',
          'geek_category',
          'geek_duedate',
          'createdon',
          'modifiedon',
          'geek_projectid',
          'ownerid'
        ],
        orderBy: 'createdon desc'
      });
      
      if (result.isSuccess && result.value) {
        setTasks(result.value);
        return result.value;
      } else {
        throw new Error('タスク一覧の取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse getAllTasks error:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 単一タスク取得
  const getTask = useCallback(async (taskId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await Geek_project_tasksService.get(taskId);
      
      if (result.isSuccess && result.value) {
        return result.value;
      } else {
        throw new Error('タスクの取得に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse getTask error:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // 新規タスク作成  
  const createTask = useCallback(async (taskData: CreateProjectTaskRequest) => {
    try {
      setLoading(true);
      setError(null);
      
      // Choice値の検証
      validateChoiceValues(taskData);
      
      // IDフィールドを除外してレコード作成
      const recordData: Omit<Geek_project_tasks, 'geek_project_taskid'> = {
        geek_name: taskData.geek_name,
        geek_description: taskData.geek_description,
        geek_priority: taskData.geek_priority,
        geek_status: taskData.geek_status,
        geek_category: taskData.geek_category,
        geek_duedate: taskData.geek_duedate,
        geek_projectid: taskData.geek_projectid,
        ownerid: taskData.ownerid
      };
      
      const result = await Geek_project_tasksService.create(recordData);
      
      if (result.isSuccess && result.value) {
        // タスク一覧を再取得
        await getAllTasks();
        return result.value;
      } else {
        throw new Error('タスクの作成に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse createTask error:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAllTasks]);

  // タスク更新
  const updateTask = useCallback(async (
    taskId: string, 
    updateData: UpdateProjectTaskRequest
  ) => {
    try {
      setLoading(true);
      setError(null);
      
      // Choice値の検証（更新時）
      if (updateData.geek_priority !== undefined || 
          updateData.geek_status !== undefined || 
          updateData.geek_category !== undefined) {
        validateChoiceValues(updateData);
      }
      
      const result = await Geek_project_tasksService.update(taskId, updateData);
      
      if (result.isSuccess && result.value) {
        // タスク一覧を再取得
        await getAllTasks();
        return result.value;
      } else {
        throw new Error('タスクの更新に失敗しました');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse updateTask error:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAllTasks]);

  // タスク削除
  const deleteTask = useCallback(async (taskId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      await Geek_project_tasksService.delete(taskId);
      
      // タスク一覧を再取得
      await getAllTasks();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Dataverse deleteTask error:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getAllTasks]);

  // Choice値の検証関数
  const validateChoiceValues = (data: CreateProjectTaskRequest | UpdateProjectTaskRequest) => {
    if ('geek_priority' in data && data.geek_priority !== undefined && 
        ![0, 1, 2, 3].includes(data.geek_priority)) {
      throw new Error(`無効な優先度: ${data.geek_priority}`);
    }
    if ('geek_status' in data && data.geek_status !== undefined && 
        ![0, 1, 2].includes(data.geek_status)) {
      throw new Error(`無効な状態: ${data.geek_status}`);
    }
    if ('geek_category' in data && data.geek_category !== undefined && 
        ![0, 1, 2, 3].includes(data.geek_category)) {
      throw new Error(`無効なカテゴリ: ${data.geek_category}`);
    }
  };

  return {
    tasks,
    loading,
    error,
    getAllTasks,
    getTask,
    createTask,
    updateTask,
    deleteTask
  };
};
```

**主要なポイント:**
- ✅ **自動生成サービスクラス** (`Geek_project_tasksService`) を使用
- ✅ **IOperationResult** の `isSuccess` でエラーチェック
- ✅ **Choice フィールドの検証** を実装
- ✅ **部分更新** に対応（updateメソッド）
- ✅ **エラーハンドリング** を各操作で実装

### **Step 5: UIコンポーネントでの使用**

**src/pages/ProjectTasksPage.tsx の作成:**
```typescript
import React, { useEffect, useState } from 'react';
import { useDataverseProjectTasks } from '../hooks/useDataverseProjectTasks';
import type { Geek_project_tasks } from '../generated/models/Geek_project_tasksModel';
import type { CreateProjectTaskRequest, UpdateProjectTaskRequest } from '@/types/dataverse';
import { 
  TaskPriorityMap, 
  TaskStatusMap, 
  TaskCategoryMap,
  TaskPriorityReverseMap,
  TaskStatusReverseMap,
  TaskCategoryReverseMap
} from '@/types/dataverse';

export const ProjectTasksPage: React.FC = () => {
  const { 
    tasks, 
    loading, 
    error, 
    getAllTasks, 
    createTask, 
    updateTask, 
    deleteTask 
  } = useDataverseProjectTasks();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Geek_project_tasks | null>(null);

  // 初期読み込み
  useEffect(() => {
    getAllTasks();
  }, [getAllTasks]);

  // タスク作成処理
  const handleCreateTask = async (formData: CreateProjectTaskRequest) => {
    try {
      await createTask(formData);
      setIsCreateModalOpen(false);
    } catch (err) {
      console.error('タスク作成エラー:', err);
    }
  };

  // タスク更新処理
  const handleUpdateTask = async (taskId: string, updateData: UpdateProjectTaskRequest) => {
    try {
      await updateTask(taskId, updateData);
      setEditingTask(null);
    } catch (err) {
      console.error('タスク更新エラー:', err);
    }
  };

  // タスク削除処理
  const handleDeleteTask = async (taskId: string) => {
    if (confirm('このタスクを削除してもよろしいですか?')) {
      try {
        await deleteTask(taskId);
      } catch (err) {
        console.error('タスク削除エラー:', err);
      }
    }
  };

  // ステータス変更処理
  const handleStatusChange = async (task: Geek_project_tasks, newStatus: number) => {
    try {
      await updateTask(task.geek_project_taskid, { geek_status: newStatus });
    } catch (err) {
      console.error('ステータス変更エラー:', err);
    }
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading tasks...</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Project Tasks</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + New Task
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* タスク一覧 */}
      <div className="grid gap-4">
        {tasks.map((task) => (
          <div key={task.geek_project_taskid} className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-xl font-semibold">{task.geek_name}</h3>
                {task.geek_description && (
                  <p className="text-gray-600 mt-2">{task.geek_description}</p>
                )}
                
                {/* Choice フィールド表示 */}
                <div className="flex gap-2 mt-4">
                  {/* 優先度バッジ */}
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    task.geek_priority === 0 ? 'bg-red-100 text-red-800' :
                    task.geek_priority === 1 ? 'bg-orange-100 text-orange-800' :
                    task.geek_priority === 2 ? 'bg-yellow-100 text-yellow-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {TaskPriorityMap[task.geek_priority]}
                  </span>

                  {/* ステータスバッジ */}
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    task.geek_status === 0 ? 'bg-green-100 text-green-800' :
                    task.geek_status === 1 ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {TaskStatusMap[task.geek_status]}
                  </span>

                  {/* カテゴリバッジ */}
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                    {TaskCategoryMap[task.geek_category]}
                  </span>
                </div>

                {/* 期限表示 */}
                {task.geek_duedate && (
                  <p className="text-sm text-gray-500 mt-2">
                    期限: {new Date(task.geek_duedate).toLocaleDateString('ja-JP')}
                  </p>
                )}
              </div>

              {/* アクションボタン */}
              <div className="flex gap-2 ml-4">
                {/* ステータス変更 */}
                {task.geek_status !== 0 && (
                  <button
                    onClick={() => handleStatusChange(task, 0)}
                    disabled={loading}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                  >
                    完了
                  </button>
                )}
                
                {/* 編集 */}
                <button
                  onClick={() => setEditingTask(task)}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  編集
                </button>
                
                {/* 削除 */}
                <button
                  onClick={() => handleDeleteTask(task.geek_project_taskid)}
                  disabled={loading}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {tasks.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <p>タスクがありません</p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            最初のタスクを作成
          </button>
        </div>
      )}
    </div>
  );
};
```

**主要なポイント:**
- ✅ **自動生成された型定義** を使用 (`Geek_project_tasks`)
- ✅ **Choice マッピング** でユーザーフレンドリーな表示
- ✅ **CRUD 操作** をすべて実装
- ✅ **エラー表示** と **Loading 状態** を適切に管理
- ✅ **Dataverseスキーマ** に完全準拠

#### **Choice値に対応したフォームコンポーネント**

**src/components/TaskForm.tsx の作成:**
```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { 
  CreateProjectTaskRequest, 
  UpdateProjectTaskRequest,
  TaskPriority,
  TaskStatus, 
  TaskCategory
} from '@/types/dataverse';
import { 
  TaskPriorityLabels, 
  TaskStatusLabels, 
  TaskCategoryLabels 
} from '@/types/dataverse';

interface TaskFormProps {
  onSubmit: (data: CreateProjectTaskRequest | UpdateProjectTaskRequest) => Promise<void>;
  initialData?: Partial<CreateProjectTaskRequest>;
  isEdit?: boolean;
}

export const TaskForm: React.FC<TaskFormProps> = ({ 
  onSubmit, 
  initialData = {}, 
  isEdit = false 
}) => {
  const [formData, setFormData] = useState({
    geek_name: initialData.geek_name || '',
    geek_description: initialData.geek_description || '',
    geek_priority: initialData.geek_priority ?? 1, // Default: High
    geek_status: initialData.geek_status ?? 2,     // Default: NotStarted
    geek_category: initialData.geek_category ?? 0, // Default: Planning
    geek_duedate: initialData.geek_duedate ? new Date(initialData.geek_duedate).toISOString().split('T')[0] : '',
    ownerid: initialData.ownerid || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      geek_duedate: formData.geek_duedate ? new Date(formData.geek_duedate) : undefined
    };

    await onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">タスク名 *</label>
        <Input
          value={formData.geek_name}
          onChange={(e) => setFormData({ ...formData, geek_name: e.target.value })}
          required
          placeholder="タスク名を入力"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">説明</label>
        <Textarea
          value={formData.geek_description}
          onChange={(e) => setFormData({ ...formData, geek_description: e.target.value })}
          placeholder="タスクの詳細を入力"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">優先度</label>
          <Select
            value={formData.geek_priority.toString()}
            onValueChange={(value) => setFormData({ ...formData, geek_priority: parseInt(value) as TaskPriority })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TaskPriorityLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">状態</label>
          <Select
            value={formData.geek_status.toString()}
            onValueChange={(value) => setFormData({ ...formData, geek_status: parseInt(value) as TaskStatus })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TaskStatusLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">カテゴリ</label>
          <Select
            value={formData.geek_category.toString()}
            onValueChange={(value) => setFormData({ ...formData, geek_category: parseInt(value) as TaskCategory })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TaskCategoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">期限日</label>
        <Input
          type="date"
          value={formData.geek_duedate}
          onChange={(e) => setFormData({ ...formData, geek_duedate: e.target.value })}
        />
      </div>

      <Button type="submit" className="w-full">
        {isEdit ? 'タスクを更新' : 'タスクを作成'}
      </Button>
    </form>
  );
};
```

### **📋 Dataverse統合のベストプラクティス**

> **📘 Dataverse実装リファレンス**
> より詳細な実装例、スキーマ取得方法、トラブルシューティングについては以下を参照してください:
> - **[Lookupフィールド実装ガイド](./docs/LOOKUP_FIELD_GUIDE.md)** - Lookup完全実装
> - **[Dataverseスキーマリファレンス](./docs/DATAVERSE_SCHEMA_REFERENCE.md)** - スキーマ定義とChoice値
> - **[スキーマ取得方法](./docs/HOW_TO_GET_DATAVERSE_SCHEMA.md)** - 5つの取得方法
> - **[Dataverseトラブルシューティング](./docs/DATAVERSE_TROUBLESHOOTING.md)** - よくある問題と解決法

#### **スキーマ名の取得とサービスクラス生成**

**1. 公式APIでテーブル情報を取得:**
```bash
# Power Platform環境に認証
pac auth create --url https://your-environment.crm.dynamics.com

# Dataverseテーブルを追加（メタデータ自動取得）
pac code add-data-source -a dataverse -t geek_project_task

# 生成されるファイル:
# generated/models/GeekProjectTaskModel.ts
# generated/services/GeekProjectTaskService.ts
```

**2. ランタイムでメタデータ確認:**
```typescript
// getMetadata APIを使用してスキーマ情報を取得
const result = await GeekProjectTaskService.getMetadata({
  schema: { columns: 'all' }
});

if (result.isSuccess && result.value) {
  console.log('提供される情報:');
  console.log('- Schema name:', result.value.SchemaName);
  console.log('- Logical name:', result.value.LogicalName);
  console.log('- Primary ID field:', result.value.PrimaryIdAttribute);
  console.log('- 全フィールド一覧:', result.value.Attributes);
  console.log('- Choice値の定義:', result.value.Attributes?.filter(a => a.AttributeType === 'Picklist'));
}
```

**3. サービスクラスの命名規則:**

公式APIで自動生成されるサービスクラスは、以下の規則に従います:

- **クラス名**: `{TableName}Service` (PascalCase、単数形)
  - 例: `GeekProjectTaskService`
- **dataSourceName**: `{table_logical_name}` (小文字、アンダースコア、単数形)
  - 例: `geek_project_task`
- **プライマリキー**: `{table_logical_name}id`
  - 例: `geek_project_taskid`

#### **テーブルスキーマ名のプレースホルダー**

開発時は以下のプレースホルダーを使用し、実際のスキーマ名に置き換えてください:

```typescript
// ❌ プレースホルダー（開発時）
import { {Prefix}_{TableName}Service } from '../generated/services/{Prefix}_{TableName}Service';
import type { {Prefix}_{TableName} } from '../generated/models/{Prefix}_{TableName}Model';

// サービスクラス使用
const result = await {Prefix}_{TableName}Service.getAll();

// ✅ 実際の例（Geek_project_tasksの場合）
import { Geek_project_tasksService } from '../generated/services/Geek_project_tasksService';
import type { Geek_project_tasks } from '../generated/models/Geek_project_tasksModel';

// サービスクラス使用
const result = await Geek_project_tasksService.getAll();
```

**フィールド名のプレースホルダー:**
```typescript
// プレースホルダー形式
{prefix}_{fieldname}     // 通常のフィールド
{prefix}_{tablename}id   // プライマリキー

// 実例（geek プレフィックス）
geek_name               // 名前フィールド
geek_description        // 説明フィールド
geek_priority           // 優先度（Choice）
geek_project_taskid     // プライマリキー
```

#### **Choice フィールドの型マッピング**

```typescript
// GitHub Copilot が取得した Choice 値
export type TaskPriority = 0 | 1 | 2 | 3;
export type TaskStatus = 0 | 1 | 2;
export type TaskCategory = 0 | 1 | 2 | 3;

// 表示名マッピング（UIで使用）
export const TaskPriorityMap: Record<TaskPriority, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low'
};

// 逆引きマッピング（フォーム送信時に使用）
export const TaskPriorityReverseMap: Record<string, TaskPriority> = {
  'Critical': 0,
  'High': 1,
  'Medium': 2,
  'Low': 3
};
```

#### **必須チェックリスト: Dataverse接続前**

**開発者への依頼事項:**
- [ ] **テーブル論理名の確認**: Power Apps Maker Portal でテーブルの論理名を確認
- [ ] **環境認証**: `pac auth create` でPower Platform環境に接続
- [ ] **データソース追加**: `pac code add-data-source` でテーブル追加とメタデータ自動取得
- [ ] **TypeScript型定義確認**: 自動生成された型定義を確認
- [ ] **Choice値確認**: `getMetadata` APIで実際のChoice値を確認
- [ ] **カスタムフック作成**: サービスクラスをラップ
- [ ] **UIフォーム更新**: Choice値をドロップダウンで選択可能なフォーム
- [ ] **型安全性確認**: TypeScriptコンパイルエラー0件
- [ ] **統合テスト**: モックデータ→リアルデータ切り替えテスト

### **⚠️ よくある問題と対処法**

#### **1. Choice値の不一致エラー**
```
❌ エラー例: "Invalid option value '4' for attribute 'geek_priority'"
✅ 対処法: getMetadata APIで正確なChoice値を再取得・更新
```

#### **2. 必須フィールドエラー**  
```
❌ エラー例: "Required attribute 'geek_name' is missing"
✅ 対処法: getMetadata APIでテーブルの必須フィールドを確認・フォーム必須設定
```

#### **3. データ型不一致エラー**
```
❌ エラー例: "Date format error for 'geek_duedate'"
✅ 対処法: ISO8601形式（YYYY-MM-DDTHH:mm:ssZ）での日付送信
```

#### **4. dataSourceName エラー**
```
❌ エラー例: "Data source '______' not found"
✅ 対処法: サービスクラスの dataSourceName を dataSourcesInfo.ts の実際の名前に修正
```

#### **5. サービスクラスが生成されない**
```
❌ 問題: pac code add-data-source 実行後もファイルが生成されない
✅ 対処法: 
  - Power Apps で接続が正しく作成されているか確認
  - 接続IDが正しいか確認
  - pac auth list で認証状態を確認
```

この手順により、Dataverseとの接続で発生する一般的なスキーマ不整合エラーを事前に防止し、安全にモックデータからリアルデータへ移行できます。

### **📋 必須チェックリスト: Dataverse接続前**

#### **開発者への依頼事項**
- [ ] **テーブル論理名の確認**: Power Apps Maker Portal でテーブルの論理名を確認
- [ ] **GitHub Copilot にメタデータ取得を依頼**: テーブル論理名を伝えてスキーマ情報を取得
- [ ] **TypeScript型定義作成**: GitHub Copilot が生成した型定義を確認・適用
- [ ] **Choice値マッピング**: GitHub Copilot が生成したマッピングを確認
- [ ] **CRUD操作更新**: 実際のスキーマに対応したDataverseサービス実装
- [ ] **UIフォーム更新**: Choice値をドロップダウンで選択可能なフォーム
- [ ] **型安全性確認**: TypeScriptコンパイルエラー0件
- [ ] **統合テスト**: モックデータ→リアルデータ切り替えテスト

### **⚠️ よくある問題と対処法**

#### **1. Choice値の不一致エラー**
```
❌ エラー例: "Invalid option value '4' for attribute 'geek_priority'"
✅ 対処法: GitHub Copilot に正確なChoice値を再取得依頼・更新
```

#### **2. 必須フィールドエラー**  
```
❌ エラー例: "Required attribute 'geek_name' is missing"
✅ 対処法: GitHub Copilot にテーブルの必須フィールドを確認・フォーム必須設定
```

#### **3. データ型不一致エラー**
```
❌ エラー例: "Date format error for 'geek_duedate'"
✅ 対処法: ISO8601形式（YYYY-MM-DDTHH:mm:ssZ）での日付送信
```

この手順により、Dataverseとの接続で発生する一般的なスキーマ不整合エラーを事前に防止し、安全にモックデータからリアルデータへ移行できます。

### � **Dataverse CRUD操作実装パターン**

#### **セットアップ: SDK初期化の確認**

```typescript
// src/App.tsx - Power Apps SDK初期化待機
import { useEffect, useState } from 'react';
import { initialize } from '@microsoft/power-apps';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Power Apps SDK の非同期初期化
    const init = async () => {
      try {
        await initialize(); // SDK初期化完了まで待機
        setIsInitialized(true); // データ操作の準備完了
      } catch (err) {
        setError('Power Apps SDK の初期化に失敗しました');
        setLoading(false);
      }
    };

    init();
  }, []);

  // SDK初期化完了まではデータ操作を無効化
  useEffect(() => {
    if (!isInitialized) return;
    // ここでデータ読み取りロジックを配置
    setLoading(false);
  }, [isInitialized]);

  if (loading) return <div>Power Apps SDK 初期化中...</div>;
  if (error) return <div>エラー: {error}</div>;

  return (
    <div>
      {/* アプリのメインコンテンツ */}
    </div>
  );
}
```

#### **インポートと型定義**

```typescript
// 生成されたサービスとモデルのインポート
import { AccountsService } from './generated/services/AccountsService';
import type { Accounts } from './generated/models/AccountsModel';
```

#### **Create (作成) 操作**

```typescript
// src/hooks/useAccounts.ts
import { useState } from 'react';
import { AccountsService } from '../generated/services/AccountsService';
import type { Accounts } from '../generated/models/AccountsModel';

export const useAccounts = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規取引先企業作成
  const createAccount = async (accountData: Partial<Accounts>) => {
    try {
      setLoading(true);
      setError(null);

      // 読み取り専用フィールドを除外して作成
      const newAccount = {
        name: accountData.name,
        accountnumber: accountData.accountnumber,
        telephone1: accountData.telephone1,
        address1_city: accountData.address1_city,
        statecode: 0, // アクティブ状態
        // 注意: accountid, ownerid などの自動生成フィールドは含めない
      };

      const result = await AccountsService.create(
        newAccount as Omit<Accounts, 'accountid'>
      );

      if (result.data) {
        console.log('取引先企業が作成されました:', result.data);
        return result.data;
      }
    } catch (err) {
      const errorMessage = '取引先企業の作成に失敗しました';
      console.error(errorMessage, err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { createAccount, loading, error };
};
```

#### **Read (読み取り) 操作**

```typescript
// 単一レコード取得
const getAccount = async (accountId: string) => {
  try {
    const result = await AccountsService.get(accountId);
    if (result.data) {
      console.log('取引先企業を取得:', result.data);
      return result.data;
    }
  } catch (err) {
    console.error('取引先企業の取得に失敗:', err);
    throw err;
  }
};

// 複数レコード取得（フィルタ・ソート対応）
const getAllAccounts = async () => {
  try {
    const options = {
      select: ['name', 'accountnumber', 'address1_city', 'telephone1'], // 必要なフィールドのみ
      filter: "address1_country eq 'Japan'", // ODataフィルター
      orderBy: ['name asc'], // ソート指定
      top: 100, // 取得上限
      maxPageSize: 50, // ページサイズ
    };

    const result = await AccountsService.getAll(options);
    if (result.data) {
      console.log(`${result.data.length}件の取引先企業を取得`);
      return result.data;
    }
    return [];
  } catch (err) {
    console.error('取引先企業一覧の取得に失敗:', err);
    return [];
  }
};
```

#### **Update (更新) 操作**

```typescript
// 取引先企業の部分更新
const updateAccount = async (accountId: string, changes: Partial<Accounts>) => {
  try {
    setLoading(true);
    
    // 変更されたフィールドのみを含める（重要）
    const updateData = {
      name: changes.name,
      telephone1: changes.telephone1,
      // 変更されていないフィールドは含めない
    };

    await AccountsService.update(accountId, updateData);
    console.log('取引先企業が更新されました');
    
    return true;
  } catch (err) {
    console.error('取引先企業の更新に失敗:', err);
    setError('更新に失敗しました');
    throw err;
  } finally {
    setLoading(false);
  }
};
```

#### **Delete (削除) 操作**

```typescript
// 取引先企業の削除
const deleteAccount = async (accountId: string) => {
  try {
    setLoading(true);
    
    await AccountsService.delete(accountId);
    console.log('取引先企業が削除されました');
    
    return true;
  } catch (err) {
    console.error('取引先企業の削除に失敗:', err);
    setError('削除に失敗しました');
    throw err;
  } finally {
    setLoading(false);
  }
};
```

### 🎯 **サポートされている機能**

- ✅ **CRUD操作**: Create, Read, Update, Delete
- ✅ **委任クエリ**: Filter, Sort, Top
- ✅ **ページング**: maxPageSize, skipToken対応
- ✅ **ODataクエリ**: select, filter, orderBy

### ⚠️ **未サポート機能**

- ❌ **選択リストの表示名取得**: フォーマット済み値の取得
- ❌ **参照フィールド**: Lookup fields (多態的参照含む)
- ❌ **Dataverse アクション・関数**: カスタム処理
- ❌ **FetchXML**: 複雑なクエリ構文
- ❌ **代替キー**: プライマリキー以外でのアクセス

## 🔗 **Azure SQL Database 接続統合 (Microsoft 公式仕様)**

> **参考ドキュメント**: [Connect your code app to Azure SQL](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-azure-sql)

### 📋 **前提条件**

- **Azureサブスクリプション**: Azure SQL Database作成権限
- **Azure ポータル**: アクセス権限
- **Power Platform環境**: Code Apps有効化済み
- **開発環境**: Visual Studio Code + Node.js LTS
- **拡張機能**: Power Platform Tools + SQL Server (mssql)

### 🏗️ **Step 1: Azure SQL Server & Database セットアップ**

#### **1.1 Azure SQL Database 作成**

```bash
# Azure ポータル手順 (https://portal.azure.com/#create/Microsoft.AzureSQL):
# 1. 「SQL database」→「Single database」→「Create」
# 2. Resource Group: rg-codeapps-dev (新規作成)
# 3. Database Name: sqldb-codeapps-dev  
# 4. Server: sql-codeapps-dev (新規作成)
# 5. Authentication: Microsoft Entra-only authentication (推奨)
# 6. Compute: General Purpose - Serverless (開発用)
# 7. Networking: Public endpoint, Azure services = Yes, Client IP = Yes
```

#### **1.2 VS Code データベース接続**

```bash
# SQL Server (mssql) 拡張機能での接続:
# 1. Ctrl + Shift + X → SQL Server (mssql) インストール
# 2. Ctrl + Alt + D → 「+ Add Connection」
# 3. 「Browse Azure」→ Subscription → Server → Database 選択
# 4. Authentication: Microsoft Entra ID - Universal with MFA support
# 5. 「Sign In」→「Connect」
```

#### **1.3 サンプルスキーマ作成**

```sql
-- Projects テーブル・ストアドプロシージャ作成 (Ctrl + Shift + E で実行)

-- 既存オブジェクト削除 (安全な再実行)
IF OBJECT_ID('dbo.GetAllProjects', 'P') IS NOT NULL DROP PROCEDURE dbo.GetAllProjects;
IF OBJECT_ID('dbo.Projects', 'U') IS NOT NULL DROP TABLE dbo.Projects;
GO

-- Projects テーブル
CREATE TABLE [dbo].[Projects](
    [ProjectId] [int] IDENTITY(1,1) NOT NULL,
    [Name] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [StartDate] [date] NULL,
    [EndDate] [date] NULL,
    [Status] [nvarchar](50) NOT NULL DEFAULT ('Planning'),
    [Priority] [nvarchar](20) NOT NULL DEFAULT ('Medium'),
    [Budget] [decimal](18, 2) NULL,
    [ProjectManagerEmail] [nvarchar](255) NOT NULL,
    [CreatedBy] [nvarchar](255) NOT NULL,
    [CreatedDate] [datetime2](7) NOT NULL DEFAULT (getutcdate()),
    [IsActive] [bit] NOT NULL DEFAULT (1),
    CONSTRAINT [PK_Projects] PRIMARY KEY ([ProjectId])
);
GO

-- 制約追加
ALTER TABLE [dbo].[Projects] ADD CONSTRAINT [CK_Projects_Status] 
CHECK ([Status] IN ('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled'));
ALTER TABLE [dbo].[Projects] ADD CONSTRAINT [CK_Projects_Priority] 
CHECK ([Priority] IN ('Low', 'Medium', 'High', 'Critical'));
GO

-- ストアドプロシージャ: 全プロジェクト取得
CREATE PROCEDURE [dbo].[GetAllProjects]
AS
BEGIN
    SET NOCOUNT ON;
    SELECT [ProjectId], [Name], [Description], [StartDate], [EndDate],
           [Status], [Priority], [Budget], [ProjectManagerEmail],
           [CreatedBy], [CreatedDate], [IsActive]
    FROM [dbo].[Projects]
    WHERE [IsActive] = 1
    ORDER BY [CreatedDate] DESC;
END
GO

-- サンプルデータ
INSERT INTO [dbo].[Projects] ([Name], [Description], [StartDate], [EndDate], [Status], [Priority], [Budget], [ProjectManagerEmail], [CreatedBy]) VALUES
('Website Redesign', 'Complete redesign of company website with modern UI/UX', '2025-06-01', '2025-08-31', 'Active', 'High', 75000.00, 'sarah.johnson@company.com', 'admin@company.com'),
('Mobile App Development', 'Develop iOS and Android mobile application', '2025-07-01', '2025-12-31', 'Planning', 'Critical', 150000.00, 'mike.chen@company.com', 'admin@company.com'),
('Database Migration', 'Migrate legacy database to cloud', '2025-05-15', '2025-09-30', 'Active', 'Medium', 50000.00, 'lisa.williams@company.com', 'admin@company.com');
GO
```

### 🔗 **Step 2: Power Platform SQL Server 接続作成**

```bash
# Power Apps での接続作成:
# 1. https://make.powerapps.com/ → 環境選択
# 2. 「接続」→「+ 新しい接続」
# 3. 「SQL Server」選択
# 4. Authentication type: Microsoft Entra ID Integrated
# 5. 「作成」→ 認証承認
```

### ⚡ **Step 3: Code Apps ストアドプロシージャ統合**

```bash
# 接続ID確認
pac connection list

# ストアドプロシージャ追加
pac code add-data-source \
  -a "shared_sql" \
  -c "[接続ID]" \
  -d "sql-codeapps-dev.database.windows.net,sqldb-codeapps-dev" \
  -sp "dbo.GetAllProjects"

# 生成ファイル:
# src/generated/services/GetAllProjectsService.ts
# src/generated/models/GetAllProjectsModel.ts
```

### 🚀 **Step 4: React + Fluent UI 実装**

#### **4.1 依存関係インストール**

```bash
# React 18 + Fluent UI
npm install react@^18.0.0 react-dom@^18.0.0 @types/react@^18.0.0 @types/react-dom@^18.0.0
npm install @fluentui/react-components
```

#### **4.2 プロジェクトテーブル実装**

```typescript
// src/components/ProjectsTable.tsx - Azure SQL データ表示
import React, { useEffect, useState, useCallback } from 'react';
import {
  DataGrid, DataGridHeader, DataGridRow, DataGridHeaderCell,
  DataGridCell, DataGridBody, TableColumnDefinition,
  Spinner, MessageBar, Badge
} from '@fluentui/react-components';
import { GetAllProjectsService } from '../generated/services/GetAllProjectsService';

type ProjectItem = {
  ProjectId?: number;
  Name?: string;
  Status?: string;
  Priority?: string;
  StartDate?: string;
  EndDate?: string;
};

const COLUMNS: TableColumnDefinition<ProjectItem>[] = [
  {
    columnId: 'name',
    renderHeaderCell: () => 'プロジェクト名',
    renderCell: (item) => item.Name || '',
  },
  {
    columnId: 'status', 
    renderHeaderCell: () => 'ステータス',
    renderCell: (item) => <StatusBadge status={item.Status || ''} />,
  },
  {
    columnId: 'priority',
    renderHeaderCell: () => '優先度', 
    renderCell: (item) => <PriorityBadge priority={item.Priority || ''} />,
  },
];

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const getProps = () => {
    switch (status?.toLowerCase()) {
      case 'active': return { appearance: 'filled' as const, color: 'brand' as const };
      case 'completed': return { appearance: 'filled' as const, color: 'success' as const };
      default: return { appearance: 'outline' as const, color: 'subtle' as const };
    }
  };
  return <Badge {...getProps()}>{status}</Badge>;
};

const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const getProps = () => {
    switch (priority?.toLowerCase()) {
      case 'critical': return { appearance: 'filled' as const, color: 'danger' as const };
      case 'high': return { appearance: 'filled' as const, color: 'important' as const };
      default: return { appearance: 'outline' as const, color: 'subtle' as const };
    }
  };
  return <Badge {...getProps()}>{priority}</Badge>;
};

const ProjectsTable: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const result = await GetAllProjectsService.GetAllProjects();
      
      if (result.success && result.data?.ResultSets?.Table1) {
        const data = Array.isArray(result.data.ResultSets.Table1)
          ? result.data.ResultSets.Table1 as ProjectItem[]
          : [result.data.ResultSets.Table1] as ProjectItem[];
        setProjects(data);
      } else {
        setError('データの読み込みに失敗しました');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <Spinner label="読み込み中..." />;
  if (error) return <MessageBar intent="error">{error}</MessageBar>;
  if (projects.length === 0) return <MessageBar intent="info">データがありません</MessageBar>;

  return (
    <div style={{ padding: '20px' }}>
      <h2>Azure SQL プロジェクト ({projects.length}件)</h2>
      <DataGrid
        items={projects}
        columns={COLUMNS}
        sortable={true}
        getRowId={(item) => item.ProjectId?.toString() || 'unknown'}
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody>
          {({ item, rowId }) => (
            <DataGridRow key={rowId}>
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );
};

export default React.memo(ProjectsTable);
```

### 🧪 **Step 5: テスト・デプロイ**

```bash
# ローカルテスト
npm run dev
# 同意ダイアログで「許可」→ Azure SQL データ表示確認

# デプロイ
npm run build
pac code push
```

### ⚠️ **トラブルシューティング**

#### **接続エラー**
- **ファイアウォール**: Azure services = Yes, Client IP追加
- **認証**: Microsoft Entra ID - Universal with MFA
- **ネットワーク**: `Test-NetConnection -ComputerName "server.database.windows.net" -Port 1433`

#### **Runtime エラー**
- **接続確認**: Power Platform で SQL Server接続の動作確認
- **同意**: アプリ初回起動時の権限許可必須
- **環境**: ブラウザーとPower Platform環境の一致確認

### �📚 **追加リソース**

- **Azure SQLの詳細ガイド**: [コード アプリを Azure SQL に接続する](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-azure-sql)
- **Dataverse統合**: [コード アプリを Dataverse に接続する](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-dataverse)
- **PAC CLI リファレンス**: [pac code コマンド](https://learn.microsoft.com/ja-jp/power-platform/developer/cli/reference/code)

## 🌐 **外部API アクセスガイドライン**

### 🚨 **重要: Power Apps 環境での CORS 制限**

Power Apps Code Apps は Power Platform 環境で実行されるため、外部APIへの直接アクセスには **CORS (Cross-Origin Resource Sharing)** 制限があります。

#### **📋 アクセス方法の区分**

| アクセス対象 | 推奨方法 | 理由 |
|-------------|---------|------|
| **Power Platform コネクター** | ✅ 直接アクセス | CORS制限なし、認証自動処理 |
| **外部API (REST/GraphQL)** | ⚠️ CORSプロキシ経由 | Power Platform環境からの CORS 制限回避 |
| **Azure Functions/Logic Apps** | ✅ 直接アクセス可能 | 適切な CORS 設定により可能 |

### 🔄 **CORSプロキシ実装パターン**

#### **方式1: Azure Functions プロキシ (推奨)**

```typescript
// Azure Functions プロキシ実装例
// functions/api/external-proxy/index.ts
import { AzureFunction, Context, HttpRequest } from '@azure/functions';

const httpTrigger: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    // CORS ヘッダー設定
    context.res = {
        headers: {
            'Access-Control-Allow-Origin': 'https://apps.powerapps.com',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    };

    if (req.method === 'OPTIONS') {
        context.res.status = 200;
        return;
    }

    try {
        const targetUrl = req.query.url || req.body?.url;
        const method = req.query.method || req.body?.method || 'GET';
        
        const response = await fetch(targetUrl, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'PowerApps-CodeApp-Proxy/1.0',
                ...(req.body?.headers || {})
            },
            body: method !== 'GET' ? JSON.stringify(req.body?.data) : undefined
        });

        const data = await response.json();
        
        context.res = {
            ...context.res,
            status: response.status,
            body: data
        };
    } catch (error) {
        context.res = {
            ...context.res,
            status: 500,
            body: { error: 'プロキシエラー', details: error.message }
        };
    }
};

export default httpTrigger;
```

#### **方式2: Logic Apps HTTP トリガー**

```json
{
    "definition": {
        "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
        "triggers": {
            "manual": {
                "type": "Request",
                "kind": "Http",
                "inputs": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "url": { "type": "string" },
                            "method": { "type": "string" },
                            "headers": { "type": "object" },
                            "body": { "type": "object" }
                        }
                    }
                }
            }
        },
        "actions": {
            "HTTP_Request": {
                "type": "Http",
                "inputs": {
                    "method": "@triggerBody()['method']",
                    "uri": "@triggerBody()['url']",
                    "headers": "@triggerBody()['headers']",
                    "body": "@triggerBody()['body']"
                }
            },
            "Response": {
                "type": "Response",
                "inputs": {
                    "statusCode": "@outputs('HTTP_Request')['statusCode']",
                    "headers": {
                        "Access-Control-Allow-Origin": "https://apps.powerapps.com",
                        "Content-Type": "application/json"
                    },
                    "body": "@outputs('HTTP_Request')['body']"
                }
            }
        }
    }
}
```

### ⚡ **React 実装パターン**

#### **CORSプロキシ用カスタムフック**

```typescript
// src/hooks/useExternalApi.ts
import { useState, useCallback } from 'react';

interface ExternalApiConfig {
    proxyUrl: string; // Azure Functions または Logic Apps のエンドポイント
    timeout?: number;
}

interface ApiRequest {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    data?: any;
}

export const useExternalApi = (config: ExternalApiConfig) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const callApi = useCallback(async <T = any>(request: ApiRequest): Promise<T> => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(config.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: request.url,
                    method: request.method || 'GET',
                    headers: request.headers,
                    data: request.data
                }),
                signal: AbortSignal.timeout(config.timeout || 10000)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return data as T;
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '不明なエラー';
            setError(errorMessage);
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    }, [config.proxyUrl, config.timeout]);

    return { callApi, loading, error };
};
```

#### **使用例: 外部API連携コンポーネント**

```typescript
// src/components/ExternalApiExample.tsx
import React, { useState, useEffect } from 'react';
import { useExternalApi } from '../hooks/useExternalApi';

interface WeatherData {
    location: string;
    temperature: number;
    description: string;
}

const ExternalApiExample: React.FC = () => {
    const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
    
    // CORSプロキシ経由でのAPI接続
    const { callApi, loading, error } = useExternalApi({
        proxyUrl: 'https://your-function-app.azurewebsites.net/api/external-proxy',
        timeout: 15000
    });

    const fetchWeather = async () => {
        try {
            const data = await callApi<WeatherData>({
                url: 'https://api.openweathermap.org/data/2.5/weather',
                method: 'GET',
                headers: {
                    'X-API-Key': process.env.REACT_APP_WEATHER_API_KEY || ''
                }
            });
            setWeatherData(data);
        } catch (err) {
            console.error('天気データ取得エラー:', err);
        }
    };

    useEffect(() => {
        fetchWeather();
    }, []);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error}</div>;

    return (
        <div>
            <h3>外部API連携例</h3>
            {weatherData ? (
                <div>
                    <p>場所: {weatherData.location}</p>
                    <p>気温: {weatherData.temperature}°C</p>
                    <p>天気: {weatherData.description}</p>
                </div>
            ) : (
                <p>天気データがありません</p>
            )}
        </div>
    );
};

export default ExternalApiExample;
```

### 🛡️ **セキュリティ考慮事項**

#### **プロキシサーバーのセキュリティ**

- **認証**: Azure AD 認証によるプロキシアクセス制限
- **レート制限**: DOS 攻撃防止のためのリクエスト制限
- **ログ記録**: API アクセスログの記録・監視
- **APIキー保護**: プロキシサーバー側での機密情報管理

#### **実装例: セキュアプロキシ**

```typescript
// セキュリティ強化版プロキシ
const secureHttpTrigger: AzureFunction = async (context: Context, req: HttpRequest) => {
    // 1. Origin 検証
    const allowedOrigins = ['https://apps.powerapps.com', 'https://make.powerapps.com'];
    const origin = req.headers.origin;
    if (!allowedOrigins.includes(origin)) {
        context.res = { status: 403, body: 'Forbidden origin' };
        return;
    }

    // 2. レート制限 (Redis Cache利用)
    const clientId = req.headers['x-client-id'] || req.ip;
    const rateLimit = await checkRateLimit(clientId);
    if (!rateLimit.allowed) {
        context.res = { status: 429, body: 'Rate limit exceeded' };
        return;
    }

    // 3. URL ホワイトリスト検証
    const targetUrl = req.body?.url;
    const allowedDomains = ['api.openweathermap.org', 'jsonplaceholder.typicode.com'];
    const urlDomain = new URL(targetUrl).hostname;
    if (!allowedDomains.includes(urlDomain)) {
        context.res = { status: 403, body: 'Domain not allowed' };
        return;
    }

    // 4. API 実行・ログ記録
    try {
        const result = await executeApiRequest(req.body);
        await logApiRequest(clientId, targetUrl, result.status);
        
        context.res = {
            headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true'
            },
            body: result.data
        };
    } catch (error) {
        await logApiError(clientId, targetUrl, error);
        context.res = { status: 500, body: 'Internal server error' };
    }
};
```

          photo
        };
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        // フォールバック
        return {
          displayName: 'ゲストユーザー',
          userPrincipalName: 'guest@example.com',
        };
      }
    },
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
    retry: 2,
  });
};
```

### Azure SQL Server 統合 (Microsoft 公式)

#### 前提条件とセットアップ

**必要な前提条件:**
- Azure サブスクリプション
- Power Platform 環境 (Code Apps 有効化済み)
- Visual Studio Code + Power Platform Tools 拡張機能
- SQL Server (mssql) VS Code 拡張機能
- Node.js (LTS版)

#### Azure SQL Database セットアップ

**1. Azure SQL Server & Database 作成**
```bash
# Azure ポータルで以下を設定
リソースグループ: rg-codeapps-dev
サーバー名: sql-codeapps-dev
データベース名: sqldb-codeapps-dev
認証方法: Microsoft Entra ID のみ
接続方法: パブリック エンドポイント
ファイアウォール: Azure サービスアクセス許可 + クライアント IP 追加
```

**2. VS Code でのデータベーステーブル作成**
```sql
-- Projects テーブル作成 (Microsoft サンプル)
CREATE TABLE [dbo].[Projects](
    [ProjectId] [int] IDENTITY(1,1) NOT NULL,
    [Name] [nvarchar](255) NOT NULL,
    [Description] [nvarchar](max) NULL,
    [StartDate] [date] NULL,
    [EndDate] [date] NULL,
    [Status] [nvarchar](50) NOT NULL DEFAULT ('Planning'),
    [Priority] [nvarchar](20) NOT NULL DEFAULT ('Medium'),
    [Budget] [decimal](18, 2) NULL,
    [ProjectManagerEmail] [nvarchar](255) NOT NULL,
    [CreatedBy] [nvarchar](255) NOT NULL,
    [CreatedDate] [datetime2](7) NOT NULL DEFAULT (getutcdate()),
    [IsActive] [bit] NOT NULL DEFAULT (1),
    CONSTRAINT [PK_Projects] PRIMARY KEY ([ProjectId])
);

-- ストアドプロシージャ作成
CREATE PROCEDURE [dbo].[GetAllProjects]
AS
BEGIN
    SELECT [ProjectId], [Name], [Description], [StartDate], [EndDate],
           [Status], [Priority], [Budget], [ProjectManagerEmail],
           [CreatedBy], [CreatedDate], [IsActive]
    FROM [dbo].[Projects]
    WHERE [IsActive] = 1
    ORDER BY [CreatedDate] DESC;
END
```

#### Power Platform 統合

**3. SQL Server コネクション作成**
```bash
# Power Apps (make.powerapps.com) で実行
1. Connections → + New Connection → SQL Server
2. 認証タイプ: Microsoft Entra ID Integrated
3. Create & サインイン
```

**4. Code Apps プロジェクト初期化**
```bash
# Vite アプリ作成 (ポート3000固定)
mkdir C:\CodeApps -Force; cd C:\CodeApps
npm create vite@latest ProjectManagementApp -- --template react-ts
cd C:\CodeApps\ProjectManagementApp
npm install
npm i --save-dev @types/node

# vite.config.ts 設定 (ポート3000必須)
server: { host: "::", port: 3000 }

# Power Platform 認証 & 初期化
pac auth create
pac env select -env <ENVIRONMENT_URL>
pac code init --displayName "Project Management App"
npm install --save-dev @microsoft/power-apps

# package.json 更新
"dev": "start pac code run && vite"
```

**5. ストアドプロシージャをデータソースとして追加**
```bash
# コネクション ID 確認
pac connection list

# ストアドプロシージャを Code Apps に追加
pac code add-data-source -a "shared_sql" -c "[CONNECTION-ID]" \
  -d "[SQL-SERVER].database.windows.net,[DATABASE]" \
  -sp "dbo.GetAllProjects"

# 生成されるファイル:
# generated/services/GetAllProjectsService.ts
# generated/models/GetAllProjectsModel.ts
```

#### TypeScript 実装パターン

**6. React + Fluent UI データグリッド実装**
```typescript
// src/components/ProjectsTable.tsx
import { useEffect, useState, useCallback } from 'react';
import { DataGrid, Spinner, MessageBar } from '@fluentui/react-components';
import { GetAllProjectsService } from '../generated/services/GetAllProjectsService';

type ProjectItem = {
  ProjectId?: number;
  Name?: string;
  Description?: string;
  StartDate?: string;
  EndDate?: string;
  Status?: string;
  Priority?: string;
  Budget?: number;
  ProjectManagerEmail?: string;
};

export const ProjectsTable: React.FC = () => {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await GetAllProjectsService.GetAllProjects();
      
      if (result.success && result.data?.ResultSets?.Table1) {
        const projectsData = Array.isArray(result.data.ResultSets.Table1)
          ? result.data.ResultSets.Table1 as ProjectItem[]
          : [result.data.ResultSets.Table1] as ProjectItem[];
        setProjects(projectsData);
      } else {
        setError('データの読み込みに失敗しました');
      }
    } catch (error) {
      setError('予期しないエラーが発生しました');
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) return <Spinner label="データを読み込み中..." />;
  if (error) return <MessageBar intent="error">{error}</MessageBar>;

  return (
    <DataGrid items={projects} sortable>
      {/* DataGrid カラム実装 */}
    </DataGrid>
  );
};
```

**7. 依存関係とFluent UI統合**
```bash
# React 18 & Fluent UI インストール (必須)
npm install react@^18.0.0 react-dom@^18.0.0 \
  @types/react@^18.0.0 @types/react-dom@^18.0.0
npm install @fluentui/react-components
```

```typescript
// src/main.tsx - FluentProvider 追加
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import PowerProvider from './PowerProvider';
import ProjectsTable from './ProjectsTable';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PowerProvider>
      <FluentProvider theme={webLightTheme}>
        <ProjectsTable />
      </FluentProvider>
    </PowerProvider>
  </StrictMode>
);
```

#### 制約事項と注意点

**重要な制約:**
- **ポート3000固定**: Power SDK は開発時にポート3000を要求
- **tsconfig設定**: `verbatimModuleSyntax: false` が必要 (Power SDK 制限)
- **React 18必須**: Fluent UI との互換性のため
- **ストアドプロシージャ推奨**: 複雑なクエリはストアドプロシージャで実装
- **Microsoft Entra ID**: SQL Server 認証は Microsoft Entra ID のみサポート

**トラブルシューティング:**
```bash
# ポート3000が使用中の場合
netstat -ano | findstr :3000
taskkill /PID [PID] /F

# SQL接続エラーの場合
# 1. Azure SQL ファイアウォール設定確認
# 2. Microsoft Entra ID 認証設定確認  
# 3. VS Code SQL拡張機能で手動接続テスト
```

**SQL Server コネクション設定:**
```bash
# 1. Power Apps で SQL Server コネクション作成
# 2. PAC CLI でテーブル追加
pac code add-data-source -a "shared_sql" -c "connection-id" -t "[dbo].[Employees]" -d "server.database.windows.net,database"

# 生成されるファイル:
# /generated/services/EmployeesService.ts
# /generated/models/EmployeesModel.ts
```

**生成されたSQLサービスの使用:**
```typescript
// src/hooks/useEmployees.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EmployeesService } from '../generated/services/EmployeesService';
import type { Employees } from '../generated/models/EmployeesModel';

export const useEmployees = () => {
  const queryClient = useQueryClient();

  // 従業員一覧取得
  const getEmployees = async () => {
    try {
      const result = await EmployeesService.getall();
      return result || [];
    } catch (error) {
      console.error('Failed to fetch employees:', error);
      throw error;
    }
  };

  // 従業員作成
  const createEmployee = async (employeeData: Partial<Employees>) => {
    try {
      const result = await EmployeesService.create(employeeData);
      return result;
    } catch (error) {
      console.error('Failed to create employee:', error);
      throw error;
    }
  };

  // 従業員更新（変更フィールドのみ）
  const updateEmployee = async (id: string, changedFields: Partial<Employees>) => {
    try {
      await EmployeesService.update(id, changedFields);
    } catch (error) {
      console.error(`Failed to update employee ${id}:`, error);
      throw error;
    }
  };

  // 従業員削除
  const deleteEmployee = async (id: string) => {
    try {
      await EmployeesService.delete(id);
    } catch (error) {
      console.error(`Failed to delete employee ${id}:`, error);
      throw error;
    }
  };

  return {
    getEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee
  };
};

// React Query フック
export const useEmployeesQuery = () => {
  const { getEmployees } = useEmployees();
  
  return useQuery({
    queryKey: ['employees'],
    queryFn: getEmployees,
    staleTime: 10 * 60 * 1000, // 10分間キャッシュ
  });
};

export const useCreateEmployeeMutation = () => {
  const { createEmployee } = useEmployees();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
  });
};
```

#### Step 2: ローカル開発・検証

**開発サーバ起動:**
```bash
# 依存関係インストール
npm install

# ビルド確認
npm run build

# Power Apps Code 初期化
pac code init

# ローカル開発開始 (Vite + pac code run)
npm run dev
```

**package.json スクリプト例 (Microsoft 公式パターン):**
```json
{
  "scripts": {
    "dev": "start vite && start pac code run",
    "build": "vite build",
    "build:dev": "vite build --mode development", 
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@microsoft/power-apps": "^0.3.1",
    "@radix-ui/react-dialog": "^1.x.x",
    "@radix-ui/react-dropdown-menu": "^1.x.x",
    "@radix-ui/react-avatar": "^1.x.x",
    "@tanstack/react-query": "^5.x.x",
    "react-hook-form": "^7.x.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x.x",
    "lucide-react": "^0.x.x",
    "tailwind-merge": "^2.x.x"
  },
  "devDependencies": {
    "tailwindcss-animate": "^1.x.x"
  }
}
```

**重要**: 
- `dev` スクリプトで `vite` と `pac code run` を同時起動
- `build:dev` で開発モード用ビルド
- shadcn/ui コンポーネントライブラリとTailwindCSS設定を含む

#### Step 3: データコネクタ統合 (オプション)

### 公式サポートコネクター一覧

**Microsoft 公式サポート済みコネクター:**
- ✅ **SQL Server** (`shared_sql`)
- ✅ **SharePoint** (`shared_sharepoint`)  
- ✅ **Office 365 Users** (`shared_office365users`)
- ✅ **Office 365 Groups** (`shared_office365groups`)
- ✅ **Azure Data Explorer** (`shared_kusto`)
- ✅ **OneDrive for Business** (`shared_onedriveforbusiness`)
- ✅ **Power Apps for Makers** (`shared_powerappsforappmakers`)
- ✅ **Microsoft Teams** (`shared_teams`)
- ✅ **MSN Weather** (`shared_msnweather`)
- ✅ **Microsoft Translator V2** (`shared_microsofttranslator`)
- ✅ **Dataverse** (CRUD 操作)

**コネクタ設定例:**
```bash
# Office 365 Users
pac code add-data-source -a "shared_office365users" -c "<connection-id>"

# SQL Server  
pac code add-data-source -a "shared_sql" -c "<connection-id>" -t "[dbo].[TableName]" -d "<server,database>"

# SharePoint
pac code add-data-source -a "shared_sharepoint" -c "<connection-id>" -t "<list-id>" -d "<site-url>"

# Microsoft Teams
pac code add-data-source -a "shared_teams" -c "<connection-id>"

# MSN Weather
pac code add-data-source -a "shared_msnweather" -c "<connection-id>"
  
  const getCurrentUser = async () => {
    try {
      const result = await office365.MyProfile();
      return result.data;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  };
  
  return { getCurrentUser, office365, outlook };
};
```

#### Step 4: Power Apps 環境デプロイ (Code Apps として)

**重要: PCF ではなく Code Apps としてデプロイ**

**Code Apps デプロイコマンド:**
```bash
# Power Apps 環境に Code Apps として公開
pac code push
```

**❌ 間違い (PCF用コマンド):**
```bash
# これは PCF 用です。Code Apps では使用しないでください
pac pcf push  
```

**成功時の出力例:**
```
Successfully deployed Code App to Power Apps environment
App URL: https://apps.powerapps.com/play/[app-id]
Your Code App is now available as a full application in Power Apps
```

> **確認ポイント**: デプロイ後、Power Apps で **アプリ一覧** に表示されます（コンポーネントライブラリではありません）。

### サンプル実装

#### コネクタ利用例

**Office 365 ユーザー情報取得:**
```typescript
// src/components/UserProfile.tsx
import { useEffect, useState } from 'react';
import { useOffice365 } from '../hooks/useOffice365';

export const UserProfile = () => {
  const [user, setUser] = useState(null);
  const { getCurrentUser } = useOffice365();
  
  useEffect(() => {
    const loadUser = async () => {
      const userData = await getCurrentUser();
      setUser(userData);
    };
    
    loadUser();
  }, []);
  
  if (!user) return <div>Loading...</div>;
  
  return (
    <div>
      <h2>{user.DisplayName}</h2>
      <p>Email: {user.Mail}</p>
      <p>Department: {user.Department}</p>
    </div>
  );
};
```

**SQL データベース操作:**
```typescript
// src/hooks/useSqlData.ts
import { connector } from '@microsoft/power-apps';

export const useSqlData = () => {
  const sqlConnector = connector('shared_sql');
  
  const getProjects = async (skip = 0, take = 10) => {
    try {
      const result = await sqlConnector.getTable('Projects', {
        skip,
        take,
        orderBy: 'CreatedDate desc'
      });
      return result.data;
    } catch (error) {
      console.error('Failed to load projects:', error);
      return [];
    }
  };
  
  return { getProjects };
};
```

**Dataverse 統合 (Microsoft 公式仕様):**

**Step 1: PAC CLI でデータソースを追加:**
```bash
# Dataverse テーブルをコードアプリに追加
pac code add-data-source -a dataverse -t accounts
pac code add-data-source -a dataverse -t contacts
pac code add-data-source -a dataverse -t cr123_customtable

# 生成されるファイル:
# /generated/services/AccountsService.ts
# /generated/models/AccountsModel.ts
# /generated/services/ContactsService.ts  
# /generated/models/ContactsModel.ts
```

**Step 2: 生成されたサービスを使用:**
```typescript
// src/hooks/useDataverse.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AccountsService } from '../generated/services/AccountsService';
import { ContactsService } from '../generated/services/ContactsService';
import type { Accounts } from '../generated/models/AccountsModel';
import type { Contacts } from '../generated/models/ContactsModel';

// クエリオプションのインターフェース (Microsoft 公式)
interface IGetAllOptions {
  maxPageSize?: number;    // ページあたりの最大レコード数
  select?: string[];       // 取得するフィールド
  filter?: string;         // OData フィルター
  orderBy?: string[];      // ソート
  top?: number;           // 最大取得数
  skip?: number;          // スキップ数
  skipToken?: string;     // ページネーション用トークン
}

export const useDataverseAccounts = () => {
  const queryClient = useQueryClient();

  // アカウント一覧取得
  const getAccounts = async (options?: IGetAllOptions) => {
    try {
      const result = await AccountsService.getAll(options);
      return result.data || [];
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      throw error;
    }
  };

  // 単一アカウント取得
  const getAccount = async (accountId: string) => {
    try {
      const result = await AccountsService.get(accountId);
      return result.data;
    } catch (error) {
      console.error(`Failed to fetch account ${accountId}:`, error);
      throw error;
    }
  };

  // アカウント作成
  const createAccount = async (accountData: Omit<Accounts, 'accountid'>) => {
    try {
      const result = await AccountsService.create(accountData);
      return result.data;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw error;
    }
  };

  // アカウント更新 (変更フィールドのみ)
  const updateAccount = async (accountId: string, changes: Partial<Accounts>) => {
    try {
      await AccountsService.update(accountId, changes);
    } catch (error) {
      console.error(`Failed to update account ${accountId}:`, error);
      throw error;
    }
  };

  // アカウント削除
  const deleteAccount = async (accountId: string) => {
    try {
      await AccountsService.delete(accountId);
    } catch (error) {
      console.error(`Failed to delete account ${accountId}:`, error);
      throw error;
    }
  };

  return {
    getAccounts,
    getAccount,
    createAccount,
    updateAccount,
    deleteAccount
  };
};

export const useDataverseContacts = () => {
  const queryClient = useQueryClient();

  // 連絡先一覧取得
  const getContacts = async (options?: IGetAllOptions) => {
    try {
      const result = await ContactsService.getAll(options);
      return result.data || [];
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
      throw error;
    }
  };

  // 単一連絡先取得
  const getContact = async (contactId: string) => {
    try {
      const result = await ContactsService.get(contactId);
      return result.data;
    } catch (error) {
      console.error(`Failed to fetch contact ${contactId}:`, error);
      throw error;
    }
  };

  // 連絡先作成
  const createContact = async (contactData: Omit<Contacts, 'contactid'>) => {
    try {
      const result = await ContactsService.create(contactData);
      return result.data;
    } catch (error) {
      console.error('Failed to create contact:', error);
      throw error;
    }
  };

  // 連絡先更新 (変更フィールドのみ)
  const updateContact = async (contactId: string, changes: Partial<Contacts>) => {
    try {
      await ContactsService.update(contactId, changes);
    } catch (error) {
      console.error(`Failed to update contact ${contactId}:`, error);
      throw error;
    }
  };

  // 連絡先削除
  const deleteContact = async (contactId: string) => {
    try {
      await ContactsService.delete(contactId);
    } catch (error) {
      console.error(`Failed to delete contact ${contactId}:`, error);
      throw error;
    }
  };

  return {
    getContacts,
    getContact,
    createContact,
    updateContact,
    deleteContact
  };
};

// React Query 統合フック (Microsoft 公式パターン)
export const useAccountsQuery = (options?: IGetAllOptions) => {
  const { getAccounts } = useDataverseAccounts();
  
  return useQuery({
    queryKey: ['dataverse', 'accounts', options],
    queryFn: () => getAccounts(options),
    staleTime: 5 * 60 * 1000, // 5分間キャッシュ
  });
};

export const useAccountQuery = (accountId: string) => {
  const { getAccount } = useDataverseAccounts();
  
  return useQuery({
    queryKey: ['dataverse', 'accounts', accountId],
    queryFn: () => getAccount(accountId),
    enabled: !!accountId,
  });
};

export const useCreateAccountMutation = () => {
  const { createAccount } = useDataverseAccounts();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (accountData: Omit<Accounts, 'accountid'>) => createAccount(accountData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dataverse', 'accounts'] });
    },
  });
};

export const useUpdateAccountMutation = () => {
  const { updateAccount } = useDataverseAccounts();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ accountId, changes }: { accountId: string; changes: Partial<Accounts> }) => 
      updateAccount(accountId, changes),
    onSuccess: (_, { accountId }) => {
      queryClient.invalidateQueries({ queryKey: ['dataverse', 'accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dataverse', 'accounts', accountId] });
    },
  });
};

export const useDeleteAccountMutation = () => {
  const { deleteAccount } = useDataverseAccounts();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (accountId: string) => deleteAccount(accountId),
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ['dataverse', 'accounts'] });
      queryClient.removeQueries({ queryKey: ['dataverse', 'accounts', accountId] });
    },
  });
};
```

**実用的なコンポーネント例 (Microsoft 公式パターン):**
```typescript
// src/components/AccountManager.tsx
import { useState } from 'react';
import { useAccountsQuery, useCreateAccountMutation, useUpdateAccountMutation } from '@/hooks/useDataverse';
import type { Accounts } from '../generated/models/AccountsModel';

export const AccountManager = () => {
  // アカウント一覧取得（フィールド制限とフィルター付き）
  const { data: accounts, isLoading, error } = useAccountsQuery({
    select: ['name', 'accountnumber', 'address1_city', 'telephone1'],
    filter: "address1_country eq 'USA'",
    orderBy: ['name asc'],
    top: 50
  });

  // ミューテーション
  const createAccountMutation = useCreateAccountMutation();
  const updateAccountMutation = useUpdateAccountMutation();

  // 新規アカウント作成
  const handleCreateAccount = async (accountData: Partial<Accounts>) => {
    try {
      // システム管理フィールドは除外
      const newAccount = {
        name: accountData.name!,
        statecode: 0, // Active
        accountnumber: accountData.accountnumber,
        telephone1: accountData.telephone1,
        address1_city: accountData.address1_city
        // accountid, ownerid などは含めない
      };

      const result = await createAccountMutation.mutateAsync(newAccount as Omit<Accounts, 'accountid'>);
      
      if (result) {
        console.log('Account created:', result);
      }
    } catch (error) {
      console.error('Failed to create account:', error);
    }
  };

  // アカウント更新（変更フィールドのみ）
  const handleUpdateAccount = async (accountId: string, changes: Partial<Accounts>) => {
    try {
      // 変更されたフィールドのみを送信
      const updateData = {
        name: changes.name,
        telephone1: changes.telephone1
        // 変更していないフィールドは含めない
      };

      await updateAccountMutation.mutateAsync({
        accountId,
        changes: updateData
      });
      
      console.log('Account updated successfully');
    } catch (error) {
      console.error('Failed to update account:', error);
    }
  };

  if (isLoading) return <div className="p-4">アカウントを読み込み中...</div>;
  if (error) return <div className="p-4 text-red-500">エラー: {error.message}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">アカウント管理</h2>
      
      {accounts?.map((account: Accounts) => (
        <div key={account.accountid} className="p-4 border rounded-lg">
          <h3 className="font-semibold">{account.name}</h3>
          <p className="text-gray-600">番号: {account.accountnumber}</p>
          <p className="text-gray-600">都市: {account.address1_city}</p>
          <p className="text-gray-600">電話: {account.telephone1}</p>
        </div>
      ))}
      
      {createAccountMutation.isPending && (
        <div className="text-blue-500">作成中...</div>
      )}
    </div>
  );
};
```

**カスタムエンティティの操作例:**
```typescript
// src/hooks/useProjectManagement.ts - カスタムエンティティ例
import { useDataverseEntities, useCreateDataverseEntity } from '@/hooks/useDataverse';

// カスタムエンティティ: プロジェクト管理
export const useProjectManagement = () => {
  // プロジェクト一覧（カスタムエンティティ: new_project）
  const useProjects = () => useDataverseEntities('new_projects', {
    $select: 'new_projectid,new_name,new_description,new_startdate,new_enddate,new_status',
    $orderby: 'new_startdate desc'
  });

  // タスク一覧（カスタムエンティティ: new_task）
  const useProjectTasks = (projectId: string) => useDataverseEntities('new_tasks', {
    $select: 'new_taskid,new_name,new_description,new_duedate,new_status,new_assignedto',
    $filter: `_new_projectid_value eq ${projectId}`,
    $orderby: 'new_duedate asc'
  });

  // プロジェクト作成
  const useCreateProject = () => useCreateDataverseEntity('new_projects');

  return {
    useProjects,
    useProjectTasks,
    useCreateProject
  };
};

// タイプセーフなインターfaces定義
export interface Contact extends DataverseEntity {
  contactid: string;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  emailaddress1?: string;
  telephone1?: string;
  birthdate?: string;
  accountid?: string;
}

export interface Account extends DataverseEntity {
  accountid: string;
  name: string;
  websiteurl?: string;
  telephone1?: string;
  emailaddress1?: string;
}

// タイプセーフな使用例
export const ContactsList = () => {
  const { data: contacts, isLoading, error } = useDataverseEntities('contacts', {
    $select: 'contactid,firstname,lastname,emailaddress1,telephone1',
    $orderby: 'lastname asc',
    $top: 100
  });

  const createContactMutation = useCreateDataverseEntity('contacts');

  const handleCreateContact = async (contactData: Partial<Contact>) => {
    try {
      await createContactMutation.mutateAsync({
        firstname: contactData.firstname,
        lastname: contactData.lastname,
        emailaddress1: contactData.emailaddress1,
        telephone1: contactData.telephone1
      });
    } catch (error) {
      console.error('連絡先作成エラー:', error);
      // ユーザーフレンドリーなエラーメッセージ表示
    }
  };

  if (isLoading) return <div className="p-4">連絡先を読み込み中...</div>;
  if (error) return <div className="p-4 text-red-500">エラーが発生しました: {error.message}</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">連絡先一覧</h2>
      {contacts?.map((contact: Contact) => (
        <div key={contact.contactid} className="p-4 border rounded-lg">
          <h3 className="font-semibold">
            {contact.firstname} {contact.lastname}
          </h3>
          {contact.emailaddress1 && (
            <p className="text-gray-600">Email: {contact.emailaddress1}</p>
          )}
          {contact.telephone1 && (
            <p className="text-gray-600">Tel: {contact.telephone1}</p>
          )}
        </div>
      ))}
    </div>
  );
};
```

### コネクタ統合のベストプラクティス

**1. データソース管理のワークフロー:**
```bash
# データソース追加
pac code add-data-source -a "shared_office365users" -c "<connection-id>"

# 生成されたファイル確認
ls generated/services/   # Office365UsersService.ts
ls generated/models/     # Office365UsersModel.ts

# スキーマ変更時の対応
pac code delete-data-source -a "shared_sql" -ds "TableName"
pac code add-data-source -a "shared_sql" -c "<connection-id>" -t "[dbo].[TableName]" -d "<server,database>"

# 不要なデータソース削除
pac code delete-data-source -a "shared_sharepoint" -ds "ListName"
```

**2. パフォーマンス最適化:**
```typescript
// 適切なキャッシュ戦略
export const useOptimizedData = () => {
  return useQuery({
    queryKey: ['data', 'optimized'],
    queryFn: fetchData,
    staleTime: 10 * 60 * 1000,  // 10分キャッシュ
    cacheTime: 30 * 60 * 1000,  // 30分保持
    refetchOnWindowFocus: false, // ウィンドウフォーカス時の再取得無効
  });
};

// バッチ処理とページネーション
const processBatch = async (items: any[], batchSize = 10) => {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    await Promise.all(batch.map(item => processItem(item)));
    // バッチ間の待機で API レート制限回避
    await new Promise(resolve => setTimeout(resolve, 100));
  }
};
```

**3. エラーハンドリングパターン:**
```typescript
// 包括的なエラーハンドリング
export const useRobustDataFetch = () => {
  return useQuery({
    queryKey: ['data'],
    queryFn: async () => {
      try {
        return await DataService.getData();
      } catch (error: any) {
        // コネクション固有のエラー処理
        if (error?.status === 401) {
          throw new Error('認証が必要です。Power Apps で再度サインインしてください。');
        }
        if (error?.status === 403) {
          throw new Error('アクセス権限がありません。管理者にお問い合わせください。');
        }
        if (error?.status >= 500) {
          throw new Error('サーバーエラーが発生しました。しばらく待ってから再試行してください。');
        }
        throw new Error(`データ取得エラー: ${error?.message || 'Unknown error'}`);
      }
    },
    retry: (failureCount, error: any) => {
      // 4xx エラーはリトライしない
      if (error?.status >= 400 && error?.status < 500) {
        return false;
      }
      // 3回までリトライ
      return failureCount < 3;
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
```

**重要な実装ポイント (Microsoft 公式仕様):**

**1. SDK 初期化の確認:**
```typescript
// src/App.tsx - 必須の初期化パターン
import { useEffect, useState } from 'react';
import { initialize } from '@microsoft/power-apps/app';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await initialize(); // SDK 初期化を待機
        setIsInitialized(true);
      } catch (err) {
        setError('Failed to initialize Power Apps SDK');
        console.error('SDK initialization failed:', err);
      }
    };
    
    init();
  }, []);

  // 初期化完了まで待機
  if (!isInitialized) {
    return <div>Power Apps SDK を初期化中...</div>;
  }

  if (error) {
    return <div>エラー: {error}</div>;
  }

  return <YourMainComponent />;
}
```

**2. Dataverse テーブル追加のワークフロー:**
```bash
# 1. 環境に接続
pac auth create --url https://yourenvironment.crm.dynamics.com

# 2. Code Apps プロジェクトに Dataverse テーブルを追加
pac code add-data-source -a dataverse -t accounts
pac code add-data-source -a dataverse -t contacts
pac code add-data-source -a dataverse -t cr123_projects  # カスタムテーブル

# 3. 自動生成されるファイル確認
ls generated/services/   # AccountsService.ts, ContactsService.ts
ls generated/models/     # AccountsModel.ts, ContactsModel.ts
```

**3. フィールド制限とパフォーマンス:**
```typescript
// 常に select パラメータでフィールドを制限
const options: IGetAllOptions = {
  select: ['name', 'accountnumber', 'telephone1'], // 必要なフィールドのみ
  filter: "statecode eq 0", // アクティブのみ
  top: 100 // 適切な上限設定
};

// すべてのフィールドを取得するのは避ける
// const badOptions = { }; // これは避ける
```

### 表形式データソースの高度な活用

**SharePoint リスト統合:**
```bash
# SharePoint リストの追加
pac code add-data-source -a "shared_sharepoint" -c "<connection-id>" -t "<list-guid>" -d "<site-url>"

# Dataset name と Table ID の取得方法:
# 1. Canvas アプリでコネクションをギャラリーに接続
# 2. アプリを公開・実行
# 3. ブラウザ開発者ツールでネットワークタブを確認
# 4. APIM リクエストから値を抽出:
# https://.../sharepoint/<Connection-ID>/datasets/<Dataset-name>/tables/<Table-ID>/items
```

**ストアドプロシージャー活用:**
```bash
# ストアドプロシージャーをデータソースとして追加
pac code add-data-source -a "shared_sql" -c "<connection-id>" -d "<server,database>" -sp "[dbo].[GetUserReports]"

# 生成されるサービス例:
# GetUserReportsService.ts
```

```typescript
// src/hooks/useStoredProcedures.ts
import { GetUserReportsService } from '../generated/services/GetUserReportsService';

export const useUserReports = () => {
  const getUserReports = async (userId: string, startDate: string, endDate: string) => {
    try {
      // ストアドプロシージャーのパラメータ渡し
      const result = await GetUserReportsService.execute({
        UserId: userId,
        StartDate: startDate,
        EndDate: endDate
      });
      return result;
    } catch (error) {
      console.error('Failed to execute stored procedure:', error);
      throw error;
    }
  };

  return { getUserReports };
};
```

**Azure Data Explorer (Kusto) 統合:**
```bash
# Kusto データソース追加
pac code add-data-source -a "shared_kusto" -c "<connection-id>"
```

```typescript
// src/hooks/useKustoQuery.ts
import { KustoService } from '../generated/services/KustoService';

export const useKustoAnalytics = () => {
  const runKustoQuery = async (query: string) => {
    try {
      const result = await KustoService.query({
        Query: query,
        Database: 'analytics-db'
      });
      return result.data;
    } catch (error) {
      console.error('Kusto query failed:', error);
      throw error;
    }
  };

  // 使用例: ログ分析
  const getErrorLogs = async (timeRange: string) => {
    const query = `
      LogsTable
      | where TimeGenerated > ago(${timeRange})
      | where Level == "Error"
      | summarize count() by bin(TimeGenerated, 1h)
      | order by TimeGenerated desc
    `;
    
    return runKustoQuery(query);
  };

  return { runKustoQuery, getErrorLogs };
};
```

**4. トラブルシューティング:**
```typescript
// 接続診断ヘルパー
export const diagnoseConnections = async () => {
  const results = [];
  
  try {
    // Office 365 Users 接続テスト
    const profile = await Office365UsersService.MyProfile();
    results.push({ service: 'Office365Users', status: 'OK', data: profile });
  } catch (error) {
    results.push({ service: 'Office365Users', status: 'ERROR', error: error.message });
  }

  try {
    // SQL 接続テスト  
    const sqlTest = await SqlService.getall();
    results.push({ service: 'SQL', status: 'OK', count: sqlTest?.length || 0 });
  } catch (error) {
    results.push({ service: 'SQL', status: 'ERROR', error: error.message });
  }

  return results;
};

// 開発環境でのみ実行
if (process.env.NODE_ENV === 'development') {
  diagnoseConnections().then(console.log);
}
```

**5. 現在未対応の機能:**
```typescript
// Microsoft 公式ドキュメントより、以下は未対応:
// - 新規コネクション作成 (PAC CLI 経由)
// - 一部コネクターの高度な機能
// - リアルタイム通知・Webhook
// - バルク操作の最適化
```
```

**モック データから実データへの移行:**
```typescript
// 開発時: モックデータ使用
import { mockUsers } from '../mockData/office365Data';
const users = mockUsers;

// 本番: 実コネクタ使用
const { office365 } = useOffice365();
const users = await office365.SearchUser(searchTerm, 50);
```

### 検証・テスト

#### MVP 検証チェックリスト

**ローカル検証:**
- [ ] `pac code init` が成功する
- [ ] `npm run dev` でローカル開発サーバが起動する
- [ ] Power Platform SDK が正常に初期化される
- [ ] React アプリが正常に表示される
- [ ] ブラウザコンソールにエラーが出ない

**Code Apps デプロイ検証:**
- [ ] `pac code push` で **Code Apps として** デプロイが成功する
- [ ] Power Apps の **アプリ一覧** に表示される (コンポーネントライブラリではない)
- [ ] Power Apps URL でアクセスできる
- [ ] Power Platform 環境内で **アプリケーションとして** 正常動作する
- [ ] コネクタが正常に接続される (使用時)

> **確認方法**: [make.powerapps.com](https://make.powerapps.com) → アプリ → あなたの Code Apps が一覧に表示される

#### テストケース実装

```typescript
// tests/PowerProvider.test.tsx
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PowerProvider from '../src/PowerProvider';

// Power Apps SDK のモック
vi.mock('@microsoft/power-apps/app', () => ({
  initialize: vi.fn().mockResolvedValue(undefined)
}));

describe('PowerProvider', () => {
  test('子コンポーネントがレンダリングされる', () => {
    render(
      <PowerProvider>
        <div>Test Child</div>
      </PowerProvider>
    );
    
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });
  
  test('SDK初期化が呼ばれる', async () => {
    const { initialize } = await import('@microsoft/power-apps/app');
    
    render(
      <PowerProvider>
        <div>Test</div>
      </PowerProvider>
    );
    
    expect(initialize).toHaveBeenCalled();
  });
});
```

#### 統合テスト

```typescript
// tests/integration/connector.test.ts
import { renderHook } from '@testing-library/react';
import { useOffice365 } from '../src/hooks/useOffice365';

// 注意: 実際のコネクタテストは Power Apps 環境が必要
describe('Office 365 Connector Integration', () => {
  test('フックが正常に初期化される', () => {
    const { result } = renderHook(() => useOffice365());
    
    expect(result.current.getCurrentUser).toBeDefined();
  });
});
```

---

## 📚 まとめ: Dataverse統合の新しいアプローチ

### XMLベースから公式API-basedへの移行

Phase 3のDataverse統合は、**XMLファイル解析から公式API-basedアプローチへ完全移行**しました。

#### 主要な変更点

| 観点 | 旧アプローチ (非推奨) | 新アプローチ (推奨) |
|------|---------------------|-------------------|
| **メタデータ取得** | customization.xmlを手動エクスポート | `pac code add-data-source` で自動取得 |
| **スキーマ更新** | 手動でXMLを再エクスポート | コマンド再実行のみ |
| **データ形式** | XML（パース複雑） | JSON（型安全） |
| **認証** | 不要（ファイル） | OAuth 2.0（標準） |
| **CI/CD統合** | 困難 | 容易 |
| **エラー検知** | 実行時 | コンパイル時 |
| **メンテナンス** | 手動管理 | 自動同期 |

#### 実装の流れ

```bash
# 1. 環境認証
pac auth create --url https://your-environment.crm.dynamics.com

# 2. テーブル追加（メタデータ自動取得）
pac code add-data-source -a dataverse -t account

# 3. 自動生成されたファイルを確認
# generated/models/AccountModel.ts
# generated/services/AccountService.ts

# 4. ビルドして使用
npm run build
```

#### 使用する公式API

1. **PAC CLI** - 開発時のメタデータ取得
   - [Microsoft Learn: Connect to Dataverse](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/connect-to-dataverse)

2. **getMetadata() 関数** - ランタイムでのスキーマ取得
   - [Microsoft Learn: Get Table Metadata](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/how-to/get-table-metadata)

3. **Dataverse Web API** - 高度なクエリ（必要時）
   - [Microsoft Learn: Query Metadata Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api)

#### 利点

✅ **型安全性**: TypeScript型定義が自動生成され、コンパイル時エラー検知
✅ **自動化**: スキーマ変更時もコマンド一発で更新
✅ **保守性**: XMLファイル管理不要、Gitがクリーン
✅ **最新性**: 常に最新のスキーマを取得
✅ **開発体験**: IDE補完が完全に機能
✅ **CI/CD対応**: パイプライン統合が容易

#### 移行ガイド

既存のXML-basedプロジェクトから移行する場合:

1. **customization.xml を削除**
   ```bash
   rm customization.xml
   ```

2. **公式コマンドで再生成**
   ```bash
   pac auth create --url https://your-environment.crm.dynamics.com
   pac code add-data-source -a dataverse -t your_table_name
   ```

3. **インポートパスを更新**
   ```typescript
   // 旧: カスタム型定義
   import { YourTable } from './types/dataverse';
   
   // 新: 自動生成された型定義
   import { YourTable } from './generated/models/YourTableModel';
   import { YourTableService } from './generated/services/YourTableService';
   ```

4. **getMetadata()で検証**
   ```typescript
   const result = await YourTableService.getMetadata({
     schema: { columns: 'all' }
   });
   console.log('スキーマ確認:', result.value);
   ```

### トラブルシューティングリファレンス

詳細なトラブルシューティングについては、以下のドキュメントを参照してください:

- [Dataverse接続 完全ガイド](./docs/DATAVERSE_CONNECTION_GUIDE.md)
- [Dataverseトラブルシューティング](./docs/DATAVERSE_TROUBLESHOOTING.md)
- [Dataverse統合ベストプラクティス](./docs/DATAVERSE_INTEGRATION_BEST_PRACTICES.md)

### 次のステップ

Phase 3が完了したら、以下に進んでください:

- **Phase 4**: パフォーマンス最適化
- **Phase 5**: セキュリティとデプロイ
- **Phase 6**: 運用とモニタリング

---

**Phase 3: データソース統合 完了！** 🎉

XMLファイルに依存しない、モダンで保守性の高いDataverse統合が実現できました。
公式APIを活用することで、将来のDataverse更新にも柔軟に対応できます。
