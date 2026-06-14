import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FormModal, FormColumns, FormSection } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { useEmployees, useCreateEmployee, useUpdateEmployee, useDeleteEmployee } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EMPLOYEE_STATUS_LABEL,
  EMPLOYEE_STATUS_COLOR,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  type EmployeeStatus,
  type EmploymentType,
  type Employee,
} from "@/types/dataverse"
import { Plus, Pencil, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

const EMPTY_FORM = {
  name:            "",
  department:      "",
  position:        "",
  employment_type: "",
  hire_date:       "",
  status:          "100000000",
  email:           "",
  phone:           "",
  notes:           "",
}
type FormValues = typeof EMPTY_FORM

export default function Employees() {
  const { data: employees = [], isLoading } = useEmployees()
  const createMutation = useCreateEmployee()
  const updateMutation = useUpdateEmployee()
  const deleteMutation = useDeleteEmployee()

  const [search, setSearch]             = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter]     = useState("all")
  const [page, setPage]                 = useState(1)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editingId, setEditingId]       = useState<string | null>(null)
  const [form, setForm]                 = useState<FormValues>(EMPTY_FORM)
  const [deleteId, setDeleteId]         = useState<string | null>(null)
  const [isSaving, setIsSaving]         = useState(false)

  const P = PUBLISHER_PREFIX
  const f = {
    id:              `${P}_employeeid`,
    name:            `${P}_name`,
    department:      `${P}_department`,
    position:        `${P}_position`,
    employment_type: `${P}_employment_type`,
    hire_date:       `${P}_hire_date`,
    status:          `${P}_status`,
    email:           `${P}_email`,
    phone:           `${P}_phone`,
    notes:           `${P}_notes`,
  }

  const ITEMS_PER_PAGE = 15

  const filtered = employees.filter((e) => {
    const name  = (e[f.name] as string ?? "").toLowerCase()
    const dept  = (e[f.department] as string ?? "").toLowerCase()
    const pos   = (e[f.position] as string ?? "").toLowerCase()
    const q     = search.toLowerCase()
    const matchSearch = !q || name.includes(q) || dept.includes(q) || pos.includes(q)
    const matchStatus = statusFilter === "all" || String(e[f.status]) === statusFilter
    const matchType   = typeFilter === "all" || String(e[f.employment_type]) === typeFilter
    return matchSearch && matchStatus && matchType
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(emp: Employee) {
    const id = emp[f.id] as string
    setEditingId(id)
    setForm({
      name:            (emp[f.name] as string) ?? "",
      department:      (emp[f.department] as string) ?? "",
      position:        (emp[f.position] as string) ?? "",
      employment_type: String((emp[f.employment_type] as number) ?? ""),
      hire_date:       (emp[f.hire_date] as string)?.slice(0, 10) ?? "",
      status:          String((emp[f.status] as number) ?? 100000000),
      email:           (emp[f.email] as string) ?? "",
      phone:           (emp[f.phone] as string) ?? "",
      notes:           (emp[f.notes] as string) ?? "",
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("氏名は必須です")
      return
    }
    setIsSaving(true)
    try {
      const data: Record<string, unknown> = {
        name:            form.name,
        department:      form.department || undefined,
        position:        form.position || undefined,
        employment_type: form.employment_type ? Number(form.employment_type) : undefined,
        hire_date:       form.hire_date || undefined,
        status:          form.status ? Number(form.status) : 100000000,
        email:           form.email || undefined,
        phone:           form.phone || undefined,
        notes:           form.notes || undefined,
      }
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, data })
        toast.success("社員情報を更新しました")
      } else {
        await createMutation.mutateAsync(data)
        toast.success("社員を登録しました")
      }
      setModalOpen(false)
    } catch {
      toast.error(editingId ? "更新に失敗しました" : "登録に失敗しました")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteMutation.mutateAsync(deleteId)
      toast.success("社員を削除しました")
    } catch {
      toast.error("削除に失敗しました")
    } finally {
      setDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">社員台帳</h1>
        <LoadingSkeletonList count={8} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">社員台帳</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="氏名・部門・役職で検索..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="在籍状況" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="雇用形態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべて</SelectItem>
            {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>氏名</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>役職</TableHead>
                  <TableHead>雇用形態</TableHead>
                  <TableHead>入社日</TableHead>
                  <TableHead>在籍状況</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((emp, idx) => {
                    const status = (emp[f.status] as EmployeeStatus) ?? 100000000
                    const type   = emp[f.employment_type] as EmploymentType
                    const name   = (emp[f.name] as string) ?? "—"
                    const dept   = (emp[f.department] as string) ?? "—"
                    const pos    = (emp[f.position] as string) ?? "—"
                    const hired  = (emp[f.hire_date] as string)?.slice(0, 10) ?? "—"
                    const id     = emp[f.id] as string

                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{name}</TableCell>
                        <TableCell>{dept}</TableCell>
                        <TableCell>{pos}</TableCell>
                        <TableCell>{type != null ? EMPLOYMENT_TYPE_LABEL[type] : "—"}</TableCell>
                        <TableCell>{hired}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${EMPLOYEE_STATUS_COLOR[status]}`}>
                            {EMPLOYEE_STATUS_LABEL[status]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="編集" onClick={() => openEdit(emp)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="削除" onClick={() => setDeleteId(id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">
                {filtered.length}件中 {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)}件を表示
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>前へ</Button>
                <span className="text-sm">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <FormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? "社員情報を編集" : "社員を新規登録"}
        onSave={handleSave}
        isSaving={isSaving}
        saveLabel={isSaving ? "保存中..." : "保存"}
      >
        <div className="space-y-6">
          <FormSection title="基本情報">
            <FormColumns columns={2}>
              <div className="space-y-2">
                <Label htmlFor="name">氏名 <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: 山田 太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">部門</Label>
                <Input
                  id="department"
                  value={form.department}
                  onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))}
                  placeholder="例: 営業部"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="position">役職</Label>
                <Input
                  id="position"
                  value={form.position}
                  onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))}
                  placeholder="例: マネージャー"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employment_type">雇用形態</Label>
                <Select value={form.employment_type} onValueChange={(v) => setForm(f => ({ ...f, employment_type: v }))}>
                  <SelectTrigger id="employment_type">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="hire_date">入社日</Label>
                <Input
                  id="hire_date"
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => setForm(f => ({ ...f, hire_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">在籍状況</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="例: taro@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">電話番号</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="例: 03-0000-0000"
                />
              </div>
            </FormColumns>
          </FormSection>
          <FormSection title="備考">
            <div className="space-y-2">
              <Label htmlFor="notes">備考</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </FormSection>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
        title="社員を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
