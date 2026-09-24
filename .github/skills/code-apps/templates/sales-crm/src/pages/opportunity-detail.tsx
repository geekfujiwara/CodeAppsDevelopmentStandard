import { useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, CalendarPlus, Mail, MessageSquare, NotebookPen, Pencil, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { StagePath } from "@/components/stage-path"
import { CoworkButton } from "@/components/crm/cowork-button"
import { DataState } from "@/components/crm/data-state"
import { EntityForm } from "@/components/crm/entity-form"
import { RecordDialog } from "@/components/crm/record-dialog"
import { displayValue, missingRequired, toFormValues, type FormValues } from "@/crm/api"
import { formatDateTime, optionLabel } from "@/crm/format"
import { nextBusinessSlot, openExternal, outlookMailUrl, outlookMeetingUrl, teamsChatUrl } from "@/crm/links"
import { coworkPrompts } from "@/crm/prompts"
import { ACTIVITY_STATUS_OPTIONS, ACTIVITY_TYPE_OPTIONS, ActivityStatus, ActivityType, col, ENTITIES, OpportunityStage, STAGE_OPTIONS } from "@/crm/schema"
import { todayIso } from "@/crm/metrics"
import {
  useActivities, useContacts, useDeleteEntity, useEntityRow, useLookupChoices, useOpportunities, usePatchOpportunity, useSaveEntity, useUserMap,
} from "@/hooks/use-crm"

const def = ENTITIES.opportunity

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const row = useEntityRow("opportunity", id)
  const opportunities = useOpportunities()
  const activities = useActivities()
  const contacts = useContacts()
  const users = useUserMap()
  const choices = useLookupChoices()
  const save = useSaveEntity("opportunity")
  const remove = useDeleteEntity("opportunity")
  const patch = usePatchOpportunity()
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<FormValues>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newActivity, setNewActivity] = useState<FormValues>()

  const opp = opportunities.data?.find((o) => o.id === id)
  const contact = contacts.data?.find((c) => c.id === opp?.contactId)
  const owner = users.get(opp?.ownerId ?? "")
  const related = useMemo(
    () => (activities.data ?? []).filter((a) => a.opportunityId === id).sort((a, b) => (b.dueDate ?? "").localeCompare(a.dueDate ?? "")),
    [activities.data, id],
  )

  const changeStage = async (stage: number) => {
    if (!id) return
    const body: Record<string, unknown> = { [col("stage")]: stage }
    if (stage === OpportunityStage.Won) Object.assign(body, { [col("probability")]: 100, [col("actualclosedate")]: todayIso() })
    if (stage === OpportunityStage.Lost) Object.assign(body, { [col("probability")]: 0, [col("actualclosedate")]: todayIso() })
    try {
      await patch.mutateAsync({ id, body })
      toast.success(`ステージを「${STAGE_OPTIONS.find((s) => s.value === stage)?.label}」に更新しました`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新に失敗しました")
    }
  }

  const startEdit = () => {
    setValues(toFormValues(def, row.data))
    setEditing(true)
  }

  const saveEdit = async () => {
    const missing = missingRequired(def, values)
    if (missing.length > 0) return void toast.error(`必須項目を入力してください: ${missing.join("、")}`)
    try {
      await save.mutateAsync({ values, id })
      toast.success("商談を更新しました")
      setEditing(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新に失敗しました")
    }
  }

  const doDelete = async () => {
    if (!id) return
    try {
      await remove.mutateAsync(id)
      toast.success("商談を削除しました")
      navigate("/opportunities")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "削除に失敗しました")
    }
  }

  const subject = opp?.name ?? ""

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild><Link to="/opportunities"><ArrowLeft className="h-4 w-4" />商談一覧</Link></Button>
      <DataState isLoading={row.isLoading || opportunities.isLoading} error={row.error ?? opportunities.error}>
        {row.data && opp && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{opp.name}</h1>
                <p className="text-sm text-muted-foreground">担当 {owner?.name ?? "—"}・{displayValue(row.data, def.fields[1]) || "取引先未設定"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!contact?.email}
                  onClick={() => openExternal(outlookMeetingUrl({ to: [contact?.email], subject: `【打合せ】${subject}`, body: opp.nextStep ?? "", start: nextBusinessSlot() }))}>
                  <CalendarPlus className="h-4 w-4" />日程調整
                </Button>
                <Button variant="outline" size="sm" disabled={!contact?.email}
                  onClick={() => openExternal(outlookMailUrl({ to: [contact?.email], subject: `【ご連絡】${subject}` }))}>
                  <Mail className="h-4 w-4" />メール下書き
                </Button>
                <Button variant="outline" size="sm" disabled={!owner?.email}
                  onClick={() => openExternal(teamsChatUrl([owner?.email], `商談「${subject}」について相談させてください`))}>
                  <MessageSquare className="h-4 w-4" />担当者と相談
                </Button>
                <CoworkButton prompt={coworkPrompts.dealPlan(opp)} label="Cowork で打ち手" />
              </div>
            </div>

            <StagePath stages={STAGE_OPTIONS} current={opp.stage} negativeValue={OpportunityStage.Lost} onSelect={(s) => void changeStage(s)} />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Card className="min-w-0">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>商談情報</CardTitle>
                  {editing ? (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={save.isPending}><X className="h-4 w-4" />キャンセル</Button>
                      <Button size="sm" onClick={() => void saveEdit()} disabled={save.isPending}><Save className="h-4 w-4" />保存</Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={startEdit}><Pencil className="h-4 w-4" />編集</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
                          <dd className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{displayValue(row.data!, f) || "—"}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle>活動</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setNewActivity({
                    [col("type")]: ActivityType.Meeting, [col("status")]: ActivityStatus.Completed,
                    [col("opportunityid")]: opp.id, [col("accountid")]: opp.accountId ?? null, [col("contactid")]: opp.contactId ?? null,
                  })}>
                    <NotebookPen className="h-4 w-4" />活動を報告
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {related.map((a) => (
                    <Link key={a.id} to={`/activities/${a.id}`} className="block rounded-lg border p-3 hover:bg-accent/50">
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {optionLabel(ACTIVITY_TYPE_OPTIONS, a.type)}・{optionLabel(ACTIVITY_STATUS_OPTIONS, a.status)}・{formatDateTime(a.dueDate)}
                      </p>
                    </Link>
                  ))}
                  {related.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">まだ活動がありません</p>}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </DataState>

      <RecordDialog entity="activity" open={!!newActivity} onOpenChange={(o) => !o && setNewActivity(undefined)} initial={newActivity} title="活動を報告" />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="商談を削除しますか？"
        description="この操作は取り消せません。関連する活動の商談参照は解除されます。" confirmLabel="削除" variant="destructive" onConfirm={() => void doDelete()} />
    </div>
  )
}
