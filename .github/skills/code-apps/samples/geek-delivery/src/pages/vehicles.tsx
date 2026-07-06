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
  useVehicles,
  useCreateVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_VEHICLES, INSPECTION_WARNING_DAYS } from "@/config"
import {
  VEHICLE_STATUS_LABEL,
  VEHICLE_STATUS_COLOR,
  VEHICLE_STATUS_OPTIONS,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:             `${P}_vehicleid`,
  name:           `${P}_name`,
  model:          `${P}_model`,
  driver:         `${P}_driver`,
  status:         `${P}_status`,
  inspection_due: `${P}_inspection_due`,
}

function StatusBadge({ status }: { status: number }) {
  const label = VEHICLE_STATUS_LABEL[status as keyof typeof VEHICLE_STATUS_LABEL] ?? String(status)
  const color = VEHICLE_STATUS_COLOR[status as keyof typeof VEHICLE_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
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
            車両マスタは現在無効になっています。有効にするには .env の{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">VITE_FEATURE_VEHICLES=true</code>{" "}
            を設定してください。
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

type FormData = {
  name: string
  model: string
  driver: string
  status: string
  inspection_due: string
}

const EMPTY_FORM: FormData = {
  name: "", model: "", driver: "", status: String(100000000), inspection_due: "",
}

export default function VehiclesPage() {
  if (!FEATURE_VEHICLES) return <DisabledFeatureCard />
  return <VehiclesContent />
}

function VehiclesContent() {
  const { data: vehicles = [], isLoading } = useVehicles()
  const createVehicle = useCreateVehicle()
  const updateVehicle = useUpdateVehicle()
  const deleteVehicle = useDeleteVehicle()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")

  const soon = new Date()
  soon.setDate(soon.getDate() + INSPECTION_WARNING_DAYS)
  const soonStr = soon.toISOString().slice(0, 10)
  const isInspectionSoon = (vehicle: Record<string, unknown>) => {
    const due = vehicle[f.inspection_due] as string | undefined
    return !!due && due <= soonStr
  }

  const filtered = vehicles
    .filter(vehicle => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        String(vehicle[f.name] ?? "").toLowerCase().includes(q) ||
        String(vehicle[f.model] ?? "").toLowerCase().includes(q) ||
        String(vehicle[f.driver] ?? "").toLowerCase().includes(q)
      const matchStatus = filterStatus === "all" || String(vehicle[f.status]) === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => String(a[f.inspection_due] ?? "9999").localeCompare(String(b[f.inspection_due] ?? "9999")))

  const handleNew = () => {
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setIsFormOpen(true)
  }

  const handleEdit = (vehicle: Record<string, unknown>) => {
    setEditingId(String(vehicle[f.id] ?? ""))
    setFormData({
      name:           String(vehicle[f.name] ?? ""),
      model:          String(vehicle[f.model] ?? ""),
      driver:         String(vehicle[f.driver] ?? ""),
      status:         vehicle[f.status] != null ? String(vehicle[f.status]) : String(100000000),
      inspection_due: String(vehicle[f.inspection_due] ?? ""),
    })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("車両名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:   formData.name,
      [f.model]:  formData.model,
      [f.driver]: formData.driver,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.inspection_due) data[f.inspection_due] = formData.inspection_due

    try {
      if (editingId) {
        await updateVehicle.mutateAsync({ id: editingId, data })
        toast.success("車両を更新しました")
      } else {
        await createVehicle.mutateAsync(data)
        toast.success("車両を登録しました")
      }
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await deleteVehicle.mutateAsync(deleteId)
      toast.success("車両を削除しました")
      setDeleteId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">車両マスタ</h1>
        <LoadingSkeletonList count={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">車両マスタ</h1>
          <p className="text-muted-foreground text-sm mt-1">車両情報と点検期限の管理</p>
        </div>
        <Button onClick={handleNew} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>車両一覧</CardTitle>
          <CardDescription>{filtered.length} 件（点検期限の近い順）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="車両名・車種・担当ドライバーで検索..."
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
                {VEHICLE_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>車両名（ナンバー）</TableHead>
                  <TableHead>車種</TableHead>
                  <TableHead>担当ドライバー</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>点検期限</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      車両がありません
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((vehicle, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(vehicle[f.name] ?? "")}</TableCell>
                      <TableCell>{String(vehicle[f.model] ?? "")}</TableCell>
                      <TableCell>{String(vehicle[f.driver] ?? "")}</TableCell>
                      <TableCell>
                        {vehicle[f.status] != null && (
                          <StatusBadge status={vehicle[f.status] as number} />
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1">
                          {String(vehicle[f.inspection_due] ?? "")}
                          {isInspectionSoon(vehicle) && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <AlertTriangle className="h-3 w-3" />間近
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEdit(vehicle)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(String(vehicle[f.id] ?? ""))}
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
        title={editingId ? "車両編集" : "車両新規登録"}
        onSave={handleSave}
        isSaving={createVehicle.isPending || updateVehicle.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">車両名（ナンバー） <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="例: 品川 100 あ 12-34"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="model">車種</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={e => setFormData(p => ({ ...p, model: e.target.value }))}
                placeholder="例: 2t トラック"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driver">担当ドライバー</Label>
              <Input
                id="driver"
                value={formData.driver}
                onChange={e => setFormData(p => ({ ...p, driver: e.target.value }))}
                placeholder="担当ドライバー名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ステータス</Label>
              <Select value={formData.status} onValueChange={vv => setFormData(p => ({ ...p, status: vv }))}>
                <SelectTrigger>
                  <SelectValue placeholder="ステータスを選択" />
                </SelectTrigger>
                <SelectContent>
                  {VEHICLE_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inspection_due">点検期限</Label>
              <Input
                id="inspection_due"
                type="date"
                value={formData.inspection_due}
                onChange={e => setFormData(p => ({ ...p, inspection_due: e.target.value }))}
              />
            </div>
          </FormColumns>
        </div>
      </FormModal>

      {/* 削除確認 */}
      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={open => { if (!open) setDeleteId(null) }}
        title="車両を削除しますか？"
        description="この操作は取り消せません。車両を完全に削除します（配送便は残ります）。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
