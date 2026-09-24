import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { FormValue, FormValues } from "@/crm/api"
import type { EntityDef, FieldDef } from "@/crm/schema"
import type { LookupChoice } from "@/hooks/use-crm"
import { cn } from "@/lib/utils"

interface EntityFormProps {
  def: EntityDef
  values: FormValues
  onChange: (values: FormValues) => void
  choices: Partial<Record<string, LookupChoice[]>>
  disabled?: boolean
}

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

export function EntityForm({ def, values, onChange, choices, disabled }: EntityFormProps) {
  const set = (name: string, value: FormValue) => onChange({ ...values, [name]: value })
  const fields = def.fields.filter((f) => !f.readOnly)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name} className={cn("min-w-0 space-y-1.5", field.type === "memo" && "md:col-span-2")}>
          <Label htmlFor={field.name}>
            {field.label}{field.required && <span className="text-destructive"> *</span>}
          </Label>
          <FieldInput field={field} value={values[field.name]} onChange={(v) => set(field.name, v)} choices={choices} disabled={disabled} />
        </div>
      ))}
    </div>
  )
}

function FieldInput({ field, value, onChange, choices, disabled }: {
  field: FieldDef
  value: FormValue | undefined
  onChange: (value: FormValue) => void
  choices: Partial<Record<string, LookupChoice[]>>
  disabled?: boolean
}) {
  const text = value == null ? "" : String(value)
  switch (field.type) {
    case "memo":
      return <Textarea id={field.name} rows={4} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    case "picklist":
      return (
        <select id={field.name} className={selectClass} value={text} disabled={disabled}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
          <option value="">（未選択）</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    case "lookup":
      return (
        <select id={field.name} className={selectClass} value={text} disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}>
          <option value="">（未選択）</option>
          {(field.target ? choices[field.target] ?? [] : []).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      )
    case "boolean":
      return <input id={field.name} type="checkbox" className="h-4 w-4" checked={value === true} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    case "money":
    case "number":
      return <Input id={field.name} type="number" inputMode="decimal" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
    case "date":
      return <Input id={field.name} type="date" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
    case "datetime":
      return <Input id={field.name} type="datetime-local" value={text} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} />
    default:
      return <Input id={field.name} type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"} value={text} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  }
}
