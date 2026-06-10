# Lookup 名のクライアントサイド解決

## 問題

SDK 生成サービスの `getAll()` / `get()` は Lookup 名フィールド
（`createdbyname`, `geek_assignedtoidname` 等）を **返さない**。

```
❌ item.createdbyname → undefined → 担当者が空白表示
✅ _xxx_value (GUID) + useMemo マップで名前解決
```

## パターン 1: useMemo マップ（推奨）

関連テーブルをデータソースとして追加済みの場合に使う。

```typescript
// ① hooks で関連テーブルを取得
const { data: records = [] } = useRecords();
const { data: users = [] } = useSystemUsers();
const { data: categories = [] } = useCategories();

// ② useMemo で GUID → 名前の Map を構築
const userMap = useMemo(() => {
  const m = new Map<string, string>();
  users.forEach((u) => m.set(u.systemuserid, u.fullname || u.internalemailaddress || ""));
  return m;
}, [users]);

const categoryMap = useMemo(() => {
  const m = new Map<string, string>();
  categories.forEach((c) => m.set(c.prefix_categoryid, c.prefix_name));
  return m;
}, [categories]);

// ③ テーブルカラムで render 関数で GUID → 名前変換
const columns = [
  {
    key: "_prefix_categoryid_value",
    label: "カテゴリ",
    render: (item) => {
      const v = item._prefix_categoryid_value as string | undefined;
      return v ? categoryMap.get(v) || "" : "";
    },
  },
  {
    key: "_createdby_value",
    label: "報告者",
    render: (item) => {
      const v = item._createdby_value as string | undefined;
      return v ? userMap.get(v) || "" : "";
    },
  },
];
```

## パターン 2: OData FormattedValue（データソース未登録テーブル向け）

データソースに追加できないテーブルの Lookup 名は、
OData が自動付与する FormattedValue アノテーションから取得する。

### 前提

- Lookup **元**テーブルがデータソース登録済み
- Lookup **先**テーブルは未登録でも OK

### 実装

```typescript
export async function getRecordsWithLookupNames(): Promise<MyRecord[]> {
  const client = getClient(dataSourcesInfo);
  const result = await client.retrieveMultipleRecordsAsync(
    "registeredtablename",
    {
      select: ["primaryid", "name", "_lookupfield_value"],
      filter: "statecode eq 0",
    }
  );
  if (!result.success) throw result.error;

  return (result.data ?? []).map((raw: any) => {
    const record = raw as MyRecord;
    // OData FormattedValue アノテーションから Lookup 先の名前を取得
    const lookupName = raw["_lookupfield_value@OData.Community.Display.V1.FormattedValue"];
    if (lookupName) record._lookupfield_name = lookupName;
    return record;
  });
}
```

### 型定義の拡張

```typescript
export interface MyRecord {
  primaryid: string;
  name: string;
  _lookupfield_value?: string;
  _lookupfield_name?: string; // ← FormattedValue から取得した名前用
}
```

### UI での使い方

```typescript
// FormattedValue 名を第一候補、useMemo マップをフォールバック
{record._lookupfield_name
  ?? lookupNameMap.get(record._lookupfield_value?.toLowerCase() ?? "")
  ?? "不明"}
```

### 重要な注意事項

- FormattedValue は OData API が **自動付与** — `select` に指定不要（Lookup 列を含めれば自動で返る）
- SDK の TypeScript 型にはこのプロパティがない — `any` キャストが必要
- **データソース登録済みテーブル経由でのみ取得可能** — 未登録テーブルに直接クエリ不可
