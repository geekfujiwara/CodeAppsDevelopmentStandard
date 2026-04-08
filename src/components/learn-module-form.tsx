import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Combobox } from "@/components/ui/combobox"
import { FormColumns, FormModal, FormSection } from "@/components/form-modal"
import { useLearnCatalog } from "@/hooks/use-learn-catalog"
import { toast } from "sonner"
import { Calendar, CheckCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModulePlanFormState {
  owner: string
  targetRole: string
  startDate: string
  dueDate: string
  deliverable: string
  notes: string
  priority: "high" | "medium" | "low"
  status: "draft" | "in-progress" | "completed"
}

export function LearnModulePlanForm() {
  const { data, isLoading, isFetching } = useLearnCatalog()
  const [open, setOpen] = useState(false)
  const [selectedModuleId, setSelectedModuleId] = useState<string>("")
  const [formState, setFormState] = useState<ModulePlanFormState>({
    owner: "",
    targetRole: "",
    startDate: "",
    dueDate: "",
    deliverable: "",
    notes: "",
    priority: "medium",
    status: "draft",
  })

  const modules = useMemo(() => data?.modules.slice(0, 50) ?? [], [data?.modules])
  const moduleMap = useMemo(() => new Map(modules.map((module) => [module.uid, module])), [modules])

  useEffect(() => {
    if (!selectedModuleId && modules.length > 0) {
      const topModule = modules[0]
      setSelectedModuleId(topModule.uid)
      setFormState((prev) => ({
        ...prev,
  deliverable: `${topModule.title} の学習計画`,
        targetRole: topModule.roles[0] ?? "",
      }))
    }
  }, [modules, selectedModuleId])

  const selectedModule = selectedModuleId ? moduleMap.get(selectedModuleId) : undefined

  const handleSave = () => {
    if (!selectedModule) {
      toast.error("モジュールを選択してください")
      return
    }

    toast.success(`学習プラン「${selectedModule.title}」を仮保存しました`)
    setOpen(false)
  }

  const handleChange = <K extends keyof ModulePlanFormState>(field: K, value: ModulePlanFormState[K]) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1 text-left">
          <p className="text-sm font-medium text-foreground">モジュール学習プラン</p>
          <p className="text-xs text-muted-foreground">
            Microsoft Learn のモジュールをもとに学習プランを作成するデモです。
          </p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={isLoading} className="gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
          プランを作成
        </Button>
      </div>

      <FormModal
        open={open}
        onOpenChange={setOpen}
        title="学習プランを作成"
        description="Microsoft Learn カタログから取得したモジュールをベースに学習計画を組み立てます。"
        onSave={handleSave}
        saveLabel="プランを保存"
      >
        <div className="space-y-8">
          <FormSection title="対象モジュール">
            <FormColumns>
              <div className="space-y-2">
                <Label htmlFor="module">モジュール</Label>
                <Combobox
                  value={selectedModuleId}
                  onValueChange={(value) => {
                    setSelectedModuleId(value)
                    const module = moduleMap.get(value)
                    setFormState((prev) => ({
                      ...prev,
                      deliverable: module ? `${module.title} の学習プラン` : prev.deliverable,
                      targetRole: module?.roles[0] ?? prev.targetRole,
                    }))
                  }}
                  options={modules.map((module) => ({
                    value: module.uid,
                    label: module.title,
                  }))}
                  searchPlaceholder="モジュールを検索..."
                  placeholder="モジュールを選択"
                  emptyMessage="モジュールが見つかりません"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetRole">対象ロール</Label>
                <Input
                  id="targetRole"
                  value={formState.targetRole}
                  onChange={(event) => handleChange("targetRole", event.target.value)}
                  placeholder="例: 開発者"
                />
              </div>
            </FormColumns>

            {selectedModule && (
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {selectedModule.levels.map((level) => (
                    <Badge key={level} variant="secondary">
                      {level}
                    </Badge>
                  ))}
                  {selectedModule.roles.slice(0, 3).map((role) => (
                    <Badge key={role} variant="outline">
                      {role}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {selectedModule.summary}
                </p>
                <p className="text-xs text-muted-foreground">
                  学習時間の目安: 約 {selectedModule.durationInMinutes} 分
                </p>
              </div>
            )}
          </FormSection>

          <FormSection title="スケジュール">
            <FormColumns>
              <div className="space-y-2">
                <Label htmlFor="owner">担当者</Label>
                <Input
                  id="owner"
                  value={formState.owner}
                  onChange={(event) => handleChange("owner", event.target.value)}
                  placeholder="例: 山田太郎"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">開始日</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formState.startDate}
                  onChange={(event) => handleChange("startDate", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">完了目標日</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formState.dueDate}
                  onChange={(event) => handleChange("dueDate", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">優先度</Label>
                <Combobox
                  value={formState.priority}
                  onValueChange={(value) => handleChange("priority", value as ModulePlanFormState["priority"])}
                  options={[
                    { value: "high", label: "高" },
                    { value: "medium", label: "中" },
                    { value: "low", label: "低" },
                  ]}
                  placeholder="優先度を選択"
                  searchPlaceholder="優先度を検索..."
                  emptyMessage="見つかりません"
                />
              </div>
            </FormColumns>
          </FormSection>

          <FormSection title="成果物とメモ">
            <FormColumns columns={1}>
              <div className="space-y-2">
                <Label htmlFor="deliverable">成果物のイメージ</Label>
                <Input
                  id="deliverable"
                  value={formState.deliverable}
                  onChange={(event) => handleChange("deliverable", event.target.value)}
                  placeholder="例: Power Apps ソリューションのプロトタイプ"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">備考</Label>
                <Textarea
                  id="notes"
                  value={formState.notes}
                  onChange={(event) => handleChange("notes", event.target.value)}
                  placeholder="学習の目的やフォローアップ事項を記載"
                  rows={5}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">ステータス</Label>
                <Combobox
                  value={formState.status}
                  onValueChange={(value) => handleChange("status", value as ModulePlanFormState["status"])}
                  options={[
                    { value: "draft", label: "ドラフト" },
                    { value: "in-progress", label: "進行中" },
                    { value: "completed", label: "完了" },
                  ]}
                  placeholder="ステータスを選択"
                  searchPlaceholder="ステータスを検索..."
                  emptyMessage="見つかりません"
                />
              </div>
            </FormColumns>
          </FormSection>
        </div>
      </FormModal>

      <div className={cn(
        "flex items-center gap-3 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4",
        (isLoading || isFetching) && "opacity-80"
      )}>
        <CheckCircle className="h-5 w-5 text-primary" />
        <div className="text-sm text-muted-foreground">
          {isFetching ? "最新のモジュール情報を読み込んでいます..." : "Microsoft Learn API から取得したデータをもとにフォームを構成しています。"}
        </div>
      </div>
    </div>
  )
}
