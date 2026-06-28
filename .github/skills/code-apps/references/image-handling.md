# Dataverse 画像列の表示パターン

Code Apps で Dataverse の **Image 列**（`EntityImage` / カスタム Image 列）を表示・アップロードするパターン。

> **検証済み**: 2026-06-29

---

## 前提知識

### CSP 制約

Code Apps の `img-src` は `'self' data: <platform>` のため:

| ソース | 利用可否 | 備考 |
|---|---|---|
| `data:image/...;base64,...` | ✅ | CSP で許可済み |
| `blob:https://...` | ❌ | `img-src` に `blob:` なし → ブロック |
| Dataverse `_url` フィールド（`download.aspx`） | ❌ | Code Apps サンドボックスでは 404 |

### SDK メソッド

| メソッド | 用途 | 戻り値 |
|---|---|---|
| `client.downloadImageFromRecord()` | 画像ダウンロード | `IOperationResult<Uint8Array>` |
| `client.uploadFileToRecord()` | 画像アップロード | `IOperationResult<void>` |
| `client.deleteFileOrImageFromRecord()` | 画像削除 | `IOperationResult<void>` |

> これらは `@microsoft/power-apps/data` の `getClient()` が返すクライアントに**常に存在する**。  
> ただし `pac code add-data-source` で生成されるサービスには `upload()` のみ含まれ、`downloadImage()` / `deleteFileOrImage()` は**生成されない**（`npx power-apps add-data-source` では全て生成される）。

### 生成モデルの `_url` フィールド

`pac code add-data-source` で Image 列を含むテーブルを追加すると、生成モデルに以下が含まれる:

```typescript
// 例: geek_photo 列の場合
export interface Geek_labs extends Geek_labsBase {
  geek_photo_timestamp?: number;
  geek_photo_url?: string;       // ← Dataverse が返す画像 URL
  geek_photoid?: string;
}
```

`geek_photo_url` は `download.aspx` を指す URL だが、**Code Apps のサンドボックスドメインからはアクセスできない**（404）。

---

## 推奨パターン: `downloadImageFromRecord` → base64 data URI

### サービス層

```typescript
import { getClient } from "@microsoft/power-apps/data"
import dataSourcesInfo from "@/lib/dataSourcesInfo"

function client() { return getClient(dataSourcesInfo) }

// 画像取得: Uint8Array → base64 data URI
async function getImage(table: string, id: string, imageColumn: string): Promise<string | null> {
  const result = await client().downloadImageFromRecord(table, id, imageColumn, false)
  if (result.success && result.data && result.data.byteLength > 0) {
    const bytes = new Uint8Array(result.data)
    let binary = ""
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return `data:image/jpeg;base64,${btoa(binary)}`
  }
  return null
}
```

**ポイント**:
- `Blob` + `URL.createObjectURL()` は CSP（`img-src` に `blob:` なし）でブロックされるため使えない
- `Uint8Array` → `String.fromCharCode` → `btoa()` で base64 に変換し `data:` URI を生成する
- `fullSize` パラメータ: `false` でサムネイル、`true` でフルサイズ

### 汎用 CRUD ファクトリでの組み込み例

```typescript
function createCrud(tableName: string, imageColumn?: string) {
  const table = `${PUBLISHER_PREFIX}_${tableName}`
  return {
    getAll: async () => { /* ... */ },
    create: async (data: Record<string, unknown>) => { /* ... */ },
    update: async (id: string, data: Record<string, unknown>) => { /* ... */ },
    remove: async (id: string) => { /* ... */ },
    getImage: imageColumn
      ? async (id: string): Promise<string | null> => {
          const result = await client().downloadImageFromRecord(
            table, id, imageColumn, false
          )
          if (result.success && result.data && result.data.byteLength > 0) {
            const bytes = new Uint8Array(result.data)
            let binary = ""
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i])
            }
            return `data:image/jpeg;base64,${btoa(binary)}`
          }
          return null
        }
      : undefined,
    uploadImage: imageColumn
      ? async (id: string, file: File): Promise<void> => {
          const arrayBuffer = await file.arrayBuffer()
          const data = new Uint8Array(arrayBuffer)
          await client().uploadFileToRecord(table, id, imageColumn, file.name, data)
        }
      : undefined,
  }
}

// 使用例
export const labService = createCrud("labs", `${PUBLISHER_PREFIX}_photo`)
export const interviewService = createCrud("seniorinterviews", `${PUBLISHER_PREFIX}_portrait`)
```

### hooks 層（React Query）

```typescript
function createHooks(key: string, service: ReturnType<typeof createCrud>) {
  return {
    useAll: () => useQuery({ queryKey: [key], queryFn: service.getAll }),
    // ... CRUD hooks ...
    useImage: (id: string | null) => useQuery({
      queryKey: [key, "image", id],
      queryFn: () => service.getImage!(id!),
      enabled: !!id && !!service.getImage,
      staleTime: 5 * 60 * 1000,
    }),
  }
}
```

### コンポーネント

```tsx
import { ImageIcon } from "lucide-react"

interface RecordImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  isLoading?: boolean
}

export function RecordImage({ src, alt, className = "", isLoading }: RecordImageProps) {
  if (isLoading) {
    return (
      <div className={`bg-muted animate-pulse rounded-lg flex items-center justify-center ${className}`}>
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    )
  }
  if (!src) {
    return (
      <div className={`bg-muted rounded-lg flex items-center justify-center ${className}`}>
        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
      </div>
    )
  }
  return <img src={src} alt={alt} className={`rounded-lg object-cover ${className}`} />
}
```

### ページでの使用

```tsx
export default function LabsPage() {
  const { data: labs = [], isLoading } = labHooks.useAll()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // useImage は early return より前で呼ぶ（React hooks ルール）
  const imageQuery = labHooks.useImage(selectedId)

  if (isLoading) return <LoadingSkeletonList />

  if (selectedId && selected) {
    return (
      <RecordImage
        src={imageQuery.data as string | null}
        alt={selected.name ?? ""}
        className="w-full h-48 sm:h-64"
        isLoading={imageQuery.isLoading}
      />
    )
  }
  // ... 一覧表示 ...
}
```

---

## 失敗パターンと教訓

### ❌ パターン 1: `_url` フィールドをそのまま使う

```tsx
// NG: download.aspx は Code Apps サンドボックスから 404
<img src={record.geek_photo_url} />
```

**原因**: `_url` は `https://<org>.crm.dynamics.com/Image/download.aspx?...` を指すが、Code Apps は `powerplatformusercontent.com` ドメインのサンドボックスで実行されるため、クロスドメインの `download.aspx` にアクセスできない。

### ❌ パターン 2: `downloadImageFromRecord` → Blob URL

```typescript
// NG: blob: URL は CSP でブロック
const blob = new Blob([result.data], { type: "image/jpeg" })
const url = URL.createObjectURL(blob)
// → "Loading the image 'blob:https://...' violates CSP directive: img-src 'self' data:"
```

**原因**: Code Apps の `img-src` ディレクティブに `blob:` が含まれていない。

### ❌ パターン 3: `retrieveRecordAsync` + `select` で base64 取得

```typescript
// 動作しない場合がある
const result = await client().retrieveRecordAsync(table, id, { select: [imageColumn] })
const b64 = result.data?.[imageColumn]
```

**原因**: Dataverse の Image 列は `retrieveRecordAsync` の `select` で指定しても、サムネイルのみ返る場合や空になる場合がある。`downloadImageFromRecord` が公式推奨。

### ⚠️ パターン 4: `useImage` を条件分岐の後で呼ぶ

```tsx
// NG: React hooks ルール違反（Error #310）
if (isLoading) return <LoadingSkeletonList />
const imageQuery = hooks.useImage(selectedId)  // ← early return の後
```

**修正**: hooks は全て early return より前で呼ぶ。`enabled` フラグで実行を制御する。

```tsx
// OK
const imageQuery = hooks.useImage(selectedId)  // ← early return の前
if (isLoading) return <LoadingSkeletonList />
```

---

## `pac` vs `npx` の生成サービス差異

| 機能 | `pac code add-data-source` | `npx power-apps add-data-source` |
|---|---|---|
| CRUD（create/get/getAll/update/delete） | ✅ | ✅ |
| `upload()` | ✅ | ✅ |
| `downloadImage()` | ❌ | ✅ |
| `downloadFile()` | ❌ | ✅ |
| `deleteFileOrImage()` | ❌ | ✅ |
| `getMetadata()` | ✅ | ✅ |

`pac code add-data-source` を使う場合、`downloadImageFromRecord` は生成サービスにないため `getClient()` から直接呼び出す。

---

## まとめ

| 手順 | 内容 |
|---|---|
| 1 | `downloadImageFromRecord()` で `Uint8Array` を取得 |
| 2 | `Uint8Array` → `String.fromCharCode` → `btoa()` で base64 変換 |
| 3 | `data:image/jpeg;base64,...` を `<img src>` に設定 |
| 4 | hooks は条件分岐より前で呼ぶ（`enabled` で制御） |
