import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Pencil, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataState } from "@/components/crm/data-state"
import { EntityForm } from "@/components/crm/entity-form"
import { missingRequired, toFormValues, type FormValues } from "@/crm/api"
import { cellText } from "@/crm/cell-text"
import { ENTITIES, type EntityKey } from "@/crm/schema"
import { useDeleteEntity, useEntityRow, useLookupChoices, useSaveEntity, useUserMap } from "@/hooks/use-crm"

export default function RecordDetailPage({ entity }: { entity: EntityKey }) {
  const def = ENTITIES[entity]
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const row = useEntityRow(entity, id)
  const users = useUserMap()
  const choices = useLookupChoices()
  const save = useSaveEntity(entity)
  const remove = useDeleteEntity(entity)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<FormValues>({})
  const [confirmDelete, setConfirmDelete] = useState(false)

  const saveEdit = async () => {
    const missing = missingRequired(def, values)
    if (missing.length > 0) return void toast.error(`必須項目を入力してください: ${missing.join("、")}`)
    try {
      await save.mutateAsync({ values, id })
      toast.success(`${def.label}を更新しました`)
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新に失敗しました")
    }
  }

  const doDelete = async () => {
    if (!id) return
    try {
      await remove.mutateAsync(id)
      toast.success(`${def.label}を削除しました`)
      navigate(def.path)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました")
    }
  }

  const data = row.data
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to={def.path}><ArrowLeft className="h-4 w-4" />{def.label}一覧</Link></Button>
      <DataState isLoading={row.isLoading} error={row.error}>
        {data && (
          <Card className="min-w-0">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="[overflow-wrap:anywhere]">{String(data[def.nameField] ?? def.label)}</CardTitle>
                {def.ownerScoped && <p className="text-sm text-muted-foreground">所有者 {users.get(String(data._ownerid_value ?? ""))?.name ?? "—"}</p>}
              </div>
              {editing ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}><X className="h-4 w-4" />キャンセル</Button>
                  <Button size="sm" onClick={() => void saveEdit()} disabled={save.isPending}><Save className="h-4 w-4" />保存</Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setValues(toFormValues(def, data)); setEditing(true) }}><Pencil className="h-4 w-4" />編集</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} aria-label="削除"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <EntityForm def={def} values={values} onChange={setValues} choices={choices} disabled={save.isPending} />
              ) : (
                <dl className="grid gap-4 md:grid-cols-2">
                  {def.fields.map((f) => (
                    <div key={f.name} className={f.type === "memo" ? "min-w-0 md:col-span-2" : "min-w-0"}>
                      <dt className="text-xs text-muted-foreground">{f.label}</dt>
                      <dd className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{cellText(data, f)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        )}
      </DataState>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title={`${def.label}を削除しますか？`}
        description="この操作は取り消せません。" confirmLabel="削除" variant="destructive" onConfirm={() => void doDelete()} />
    </div>
  )
}
