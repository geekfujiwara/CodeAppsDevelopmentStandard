import { useState } from "react"
import { toast } from "sonner"
import { FormModal } from "@/components/form-modal"
import { EntityForm } from "@/components/crm/entity-form"
import { missingRequired, toFormValues, type FormValues } from "@/crm/api"
import { ENTITIES, type EntityKey } from "@/crm/schema"
import { useLookupChoices, useSaveEntity } from "@/hooks/use-crm"

interface RecordDialogProps {
  entity: EntityKey
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: FormValues
  title?: string
}

export function RecordDialog({ entity, open, onOpenChange, initial, title }: RecordDialogProps) {
  const def = ENTITIES[entity]
  const choices = useLookupChoices()
  const save = useSaveEntity(entity)
  const [values, setValues] = useState<FormValues>(() => ({ ...toFormValues(def), ...initial }))
  const [wasOpen, setWasOpen] = useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValues({ ...toFormValues(def), ...initial })
  }

  const handleSave = async () => {
    const missing = missingRequired(def, values)
    if (missing.length > 0) {
      toast.error(`必須項目を入力してください: ${missing.join("、")}`)
      return
    }
    try {
      await save.mutateAsync({ values })
      toast.success(`${def.label}を登録しました`)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登録に失敗しました")
    }
  }

  return (
    <FormModal open={open} onOpenChange={onOpenChange} title={title ?? `${def.label}を追加`} onSave={handleSave} isSaving={save.isPending}>
      <EntityForm def={def} values={values} onChange={setValues} choices={choices} disabled={save.isPending} />
    </FormModal>
  )
}
