import { useState } from "react"
import { toast } from "sonner"
import type { Drawing, TemplateId } from "@/drawing/drawing-schema"
import { DRAWING_TEMPLATES, TEMPLATE_LIST } from "@/drawing/drawing-templates"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useWorkspace } from "@/state/workspace-context"

const TITLE_FIELDS: { key: keyof Drawing["titleBlock"]; label: string; placeholder: string }[] = [
  { key: "drawingNumber", label: "図番", placeholder: "LY-0001" },
  { key: "title", label: "図面名", placeholder: "汎用機器配置図" },
  { key: "project", label: "件名", placeholder: "第 2 工場 レイアウト検討" },
  { key: "designer", label: "設計", placeholder: "設計担当" },
  { key: "checker", label: "照査", placeholder: "未割当" },
  { key: "scale", label: "尺度", placeholder: "NTS" },
  { key: "date", label: "作図日 (YYYY-MM-DD)", placeholder: "2026-01-15" },
  { key: "note", label: "注記", placeholder: "寸法は mm" },
]

export function DesignPanel() {
  const { state, dispatch } = useWorkspace()
  const drawing = state.drawing
  const template = DRAWING_TEMPLATES[drawing.templateId]
  const [pendingTemplate, setPendingTemplate] = useState<TemplateId | null>(null)

  const groups = [...new Set(template.parameters.map((parameter) => parameter.group))]

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2" data-tour="template-select">
        <Label htmlFor="template">テンプレート</Label>
        <Select value={drawing.templateId} onValueChange={(value) => setPendingTemplate(value as TemplateId)}>
          <SelectTrigger id="template" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATE_LIST.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{template.summary}</p>
      </div>

      <div className="space-y-3" data-tour="parameter-form">
        {groups.map((group) => (
          <div key={group} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {template.parameters
                .filter((parameter) => parameter.group === group)
                .map((parameter) => (
                  <div key={parameter.key} className="min-w-0 space-y-1">
                    <Label htmlFor={parameter.key} className="text-xs [overflow-wrap:anywhere]">
                      {parameter.label} ({parameter.unit})
                    </Label>
                    <Input
                      id={parameter.key}
                      type="number"
                      inputMode="decimal"
                      min={parameter.min}
                      max={parameter.max}
                      step={parameter.step}
                      value={drawing.parameters[parameter.key]}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (!Number.isFinite(value)) return
                        if (value < parameter.min || value > parameter.max) {
                          toast.error(`${parameter.label} は ${parameter.min} 〜 ${parameter.max} ${parameter.unit} の範囲です`)
                          return
                        }
                        dispatch({ type: "update-parameter", key: parameter.key, value: parameter.integer ? Math.round(value) : value })
                      }}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {parameter.min} 〜 {parameter.max}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-md border border-border p-3" data-tour="title-block-form">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">表題欄</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TITLE_FIELDS.map((field) => (
            <div key={field.key} className="min-w-0 space-y-1">
              <Label htmlFor={`title-${field.key}`} className="text-xs [overflow-wrap:anywhere]">
                {field.label}
              </Label>
              <Input
                id={`title-${field.key}`}
                value={drawing.titleBlock[field.key]}
                placeholder={field.placeholder}
                maxLength={120}
                onChange={(event) => dispatch({ type: "update-title-block", key: field.key, value: event.target.value })}
              />
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null)
        }}
        title="テンプレートを切り替えますか？"
        description="現在の寸法と注釈は新しいテンプレートの既定値に置き換わります。Undo で戻せます。"
        confirmLabel="切り替える"
        variant="destructive"
        onConfirm={() => {
          if (pendingTemplate) dispatch({ type: "select-template", templateId: pendingTemplate })
          setPendingTemplate(null)
        }}
      />
    </div>
  )
}
