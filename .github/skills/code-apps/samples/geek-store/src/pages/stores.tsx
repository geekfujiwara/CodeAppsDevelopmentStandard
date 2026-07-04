import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  useStores,
  useCreateStore,
  useUpdateStore,
  useDeleteStore,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_STORES } from "@/config"
import {
  STORE_STATUS_LABEL,
  STORE_STATUS_COLOR,
  STORE_STATUS_OPTIONS,
  STORE_OPEN,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:      `${P}_storeid`,
  name:    `${P}_name`,
  region:  `${P}_region`,
  manager: `${P}_manager`,
  status:  `${P}_status`,
}

function StatusBadge({ status }: { status: number }) {
  const label = STORE_STATUS_LABEL[status as keyof typeof STORE_STATUS_LABEL] ?? String(status)
  const color = STORE_STATUS_COLOR[status as keyof typeof STORE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function DisabledFeatureCard() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>この機能は無効です</CardTitle>
          <CardDescription>
            店舗マスタは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_STORES=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  region: string
  manager: string
  status: string
}

const EMPTY_FORM: FormData = {
  name: "", region: "", manager: "", status: String(STORE_OPEN),
}

export default function StoresPage() {
  if (!FEATURE_STORES) return <DisabledFeatureCard />
  return <StoresContent />
}

function StoresContent() {
  const { data: stores = [], isLoading } = useStores()
  const createStore = useCreateStore()
  const updateStore = useUpdateStore()
  const deleteStore = useDeleteStore()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const filtered = stores
    .filter(store => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(store[f.name] ?? "").toLowerCase().includes(q) ||
        String(store[f.region] ?? "").toLowerCase().includes(q) ||
        String(store[f.manager] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(store[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(a[f.name] ?? "").localeCompare(String(b[f.name] ?? "")))

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (store: Record<string, unknown>) => {
    setEditingId(String(store[f.id] ?? ""))
    setFormData({
      name:    String(store[f.name] ?? ""),
      region:  String(store[f.region] ?? ""),
      manager: String(store[f.manager] ?? ""),
      status:  store[f.status] != null ? String(store[f.status]) : String(STORE_OPEN),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("店舗名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:    formData.name,
      [f.region]:  formData.region,
      [f.manager]: formData.manager,
    }
    if (formData.status) data[f.status] = Number(formData.status)

    try {
      if (editingId) {
        await updateStore.mutateAsync({ id: editingId, data })
        toast.success("店舗を更新しました")
      } else {
        await createStore.mutateAsync(data)
        toast.success("店舗を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteStore.mutateAsync(deleteId)
      toast.success("店舗を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">店舗マスタ</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">店舗マスタ</h1>
          <p className="text-muted-foreground text-sm mt-1">店舗情報の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>店舗一覧</CardTitle>
          <CardDescription>{filtered.length} 件</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="店舗名・地域・店長で検索..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのステータス</SelectItem>
                {STORE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>店舗名</TableHead>
                  <TableHead>地域</TableHead>
                  <TableHead>店長</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      店舗がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((store, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(store[f.name] ?? "")}</TableCell>
                      <TableCell>{String(store[f.region] ?? "")}</TableCell>
                      <TableCell>{String(store[f.manager] ?? "")}</TableCell>
                      <TableCell>
                        {store[f.status] != null && (
                          <StatusBadge status={store[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(store)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(store[f.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* フォームモーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editingId ? "店舗編集" : "店舗新規登録"}
        onSave={handleSave}
        isSaving={createStore.isPending || updateStore.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">店舗名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 渋谷店"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="region">地域</Label>
              <Input
                id="region"
                value={formData.region}
                onChange={e => setFormData(p => ({ ...p, region: e.target.value }))}
                placeholder="例: 関東, 関西"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manager">店長</Label>
              <Input
                id="manager"
                value={formData.manager}
                onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))}
                placeholder="店長名"
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="ステータスを選択" />
              </SelectTrigger>
              <SelectContent>
                {STORE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="店舗を削除しますか？"
        description="この操作は取り消せません。店舗を完全に削除します（臨店チェックは残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
