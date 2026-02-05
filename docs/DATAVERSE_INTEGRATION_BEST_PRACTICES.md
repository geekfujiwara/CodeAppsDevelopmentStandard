# Dataverseテーブル統合のベストプラクティス

**最終更新**: 2026年2月5日  
**対象Phase**: Phase 3（データソース統合）

---

> **📘 はじめに読む方へ**
>
> このドキュメントは、特定のプロジェクト（業務プロセスデザイナーアプリ）での実装経験に基づくベストプラクティス集です。
> 
> **Dataverse接続の基本から学びたい方は、まず以下を参照してください:**
> - **[Dataverse接続 完全ガイド](./DATAVERSE_CONNECTION_GUIDE.md)** - 統合最終版ガイド（Step-by-Step）
>
> このドキュメントは、上記の完全ガイドで基礎を理解した後、より詳細な実装パターンやベストプラクティスを参照する際にご活用ください。

---

## 📋 概要

Power Apps Code AppsでDataverseテーブルをデータソースとして追加し、CRUD操作を実装する際のベストプラクティスとトラブルシューティングガイド。

## 背景

業務プロセスデザイナーアプリで、Dataverseテーブル（`geek_businessprocess`）を使用したデータ永続化機能を実装した際に発見したベストプラクティス。

---

## 📚 目次

1. [推奨される実装手順](#✅-推奨される実装手順)
   - [プロジェクト初期化](#1-プロジェクト初期化)
   - [Dataverseテーブルをデータソースとして追加](#2-dataverseテーブルをデータソースとして追加-⭐-重要)
   - [Power Apps SDK を使用したサービス実装](#3-power-apps-sdk-を使用したサービス実装-⭐-推奨)
   - [UIでの使用例](#4-uiでの使用例)
2. [トラブルシューティング](#トラブルシューティング)
3. [チェックリスト](#チェックリスト)
4. [参考リンク](#参考リンク)
5. [まとめ](#まとめ)

---

## ✅ 推奨される実装手順

### 1. プロジェクト初期化

```bash
pac code init -n "AppName" -env "<Environment-ID>"
```

**注意点:**
- 環境IDは`pac org list`で取得
- 既に`power.config.json`が存在する場合はエラーになる

---

### 2. Dataverseテーブルをデータソースとして追加 ⭐ 重要

#### ✅ 正しい方法（推奨）

```bash
pac code add-data-source -a dataverse -t <テーブル論理名>
```

**例:**
```bash
pac code add-data-source -a dataverse -t geek_businessprocess
```

**ポイント:**
- `-a dataverse`を指定（`shared_commondataserviceforapps`は**使用しない**）
- `-t`には**テーブルの論理名（LogicalName）**を指定（**単数形**）
- `-c`（Connection ID）や`-d`（Dataset）の指定は**不要**
- コマンド実行により自動的に以下が生成される:
  - `.power/schemas/dataverse/<tablename>.Schema.json`
  - `power.config.json`への接続参照追加
  - `dataSourcesInfo`の更新

**論理名の確認方法:**
1. Power Apps Maker ポータルで確認: テーブル &gt; 設定 &gt; プロパティ &gt; 名前
2. `customizations.xml`で確認: `<entity Name="geek_businessprocess">`

---

#### ❌ 避けるべき方法

```bash
# 間違い: shared_commondataserviceforapps を使用
pac code add-data-source -a "shared_commondataserviceforapps" -c "<Connection-ID>"
```

**問題点:**
- `The interface 'CDPTabular1' was not found`エラーが発生
- `shared_commondataserviceforapps`はCode Appsの想定するインターフェイスと互換性がない
- 手動でのスキーマ設定が必要になり複雑化

---

### 3. Power Apps SDK を使用したサービス実装 ⭐ 推奨

#### ✅ Power Apps SDK を使用する方法（推奨）

Dataverseへのアクセスには**Power Apps SDK**の使用が推奨されます。Content Security Policy (CSP) の制約を受けず、認証も自動的に処理されます。

##### Modelファイル (`src/Models/GeekBusinessProcessModel.ts`)

```typescript
/**
 * Dataverseテーブル: geek_businessprocess
 * EntitySetName: geekbusinessprocesses (自動生成されたスキーマファイルで確認)
 */
export interface GeekBusinessProcess {
  geek_businessprocessid?: string;
  geek_processname: string; // Primary Name フィールド
  geek_processid?: string; // Auto Number
  geek_description?: string;
  geek_markdowndetails?: string;
  createdon?: string;
  modifiedon?: string;
  statecode?: number;
  statuscode?: number;
  ownerid?: string;
}

export interface GeekBusinessProcessCreateInput {
  geek_processname: string;
  geek_description?: string;
  geek_markdowndetails?: string;
}

export interface GeekBusinessProcessUpdateInput {
  geek_processname?: string;
  geek_description?: string;
  geek_markdowndetails?: string;
}
```

**フィールド名の確認方法:**
- `.power/schemas/dataverse/<tablename>.Schema.json`で確認
- または`customizations.xml`の`<attribute PhysicalName="...">`で確認

---

##### Serviceファイル (`src/Services/GeekBusinessProcessService.ts`)

```typescript
import { getClient, type DataClient } from '@microsoft/power-apps/data';
import type { IOperationOptions } from '@microsoft/power-apps/data';
import { dataSourcesInfo } from '../../.power/schemas/appschemas/dataSourcesInfo';
import type { 
  GeekBusinessProcess, 
  GeekBusinessProcessCreateInput, 
  GeekBusinessProcessUpdateInput 
} from '@/Models/GeekBusinessProcessModel';

// テーブル名 (power.config.json の dataSources に合わせる)
// pac code add-data-source 実行後に自動生成される
const TABLE_NAME = 'geekbusinessprocesses';

// DataClient を取得
const getDataClient = (): DataClient => {
  return getClient(dataSourcesInfo);
};

/**
 * 一覧取得
 */
export async function fetchBusinessProcesses(): Promise<GeekBusinessProcess[]> {
  const client = getDataClient();
  const options: IOperationOptions = {
    select: [
      'geek_businessprocessid',
      'geek_processname',
      'geek_processid',
      'geek_description',
      'geek_markdowndetails',
      'createdon',
      'modifiedon'
    ],
    orderBy: ['modifiedon desc'],
    filter: 'statecode eq 0', // Active のみ
  };

  const result = await client.retrieveMultipleRecordsAsync<GeekBusinessProcess>(
    TABLE_NAME,
    options
  );

  if (!result.success) {
    throw new Error(`Fetch failed: ${result.error?.message}`);
  }

  return result.data || [];
}

/**
 * 新規作成
 */
export async function createBusinessProcess(
  input: GeekBusinessProcessCreateInput
): Promise<string> {
  const client = getDataClient();
  const result = await client.createRecordAsync(TABLE_NAME, input);

  if (!result.success) {
    throw new Error(`Create failed: ${result.error?.message}`);
  }

  return result.data; // GUID
}

/**
 * 更新
 */
export async function updateBusinessProcess(
  id: string,
  input: GeekBusinessProcessUpdateInput
): Promise<void> {
  const client = getDataClient();
  const result = await client.updateRecordAsync(TABLE_NAME, id, input);

  if (!result.success) {
    throw new Error(`Update failed: ${result.error?.message}`);
  }
}

/**
 * 削除
 */
export async function deleteBusinessProcess(id: string): Promise<void> {
  const client = getDataClient();
  const result = await client.deleteRecordAsync(TABLE_NAME, id);

  if (!result.success) {
    throw new Error(`Delete failed: ${result.error?.message}`);
  }
}
```

**Power Apps SDK のポイント:**
- ✅ CSP制約を受けない（Content Security Policy違反エラーが発生しない）
- ✅ 認証が自動的に処理される
- ✅ `IOperationResult`型で成功/失敗が明確
- ✅ TypeScript型サポートが充実
- ✅ `$select`, `$filter`, `$orderby`などのODataオプションをサポート

---

#### ⚠️ Fetch API を直接使用する方法（非推奨）

Power Apps環境ではContent Security Policy (CSP)の制約により、直接fetch APIを使用すると以下のエラーが発生する可能性があります:

```
Refused to connect to '<URL>' because it violates the following 
Content Security Policy directive: "connect-src 'self' ..."
```

**そのため、Dataverseへのアクセスには必ず Power Apps SDK を使用してください。**

---

### 4. UIでの使用例

```typescript
import { 
  fetchBusinessProcesses,
  createBusinessProcess, 
  updateBusinessProcess 
} from '@/Services/GeekBusinessProcessService';
import { toast } from 'sonner';

const ProcessEditor = () => {
  const [process, setProcess] = useState<BusinessProcess | null>(null);

  // データ読み込み
  useEffect(() => {
    const loadProcesses = async () => {
      try {
        const data = await fetchBusinessProcesses();
        console.log('Loaded processes:', data);
      } catch (error) {
        toast.error('データの読み込みに失敗しました');
      }
    };
    loadProcesses();
  }, []);

  // Dataverseに保存
  const handleSaveToDataverse = async () => {
    if (!process) return;

    try {
      if (process.geek_businessprocessid) {
        // 更新
        await updateBusinessProcess(process.geek_businessprocessid, {
          geek_processname: process.title,
          geek_markdowndetails: exportToMarkdown(process),
        });
        toast.success('更新しました');
      } else {
        // 新規作成
        const id = await createBusinessProcess({
          geek_processname: process.title,
          geek_markdowndetails: exportToMarkdown(process),
        });
        setProcess({ ...process, geek_businessprocessid: id });
        toast.success('保存しました');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('保存に失敗しました');
    }
  };

  return (
    <Button onClick={handleSaveToDataverse}>
      Dataverseに保存
    </Button>
  );
};
```

---

## トラブルシューティング

### ❌ エラー: "The interface 'CDPTabular1' was not found"

**原因:**
`pac code add-data-source`で`-a shared_commondataserviceforapps`を指定している

**解決策:**
```bash
# ✅ 正しいコマンド
pac code add-data-source -a dataverse -t <テーブル論理名>
```

---

### ❌ エラー: "Data source not found: Failed to load Dataverse database references"

**原因:**
- `dataSourcesInfo.ts`にテーブル定義が存在しない
- `power.config.json`の`databaseReferences`が不正

**解決策:**
1. `pac code add-data-source -a dataverse -t <テーブル論理名>`を再実行
2. `.power/schemas/appschemas/dataSourcesInfo.ts`にテーブル定義を手動追加:
```typescript
export const dataSourcesInfo = {
  "geekbusinessprocesses": {
    "tableId": "geekbusinessprocesses",
    "version": "",
    "primaryKey": "geek_businessprocessid",
    "dataSourceType": "Dataverse",
    "apis": {},
  },
  // ... その他
};
```

---

### ❌ エラー: "Content Security Policy directive" (CSP違反)

**原因:**
fetch APIを直接使用してDataverseにアクセスしている

**解決策:**
Power Apps SDK (`@microsoft/power-apps/data`) を使用する

---

### ❌ データが取得できない（404エラー）

**原因:**
テーブル名（EntitySetName）が正しくない

**確認方法:**
1. `power.config.json`の`dataSources`セクションを確認
2. `.power/schemas/dataverse/`フォルダ内のスキーマファイル名を確認
3. サービスコードの`TABLE_NAME`を上記に合わせる

---

## チェックリスト

- [ ] `pac code add-data-source -a dataverse -t <論理名>`を実行
- [ ] `.power/schemas/dataverse/`にスキーマファイルが生成されている
- [ ] `power.config.json`に`databaseReferences`が追加されている
- [ ] Model定義のフィールド名が実際のDataverseスキーマと一致
- [ ] ServiceでPower Apps SDK (`getClient`)を使用
- [ ] `TABLE_NAME`が`power.config.json`の`dataSources`と一致
- [ ] エラーハンドリングで`result.success`を確認
- [ ] `npm run build && pac code push`でデプロイ成功

---

## 参考リンク

### 公式ドキュメント
- [Power Platform CLI - add-data-source コマンド](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/code#pac-code-add-data-source)
- [Power Apps SDK - Data クライアント](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/clientapi/reference)
- [Dataverse Web API Reference](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/overview)
- [OData Query Options](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-data-web-api)
- [Power Apps Code Apps 概要](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/code-apps/overview)

### 関連リソース
- [CodeAppsDevelopmentStandard](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard)
- [Power Platform CLI リファレンス](https://learn.microsoft.com/en-us/power-platform/developer/cli/introduction)

---

## まとめ

### ✅ ベストプラクティス要約

1. **データソース追加は `pac code add-data-source -a dataverse` を使用**
   - テーブル論理名（単数形）のみ指定
   - スキーマは自動生成される

2. **Power Apps SDK を使用してDataverseにアクセス**
   - CSP制約を回避
   - 型安全なコーディング
   - 自動認証処理

3. **テーブル名は自動生成されたものを使用**
   - `power.config.json`の`dataSources`を確認
   - スキーマファイル名と一致させる

4. **フィールド名は実際のスキーマと完全一致させる**
   - `.power/schemas/dataverse/`のスキーマファイルで確認
   - 大文字小文字、アンダースコアまで正確に

### 期待される効果

- ⏱️ **開発時間の大幅短縮**: 正しいコマンド一発でスキーマ生成
- 🐛 **トラブルシューティング時間削減**: CSPエラーやインターフェイス不一致を回避
- 📝 **コードの一貫性**: Power Apps SDKによる統一されたアクセス方法
- 🔒 **セキュリティ**: 自動認証処理により安全なアクセス
- 🚀 **スケーラビリティ**: 標準パターンで複数テーブルにも容易に対応

---

**最終更新日:** 2026年2月4日
