# ログインユーザーの systemuserid 取得

## 問題

Code Apps では `Xrm` オブジェクトや `fetch()` が使えない（CSP 制約）。

```
❌ Xrm.Utility.getGlobalContext().userSettings.userId → undefined
❌ fetch("/api/data/v9.2/WhoAmI") → CSP connect-src: 'none' でブロック
❌ WhoAmI Service（executeAsync）→ 内部で fetch 使用、CSP でブロック
❌ SDK getContext().user.objectId をそのまま使う → これは Entra AAD Object ID であり systemuserid ではない
```

## 解決策

```
✅ SDK getContext() → Entra objectId 取得 → systemuser テーブルクエリで systemuserid を解決
   → retrieveMultipleRecordsAsync は postMessage ベースのため CSP 安全
```

### 前提: systemuser をデータソースに追加

systemuser はシステムテーブルのため `pac code add-data-source` では追加できない。
`src/lib/dataSourcesInfo.ts` に手動追記する（カスタムテーブルとは異なりシステムテーブルは手動追記が許可される）。

```typescript
systemusers: {
  tableId: "systemuser",
  version: "",
  primaryKey: "systemuserid",
  dataSourceType: "Dataverse",
  apis: {},
},
```

### 実装パターン

```typescript
// src/services/user-service.ts
// @ts-ignore - resolved at runtime by Power Apps host
import { getContext } from "@microsoft/power-apps/app";
import type { IContext } from "@microsoft/power-apps/app";
import { getClient } from "@microsoft/power-apps/data";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";

let _sdkContext: IContext | null = null;
async function getSdkContext(): Promise<IContext | null> {
  if (_sdkContext) return _sdkContext;
  try {
    _sdkContext = await getContext();
    return _sdkContext;
  } catch { return null; }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const ctx = await getSdkContext();
    if (ctx?.user?.objectId) {
      const entraId = ctx.user.objectId;
      const client = getClient(dataSourcesInfo);
      const result = await client.retrieveMultipleRecordsAsync(
        "systemusers",
        {
          select: ["systemuserid"],
          filter: `azureactivedirectoryobjectid eq '${entraId}'`,
          top: 1,
        }
      );
      if (result?.success && result.data?.length > 0) {
        return result.data[0]?.systemuserid?.toLowerCase() ?? null;
      }
    }
  } catch (e) {
    console.warn("[getCurrentUserId] failed:", e);
  }
  return null;
}
```

### TanStack Query フック

```typescript
export function useCurrentUserId() {
  return useQuery({
    queryKey: ["currentUserId"],
    queryFn: getCurrentUserId,
    staleTime: Infinity,  // セッション中不変
    retry: 2,
  });
}
```

### 重要な教訓

- **GUID 比較は `.toLowerCase()` で統一**: Dataverse API は大文字小文字混在で返す
- **systemuserid が取れない場合は空配列**: null で全データ表示しない（セキュリティリスク）
- **`objectId` は Entra AAD Object ID**: Dataverse の `systemuserid` とは異なる
- **`executeAsync` も CSP でブロック**: `retrieveMultipleRecordsAsync` だけが CSP 安全
