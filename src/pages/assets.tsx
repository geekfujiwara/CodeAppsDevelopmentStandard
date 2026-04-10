import { useState, useMemo } from "react"
import { ListTable } from "@/components/list-table"
import type { TableColumn, FilterConfig } from "@/components/list-table"
import { FormModal, FormSection, FormColumns } from "@/components/form-modal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Monitor, Plus, Pencil, Trash2 } from "lucide-react"
import {
  useItAssets,
  useLocations,
  useCreateItAsset,
  useUpdateItAsset,
  useDeleteItAsset,
} from "@/hooks/use-incidents"
import { assetTypeLabels } from "@/types/incident"
import type { Geek_itassets } from "@/generated/models/Geek_itassetsModel"
import { toast } from "sonner"

type AssetRow = Geek_itassets & Record<string, unknown>

export default function AssetsPage() {
  const { data: assets = [], isLoading } = useItAssets()
  const { data: locations = [] } = useLocations()
  const createMutation = useCreateItAsset()
  const updateMutation = useUpdateItAsset()
  const deleteMutation = useDeleteItAsset()

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Geek_itassets | null>(null)

  // フォーム state
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState("")
  const [formSerial, setFormSerial] = useState("")
  const [formLocation, setFormLocation] = useState("")

  // Lookup 名前解決マップ
  const locationMap = useMemo(() => {
    const m = new Map<string, string>()
    locations.forEach((l) => m.set(l.geek_locationid, l.geek_name))
    return m
  }, [locations])

  const assetTypeColors: Record<number, string> = {
    100000000: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    100000001: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    100000002: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    100000003: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    100000004: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    100000005: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  }

  const columns: TableColumn<AssetRow>[] = [
    { key: "geek_name", label: "資産名", sortable: true },
    {
      key: "geek_assettype", label: "種別", sortable: true,
      render: (item) => {
        const t = item.geek_assettype as number | undefined
        return t != null ? (
          <Badge variant="outline" className={assetTypeColors[t] || ""}>{assetTypeLabels[t] || "不明"}</Badge>
        ) : null
      },
    },
    { key: "geek_serialnumber", label: "シリアル番号", sortable: true },
    {
      key: "_geek_locationid_value", label: "設置場所", sortable: true,
      render: (item) => {
        const v = item._geek_locationid_value as string | undefined
        return v ? locationMap.get(v) || "" : ""
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
      label: "種別",
      options: Object.entries(assetTypeLabels).map(([v, l]) => ({ value: v, label: l })),
    },
    {
      key: "_geek_locationid_value" as keyof AssetRow,
      label: "設置場所",
      options: locations.map((l) => ({ value: l.geek_locationid, label: l.geek_name })),
    },
  ]

  const resetForm = () => {
    setFormName("")
    setFormType("")
    setFormSerial("")
    setFormLocation("")
    setEditingAsset(null)
  }

  const startEdit = (asset: Geek_itassets) => {
    setFormName(asset.geek_name || "")
    setFormType(asset.geek_assettype != null ? String(asset.geek_assettype) : "")
    setFormSerial(asset.geek_serialnumber || "")
    setFormLocation(asset._geek_locationid_value || "")
    setEditingAsset(asset)
    setIsCreateOpen(true)
  }

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error("資産名は必須です")
      return
    }

    const payload: Record<string, unknown> = {
      geek_name: formName.trim(),
      geek_serialnumber: formSerial.trim() || undefined,
    }
    if (formType) payload.geek_assettype = Number(formType)
    if (formLocation) {
      payload["geek_locationid@odata.bind"] = `/geek_locations(${formLocation})`
    }

    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.geek_itassetid, ...payload }, {
        onSuccess: () => {
          toast.success("IT資産を更新しました")
          setIsCreateOpen(false)
          resetForm()
        },
        onError: () => toast.error("更新に失敗しました"),
      })
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => {
          toast.success("IT資産を作成しました")
          setIsCreateOpen(false)
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
      {/* 統計 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">合計</CardTitle>
            <Monitor className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assets.length}</div>
            <p className="text-xs text-muted-foreground">登録済み資産</p>
          </CardContent>
        </Card>
        {Object.entries(assetTypeLabels).slice(0, 3).map(([v, label]) => {
          const count = assets.filter((a) => a.geek_assettype === Number(v)).length
          return (
            <Card key={v}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{count}</div>
                <p className="text-xs text-muted-foreground">台</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 一覧テーブル */}
      <div className="flex justify-end">
        <Button onClick={() => { resetForm(); setIsCreateOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" />
          新規登録
        </Button>
      </div>
      <ListTable
        data={assets as AssetRow[]}
        columns={columns}
        searchKeys={["geek_name" as keyof AssetRow, "geek_serialnumber" as keyof AssetRow]}
        searchPlaceholder="IT資産を検索..."
        filters={filters}
        emptyMessage="IT資産はまだ登録されていません"
      />

      {/* 作成/編集モーダル */}
      <FormModal
        open={isCreateOpen}
        onOpenChange={(open) => { setIsCreateOpen(open); if (!open) resetForm() }}
        title={editingAsset ? "IT資産 編集" : "IT資産 登録"}
        description={editingAsset ? "IT資産の情報を更新します" : "新しいIT資産を登録します"}
        maxWidth="2xl"
        onSave={handleSave}
        saveLabel={editingAsset ? "更新" : "登録"}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <FormSection title="基本情報">
          <div className="space-y-2">
            <Label>資産名 *</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: Dell Latitude 5540" />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-2">
              <Label>種別</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(assetTypeLabels).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>シリアル番号</Label>
              <Input value={formSerial} onChange={(e) => setFormSerial(e.target.value)} placeholder="例: SN-12345" />
            </div>
          </FormColumns>
          <div className="space-y-2">
            <Label>設置場所</Label>
            <Combobox
              options={locations.map((l) => ({ value: l.geek_locationid, label: l.geek_name }))}
              value={formLocation}
              onValueChange={setFormLocation}
              placeholder="場所を選択"
              searchPlaceholder="検索..."
            />
          </div>
        </FormSection>
      </FormModal>
    </div>
  )
}
