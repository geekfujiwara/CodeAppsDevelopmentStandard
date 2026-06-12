import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  useOpportunities,
  useCustomers,
  useUpdateOpportunity,
  useCurrentUserId,
} from "@/hooks/use-dataverse";
import { StageOptions, type Opportunity } from "@/types/dataverse";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";

// ── フェーズ列定義 ──
const PROCESS_STAGES = [
  { stage: 100000000, label: "リード", color: "border-t-slate-400" },
  { stage: 100000001, label: "提案", color: "border-t-blue-500" },
  { stage: 100000002, label: "見積", color: "border-t-indigo-500" },
];

const NEGOTIATION_STAGE = { stage: 100000003, label: "交渉", color: "border-t-yellow-500" };

const CLOSING_STAGES = [
  { stage: 100000004, label: "受注", color: "border-t-green-500" },
  { stage: 100000005, label: "失注", color: "border-t-red-400" },
  { stage: 100000006, label: "キャンセル", color: "border-t-gray-400" },
];

const ALL_STAGES = [...PROCESS_STAGES, NEGOTIATION_STAGE, ...CLOSING_STAGES];

// ── Droppable Column ──
function StageColumn({
  stage,
  label,
  color,
  count,
  totalAmount,
  children,
}: {
  stage: number;
  label: string;
  color: string;
  count: number;
  totalAmount: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[240px] w-full rounded-lg border-t-4 ${color} bg-muted/30 ${isOver ? "ring-2 ring-primary/40" : ""}`}
    >
      <div className="px-3 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{label}</h3>
          <Badge variant="secondary" className="text-xs">
            {count}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          ¥{(totalAmount / 10000).toFixed(0)}万
        </p>
      </div>
      <div
        className="flex-1 px-2 pb-2 overflow-y-auto space-y-2 min-h-[80px]"
        style={{ maxHeight: "calc(100vh - 14rem)" }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Draggable Card ──
function OpportunityCard({
  opportunity,
  customerName,
  isDragging,
}: {
  opportunity: Opportunity;
  customerName: string;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: opportunity.geek_opportunityid,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  // 滞留日数計算（modifiedon から今日まで）
  const stagnationDays = useMemo(() => {
    if (!opportunity.modifiedon) return 0;
    const modified = new Date(opportunity.modifiedon).getTime();
    const now = Date.now();
    return Math.floor((now - modified) / 86400000);
  }, [opportunity.modifiedon]);
  const isStagnant = stagnationDays >= 30;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing transition-shadow ${isDragging ? "opacity-50" : "hover:shadow-md"} ${isStagnant ? "ring-1 ring-amber-400/60" : ""}`}
    >
      <CardContent className="p-3 space-y-1.5">
        <p className="text-sm font-medium leading-tight truncate">
          {opportunity.geek_name}
        </p>
        {customerName && (
          <p className="text-xs text-muted-foreground truncate">
            {customerName}
          </p>
        )}
        <div className="flex items-center justify-between">
          {opportunity.geek_amount != null && (
            <span className="text-xs font-semibold text-primary">
              ¥{opportunity.geek_amount.toLocaleString()}
            </span>
          )}
          {opportunity.geek_probability != null && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {opportunity.geek_probability}%
            </Badge>
          )}
        </div>
        {opportunity.geek_expectedclosedate && (
          <p className="text-[10px] text-muted-foreground">
            〆{new Date(opportunity.geek_expectedclosedate).toLocaleDateString("ja-JP")}
          </p>
        )}
        {isStagnant && (
          <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="h-3 w-3" />
            滞留 {stagnationDays}日
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Overlay Card (ドラッグ中表示) ──
function OverlayCard({
  opportunity,
  customerName,
}: {
  opportunity: Opportunity;
  customerName: string;
}) {
  return (
    <Card className="shadow-xl ring-2 ring-primary/30 w-[220px]">
      <CardContent className="p-3 space-y-1.5">
        <p className="text-sm font-medium leading-tight truncate">
          {opportunity.geek_name}
        </p>
        {customerName && (
          <p className="text-xs text-muted-foreground truncate">
            {customerName}
          </p>
        )}
        {opportunity.geek_amount != null && (
          <span className="text-xs font-semibold text-primary">
            ¥{opportunity.geek_amount.toLocaleString()}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

// ── メインページ ──
export default function PipelinePage() {
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: customers = [] } = useCustomers();
  const { data: currentUserId } = useCurrentUserId();
  const updateMutation = useUpdateOpportunity();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [myOnly, setMyOnly] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  const filteredOpportunities = useMemo(() => {
    let list = opportunities;
    if (myOnly && currentUserId) {
      list = list.filter((o) => o._createdby_value?.toLowerCase() === currentUserId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((o) => {
        const name = o.geek_name?.toLowerCase() ?? "";
        const custName = (o._geek_customerid_value ? customerMap.get(o._geek_customerid_value) : "")?.toLowerCase() ?? "";
        return name.includes(q) || custName.includes(q);
      });
    }
    return list;
  }, [opportunities, myOnly, currentUserId, searchQuery, customerMap]);

  const opportunityMap = useMemo(() => {
    const m = new Map<string, Opportunity>();
    opportunities.forEach((o) => m.set(o.geek_opportunityid, o));
    return m;
  }, [opportunities]);

  const grouped = useMemo(() => {
    const map = new Map<number, Opportunity[]>();
    ALL_STAGES.forEach((s) => map.set(s.stage, []));
    filteredOpportunities.forEach((o) => {
      const stage = o.geek_stage ?? 100000000;
      const list = map.get(stage);
      if (list) list.push(o);
    });
    return map;
  }, [filteredOpportunities]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith("stage-")) return;

    const newStage = Number(overId.replace("stage-", ""));
    const opp = opportunityMap.get(String(active.id));
    if (!opp || opp.geek_stage === newStage) return;

    const oldStageName = StageOptions[opp.geek_stage ?? 0] ?? "";
    const newStageName = StageOptions[newStage] ?? "";

    updateMutation.mutate(
      { id: opp.geek_opportunityid, data: { geek_stage: newStage } },
      {
        onSuccess: () => {
          toast.success(`「${opp.geek_name}」を ${oldStageName} → ${newStageName} に変更`);
        },
        onError: () => {
          toast.error("フェーズの更新に失敗しました");
        },
      },
    );
  };

  const activeOpportunity = activeId ? opportunityMap.get(activeId) : null;

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 className="text-2xl font-bold">パイプライン</h2>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="商談名・顧客名で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[220px]"
            />
          </div>
          <Button
            variant={myOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setMyOnly(!myOnly)}
            className="gap-1.5"
          >
            <User className="h-4 w-4" />
            自分のみ
          </Button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* セクション1: 営業プロセス (リード → 提案 → 見積) */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">営業プロセス</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PROCESS_STAGES.map((s) => {
              const items = grouped.get(s.stage) ?? [];
              const total = items.reduce((sum, o) => sum + (o.geek_amount ?? 0), 0);
              return (
                <StageColumn
                  key={s.stage}
                  stage={s.stage}
                  label={s.label}
                  color={s.color}
                  count={items.length}
                  totalAmount={total}
                >
                  {items.map((opp) => (
                    <OpportunityCard
                      key={opp.geek_opportunityid}
                      opportunity={opp}
                      customerName={
                        opp._geek_customerid_value
                          ? customerMap.get(opp._geek_customerid_value) ?? ""
                          : ""
                      }
                      isDragging={activeId === opp.geek_opportunityid}
                    />
                  ))}
                </StageColumn>
              );
            })}
          </div>
        </div>

        {/* セクション2: クロージング (交渉 → 受注/失注/キャンセル) */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">クロージング</h3>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
            {/* 交渉列 */}
            {(() => {
              const items = grouped.get(NEGOTIATION_STAGE.stage) ?? [];
              const total = items.reduce((sum, o) => sum + (o.geek_amount ?? 0), 0);
              return (
                <StageColumn
                  stage={NEGOTIATION_STAGE.stage}
                  label={NEGOTIATION_STAGE.label}
                  color={NEGOTIATION_STAGE.color}
                  count={items.length}
                  totalAmount={total}
                >
                  {items.map((opp) => (
                    <OpportunityCard
                      key={opp.geek_opportunityid}
                      opportunity={opp}
                      customerName={
                        opp._geek_customerid_value
                          ? customerMap.get(opp._geek_customerid_value) ?? ""
                          : ""
                      }
                      isDragging={activeId === opp.geek_opportunityid}
                    />
                  ))}
                </StageColumn>
              );
            })()}

            {/* 最終結果 (受注/失注/キャンセル 縦並び) */}
            <div className="flex flex-col gap-3">
              <div className="text-xs font-medium text-muted-foreground text-center py-1 bg-muted/50 rounded">
                最終結果（いずれかに帰結）
              </div>
              {CLOSING_STAGES.map((s) => {
                const items = grouped.get(s.stage) ?? [];
                const total = items.reduce((sum, o) => sum + (o.geek_amount ?? 0), 0);
                return (
                  <StageColumn
                    key={s.stage}
                    stage={s.stage}
                    label={s.label}
                    color={s.color}
                    count={items.length}
                    totalAmount={total}
                  >
                    {items.map((opp) => (
                      <OpportunityCard
                        key={opp.geek_opportunityid}
                        opportunity={opp}
                        customerName={
                          opp._geek_customerid_value
                            ? customerMap.get(opp._geek_customerid_value) ?? ""
                            : ""
                        }
                        isDragging={activeId === opp.geek_opportunityid}
                      />
                    ))}
                  </StageColumn>
                );
              })}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeOpportunity && (
            <OverlayCard
              opportunity={activeOpportunity}
              customerName={
                activeOpportunity._geek_customerid_value
                  ? customerMap.get(activeOpportunity._geek_customerid_value) ?? ""
                  : ""
              }
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
