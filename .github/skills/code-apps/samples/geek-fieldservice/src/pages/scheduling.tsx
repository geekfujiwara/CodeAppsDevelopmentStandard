import { useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragStartEvent, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useWorkOrders, useUpdateWorkOrder, useEngineers, useCustomers, useCalls, useRecommendations, useAreas } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { WORK_ORDER_TYPE_LABEL, WORK_ORDER_TYPE_COLOR, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUS_COLOR, SKILL_LEVEL_LABEL, SKILL_LEVEL_COLOR, WORK_STATUS_LABEL, WORK_STATUS_COLOR } from "@/types/dataverse"
import { ChevronLeft, ChevronRight, Calendar, Map as MapIcon, PanelLeftClose, PanelLeftOpen, AlertTriangle, MessageCircle, User, ExternalLink, Maximize2, Minimize2, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { format, addDays, addWeeks, startOfWeek, isSameDay, parseISO } from "date-fns"
import { ja } from "date-fns/locale"

const P = PUBLISHER_PREFIX
const f = {
  id: `${P}_workorderid`, name: `${P}_name`, worktype: `${P}_worktype`,
  scheduleddate: `${P}_scheduleddate`, status: `${P}_status`,
  workdetail: `${P}_workdetail`, faultsummary: `${P}_faultsummary`,
  engineerId: `_${P}_engineerid_value`, customerId: `_${P}_customerid_value`,
  installationlocation: `${P}_installationlocation`,
  workstart: `${P}_workstart`, workend: `${P}_workend`,
  traveltime: `${P}_traveltime`, worktime: `${P}_worktime`,
}
const fe = { id: `${P}_engineerid`, name: `${P}_name`, area: `${P}_area`, skill: `${P}_skill`, skilllevel: `${P}_skilllevel`, workstatus: `${P}_workstatus` }
const fc = { id: `${P}_customerid`, name: `${P}_name`, address: `${P}_address` }
const fCall = { id: `${P}_callid`, name: `${P}_name`, channel: `${P}_channel`, description: `${P}_description`, priority: `${P}_priority`, status: `${P}_status`, receiveddate: `${P}_receiveddate`, customerId: `_${P}_customerid_value`, equipmentId: `_${P}_equipmentid_value` }
const fRec = { id: `${P}_recommendationid`, name: `${P}_name`, category: `${P}_category`, detail: `${P}_detail`, priority: `${P}_priority`, customerId: `_${P}_customerid_value` }
const fWoCall = `_${P}_callid_value`

type ViewMode = "day" | "week"
type GroupBy = "area" | "customer" | "skill"
type DisplayMode = "gantt" | "map"

// ===== Badge component =====
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`inline-flex items-center px-1 py-px rounded-full text-[9px] font-medium leading-tight ${color}`}>{label}</span>
}

// ===== Status-based card background colors for gantt =====
const STATUS_CARD_BG: Record<number, string> = {
  100000000: "bg-gray-50 border-gray-300 dark:bg-gray-800 dark:border-gray-600",       // 未着手
  100000001: "bg-sky-50 border-sky-300 dark:bg-sky-900/40 dark:border-sky-600",         // 手配済
  100000002: "bg-amber-50 border-amber-400 dark:bg-amber-900/40 dark:border-amber-500", // 作業中
  100000003: "bg-green-50 border-green-300 dark:bg-green-900/40 dark:border-green-600", // 完了
}

// ===== Work Order Draggable Card =====
function WOCard({ wo, custMap, compact, onClick }: { wo: Record<string, unknown>; custMap: Map<string, string>; compact?: boolean; onClick?: () => void }) {
  const typeVal = wo[f.worktype] as number
  const statusVal = wo[f.status] as number
  const typeLabel = WORK_ORDER_TYPE_LABEL[typeVal as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""
  const typeColor = WORK_ORDER_TYPE_COLOR[typeVal as keyof typeof WORK_ORDER_TYPE_COLOR] ?? "bg-gray-100 text-gray-600"
  const statusLabel = WORK_ORDER_STATUS_LABEL[statusVal as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""
  const statusColor = WORK_ORDER_STATUS_COLOR[statusVal as keyof typeof WORK_ORDER_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"
  const custName = custMap.get(String(wo[f.customerId] ?? "")) ?? ""
  const worktime = wo[f.worktime] ? `${wo[f.worktime]}分` : null
  const traveltime = wo[f.traveltime] ? `移動${wo[f.traveltime]}分` : null

  if (compact) {
    const cardBg = STATUS_CARD_BG[statusVal] ?? "bg-card border-border"
    const tooltipText = [
      String(wo[f.name] ?? ""),
      `[${statusLabel}] ${typeLabel}`,
      custName && `顧客: ${custName}`,
      worktime && `作業: ${worktime}`,
      traveltime,
      wo[f.installationlocation] && `📍 ${String(wo[f.installationlocation] ?? "")}`,
    ].filter(Boolean).join("\n")
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("border rounded px-1.5 py-0.5 text-xs shadow-sm cursor-grab active:cursor-grabbing h-full flex flex-col justify-center overflow-hidden", cardBg)} onClick={onClick}>
              <div className="flex items-center gap-0.5">
                <Badge label={typeLabel} color={typeColor} />
              </div>
              <span className="truncate font-medium text-[11px] leading-tight">{String(wo[f.name] ?? "")}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64 whitespace-pre-line text-xs">
            {tooltipText}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow" onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-1">
        <Badge label={typeLabel} color={typeColor} />
        <Badge label={statusLabel} color={statusColor} />
        {worktime && <span className="text-[10px] text-muted-foreground ml-auto">⏱{worktime}</span>}
      </div>
      <p className="text-sm font-medium truncate">{String(wo[f.name] ?? "")}</p>
      {custName ? <p className="text-xs text-muted-foreground truncate mt-0.5">{custName}</p> : null}
      {wo[f.faultsummary] ? <p className="text-xs text-muted-foreground truncate mt-0.5">{String(wo[f.faultsummary] ?? "")}</p> : null}
      {wo[f.installationlocation] ? <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">📍 {String(wo[f.installationlocation] ?? "")}</p> : null}
      {traveltime && <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">🚗 {traveltime}</p>}
    </div>
  )
}

// ===== Draggable wrapper =====
function DraggableWO({ wo, custMap, compact, onClickCard }: { wo: Record<string, unknown>; custMap: Map<string, string>; compact?: boolean; onClickCard?: (wo: Record<string, unknown>) => void }) {
  const id = String(wo[f.id] ?? "")
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { wo } })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-30 scale-95 transition-transform")}>
      <WOCard wo={wo} custMap={custMap} compact={compact} onClick={onClickCard ? () => onClickCard(wo) : undefined} />
    </div>
  )
}

// ===== Droppable time slot (30-min granularity) =====
function HalfHourSlot({ engineerId, hour, half, className: cls }: { engineerId: string; hour: number; half: 0 | 1; className?: string }) {
  const slotHour = hour + half * 0.5
  const id = `${engineerId}__${slotHour}`
  const { isOver, setNodeRef } = useDroppable({ id, data: { engineerId, hour: slotHour } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-full min-h-[40px]",
        half === 0 && "border-l border-border/50",
        half === 1 && "border-l border-dashed border-border/30",
        isOver && "bg-primary/10 ring-1 ring-primary/30",
        cls
      )}
    />
  )
}

function TimeSlot({ engineerId, hour, children }: { engineerId: string; hour: number; children?: React.ReactNode }) {
  return (
    <div className="h-full min-h-[40px] relative grid grid-cols-2">
      <HalfHourSlot engineerId={engineerId} hour={hour} half={0} className={hour === 12 ? "bg-amber-50/30 dark:bg-amber-900/5" : undefined} />
      <HalfHourSlot engineerId={engineerId} hour={hour} half={1} className={hour === 12 ? "bg-amber-50/30 dark:bg-amber-900/5" : undefined} />
      {children && <div className="absolute inset-0 pointer-events-none">{children}</div>}
    </div>
  )
}

// ===== Engineer Detail Modal =====
function EngineerModal({ engineer, open, onClose }: { engineer: Record<string, unknown> | null; open: boolean; onClose: () => void }) {
  if (!engineer) return null
  const name = String(engineer[fe.name] ?? "")
  const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(name)}`

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><User className="h-5 w-5" />{name}</DialogTitle>
          <DialogDescription>エンジニア詳細情報</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-muted-foreground">担当エリア:</span><p className="font-medium">{String(engineer[fe.area] ?? "-")}</p></div>
            <div><span className="text-muted-foreground">稼働状況:</span><p>{engineer[fe.workstatus] != null && <Badge label={WORK_STATUS_LABEL[engineer[fe.workstatus] as keyof typeof WORK_STATUS_LABEL] ?? ""} color={WORK_STATUS_COLOR[engineer[fe.workstatus] as keyof typeof WORK_STATUS_COLOR] ?? ""} />}</p></div>
            <div><span className="text-muted-foreground">スキルレベル:</span><p>{engineer[fe.skilllevel] != null && <Badge label={SKILL_LEVEL_LABEL[engineer[fe.skilllevel] as keyof typeof SKILL_LEVEL_LABEL] ?? ""} color={SKILL_LEVEL_COLOR[engineer[fe.skilllevel] as keyof typeof SKILL_LEVEL_COLOR] ?? ""} />}</p></div>
            <div className="col-span-2"><span className="text-muted-foreground">保有スキル:</span><p className="font-medium text-xs mt-1">{String(engineer[fe.skill] ?? "-")}</p></div>
          </div>
          <Button className="w-full gap-2" onClick={() => window.open(teamsUrl, "_blank")}>
            <MessageCircle className="h-4 w-4" />Teams でチャット
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ===== Route Modal (Google Maps) =====
function RouteModal({ open, onClose, origin, destination, onConfirm, travelMinutes, setTravelMinutes, workMinutes, setWorkMinutes, startTime, setStartTime }: {
  open: boolean; onClose: () => void; origin: string; destination: string
  onConfirm: () => void; travelMinutes: string; setTravelMinutes: (v: string) => void
  workMinutes: string; setWorkMinutes: (v: string) => void
  startTime: string; setStartTime: (v: string) => void
}) {
  const [maximized, setMaximized] = useState(false)
  const fallbackUrl = origin && destination
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`
    : ""

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent showCloseButton={false} className={cn(
        "transition-all duration-200 flex flex-col",
        maximized ? "sm:max-w-[95vw] h-[90vh] max-h-[90vh]" : "sm:max-w-2xl max-h-[85vh]"
      )}>
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <DialogTitle>移動経路確認</DialogTitle>
              <DialogDescription>前の作業場所（または事業所）から次の作業場所までの経路</DialogDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMaximized(!maximized)} title={maximized ? "縮小" : "最大化"}>
                {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="閉じる">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="text-xs text-muted-foreground space-y-0.5 shrink-0">
            <p>出発: {origin || "（未設定）"}</p>
            <p>到着: {destination || "（未設定）"}</p>
          </div>
          {/* Maps iframe */}
          {origin && destination ? (
            origin === destination ? (
              // Same location - show pin instead of directions
              <div className={cn(
                "border rounded-lg overflow-hidden bg-muted relative flex-1 min-h-0",
                maximized ? "h-full" : "h-[350px]"
              )}>
                <iframe
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${encodeURIComponent(origin)}&hl=ja&output=embed`}
                  allow="fullscreen"
                />
                <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm rounded px-2 py-1 text-xs text-muted-foreground">
                  📍 同一拠点内での作業（移動不要）
                </div>
              </div>
            ) : (
              <div className={cn(
                "border rounded-lg overflow-hidden bg-muted relative flex-1 min-h-0",
                maximized ? "h-full" : "h-[350px]"
              )}>
                <iframe
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&dirflg=d&hl=ja&output=embed`}
                  allow="fullscreen"
                />
                <Button variant="outline" size="sm" className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm" onClick={() => window.open(fallbackUrl, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> 大きく開く
                </Button>
              </div>
            )
          ) : (
            <div className="h-[200px] bg-muted rounded-lg flex items-center justify-center text-muted-foreground text-sm">住所情報がありません</div>
          )}
          <div className="flex flex-wrap items-end gap-3 shrink-0 pt-1">
            <div className="space-y-1">
              <Label className="text-sm">開始時間</Label>
              <Input type="time" className="w-28" value={startTime} onChange={e => setStartTime(e.target.value)} step="1800" />
              {(() => {
                if (!startTime) return null
                const [hh, mm] = startTime.split(":").map(Number)
                const start = hh + mm / 60
                const duration = workMinutes ? Number(workMinutes) / 60 : 1
                const end = start + duration
                if (start < 13 && end > 12) {
                  return (
                    <div className="flex items-center gap-1 text-amber-600 text-xs mt-1">
                      <AlertTriangle className="h-3 w-3" />
                      <span>昼休み（12:00-13:00）と重複</span>
                    </div>
                  )
                }
                return null
              })()}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">移動時間（分）</Label>
              <Input type="number" min="0" className="w-24" value={travelMinutes} onChange={e => setTravelMinutes(e.target.value)} placeholder="例: 45" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">作業時間（分）</Label>
              <Input type="number" min="1" className="w-24" value={workMinutes} onChange={e => setWorkMinutes(e.target.value)} placeholder="60" />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={onClose}>キャンセル</Button>
              <Button onClick={onConfirm}>保存</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ===== HOURS =====
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8) // 8-17
const WEEKDAYS_SHORT = ["月", "火", "水", "木", "金", "土", "日"]

export default function SchedulingPage() {
  const navigate = useNavigate()
  const { data: workOrders = [] } = useWorkOrders()
  const { data: engineers = [] } = useEngineers()
  const { data: customers = [] } = useCustomers()
  const { data: calls = [] } = useCalls()
  const { data: recommendations = [] } = useRecommendations()
  const { data: areas = [] } = useAreas()
  const updateWO = useUpdateWorkOrder()

  // State
  const [viewMode, setViewMode] = useState<ViewMode>("day")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [groupBy, setGroupBy] = useState<GroupBy>("area")
  const [displayMode, setDisplayMode] = useState<DisplayMode>("gantt")
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [selectedEngineer, setSelectedEngineer] = useState<Record<string, unknown> | null>(null)
  const [engineerModalOpen, setEngineerModalOpen] = useState(false)
  const [activeWO, setActiveWO] = useState<Record<string, unknown> | null>(null)
  const [woDetailOpen, setWoDetailOpen] = useState(false)
  const [selectedWO, setSelectedWO] = useState<Record<string, unknown> | null>(null)

  // Map view filters
  const [mapIncludeUnassigned, setMapIncludeUnassigned] = useState(true)
  const [mapAreaFilter, setMapAreaFilter] = useState("all")
  const [unassignedAreaFilter, setUnassignedAreaFilter] = useState("all")

  // Sync area filters between panels
  const handleUnassignedAreaChange = (val: string) => { setUnassignedAreaFilter(val); setMapAreaFilter(val) }
  const handleMapAreaChange = (val: string) => { setMapAreaFilter(val); setUnassignedAreaFilter(val) }

  // Route modal state
  const [routeModalOpen, setRouteModalOpen] = useState(false)
  const [routeOrigin, setRouteOrigin] = useState("")
  const [routeDestination, setRouteDestination] = useState("")
  const [travelMinutes, setTravelMinutes] = useState("")
  const [workMinutes, setWorkMinutes] = useState("60")
  const [startTime, setStartTime] = useState("")
  const [pendingDrop, setPendingDrop] = useState<{ woId: string; engineerId: string; hour: number } | null>(null)

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Maps
  const custMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.name] ?? "")])), [customers])
  const custAddrMap = useMemo(() => new Map(customers.map(c => [String(c[fc.id] ?? ""), String(c[fc.address] ?? "")])), [customers])

  // Unassigned WOs (no engineer assigned)
  const unassignedWOs = useMemo(() => workOrders.filter(wo => !wo[f.engineerId]), [workOrders])

  // Filtered unassigned WOs by area
  const filteredUnassignedWOs = useMemo(() => {
    if (unassignedAreaFilter === "all") return unassignedWOs
    const areaPrefix = unassignedAreaFilter.replace(/エリア|サービスセンター/g, "")
    return unassignedWOs.filter(wo => {
      const loc = String(wo[f.installationlocation] ?? "")
      return loc.includes(areaPrefix) || loc.includes(unassignedAreaFilter)
    })
  }, [unassignedWOs, unassignedAreaFilter])

  // Resolve area name from lookup
  const resolveAreaName = useCallback((eng: Record<string, unknown>) => {
    const areaId = String(eng[`_${P}_areaid_value`] ?? "")
    if (areaId) {
      const found = areas.find(a => String(a[`${P}_areaid`]) === areaId)
      if (found) return String(found[`${P}_name`] ?? "")
    }
    return String(eng[fe.area] ?? "")
  }, [areas])

  // Unique areas from engineers (resolved from lookup)
  const areaOptions = useMemo(() => {
    const set = new Set(engineers.map(e => resolveAreaName(e)).filter(Boolean))
    return Array.from(set).sort()
  }, [engineers, resolveAreaName])

  // Engineer IDs per area
  const engineerIdsByArea = useMemo(() => {
    const result: Record<string, Set<string>> = {}
    engineers.forEach(eng => {
      const area = resolveAreaName(eng)
      if (!area) return
      if (!result[area]) result[area] = new Set()
      result[area].add(String(eng[fe.id] ?? ""))
    })
    return result
  }, [engineers, resolveAreaName])

  // Assigned WOs for the current date range
  const assignedWOs = useMemo(() => {
    return workOrders.filter(wo => {
      if (!wo[f.engineerId]) return false
      const dateStr = String(wo[f.scheduleddate] ?? "")
      if (!dateStr) return false
      try {
        const woDate = parseISO(dateStr)
        if (viewMode === "day") return isSameDay(woDate, currentDate)
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
        return woDate >= weekStart && woDate < addDays(weekStart, 7)
      } catch { return false }
    })
  }, [workOrders, currentDate, viewMode])

  // Map view WOs - filtered by area and unassigned toggle
  const mapViewWOs = useMemo(() => {
    let wos: Record<string, unknown>[] = []
    // Include assigned WOs
    wos = [...assignedWOs]
    // Optionally include unassigned
    if (mapIncludeUnassigned) {
      wos = [...wos, ...unassignedWOs]
    }
    // Filter by area
    if (mapAreaFilter !== "all") {
      const areaEngIds = engineerIdsByArea[mapAreaFilter]
      wos = wos.filter(wo => {
        const engId = String(wo[f.engineerId] ?? "")
        if (!engId) {
          // Unassigned: match by installation location containing area keyword
          const loc = String(wo[f.installationlocation] ?? "").toLowerCase()
          const areaPrefix = mapAreaFilter.replace(/エリア|サービスセンター/g, "")
          return loc.includes(areaPrefix.toLowerCase())
        }
        return areaEngIds?.has(engId) ?? false
      })
    }
    return wos
  }, [assignedWOs, unassignedWOs, mapIncludeUnassigned, mapAreaFilter, engineerIdsByArea])

  // Group engineers
  const groupedEngineers = useMemo((): [string, Record<string, unknown>[]][] => {
    const entries: [string, Record<string, unknown>[]][] = []
    const groupMap: Record<string, Record<string, unknown>[]> = {}
    engineers.forEach(eng => {
      let key = ""
      if (groupBy === "area") key = resolveAreaName(eng) || "未設定"
      else if (groupBy === "skill") key = String(eng[fe.skill] ?? "未設定").split(",")[0] || "未設定"
      else key = "全エンジニア"
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(eng)
    })
    for (const [k, v] of Object.entries(groupMap)) entries.push([k, v])
    return entries
  }, [engineers, groupBy])

  // Find previous WO for engineer on same day
  const findPreviousWO = useCallback((engineerId: string, hour: number) => {
    const engWOs = assignedWOs
      .filter(wo => String(wo[f.engineerId] ?? "") === engineerId)
      .map(wo => {
        const startStr = String(wo[f.workstart] ?? wo[f.scheduleddate] ?? "")
        try { return { wo, hour: parseISO(startStr).getHours() } } catch { return null }
      })
      .filter((x): x is { wo: Record<string, unknown>; hour: number } => x !== null)
      .sort((a, b) => b.hour - a.hour)
    return engWOs.find(x => x.hour < hour)?.wo ?? null
  }, [assignedWOs])

  // Navigation
  const goBack = () => setCurrentDate(d => viewMode === "day" ? addDays(d, -1) : addWeeks(d, -1))
  const goForward = () => setCurrentDate(d => viewMode === "day" ? addDays(d, 1) : addWeeks(d, 1))
  const goToday = () => setCurrentDate(new Date())

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveWO(event.active.data.current?.wo ?? null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveWO(null)
    const { active, over } = event
    if (!over) return

    const wo = active.data.current?.wo as Record<string, unknown> | undefined
    if (!wo) return

    const dropData = over.data.current as { engineerId?: string; hour?: number } | undefined
    if (!dropData?.engineerId || dropData.hour == null) return

    const woId = String(wo[f.id] ?? "")
    const engineerId = dropData.engineerId
    const hour = dropData.hour

    // Determine origin for route
    const prevWO = findPreviousWO(engineerId, hour)
    let origin = ""
    if (prevWO) {
      const prevCustId = String(prevWO[f.customerId] ?? "")
      origin = String(prevWO[f.installationlocation] ?? "") || custAddrMap.get(prevCustId) || ""
    }
    // If no previous WO, use engineer's area as rough origin (raw value, not normalized)
    if (!origin) {
      const eng = engineers.find(e => String(e[fe.id]) === engineerId)
      const rawArea = eng ? String(eng[fe.area] ?? "") : ""
      // Convert "東京エリア" → "東京" for a more useful map search
      origin = rawArea.replace(/エリア$|サービスセンター$/g, "").trim()
      if (origin) origin = `${origin}駅`
    }

    const woCustId = String(wo[f.customerId] ?? "")
    const destination = String(wo[f.installationlocation] ?? "") || custAddrMap.get(woCustId) || ""

    // Open route modal
    setRouteOrigin(origin)
    setRouteDestination(destination)
    // Pre-fill travel time if WO already has one (default 30)
    const existingTravel = wo[f.traveltime] ? String(wo[f.traveltime]) : "30"
    setTravelMinutes(existingTravel)
    // Pre-fill work time (default 60)
    const existingWork = wo[f.worktime] ? String(wo[f.worktime]) : "60"
    setWorkMinutes(existingWork)
    // Pre-fill start time from drop slot
    const hh = Math.floor(hour)
    const mm = (hour % 1) * 60
    setStartTime(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`)
    setPendingDrop({ woId, engineerId, hour })
    setRouteModalOpen(true)
  }

  const confirmTravelAndAssign = async () => {
    if (!pendingDrop) return
    const { woId, engineerId } = pendingDrop
    const scheduledDate = new Date(currentDate)
    // Use startTime from modal
    const [hh, mm] = startTime.split(":").map(Number)
    scheduledDate.setHours(hh, mm, 0, 0)

    const data: Record<string, unknown> = {
      [`${P}_engineerid@odata.bind`]: `/${P}_engineers(${engineerId})`,
      [f.scheduleddate]: scheduledDate.toISOString(),
      [f.workstart]: scheduledDate.toISOString(),
      [f.status]: 100000001, // 手配済
    }
    if (travelMinutes) {
      data[f.traveltime] = Number(travelMinutes)
    }
    if (workMinutes) {
      data[f.worktime] = Number(workMinutes)
    }

    try {
      await updateWO.mutateAsync({ id: woId, data })
      toast.success("作業オーダーをスケジュールしました")
      setRouteModalOpen(false)
      setPendingDrop(null)
    } catch (err: unknown) {
      let msg = ""
      if (err instanceof Error) msg = err.message
      else if (typeof err === "object" && err !== null) msg = JSON.stringify(err)
      else msg = String(err)
      toast.error(`スケジュール設定に失敗しました: ${msg}`)
    }
  }

  // Week days for week view
  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [currentDate])

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">スケジューリングボード</h1>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
            <Button variant={viewMode === "day" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setViewMode("day")}>日</Button>
            <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setViewMode("week")}>週</Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goBack}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToday}>今日</Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goForward}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {viewMode === "day"
              ? format(currentDate, "yyyy年M月d日 (E)", { locale: ja })
              : `${format(weekDays[0], "M/d", { locale: ja })} - ${format(weekDays[6], "M/d", { locale: ja })}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="area">エリア別</SelectItem>
              <SelectItem value="skill">スキル別</SelectItem>
              <SelectItem value="customer">全員表示</SelectItem>
            </SelectContent>
          </Select>
          {/* Legend inline */}
          <div className="hidden md:flex items-center gap-1.5 border-l border-border/50 pl-2 ml-1">
            {Object.entries(WORK_ORDER_STATUS_LABEL).map(([k, v]) => (
              <span key={k} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", STATUS_CARD_BG[Number(k)] ?? "bg-card border-border")}>{v}</span>
            ))}
          </div>
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <Button variant={displayMode === "gantt" ? "default" : "ghost"} size="sm" className="h-7 text-xs gap-1" onClick={() => setDisplayMode("gantt")}>
              <Calendar className="h-3.5 w-3.5" />ガント
            </Button>
            <Button variant={displayMode === "map" ? "default" : "ghost"} size="sm" className="h-7 text-xs gap-1" onClick={() => setDisplayMode("map")}>
              <MapIcon className="h-3.5 w-3.5" />マップ
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Panel - Unassigned WOs */}
          <div className={cn(
            "border-r border-border bg-muted/30 transition-all duration-300 flex flex-col shrink-0",
            leftCollapsed ? "w-10" : "w-72"
          )}>
            <div className="flex items-center justify-between px-2 py-2 border-b border-border/50 shrink-0">
              {!leftCollapsed && <span className="text-xs font-semibold text-muted-foreground">未アサイン ({filteredUnassignedWOs.length})</span>}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setLeftCollapsed(!leftCollapsed)}>
                {leftCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {!leftCollapsed && (
              <div className="px-2 pt-2 shrink-0">
                <Select value={unassignedAreaFilter} onValueChange={handleUnassignedAreaChange}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="エリア" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全エリア</SelectItem>
                    {areaOptions.map(area => <SelectItem key={area} value={area}>{area}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!leftCollapsed && (
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredUnassignedWOs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">未アサインの作業オーダーなし</p>
                ) : (
                  filteredUnassignedWOs.map(wo => (
                    <DraggableWO key={String(wo[f.id])} wo={wo} custMap={custMap} onClickCard={wo => { setSelectedWO(wo); setWoDetailOpen(true) }} />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Center - Timeline / Map */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {displayMode === "gantt" ? (
              <div className="flex-1 overflow-auto">
                {/* Time header */}
                <div className="sticky top-0 z-10 bg-card border-b border-border grid" style={{ gridTemplateColumns: "9rem 1fr" }}>
                  <div className="border-r border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-end">エンジニア</div>
                  {viewMode === "day" ? (
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
                      {HOURS.map(h => (
                        <div key={h} className={cn(
                          "pl-0.5 py-1 text-xs font-medium border-l border-border/50",
                          h === 12 && "bg-amber-50/50 dark:bg-amber-900/10"
                        )}>
                          <span className="text-[11px] text-muted-foreground">{h}:00</span>
                          {h === 12 && <span className="block text-[9px] text-amber-600">昼休み</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid" style={{ gridTemplateColumns: `repeat(7, 1fr)` }}>
                      {weekDays.map((d, i) => (
                        <div key={i} className={cn(
                          "px-1 py-1.5 text-center text-xs font-medium border-r border-border/50",
                          isSameDay(d, new Date()) && "bg-primary/10",
                          (i === 5 || i === 6) && "text-muted-foreground/60"
                        )}>
                          {format(d, "M/d", { locale: ja })} ({WEEKDAYS_SHORT[i]})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Engineer rows grouped */}
                {groupedEngineers.map(([groupName, engs]) => (
                  <div key={groupName}>
                    {groupBy !== "customer" && (
                      <div className="bg-muted/50 px-3 py-1 text-xs font-semibold text-muted-foreground border-b border-border/50 sticky left-0">
                        {groupName}
                      </div>
                    )}
                    {engs.map((eng: Record<string, unknown>) => {
                      const engId = String(eng[fe.id] ?? "")
                      return (
                        <div key={engId} className="grid border-b border-border/50 hover:bg-muted/20" style={{ gridTemplateColumns: "9rem 1fr" }}>
                          {/* Engineer name cell */}
                          <div className="border-r border-border px-2 py-2 flex flex-col justify-center">
                            <button
                              className="text-left hover:underline"
                              onClick={() => { setSelectedEngineer(eng); setEngineerModalOpen(true) }}
                            >
                              <span className="text-sm font-medium">{String(eng[fe.name] ?? "")}</span>
                            </button>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {eng[fe.skilllevel] != null && (
                                <button onClick={() => { setSelectedEngineer(eng); setEngineerModalOpen(true) }}>
                                  <Badge label={SKILL_LEVEL_LABEL[eng[fe.skilllevel] as keyof typeof SKILL_LEVEL_LABEL] ?? ""} color={SKILL_LEVEL_COLOR[eng[fe.skilllevel] as keyof typeof SKILL_LEVEL_COLOR] ?? ""} />
                                </button>
                              )}
                              {eng[fe.workstatus] != null && (
                                <button onClick={() => { setSelectedEngineer(eng); setEngineerModalOpen(true) }}>
                                  <Badge label={WORK_STATUS_LABEL[eng[fe.workstatus] as keyof typeof WORK_STATUS_LABEL] ?? ""} color={WORK_STATUS_COLOR[eng[fe.workstatus] as keyof typeof WORK_STATUS_COLOR] ?? ""} />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Time slots */}
                          {viewMode === "day" ? (
                            (() => {
                              const CARD_H = 32
                              const GAP = 2
                              const dayWOs = assignedWOs
                                .filter(wo => String(wo[f.engineerId] ?? "") === engId)
                                .filter(wo => {
                                  const startStr = String(wo[f.workstart] ?? wo[f.scheduleddate] ?? "")
                                  if (!startStr) return false
                                  try { return isSameDay(parseISO(startStr), currentDate) } catch { return false }
                                })
                                .map(wo => {
                                  const startStr = String(wo[f.workstart] ?? wo[f.scheduleddate] ?? "")
                                  const d = parseISO(startStr)
                                  const startHour = d.getHours() + d.getMinutes() / 60
                                  const workDuration = Number(wo[f.worktime] ?? 60)
                                  const travelDuration = Number(wo[f.traveltime] ?? 0)
                                  const totalStart = startHour - travelDuration / 60
                                  const totalEnd = startHour + workDuration / 60
                                  return { wo, startHour, workDuration, travelDuration, totalStart, totalEnd }
                                })

                              // Detect overlaps and assign rows
                              const sorted = [...dayWOs].sort((a, b) => a.totalStart - b.totalStart)
                              const rows: number[] = new Array(sorted.length).fill(0)
                              const overlaps = new Set<number>()
                              for (let i = 0; i < sorted.length; i++) {
                                for (let j = 0; j < i; j++) {
                                  if (sorted[j].totalEnd > sorted[i].totalStart) {
                                    overlaps.add(i)
                                    overlaps.add(j)
                                    if (rows[i] <= rows[j]) rows[i] = rows[j] + 1
                                  }
                                }
                              }
                              const maxRow = rows.length > 0 ? Math.max(...rows) : 0
                              const containerH = Math.max(40, (maxRow + 1) * (CARD_H + GAP) + 4)

                              return (
                                <div className="relative" style={{ display: "grid", gridTemplateColumns: `repeat(${HOURS.length}, 1fr)`, minHeight: `${containerH}px` }}>
                                  {HOURS.map(h => (
                                    <TimeSlot key={h} engineerId={engId} hour={h} />
                                  ))}
                                  {sorted.map((item, idx) => {
                                    const { wo, startHour, workDuration, travelDuration } = item
                                    const startOffset = ((startHour - HOURS[0]) / HOURS.length) * 100
                                    const workWidth = (workDuration / 60 / HOURS.length) * 100
                                    const travelWidth = (travelDuration / 60 / HOURS.length) * 100
                                    const travelOffset = startOffset - travelWidth
                                    const isOverlap = overlaps.has(idx)
                                    const top = rows[idx] * (CARD_H + GAP) + 2

                                    return (
                                      <div key={String(wo[f.id])} className="absolute flex z-[1]" style={{ left: `${travelOffset >= 0 ? travelOffset : startOffset}%`, width: `${travelWidth + workWidth}%`, height: `${CARD_H}px`, top: `${top}px` }}>
                                        {travelDuration > 0 && (
                                          <div
                                            className="bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-l flex items-center justify-center text-[9px] text-slate-600 dark:text-slate-300 shrink-0 overflow-hidden"
                                            style={{ width: `${(travelWidth / (travelWidth + workWidth)) * 100}%`, minWidth: 0 }}
                                          >
                                            🚗
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0 relative" style={{ width: travelDuration > 0 ? `${(workWidth / (travelWidth + workWidth)) * 100}%` : "100%" }}>
                                          <DraggableWO wo={wo} custMap={custMap} compact onClickCard={wo => { setSelectedWO(wo); setWoDetailOpen(true) }} />
                                          {isOverlap && (
                                            <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold z-10" title="時間が重複しています">!</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()
                          ) : (
                            <div className="grid" style={{ gridTemplateColumns: `repeat(7, 1fr)` }}>
                              {weekDays.map((day, di) => {
                                const dayWOs = assignedWOs.filter(wo => {
                                  if (String(wo[f.engineerId] ?? "") !== engId) return false
                                  const ds = String(wo[f.scheduleddate] ?? "")
                                  if (!ds) return false
                                  try { return isSameDay(parseISO(ds), day) } catch { return false }
                                })
                                return (
                                  <TimeSlot key={di} engineerId={engId} hour={day.getDate()}>
                                    <div className={cn("h-full p-0.5 min-h-[48px] flex flex-col items-center justify-center", isSameDay(day, new Date()) && "bg-primary/5")}>
                                      {dayWOs.length > 0 ? (
                                        <TooltipProvider delayDuration={200}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <button
                                                className={cn(
                                                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                                                  dayWOs.length >= 4 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                                                  dayWOs.length >= 2 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                                  "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                                )}
                                                onClick={() => {
                                                  if (dayWOs.length === 1) { setSelectedWO(dayWOs[0]); setWoDetailOpen(true) }
                                                  else { setCurrentDate(day); setViewMode("day") }
                                                }}
                                              >
                                                {dayWOs.length}
                                              </button>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-64 text-xs">
                                              {dayWOs.map(wo => (
                                                <div key={String(wo[f.id])} className="py-0.5">
                                                  <span className="font-medium">{String(wo[f.name] ?? "")}</span>
                                                  <span className="text-muted-foreground ml-1">
                                                    {WORK_ORDER_TYPE_LABEL[wo[f.worktype] as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""}
                                                  </span>
                                                </div>
                                              ))}
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      ) : null}
                                    </div>
                                  </TimeSlot>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              /* Map view */
              <div className="flex-1 flex flex-col overflow-hidden bg-muted/30">
                {/* Map toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-card shrink-0 flex-wrap">
                  <Button
                    variant={mapIncludeUnassigned ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setMapIncludeUnassigned(!mapIncludeUnassigned)}
                  >
                    {mapIncludeUnassigned ? "☑" : "☐"} 未アサインも含む
                  </Button>
                  <Select value={mapAreaFilter} onValueChange={handleMapAreaChange}>
                    <SelectTrigger className="w-[150px] h-7 text-xs"><SelectValue placeholder="エリア絞り込み" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全エリア</SelectItem>
                      {areaOptions.map(area => <SelectItem key={area} value={area}>{area}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground ml-auto">{mapViewWOs.length} 件</span>
                </div>

                {/* Map + WO list split */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Google Maps iframe */}
                  {mapViewWOs.length > 0 ? (
                    <div className="h-[45%] shrink-0 border-b border-border/50 relative">
                      <iframe
                        className="w-full h-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                        src={(() => {
                          const locations = mapViewWOs
                            .map(wo => String(wo[f.installationlocation] ?? ""))
                            .filter(Boolean)
                          if (locations.length === 0) return ""
                          const unique = [...new Set(locations)]
                          // Always use simple embed with first location (most reliable without API key)
                          return `https://www.google.com/maps?q=${encodeURIComponent(unique[0])}&hl=ja&output=embed`
                        })()}
                        allow="fullscreen"
                      />
                      <Button variant="outline" size="sm" className="absolute bottom-2 right-2 bg-background/80 backdrop-blur-sm text-xs" onClick={() => {
                        const locations = mapViewWOs.map(wo => String(wo[f.installationlocation] ?? "")).filter(Boolean)
                        if (locations.length > 0) {
                          const unique = [...new Set(locations)]
                          const url = `https://www.google.com/maps/search/${encodeURIComponent(unique.join(" | "))}/`
                          window.open(url, "_blank")
                        }
                      }}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> 大きく開く
                      </Button>
                    </div>
                  ) : null}

                  {/* WO card list */}
                  <div className="flex-1 overflow-y-auto p-3">
                    {mapViewWOs.length > 0 ? (
                      <div className="max-w-2xl mx-auto space-y-2">
                        {mapViewWOs.map(wo => {
                          const engId = String(wo[f.engineerId] ?? "")
                          const engName = engId ? engineers.find(e => String(e[fe.id]) === engId) : null
                          return (
                            <Card key={String(wo[f.id])} className="p-3 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedWO(wo); setWoDetailOpen(true) }}>
                              <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Badge label={WORK_ORDER_TYPE_LABEL[wo[f.worktype] as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""} color={WORK_ORDER_TYPE_COLOR[wo[f.worktype] as keyof typeof WORK_ORDER_TYPE_COLOR] ?? ""} />
                                    <Badge label={WORK_ORDER_STATUS_LABEL[wo[f.status] as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[wo[f.status] as keyof typeof WORK_ORDER_STATUS_COLOR] ?? ""} />
                                    {!engId && <Badge label="未アサイン" color="bg-red-100 text-red-700" />}
                                  </div>
                                  <p className="text-sm font-medium">{String(wo[f.name] ?? "")}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{custMap.get(String(wo[f.customerId] ?? "")) ?? ""}</p>
                                  {engName && <p className="text-xs text-muted-foreground mt-0.5">👤 {String(engName[fe.name] ?? "")}</p>}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs text-muted-foreground">📍 {String(wo[f.installationlocation] ?? "住所未設定")}</p>
                                  {wo[f.worktime] ? <p className="text-[10px] text-muted-foreground mt-0.5">⏱ {String(wo[f.worktime])}分</p> : null}
                                </div>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-2">
                          <MapIcon className="h-12 w-12 mx-auto text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">該当する作業オーダーがありません</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeWO && (
            <div className="opacity-60 rotate-2 scale-105 shadow-lg pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ cursor: "grabbing" }}>
              <WOCard wo={activeWO} custMap={custMap} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* WO Detail Modal */}
      <Dialog open={woDetailOpen} onOpenChange={v => { if (!v) setWoDetailOpen(false) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" showCloseButton={false}>
          <DialogHeader className="shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <DialogTitle>{selectedWO ? String(selectedWO[f.name] ?? "") : ""}</DialogTitle>
                <DialogDescription>作業オーダー詳細</DialogDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setWoDetailOpen(false); sessionStorage.setItem("returnToScheduling", "true"); navigate(`/work-orders?select=${String(selectedWO?.[f.id] ?? "")}`) }}>
                詳細画面へ
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setWoDetailOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          {selectedWO && (() => {
            const woCustomerId = String(selectedWO[f.customerId] ?? "")
            const woCallId = String(selectedWO[fWoCall] ?? "")
            const relatedCall = woCallId ? calls.find(c => String(c[fCall.id]) === woCallId) : null
            const relatedCalls = calls.filter(c => String(c[fCall.customerId] ?? "") === woCustomerId)
            const custInfo = customers.find(c => String(c[fc.id]) === woCustomerId)
            const relatedRecs = recommendations.filter(r => String(r[fRec.customerId] ?? "") === woCustomerId)
            return (
              <Tabs defaultValue="info" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="shrink-0 grid grid-cols-4 w-full">
                  <TabsTrigger value="info">基本情報</TabsTrigger>
                  <TabsTrigger value="customer">顧客</TabsTrigger>
                  <TabsTrigger value="calls">コール{relatedCalls.length > 0 ? ` (${relatedCalls.length})` : ""}</TabsTrigger>
                  <TabsTrigger value="knowledge">ナレッジ{relatedRecs.length > 0 ? ` (${relatedRecs.length})` : ""}</TabsTrigger>
                </TabsList>

                <div className="flex-1 min-h-0 h-[50vh]">
                <TabsContent value="info" className="h-full overflow-y-auto mt-3">
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge label={WORK_ORDER_TYPE_LABEL[selectedWO[f.worktype] as keyof typeof WORK_ORDER_TYPE_LABEL] ?? ""} color={WORK_ORDER_TYPE_COLOR[selectedWO[f.worktype] as keyof typeof WORK_ORDER_TYPE_COLOR] ?? ""} />
                      <Badge label={WORK_ORDER_STATUS_LABEL[selectedWO[f.status] as keyof typeof WORK_ORDER_STATUS_LABEL] ?? ""} color={WORK_ORDER_STATUS_COLOR[selectedWO[f.status] as keyof typeof WORK_ORDER_STATUS_COLOR] ?? ""} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><span className="text-muted-foreground text-xs">顧客</span><p className="font-medium">{custMap.get(woCustomerId) ?? "-"}</p></div>
                      <div><span className="text-muted-foreground text-xs">予定日</span><p className="font-medium">{selectedWO[f.scheduleddate] ? format(parseISO(String(selectedWO[f.scheduleddate])), "yyyy/MM/dd") : "-"}</p></div>
                      <div>
                        <span className="text-muted-foreground text-xs">作業時間</span>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min="0" className="h-7 w-20 text-sm"
                            defaultValue={String(selectedWO[f.worktime] ?? "")}
                            onBlur={async (e) => {
                              const val = e.target.value
                              const woId = String(selectedWO[f.id] ?? "")
                              if (!woId) return
                              const newVal = val ? Number(val) : null
                              const oldVal = selectedWO[f.worktime] ?? null
                              if (newVal === oldVal) return
                              try {
                                const data: Record<string, unknown> = {}
                                data[f.worktime] = newVal
                                await updateWO.mutateAsync({ id: woId, data })
                                toast.success("作業時間を更新しました")
                              } catch { toast.error("作業時間の更新に失敗しました") }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">分</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">移動時間</span>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number" min="0" className="h-7 w-20 text-sm"
                            defaultValue={String(selectedWO[f.traveltime] ?? "")}
                            onBlur={async (e) => {
                              const val = e.target.value
                              const woId = String(selectedWO[f.id] ?? "")
                              if (!woId) return
                              const newVal = val ? Number(val) : null
                              const oldVal = selectedWO[f.traveltime] ?? null
                              if (newVal === oldVal) return
                              try {
                                const data: Record<string, unknown> = {}
                                if (newVal !== null) data[f.traveltime] = newVal
                                else data[f.traveltime] = null
                                await updateWO.mutateAsync({ id: woId, data })
                                toast.success("移動時間を更新しました")
                              } catch { toast.error("移動時間の更新に失敗しました") }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">分</span>
                        </div>
                      </div>
                    </div>
                    {selectedWO[f.faultsummary] ? <div><span className="text-muted-foreground text-xs">障害概要</span><p>{String(selectedWO[f.faultsummary])}</p></div> : null}
                    {selectedWO[f.workdetail] ? <div><span className="text-muted-foreground text-xs">作業内容</span><p className="whitespace-pre-wrap">{String(selectedWO[f.workdetail])}</p></div> : null}
                    {selectedWO[f.installationlocation] ? <div><span className="text-muted-foreground text-xs">作業場所</span><p>📍 {String(selectedWO[f.installationlocation])}</p></div> : null}
                    {relatedCall && (
                      <div className="border-t pt-2">
                        <span className="text-muted-foreground text-xs">関連コール</span>
                        <p className="font-medium">{String(relatedCall[fCall.name] ?? "")}</p>
                        {relatedCall[fCall.description] ? <p className="text-xs text-muted-foreground mt-0.5">{String(relatedCall[fCall.description])}</p> : null}
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="customer" className="h-full overflow-y-auto mt-3">
                  {custInfo ? (
                    <div className="space-y-3 text-sm">
                      <div><span className="text-muted-foreground text-xs">顧客名</span><p className="font-medium text-base">{String(custInfo[fc.name] ?? "")}</p></div>
                      {custInfo[fc.address] ? <div><span className="text-muted-foreground text-xs">住所</span><p>📍 {String(custInfo[fc.address])}</p></div> : null}
                      <div className="border-t pt-2">
                        <span className="text-muted-foreground text-xs">この顧客の作業オーダー件数</span>
                        <p className="font-medium">{workOrders.filter(wo => String(wo[f.customerId] ?? "") === woCustomerId).length} 件</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">顧客情報がありません</p>
                  )}
                </TabsContent>

                <TabsContent value="calls" className="h-full overflow-y-auto mt-3">
                  {relatedCalls.length > 0 ? (
                    <div className="space-y-2">
                      {relatedCalls.map(c => (
                        <Card key={String(c[fCall.id])} className="p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setWoDetailOpen(false); sessionStorage.setItem("returnToScheduling", "true"); navigate(`/calls?select=${String(c[fCall.id])}`) }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{String(c[fCall.name] ?? "")}</p>
                              {c[fCall.description] ? <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{String(c[fCall.description])}</p> : null}
                            </div>
                            <div className="text-right shrink-0">
                              {c[fCall.receiveddate] ? <p className="text-[10px] text-muted-foreground">{format(parseISO(String(c[fCall.receiveddate])), "MM/dd")}</p> : null}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">関連コールはありません</p>
                  )}
                </TabsContent>

                <TabsContent value="knowledge" className="h-full overflow-y-auto mt-3">
                  {relatedRecs.length > 0 ? (
                    <div className="space-y-2">
                      {relatedRecs.map(r => (
                        <Card key={String(r[fRec.id])} className="p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setWoDetailOpen(false); sessionStorage.setItem("returnToScheduling", "true"); navigate(`/recommendations?select=${String(r[fRec.id])}`) }}>
                          <p className="text-sm font-medium">{String(r[fRec.name] ?? "")}</p>
                          {r[fRec.category] ? <p className="text-xs text-muted-foreground mt-0.5">{String(r[fRec.category])}</p> : null}
                          {r[fRec.detail] ? <p className="text-xs mt-1 line-clamp-2">{String(r[fRec.detail])}</p> : null}
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">関連ナレッジはありません</p>
                  )}
                </TabsContent>
                </div>
              </Tabs>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Engineer Detail Modal */}
      <EngineerModal engineer={selectedEngineer} open={engineerModalOpen} onClose={() => setEngineerModalOpen(false)} />

      {/* Route Modal */}
      <RouteModal
        open={routeModalOpen}
        onClose={() => { setRouteModalOpen(false); setPendingDrop(null) }}
        origin={routeOrigin}
        destination={routeDestination}
        onConfirm={confirmTravelAndAssign}
        travelMinutes={travelMinutes}
        setTravelMinutes={setTravelMinutes}
        workMinutes={workMinutes}
        setWorkMinutes={setWorkMinutes}
        startTime={startTime}
        setStartTime={setStartTime}
      />
    </div>
  )
}
