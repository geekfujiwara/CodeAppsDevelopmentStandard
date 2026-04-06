# Dataverse 統合ガイド

Dataverse は Power Platform のネイティブデータストアです。Code Apps から Dataverse に接続し、CRUD 操作を実行する方法を記載します。

---

## 目次

- [セットアップ](#セットアップ)
- [テーブル操作（CRUD）](#テーブル操作crud)
- [Lookup フィールド](#lookup-フィールド)
- [Choice フィールド](#choice-フィールド)
- [システムフィールド](#システムフィールド)
- [スキーマ情報の取得](#スキーマ情報の取得)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)

---

## セットアップ

### コネクタ追加

```bash
pac code add-data-source -a dataverse -t {table-logical-name}
```

### PAC CLI によるテーブル管理

PAC CLI を使用して Dataverse テーブルをソリューション単位で管理できます:

```bash
# ソリューションの作成
pac solution init --publisher-name "YourPublisher" --publisher-prefix "yp"

# テーブルの作成・管理は Power Platform 管理センターまたは PAC CLI で実施
```

---

## テーブル操作（CRUD）

### データ取得（Read）

```typescript
import { DataverseService } from "../services/DataverseService";

// 全件取得（OData フィルター付き）
const accounts = await DataverseService.GetItems(
  "accounts",
  "$select=name,revenue,createdon&$filter=statecode eq 0&$orderby=createdon desc&$top=50"
);

// 単一レコード取得
const account = await DataverseService.GetItem(
  "accounts",
  "{record-id}",
  "$select=name,revenue"
);
```

### データ作成（Create）

```typescript
const newAccount = await DataverseService.PostItem("accounts", {
  name: "新規取引先企業",
  revenue: 5000000,
  description: "Code Apps から作成",
});
```

### データ更新（Update）

```typescript
await DataverseService.PatchItem("accounts", "{record-id}", {
  revenue: 7500000,
  description: "更新済み",
});
```

### データ削除（Delete）

```typescript
await DataverseService.DeleteItem("accounts", "{record-id}");
```

---

## Lookup フィールド

Lookup フィールドは他のテーブルへの参照です。

### 読み取り時の展開

```typescript
// $expand で関連テーブルのデータを取得
const contacts = await DataverseService.GetItems(
  "contacts",
  "$select=fullname&$expand=parentcustomerid($select=name)"
);

// 結果例: contact.parentcustomerid.name で取引先名にアクセス
```

### 書き込み時の設定

```typescript
// Lookup フィールドの設定（OData バインディング）
await DataverseService.PostItem("contacts", {
  fullname: "山田太郎",
  "parentcustomerid_account@odata.bind": "/accounts({account-id})",
});
```

---

## Choice フィールド

Choice フィールドは列挙型の値を持ちます。

### 読み取り

```typescript
const items = await DataverseService.GetItems(
  "incidents",
  "$select=title,prioritycode"
);
// prioritycode は数値で返される（例: 1 = 高, 2 = 中, 3 = 低）
```

### 書き込み

```typescript
await DataverseService.PostItem("incidents", {
  title: "新規インシデント",
  prioritycode: 1, // 数値で指定
});
```

### Choice 値のマッピング例

```typescript
const priorityMap: Record<number, string> = {
  1: "高",
  2: "中",
  3: "低",
};

const priorityLabel = priorityMap[incident.prioritycode] ?? "未設定";
```

---

## システムフィールド

Dataverse テーブルには自動管理されるシステムフィールドがあります。

| フィールド | 説明 | 読み取り | 書き込み |
|-----------|------|---------|---------|
| `createdon` | 作成日時 | ✅ | ❌ |
| `modifiedon` | 更新日時 | ✅ | ❌ |
| `createdby` | 作成者 | ✅ | ❌ |
| `modifiedby` | 更新者 | ✅ | ❌ |
| `statecode` | 状態コード | ✅ | ⚠️ |
| `statuscode` | ステータスコード | ✅ | ⚠️ |
| `versionnumber` | バージョン番号 | ✅ | ❌ |

> ⚠️ `statecode` と `statuscode` は特定の API を通じてのみ変更可能です。

---

## スキーマ情報の取得

### PAC CLI でのスキーマ確認

```bash
# テーブル情報の確認
pac table list

# テーブルの列情報
pac table get --name account
```

### OData メタデータ

```typescript
// EntityDefinitions を使用してスキーマ情報を取得
const metadata = await DataverseService.GetItems(
  "EntityDefinitions(LogicalName='account')/Attributes",
  "$select=LogicalName,AttributeType,DisplayName"
);
```

---

## ベストプラクティス

### パフォーマンス

- ✅ `$select` で必要なフィールドのみ取得
- ✅ `$top` で取得件数を制限
- ✅ `$filter` でサーバーサイドフィルタリング
- ❌ 全件取得してクライアントサイドでフィルタリングしない

### エラーハンドリング

```typescript
import { getConnectorErrorMessage, withRetry } from "../utils/errorHandling";

try {
  const data = await withRetry(async () => {
    return await DataverseService.GetItems(
      "accounts",
      "$select=name&$top=50"
    );
  });
} catch (err) {
  const message = getConnectorErrorMessage(err, "Dataverse 取得");
  // ユーザーにフレンドリーなエラーメッセージを表示
}
```

### 楽観的同時実行制御

更新時のコンフリクトを防止するため、`@odata.etag` を活用します。

---

## トラブルシューティング

### データソース名のエラー

PAC CLI が生成するデータソース名がコード内の参照と一致しない場合があります。
`power.config.json` の `dataSources` セクションでデータソース名を確認してください。

### 認証エラー

```
401 Unauthorized
```

PAC CLI の認証が期限切れの可能性があります:

```bash
pac auth list
pac auth create --environment {environment-id}
```

### フィールドが取得できない

- `$select` に対象フィールドが含まれているか確認
- Lookup フィールドの場合は `$expand` を使用
- フィールドのスキーマ名（論理名）が正しいか確認
