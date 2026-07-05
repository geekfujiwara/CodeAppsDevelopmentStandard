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
  useSites,
  useCreateSite,
  useUpdateSite,
  useDeleteSite,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_SITES } from "@/config"
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_COLOR,
  SITE_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:              `${P}_siteid`,
  name:            `${P}_name`,
  manager:         `${P}_manager`,
  status:          `${P}_status`,
  completion_date: `${P}_completion_date`,
}

function StatusBadge({ status }: { status: number }) {
  const label = SITE_STATUS_LABEL[status as keyof typeof SITE_STATUS_LABEL] ?? String(status)
  const color = SITE_STATUS_COLOR[status as keyof typeof SITE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
            現場マスタは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_SITES=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  manager: string
  status: string
  completion_date: string
}

const EMPTY_FORM: FormData = {
  name: "", manager: "", status: String(100000000), completion_date: "",
}

export default function SitesPage() {
  if (!FEATURE_SITES) return <DisabledFeatureCard />
  return <SitesContent />
}

function SitesContent() {
  const { data: sites = [], isLoading } = useSites()
  const createSite = useCreateSite()
  const updateSite = useUpdateSite()
  const deleteSite = useDeleteSite()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const filtered = sites
    .filter(site => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(site[f.name] ?? "").toLowerCase().includes(q) ||
        String(site[f.manager] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(site[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(a[f.completion_date] ?? "9999").localeCompare(String(b[f.completion_date] ?? "9999")))

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (site: Record<string, unknown>) => {
    setEditingId(String(site[f.id] ?? ""))
    setFormData({
      name:            String(site[f.name] ?? ""),
      manager:         String(site[f.manager] ?? ""),
      status:          site[f.status] != null ? String(site[f.status]) : String(100000000),
      completion_date: String(site[f.completion_date] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("現場名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:    formData.name,
      [f.manager]: formData.manager,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.completion_date) data[f.completion_date] = formData.completion_date

    try {
      if (editingId) {
        await updateSite.mutateAsync({ id: editingId, data })
        toast.success("現場を更新しました")
      } else {
        await createSite.mutateAsync(data)
        toast.success("現場を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteSite.mutateAsync(deleteId)
      toast.success("現場を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">現場マスタ</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">現場マスタ</h1>
          <p className="text-muted-foreground text-sm mt-1">現場情報の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>現場一覧</CardTitle>
          <CardDescription>{filtered.length} 件（竣工予定日の近い順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="現場名・現場代理人で検索..."
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
                {SITE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>現場名</TableHead>
                  <TableHead>現場代理人</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>竣工予定日</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      現場がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((site, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(site[f.name] ?? "")}</TableCell>
                      <TableCell>{String(site[f.manager] ?? "")}</TableCell>
                      <TableCell>
                        {site[f.status] != null && (
                          <StatusBadge status={site[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>{String(site[f.completion_date] ?? "")}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(site)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(site[f.id] ?? ""))}
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
        title={editingId ? "現場編集" : "現場新規登録"}
        onSave={handleSave}
        isSaving={createSite.isPending || updateSite.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">現場名 <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: ○○ビル新築工事"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="manager">現場代理人</Label>
              <Input
                id="manager"
                value={formData.manager}
                onChange={e => setFormData(p => ({ ...p, manager: e.target.value }))}
                placeholder="現場代理人名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="completion_date">竣工予定日</Label>
              <Input
                id="completion_date"
                type="date"
                value={formData.completion_date}
                onChange={e => setFormData(p => ({ ...p, completion_date: e.target.value }))}
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
                {SITE_STATUS_OPTIONS.map(o => (
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
        title="現場を削除しますか？"
        description="この操作は取り消せません。現場を完全に削除します（指摘事項は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
