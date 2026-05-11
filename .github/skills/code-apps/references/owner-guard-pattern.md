# Code Apps — オーナーガード（読み取り専用制御）パターン

レコードの担当者（所有者）とログインユーザーを比較し、自分のレコードでなければ UI を読み取り専用にするデザインパターン。
承認ワークフロー・タスク再割当・チーム共有ビュー等、**他のユーザーに割り当てられたレコードを閲覧はできるが編集はできない**シナリオで使用する。

## ユースケース

| シナリオ | 説明 |
|---------|------|
| 予約の再割当 | 拒否後に別の担当者にアサインされた予約を読み取り専用で表示 |
| 承認ワークフロー | 次の承認者にアサインされたレコードを、前の承認者は閲覧のみ |
| チーム共有ビュー | チーム全員のタスクが見えるが、自分のタスクだけ編集可能 |
| マネージャービュー | 部下のレコードを参照できるが、直接編集はしない |
| 引継ぎ | 前任者が後任者に引き継いだレコードを読み取り専用で参照 |

## アーキテクチャ概要

```
┌─────────────────────────────────────────────┐
│             Code Apps (React UI)            │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  SDK getContext().user.objectId       │  │
│  │  → systemuser テーブルクエリ          │  │
│  │  → systemuserid 取得                 │  │
│  └────────────────┬──────────────────────┘  │
│                   │                         │
│  ┌────────────────▼──────────────────────┐  │
│  │  担当者テーブル (例: bookableresource)│  │
│  │  filter: _userid_value eq {userId}   │  │
│  │  → myResourceId 取得                 │  │
│  └────────────────┬──────────────────────┘  │
│                   │                         │
│  ┌────────────────▼──────────────────────┐  │
│  │  比較: myResourceId vs record.owner   │  │
│  │  → isOwnRecord / isReadOnly 判定     │  │
│  └────────────────┬──────────────────────┘  │
│                   │                         │
│  ┌────────────────▼──────────────────────┐  │
│  │  UI 制御                              │  │
│  │  ・バナー表示（amber: 他の担当者）    │  │
│  │  ・アクションボタン非表示             │  │
│  │  ・フォーム入力 disabled              │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## SDK 制約と解決策

### CSP 安全な SDK メソッド（postMessage ベース）

Code Apps は CSP `connect-src: 'none'` のため、`fetch()` / `executeAsync` は使えない。
以下の SDK メソッドのみ使用可能:

- `retrieveMultipleRecordsAsync` / `retrieveRecordAsync`
- `createRecordAsync` / `updateRecordAsync` / `deleteRecordAsync`

### `$select` クォーク（重要）

SDK の `retrieveMultipleRecordsAsync` に `select` を指定すると、**Lookup 値（`_xxx_value`）が返されない**ことがある。
REST API では正しく返されるが、SDK 経由では欠落する。

```typescript
// ❌ NG: select に _userid_value を含めても返されないことがある
const result = await client.retrieveMultipleRecordsAsync("bookableresources", {
  select: ["bookableresourceid", "name", "_userid_value"],
  filter: "statecode eq 0",
});
// result.data[0]._userid_value → undefined（SDK クォーク）

// ✅ OK: filter で _userid_value を使い、select を省略または最小限にする
const result = await client.retrieveMultipleRecordsAsync("bookableresources", {
  filter: `_userid_value eq ${systemUserId} and statecode eq 0`,
  top: 1,
});
// result.data[0].bookableresourceid → 正しく取得できる
```

**原則**: Lookup 値はデータ取得後の `select` ではなく、`filter` 条件として使う。

## テンプレートコード

### 1. ユーザー識別サービス（booking-service.ts 相当）

```typescript
// services/user-identity.ts
import { getClient, getSdkContext } from "./sdk-client";

/**
 * ログインユーザーの systemuserid を取得する。
 * SDK getContext() → Entra objectId → systemuser テーブルで解決。
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const ctx = await getSdkContext();
    if (!ctx?.user?.objectId) return null;

    const entraId = ctx.user.objectId;
    const client = await getClient();
    const result = await client.retrieveMultipleRecordsAsync("systemusers", {
      select: ["systemuserid"],
      filter: `azureactivedirectoryobjectid eq '${entraId}'`,
      top: 1,
    });

    const records = result.data ?? [];
    if (records.length > 0) {
      return (records[0].systemuserid as string)?.toLowerCase() ?? null;
    }
  } catch (e) {
    console.warn("[getCurrentUserId] failed:", e);
  }
  return null;
}

/**
 * systemuserid から担当者テーブルのレコード ID を取得する。
 * _userid_value を filter で使い、$select クォークを回避する。
 *
 * @param systemUserId - systemuser の GUID
 * @param tableName - 担当者テーブル名（例: "bookableresources"）
 * @param idColumn - 主キー列名（例: "bookableresourceid"）
 * @returns 担当者レコードの GUID（小文字）、見つからなければ null
 */
export async function getMyRecordId(
  systemUserId: string,
  tableName: string,
  idColumn: string,
): Promise<string | null> {
  try {
    const client = await getClient();
    const result = await client.retrieveMultipleRecordsAsync(tableName, {
      filter: `_userid_value eq ${systemUserId} and statecode eq 0`,
      top: 1,
    });

    const records = result.data ?? [];
    if (records.length > 0) {
      const id = (records[0] as Record<string, unknown>)[idColumn] as string;
      return id?.toLowerCase() ?? null;
    }
  } catch (e) {
    console.warn(`[getMyRecordId] failed for ${tableName}:`, e);
  }
  return null;
}
```

### 2. ページデータ型定義

```typescript
// types/page-data.ts
interface PageData {
  // ... 既存のデータフィールド
  currentUserId: string | null;
  myRecordId: string | null;  // 自分の担当者レコード ID
}
```

### 3. queryFn でのデータ取得

```typescript
// pages/detail-page.tsx
const { data: page } = useQuery({
  queryKey: ["detailPage", id],
  queryFn: async (): Promise<PageData> => {
    // 0) ログインユーザー → 自分の担当者 ID を解決
    const currentUserId = await getCurrentUserId().catch(() => null);
    const myRecordId = currentUserId
      ? await getMyRecordId(currentUserId, "bookableresources", "bookableresourceid").catch(() => null)
      : null;

    // 1) 他のデータを並列取得
    const [records, statuses, ...rest] = await Promise.all([
      getRecords(),
      getStatuses(),
      // ...
    ]);

    return { records, statuses, currentUserId, myRecordId, ...rest };
  },
});
```

### 4. isOwnRecord / isReadOnly 判定

```typescript
// ── オーナーガード判定 ──
// myRecordId が null の場合（解決失敗）はフォールバックで自分のレコードとして扱う
const isOwnRecord = !page.myRecordId
  || page.myRecordId.toLowerCase() === record._owner_value.toLowerCase();

const isReadOnly =
  record.statecode === COMPLETED
  || record.statecode === CANCELED
  || !isOwnRecord;
```

**GUID 比較は必ず `.toLowerCase()` で統一する。** Dataverse API は大文字小文字混在で GUID を返すことがある。

### 5. UI バナー表示

```tsx
{/* ── ステータスバナー ── */}

{/* 完了/キャンセル時の読み取り専用バナー（自分のレコードのみ） */}
{isReadOnly && isOwnRecord && (
  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400
    bg-green-50 dark:bg-green-950/30 p-3 rounded-lg
    border border-green-200 dark:border-green-800">
    <Lock className="h-4 w-4 shrink-0" />
    <span className="flex-1">
      このレコードは{statusLabel}のため、読み取り専用です。
    </span>
  </div>
)}

{/* 他の担当者のレコード（amber バナー） */}
{!isOwnRecord && (
  <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400
    bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg
    border border-amber-200 dark:border-amber-800">
    <Info className="h-4 w-4 shrink-0" />
    <span className="flex-1">
      このレコードは別の担当者（{ownerName ?? "不明"}）に割り当てられています。読み取り専用です。
    </span>
  </div>
)}
```

### 6. アクションボタンのガード

```tsx
const renderActions = () => {
  // 読み取り専用時はアクションボタンを表示しない
  if (isReadOnly) return null;

  return (
    <div className="flex gap-2">
      <Button onClick={handleApprove} disabled={isPending}>
        <CheckCircle2 className="h-5 w-5 mr-2" />
        承認
      </Button>
      <Button variant="destructive" onClick={handleReject} disabled={isPending}>
        <XCircle className="h-5 w-5 mr-2" />
        差戻し
      </Button>
    </div>
  );
};
```

### 7. フォーム入力の制御

```tsx
{/* isReadOnly をフォーム・テーブル・写真撮影等に伝搬 */}
<InlineEditTable
  data={items}
  columns={columns}
  readOnly={isReadOnly}
/>

<PhotoCapture
  recordId={record.id}
  readOnly={isReadOnly}
/>

<ServiceTaskList
  workOrderId={workOrder?.id}
  readOnly={!isInProgress || isReadOnly}
/>
```

## バナーカラー規約

| 状態 | カラー | 用途 |
|------|--------|------|
| 他の担当者 | `amber` | 他のユーザーに割り当てられたレコード |
| 完了/キャンセル | `green` | ステータスによる読み取り専用 |
| キャンセル | `gray` | キャンセル済みレコード |
| 作業待ち | `purple` | ユーザーの確認アクション待ち |
| 情報 | `blue` | 一般的な通知 |

### バナーの共通構造

```tsx
<div className="flex items-center gap-2 text-sm
  text-{color}-700 dark:text-{color}-400
  bg-{color}-50 dark:bg-{color}-950/30
  p-3 rounded-lg
  border border-{color}-200 dark:border-{color}-800">
  <Icon className="h-4 w-4 shrink-0" />
  <span className="flex-1">{メッセージ}</span>
</div>
```

## フォールバック設計

| 状況 | フォールバック | 理由 |
|------|--------------|------|
| `getCurrentUserId()` 失敗 | `myRecordId = null` → `isOwnRecord = true` | ユーザーが操作不能になるのを防ぐ |
| `getMyRecordId()` 失敗 | `myRecordId = null` → `isOwnRecord = true` | 同上 |
| `myRecordId` 取得成功だが一致しない | `isOwnRecord = false` → 読み取り専用 | 正しくガード |

**セキュリティ原則**: ID 解決に失敗した場合は**許可方向**にフォールバックする（操作不能を防止）。
Dataverse 側のセキュリティロールが最終的なアクセス制御を担保する。

## カスタマイズガイド

### 担当者テーブルの変更

`bookableresources` 以外のテーブル（例: カスタム担当者テーブル）を使う場合:

```typescript
// getMyRecordId の引数を変更
const myRecordId = await getMyRecordId(
  currentUserId,
  "cr_customresources",      // テーブル名
  "cr_customresourceid",     // 主キー列名
);
```

### 所有者フィールドの変更

`_resource_value` 以外の Lookup フィールドで所有者を判定する場合:

```typescript
// _ownerid_value を使う例（標準の所有者列）
const isOwnRecord = !myRecordId
  || myRecordId === record._ownerid_value?.toLowerCase();

// カスタム Lookup を使う例
const isOwnRecord = !myRecordId
  || myRecordId === record._cr_assignedto_value?.toLowerCase();
```

### 段階的な読み取り専用

一部のフィールドだけ編集可能にしたい場合（例: コメントは許可、ステータス変更は禁止）:

```typescript
const isFullReadOnly = isReadOnly;
const isStatusLocked = isReadOnly || !isOwnRecord;
const isCommentAllowed = !isReadOnly || isManager;  // マネージャーはコメント可
```

## チェックリスト

- [ ] `systemuser` テーブルをデータソースに追加済み（`npx power-apps add-data-source --resource-name systemuser`）
- [ ] 担当者テーブル（bookableresources 等）をデータソースに追加済み
- [ ] `getCurrentUserId()` → `getMyRecordId()` の 2 段階解決を実装
- [ ] GUID 比較で `.toLowerCase()` を使用
- [ ] `isReadOnly` をアクションボタン・フォーム・写真撮影等に伝搬
- [ ] amber バナーで「他の担当者」を表示
- [ ] フォールバック（ID 解決失敗時）で操作不能にならない設計
- [ ] コンソールログで `isOwnRecord` / `myRecordId` を出力（デバッグ用）
