import { useMemo, useState, useRef } from "react";
import { PUBLISHER_PREFIX } from "@/config";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActivities, useCustomers, useOpportunities, useCreateActivity, useUpdateActivity, useDeleteActivity } from "@/hooks/use-dataverse";
import { ActivityTypeOptions, type Activity, type ActivityCreate } from "@/types/dataverse";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2, List, Clock, Phone, Mail, Users, Video, MessageSquare } from "lucide-react";

type ViewMode = "table" | "timeline";

const activityIcon = (type?: number) => {
  switch (type) {
    case 100000000: return <Users className="h-4 w-4" />;
    case 100000001: return <Phone className="h-4 w-4" />;
    case 100000002: return <Mail className="h-4 w-4" />;
    case 100000003: return <Video className="h-4 w-4" />;
    default: return <MessageSquare className="h-4 w-4" />;
  }
};

const activityColor = (type?: number) => {
  switch (type) {
    case 100000000: return "bg-blue-500";
    case 100000001: return "bg-green-500";
    case 100000002: return "bg-purple-500";
    case 100000003: return "bg-amber-500";
    default: return "bg-gray-400";
  }
};

export default function ActivitiesPage() {
  const { data: activities = [], isLoading } = useActivities();
  const { data: customers = [] } = useCustomers();
  const { data: opportunities = [] } = useOpportunities();
  const createMutation = useCreateActivity();
  const updateMutation = useUpdateActivity();
  const deleteMutation = useDeleteActivity();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const submitRef = useRef<(() => void) | null>(null);

  const P = PUBLISHER_PREFIX;

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  const opportunityMap = useMemo(() => {
    const m = new Map<string, string>();
    opportunities.forEach((o) => m.set(o.geek_opportunityid, o.geek_name));
    return m;
  }, [opportunities]);

  const columns: TableColumn<Activity>[] = useMemo(() => [
    { key: `${P}_name`, label: "件名", sortable: true },
    {
      key: `${P}_type`,
      label: "種別",
      render: (item) =>
        item.geek_type !== undefined ? (
          <Badge variant="outline">{ActivityTypeOptions[item.geek_type] ?? ""}</Badge>
        ) : null,
    },
    {
      key: "_geek_customerid_value",
      label: "顧客",
      render: (item) => {
        const v = item._geek_customerid_value;
        return v ? customerMap.get(v) ?? "" : "";
      },
    },
    {
      key: "_geek_opportunityid_value",
      label: "商談",
      render: (item) => {
        const v = item._geek_opportunityid_value;
        return v ? opportunityMap.get(v) ?? "" : "";
      },
    },
    {
      key: `${P}_activitydate`,
      label: "活動日",
      sortable: true,
      render: (item) =>
        item.geek_activitydate
          ? new Date(item.geek_activitydate).toLocaleDateString("ja-JP")
          : "",
    },
  ], [customerMap, opportunityMap]);

  const filters: FilterConfig<Activity>[] = useMemo(() => [
    {
      key: `${P}_type` as keyof Activity,
      label: "種別",
      placeholder: "種別で絞込",
      options: Object.entries(ActivityTypeOptions).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ], []);

  const handleSave = (formData: Partial<ActivityCreate>) => {
    console.log('[Activities] handleSave called, editItem:', editItem?.geek_activityid, 'data:', JSON.stringify(formData));
    if (editItem) {
      console.log('[Activities] Calling updateMutation.mutate, id:', editItem.geek_activityid);
      updateMutation.mutate(
        { id: editItem.geek_activityid, data: formData },
        {
          onSuccess: () => { console.log('[Activities] ✅ Update SUCCESS'); setIsFormOpen(false); setEditItem(null); },
          onError: (err) => { console.error('[Activities] ❌ Update FAILED:', err); },
        },
      );
    } else {
      console.log('[Activities] Calling createMutation.mutate');
      createMutation.mutate(formData as ActivityCreate, {
        onSuccess: () => { console.log('[Activities] ✅ Create SUCCESS'); setIsFormOpen(false); },
        onError: (err) => { console.error('[Activities] ❌ Create FAILED:', err); },
      });
    }
  };

  // タイムライン用：日付でグループ化
  const timelineGroups = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) =>
        new Date(b.geek_activitydate ?? b.createdon ?? "").getTime() -
        new Date(a.geek_activitydate ?? a.createdon ?? "").getTime(),
    );
    const groups = new Map<string, Activity[]>();
    sorted.forEach((a) => {
      const dateStr = a.geek_activitydate?.split("T")[0] ?? a.createdon?.split("T")[0] ?? "不明";
      const list = groups.get(dateStr) ?? [];
      list.push(a);
      groups.set(dateStr, list);
    });
    return Array.from(groups.entries());
  }, [activities]);

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">活動履歴</h2>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="table" className="gap-1 px-3">
                <List className="h-3.5 w-3.5" />テーブル
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1 px-3">
                <Clock className="h-3.5 w-3.5" />タイムライン
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />新規記録
          </Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <ListTable<Activity>
          data={activities}
          columns={columns}
          searchKeys={[`${P}_name`, `${P}_content`]}
          searchPlaceholder="件名・内容で検索..."
          filters={filters}
          onRowClick={(item) => { setEditItem(item); setIsFormOpen(true); }}
          emptyMessage="活動データがありません"
        />
      ) : (
        <div className="space-y-6">
          {timelineGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">活動データがありません</p>
          ) : (
            timelineGroups.map(([dateStr, items]) => (
              <div key={dateStr} className="relative">
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1 mb-3">
                  <Badge variant="outline" className="text-xs font-medium">
                    {dateStr !== "不明"
                      ? new Date(dateStr).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
                      : "日付不明"}
                  </Badge>
                </div>
                <div className="ml-4 border-l-2 border-muted pl-6 space-y-3">
                  {items.map((a) => (
                    <Card
                      key={a.geek_activityid}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => { setEditItem(a); setIsFormOpen(true); }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center text-white shrink-0 ${activityColor(a.geek_type)}`}>
                            {activityIcon(a.geek_type)}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{a.geek_name}</p>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {ActivityTypeOptions[a.geek_type ?? 100000004] ?? "その他"}
                              </Badge>
                            </div>
                            {a.geek_content && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{a.geek_content}</p>
                            )}
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {a._geek_customerid_value && (
                                <span>{customerMap.get(a._geek_customerid_value) ?? ""}</span>
                              )}
                              {a._geek_opportunityid_value && (
                                <span>📋 {opportunityMap.get(a._geek_opportunityid_value) ?? ""}</span>
                              )}
                            </div>
                            {a.geek_nextaction && (
                              <p className="text-xs text-primary font-medium">→ {a.geek_nextaction}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "活動編集" : "新規活動記録"}
        onSave={() => {
          console.log('[Activities] onSave called, submitRef.current:', typeof submitRef.current);
          if (submitRef.current) {
            submitRef.current();
          } else {
            console.error('[Activities] ❌ submitRef.current is null!');
          }
        }}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <ActivityForm
          item={editItem}
          customers={customers}
          opportunities={opportunities}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="活動記録を削除"
        description={`「${deleteTarget?.geek_name}」を削除しますか？`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.geek_activityid, {
              onSuccess: () => { setDeleteTarget(null); setIsFormOpen(false); setEditItem(null); },
            });
          }
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

function ActivityForm({
  item,
  customers,
  opportunities,
  onSubmit,
  onDelete,
  submitRef,
}: {
  item: Activity | null;
  customers: { geek_customerid: string; geek_name: string }[];
  opportunities: { geek_opportunityid: string; geek_name: string }[];
  onSubmit: (data: Partial<ActivityCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [name, setName] = useState(item?.geek_name ?? "");
  const [type, setType] = useState(item?.geek_type?.toString() ?? "100000000");
  const [activityDate, setActivityDate] = useState(
    item?.geek_activitydate?.split("T")[0] ?? new Date().toISOString().split("T")[0],
  );
  const [customerId, setCustomerId] = useState(item?._geek_customerid_value ?? "");
  const [opportunityId, setOpportunityId] = useState(item?._geek_opportunityid_value ?? "");
  const [content, setContent] = useState(item?.geek_content ?? "");
  const [nextAction, setNextAction] = useState(item?.geek_nextaction ?? "");

  // submitRef にデータ収集＆送信ロジックを登録
  const doSubmit = () => {
    console.log('[ActivityForm] doSubmit called, name:', name);
    if (!name.trim()) {
      console.warn('[ActivityForm] ⚠️ name is empty, aborting');
      return;
    }
    const data: Partial<ActivityCreate> = {
      geek_name: name,
      geek_type: Number(type),
      geek_activitydate: activityDate,
      ...(content && { geek_content: content }),
      ...(nextAction && { geek_nextaction: nextAction }),
      ...(customerId && { "geek_customerid@odata.bind": `/geek_customers(${customerId})` } as unknown as Partial<ActivityCreate>),
      ...(opportunityId && { "geek_opportunityid@odata.bind": `/geek_opportunities(${opportunityId})` } as unknown as Partial<ActivityCreate>),
    };
    console.log('[ActivityForm] ✅ calling onSubmit with data:', JSON.stringify(data));
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>件名 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>種別</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ActivityTypeOptions).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>活動日</Label>
          <Input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="min-w-0">
          <Label>顧客</Label>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.geek_customerid} value={c.geek_customerid}>
                  {c.geek_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0">
          <Label>商談</Label>
          <Select value={opportunityId} onValueChange={setOpportunityId}>
            <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
            <SelectContent>
              {opportunities.map((o) => (
                <SelectItem key={o.geek_opportunityid} value={o.geek_opportunityid}>
                  {o.geek_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>内容</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
      </div>
      <div>
        <Label>次のアクション</Label>
        <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
      </div>
      {onDelete && (
        <div className="pt-2 border-t">
          <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-1" />削除
          </Button>
        </div>
      )}
    </div>
  );
}
