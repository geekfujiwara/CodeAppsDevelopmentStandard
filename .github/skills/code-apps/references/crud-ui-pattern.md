# CRUD UI 標準パターン（一覧クリックで詳細・インライン編集）

すべての CRUD 画面はこのパターンに統一する。**指示がなくても、テーブルごとに「一覧・詳細（インライン編集）・作成・削除」を標準実装すること。**

---

## 原則

1. **一覧は行／カード全体をクリックして詳細を開く**
   - 「目（👁）」アイコンなどの小さな専用ボタンで詳細を開かせない。クリック領域が小さく操作しづらいため。
   - 行 (`<tr>`) やカード (`<Card>`) に `onClick` を付け、`cursor-pointer` とホバー演出（`hover:bg-accent/50` / `hover:shadow-md hover:border-primary/40`）を付与する。

2. **詳細画面の編集はモーダルではなくインライン編集モード**
   - 「編集」ボタンで同一画面・同一ダイアログ内のフィールドを入力欄へ切り替える（`editing` ステート）。
   - 別モーダルを開かない。保存（`保存`）／キャンセル／削除をインラインに置く。
   - 保存後は `editing=false` に戻して表示モードに復帰する。

3. **行内アクション（削除・クイック操作）は必ず `e.stopPropagation()`**
   - 行クリックの詳細遷移と競合させないため、削除ボタン等は `onClick={(e) => { e.stopPropagation(); ... }}`。

4. **作成（新規）だけはモーダル or 専用インラインフォームでよい**
   - 既存レコードの編集はインライン。新規作成は一覧上部のフォーム／ダイアログで可。

---

## テーブル一覧（行クリック）

```tsx
import { useNavigate } from "react-router-dom"
import { Trash2 } from "lucide-react"   // Eye はインポートしない

const navigate = useNavigate()

<tr
  className="border-b hover:bg-accent/50 transition-colors cursor-pointer"
  onClick={() => navigate(`/items/${id}`)}
>
  <td>{item.name}</td>
  {/* ...他カラム... */}
  <td className="text-right">
    <Button
      variant="ghost" size="icon"
      onClick={(e) => { e.stopPropagation(); handleDelete(item) }}
      title="削除"
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  </td>
</tr>
```

## カード一覧（カードクリック）

```tsx
<Card
  className="flex flex-col hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
  onClick={() => setDetailId(item.id)}
>
  <CardContent>
    {/* 表示内容 */}
    {/* クイック操作は stopPropagation */}
    <Button size="sm" variant="outline"
      onClick={(e) => { e.stopPropagation(); handleQuickAction(item) }}>
      操作
    </Button>
  </CardContent>
</Card>
```

> 一覧の `detail` は**スナップショットではなく ID で保持**し、最新クエリ結果から導出する。更新後も詳細が古い値を表示しないため。
> ```tsx
> const [detailId, setDetailId] = useState<string | null>(null)
> const detail = useMemo(() => items.find((i) => i.id === detailId) ?? null, [items, detailId])
> ```

## 詳細のインライン編集

```tsx
const [editing, setEditing] = useState(false)
const [form, setForm] = useState<ItemInput>({})
const setField = <K extends keyof ItemInput>(k: K, v: ItemInput[K]) =>
  setForm((p) => ({ ...p, [k]: v }))

// 対象が切り替わったら編集モードを閉じる
useEffect(() => { setEditing(false) }, [itemId])

const startEdit = () => { setForm({ /* 現在値で初期化 */ }); setEditing(true) }
const handleSave = async () => {
  if (!form.name?.trim()) { toast.error("名称は必須です"); return }
  await onUpdate(itemId, form)
  setEditing(false)
}

return editing ? (
  <div className="space-y-4">
    {/* Input / select / textarea でフィールドを編集 */}
    <div className="flex items-center justify-between">
      <Button variant="ghost" className="text-red-600" onClick={() => onDelete(item)}>
        <Trash2 className="h-4 w-4 mr-2" />削除
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setEditing(false)}>
          <X className="h-4 w-4 mr-2" />キャンセル
        </Button>
        <Button onClick={handleSave} disabled={!form.name?.trim()}>
          <Save className="h-4 w-4 mr-2" />保存
        </Button>
      </div>
    </div>
  </div>
) : (
  <div className="space-y-5">
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={startEdit}>
        <Pencil className="h-4 w-4 mr-2" />編集
      </Button>
    </div>
    {/* 表示内容 */}
  </div>
)
```

## ツリー／階層 UI（組織図など）

- ノード行全体をクリックでインライン編集パネルを行直下に展開する（鉛筆アイコン→モーダルにしない）。
- 展開／折りたたみのシェブロンは `e.stopPropagation()` でクリックを分離する。
- 編集パネル内のクリックは `onClick={(e) => e.stopPropagation()}` で行クリックへ伝播させない。

---

## チェックリスト（CRUD 画面実装時）

- [ ] 一覧の行／カード全体がクリックで詳細を開く（`cursor-pointer` + ホバー）
- [ ] 「目」アイコン等の小さな詳細ボタンを置いていない
- [ ] 行内の削除・クイック操作は `e.stopPropagation()`
- [ ] 詳細の編集はインライン（モーダルを開かない）
- [ ] 保存／キャンセル／削除がインラインに揃っている
- [ ] 詳細は ID 保持＋クエリ導出で最新値を反映
- [ ] 対象切替時に編集モードをリセット（`useEffect`）
