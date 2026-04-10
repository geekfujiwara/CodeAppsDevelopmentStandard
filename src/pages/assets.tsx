import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ListTable } from "@/components/list-table"
import type { TableColumn, FilterConfig } from "@/components/list-table"
import { FormModal, FormSection, FormColumns } from "@/components/form-modal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Plus, Pencil, Trash2 } from "lucide-react"
import {
  useItAssets,
  useCreateItAsset,
  useUpdateItAsset,
  useDeleteItAsset,
} from "@/hooks/use-incidents"
import {
  assetTypeLabels,
  assetTypeColors,
  assetStatusLabels,
  assetStatusColors,
} from "@/types/incident"
import type { Geek_itassets } from "@/generated/models/Geek_itassetsModel"
import { toast } from "sonner"

type AssetRow = Geek_itassets & Record<string, unknown>

export default function AssetsPage() {
  const { data: assets = [], isLoading } = useItAssets()
  const createMutation = useCreateItAsset()
  const updateMutation = useUpdateItAsset()
  const deleteMutation = useDeleteItAsset()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Geek_itassets | null>(null)

  const [formName, setFormName] = useState("")
  const [formNumber, setFormNumber] = useState("")
  const [formType, setFormType] = useState("")
  const [formLocation, setFormLocation] = useState("")
  const [formMfr, setFormMfr] = useState("")
  const [formModel, setFormModel] = useState("")
  const [formStatus, setFormStatus] = useState("")
  const [formRemarks, setFormRemarks] = useState("")

  const columns: TableColumn<AssetRow>[] = [
    { key: "geek_name", label: "資産名", sortable: true },
    {
      key: "geek_assettype", label: "資産タイプ", sortable: true,
      render: (item) => {
        const t = item.geek_assettype as number | undefined
        return t != null ? (
          <Badge variant="outline" className={assetTypeColors[t] || ""}>{assetTypeLabels[t] || "不明"}</Badge>
        ) : null
      },
    },
    { key: "geek_assetnumber", label: "資産番号", sortable: true },
    { key: "geek_location", label: "設置場所", sortable: true },
    { key: "geek_manufacturer", label: "メーカー", sortable: true },
    { key: "geek_model", label: "モデル", sortable: true },
    {
      key: "geek_status", label: "ステータス", sortable: true,
      render: (item) => {
        const s = item.geek_status as number | undefined
        return s != null ? (
          <Badge variant="outline" className={assetStatusColors[s] || ""}>{assetStatusLabels[s] || "不明"}</Badge>
        ) : null
      },
    },
    {
      key: "geek_itassetid", label: "操作", sortable: false,
      render: (item) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); startEdit(item as Geek_itassets) }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="z-[400]">
              <AlertDialogHeader>
                <AlertDialogTitle>IT資産を削除しますか？</AlertDialogTitle>
                <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(item.geek_itassetid)}>削除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ]

  const filters: FilterConfig<AssetRow>[] = [
    {
      key: "geek_assettype" as keyof AssetRow,
      label: "資産タイプ",
      options: Object.entries(assetTypeLabels).map(([v, l]) => ({ value: v, label: l })),
    },
    {
      key: "geek_status" as keyof AssetRow,
      label: "ステータス",
      options: Object.entries(assetStatusLabels).map(([v, l]) => ({ value: v, label: l })),
    },
  ]

  const resetForm = () => {
    setFormName(""); setFormNumber(""); setFormType(""); setFormLocation("")
    setFormMfr(""); setFormModel(""); setFormStatus(""); setFormRemarks("")
    setEditingAsset(null)
  }

  const startEdit = (asset: Geek_itassets) => {
    setFormName(asset.geek_name || "")
    setFormNumber(asset.geek_assetnumber || "")
    setFormType(asset.geek_assettype != null ? String(asset.geek_assettype) : "")
    setFormLocation(asset.geek_location || "")
    setFormMfr(asset.geek_manufacturer || "")
    setFormModel(asset.geek_model || "")
    setFormStatus(asset.geek_status != null ? String(asset.geek_status) : "")
    setFormRemarks(asset.geek_remarks || "")
    setEditingAsset(asset)
    setIsFormOpen(true)
  }

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("資産名は必須です")
      return
    }
    const payload: Record<string, unknown> = {
      geek_name: formName.trim(),
      geek_assetnumber: formNumber.trim() || undefined,
      geek_location: formLocation.trim() || undefined,
      geek_manufacturer: formMfr.trim() || undefined,
      geek_model: formModel.trim() || undefined,
      geek_remarks: formRemarks.trim() || undefined,
    }
    if (formType) payload.geek_assettype = Number(formType)
    if (formStatus) payload.geek_status = Number(formStatus)

    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.geek_itassetid, ...payload }, {
        onSuccess: () => {
          toast.success("IT資産を更新しました")
          setIsFormOpen(false)
          resetForm()
        },
        onError: () => toast.error("更新に失敗しました"),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("IT資産を作成しました")
          setIsFormOpen(false)
          resetForm()
        },
        onError: () => toast.error("作成に失敗しました"),
      })
    }
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("IT資産を削除しました"),
      onError: () => toast.error("削除に失敗しました"),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>IT資産一覧</CardTitle>
          <Button onClick={() => { resetForm(); setIsFormOpen(true) }}>
            <Plus className="mr-1 h-4 w-4" /> 新規登録
          </Button>
        </CardHeader>
        <CardContent>
          <ListTable
            data={assets as AssetRow[]}
            columns={columns}
            filters={filters}
            searchKeys={["geek_name", "geek_assetnumber", "geek_location", "geek_manufacturer"]}
          />
        </CardContent>
      </Card>

      {/* 作成/編集モーダル */}
      <FormModal
        open={isFormOpen}
        onOpenChange={(open) => { setIsFormOpen(open); if (!open) resetForm() }}
        title={editingAsset ? "IT資産編集" : "IT資産登録"}
        maxWidth="2xl"
        onSave={handleSave}
        saveLabel={editingAsset ? "更新" : "登録"}
      >
        <FormSection title="基本情報">
          <FormColumns columns={2}>
            <div className="space-y-2">
              <Label>資産名 *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: 営業部PC-001" />
            </div>
            <div className="space-y-2">
              <Label>資産番号</Label>
              <Input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} placeholder="例: AST-2024-001" />
            </div>
          </FormColumns>
          <FormColumns columns={2}>
            <div className="space-y-2">
              <Label>資産タイプ</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent className="z-[500]">
                  {Object.entries(assetTypeLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ステータス</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent className="z-[500]">
                  {Object.entries(assetStatusLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FormColumns>
          <FormColumns columns={2}>
            <div className="space-y-2">
              <Label>設置場所</Label>
              <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="例: 本社3F 営業部" />
            </div>
            <div className="space-y-2">
              <Label>メーカー</Label>
              <Input value={formMfr} onChange={(e) => setFormMfr(e.target.value)} placeholder="例: Dell" />
            </div>
          </FormColumns>
          <div className="space-y-2">
            <Label>モデル</Label>
            <Input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder="例: Latitude 5540" />
          </div>
        </FormSection>
        <FormSection title="備考">
          <div className="space-y-2">
            <Textarea value={formRemarks} onChange={(e) => setFormRemarks(e.target.value)} rows={3} placeholder="補足情報" />
          </div>
        </FormSection>
      </FormModal>
    </div>
  )
}
