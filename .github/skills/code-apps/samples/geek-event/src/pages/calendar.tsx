import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormModal, FormColumns } from "@/components/form-modal"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { MonthCalendar, type CalendarEvent } from "@/components/month-calendar"
import { useEvents, useCreateEvent } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import {
  EVENT_STATUS_LABEL,
  EVENT_STATUS_COLOR,
  EVENT_STATUS_OPTIONS,
  EVENT_STATUS_OPEN,
} from "@/types/dataverse"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:         `${P}_eventid`,
  name:       `${P}_name`,
  category:   `${P}_category`,
  venue:      `${P}_venue`,
  status:     `${P}_status`,
  start_date: `${P}_start_date`,
  capacity:   `${P}_capacity`,
}

type FormData = {
  name: string
  category: string
  venue: string
  status: string
  start_date: string
  capacity: string
}

const EMPTY_FORM: FormData = {
  name: "", category: "", venue: "",
  status: String(EVENT_STATUS_OPEN), start_date: "", capacity: "",
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const { data: events = [], isLoading } = useEvents()
  const createEvent = useCreateEvent()

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)

  const calendarEvents: CalendarEvent[] = useMemo(() =>
    events
      .filter(ev => ev[f.start_date])
      .map(ev => ({
        id: String(ev[f.id] ?? ""),
        date: String(ev[f.start_date]),
        title: String(ev[f.name] ?? ""),
        colorClass: EVENT_STATUS_COLOR[ev[f.status] as keyof typeof EVENT_STATUS_COLOR],
      })),
    [events]
  )

  // 空セルクリック → その日付を初期値に新規作成
  const handleDayClick = (date: string) => {
    setFormData({ ...EMPTY_FORM, start_date: date })
    setIsFormOpen(true)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("イベント名は必須です")
      return
    }
    const data: Record<string, unknown> = {
      [f.name]:     formData.name,
      [f.category]: formData.category,
      [f.venue]:    formData.venue,
    }
    if (formData.status) data[f.status] = Number(formData.status)
    if (formData.start_date) data[f.start_date] = formData.start_date
    if (formData.capacity) data[f.capacity] = parseInt(formData.capacity, 10)
    try {
      await createEvent.mutateAsync(data)
      toast.success("イベントを作成しました")
      setIsFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">カレンダー</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">カレンダー</h1>
        <p className="text-muted-foreground text-sm mt-1">
          イベントをクリックで詳細へ。空いている日をクリックすると新規作成できます
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <MonthCalendar
            events={calendarEvents}
            onEventClick={(id) => navigate(`/events/${id}`)}
            onDayClick={handleDayClick}
          />
          {/* 凡例 */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs text-muted-foreground">凡例:</span>
            {EVENT_STATUS_OPTIONS.map(o => (
              <span
                key={o.value}
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_STATUS_COLOR[o.value as keyof typeof EVENT_STATUS_COLOR]}`}
              >
                {EVENT_STATUS_LABEL[o.value as keyof typeof EVENT_STATUS_LABEL]}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {calendarEvents.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>イベントがありません</CardTitle>
            <CardDescription>カレンダーの日付をクリックするか、「イベント」ページから登録してください。</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* 新規作成モーダル（日付プリセット付き） */}
      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title="イベント新規作成"
        onSave={handleSave}
        isSaving={createEvent.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cal_name">イベント名 <span className="text-destructive">*</span></Label>
            <Input
              id="cal_name"
              value={formData.name}
              onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
              placeholder="イベント名を入力"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="cal_date">開催日</Label>
              <Input
                id="cal_date"
                type="date"
                value={formData.start_date}
                onChange={e => setFormData(p => ({ ...p, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal_category">分野</Label>
              <Input
                id="cal_category"
                value={formData.category}
                onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
                placeholder="例: 勉強会, 全社イベント"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal_venue">会場</Label>
              <Input
                id="cal_venue"
                value={formData.venue}
                onChange={e => setFormData(p => ({ ...p, venue: e.target.value }))}
                placeholder="例: 本社 大会議室 / オンライン"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cal_capacity">定員</Label>
              <Input
                id="cal_capacity"
                type="number"
                min={0}
                value={formData.capacity}
                onChange={e => setFormData(p => ({ ...p, capacity: e.target.value }))}
                placeholder="例: 30"
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>ステータス</Label>
            <Select value={formData.status} onValueChange={v => setFormData(p => ({ ...p, status: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="ステータスを選択" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormModal>
    </div>
  )
}
