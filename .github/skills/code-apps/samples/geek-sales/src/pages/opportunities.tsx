import { useMemo, useState, useRef } from "react";
import { PUBLISHER_PREFIX } from "@/config";
import { useNavigate } from "react-router-dom";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOpportunities, useCustomers, useCreateOpportunity, useUpdateOpportunity, useDeleteOpportunity } from "@/hooks/use-dataverse";
import { StageOptions, type Opportunity, type OpportunityCreate } from "@/types/dataverse";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2, TrendingUp, Trophy, XCircle, Handshake, Target } from "lucide-react";
import { StageProgressBar } from "@/components/stage-progress-bar";

export default function OpportunitiesPage() {
  const navigate = useNavigate();
  const { data: opportunities = [], isLoading } = useOpportunities();
  const { data: customers = [] } = useCustomers();
  const createMutation = useCreateOpportunity();
  const updateMutation = useUpdateOpportunity();
  const deleteMutation = useDeleteOpportunity();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Opportunity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null);
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const submitRef = useRef<(() => void) | null>(null);

  const P = PUBLISHER_PREFIX;

  const customerMap = useMemo(() => {
    const m = new Map<string, string>();
    customers.forEach((c) => m.set(c.geek_customerid, c.geek_name));
    return m;
  }, [customers]);

  // ステージ別カウント
  const stageCounts = useMemo(() => {
    const m = new Map<number, number>();
    opportunities.forEach((o) => {
      const s = o.geek_stage ?? -1;
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return m;
  }, [opportunities]);

  // フィルタ適用
  const filteredOpportunities = useMemo(
    () =>
      stageFilter != null
        ? opportunities.filter((o) => o.geek_stage === stageFilter)
        : opportunities,
    [opportunities, stageFilter],
  );

  const columns: TableColumn<Opportunity>[] = useMemo(() => [
    { key: `${P}_name`, label: "商談名", sortable: true },
    {
      key: `${P}_stage`,
      label: "フェーズ",
      sortable: true,
      render: (item) => (
        <StageProgressBar currentStage={item.geek_stage} compact />
      ),
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
      key: `${P}_amount`,
      label: "金額",
      sortable: true,
      align: "right",
      render: (item) =>
        item.geek_amount != null ? `¥${item.geek_amount.toLocaleString()}` : "",
    },
    {
      key: `${P}_probability`,
      label: "確度",
      align: "center",
      render: (item) =>
        item.geek_probability !== undefined ? `${item.geek_probability}%` : "",
    },
    {
      key: `${P}_expectedclosedate`,
      label: "予定完了日",
      render: (item) =>
        item.geek_expectedclosedate
          ? new Date(item.geek_expectedclosedate).toLocaleDateString("ja-JP")
          : "",
    },
    {
      key: "weighted_amount",
      label: "見込額",
      align: "right" as const,
      render: (item) => {
        const amount = item.geek_amount ?? 0;
        const prob = item.geek_probability ?? 0;
        const weighted = amount * prob / 100;
        if (weighted === 0) return null;
        return (
          <Badge variant="secondary" className="text-xs whitespace-nowrap">
            見込¥{Math.round(weighted / 10000).toLocaleString()}万
          </Badge>
        );
      },
    },
  ], [customerMap]);

  const filters: FilterConfig<Opportunity>[] = useMemo(() => [
    {
      key: `${P}_stage` as keyof Opportunity,
      label: "フェーズ",
      placeholder: "フェーズで絞込",
      options: Object.entries(StageOptions).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ], []);

  const handleSave = (formData: Partial<OpportunityCreate>) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.geek_opportunityid, data: formData },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } }
      );
    } else {
      createMutation.mutate(formData as OpportunityCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  // サマリ KPI
  const summaryStats = useMemo(() => {
    const active = opportunities.filter(
      (o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005 && o.geek_stage !== 100000006,
    );
    const pipelineTotal = active.reduce((s, o) => s + (o.geek_amount ?? 0), 0);
    const wonTotal = opportunities
      .filter((o) => o.geek_stage === 100000004)
      .reduce((s, o) => s + (o.geek_amount ?? 0), 0);
    const lostCount = opportunities.filter((o) => o.geek_stage === 100000005).length;
    const weightedTotal = active.reduce(
      (s, o) => s + (o.geek_amount ?? 0) * (o.geek_probability ?? 0) / 100,
      0,
    );
    return { activeCount: active.length, pipelineTotal, wonTotal, lostCount, weightedTotal };
  }, [opportunities]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">商談</h2>
        <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />新規作成
        </Button>
      </div>

      {/* サマリーバナー */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Handshake className="h-5 w-5 text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">進行中</p>
              <p className="text-lg font-bold">{summaryStats.activeCount}件</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-purple-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">パイプライン</p>
              <p className="text-lg font-bold">¥{(summaryStats.pipelineTotal / 10000).toFixed(0)}万</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Trophy className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">受注合計</p>
              <p className="text-lg font-bold">¥{(summaryStats.wonTotal / 10000).toFixed(0)}万</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">失注</p>
              <p className="text-lg font-bold">{summaryStats.lostCount}件</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Target className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">重み付きパイプライン</p>
              <p className="text-lg font-bold">¥{Math.round(summaryStats.weightedTotal / 10000).toLocaleString()}万</p>
              <p className="text-xs text-muted-foreground">確度加重合計</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ステージフィルターボタン */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={stageFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStageFilter(null)}
        >
          すべて ({opportunities.length})
        </Button>
        {Object.entries(StageOptions).map(([value, label]) => {
          const stage = Number(value);
          const count = stageCounts.get(stage) ?? 0;
          return (
            <Button
              key={value}
              variant={stageFilter === stage ? "default" : "outline"}
              size="sm"
              onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
            >
              {label} ({count})
            </Button>
          );
        })}
      </div>

      <ListTable<Opportunity>
        data={filteredOpportunities}
        columns={columns}
        searchKeys={[`${P}_name`]}
        searchPlaceholder="商談名で検索..."
        filters={filters}
        onRowClick={(item) => navigate(`/opportunities/${item.geek_opportunityid}`)}
        emptyMessage="商談データがありません"
      />

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "商談編集" : "新規商談"}
        onSave={() => submitRef.current?.()}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <OpportunityForm
          item={editItem}
          customers={customers}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="商談を削除"
        description={`「${deleteTarget?.geek_name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.geek_opportunityid, {
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

function OpportunityForm({
  item,
  customers,
  onSubmit,
  onDelete,
  submitRef,
}: {
  item: Opportunity | null;
  customers: { geek_customerid: string; geek_name: string }[];
  onSubmit: (data: Partial<OpportunityCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [name, setName] = useState(item?.geek_name ?? "");
  const [stage, setStage] = useState(item?.geek_stage?.toString() ?? "100000000");
  const [amount, setAmount] = useState(item?.geek_amount?.toString() ?? "");
  const [probability, setProbability] = useState(item?.geek_probability?.toString() ?? "");
  const [closeDate, setCloseDate] = useState(item?.geek_expectedclosedate?.split("T")[0] ?? "");
  const [customerId, setCustomerId] = useState(item?._geek_customerid_value ?? "");
  const [description, setDescription] = useState(item?.geek_description ?? "");

  const doSubmit = () => {
    if (!name.trim()) return;
    const data: Partial<OpportunityCreate> = {
      geek_name: name,
      geek_stage: Number(stage),
      ...(amount && { geek_amount: Number(amount) }),
      ...(probability && { geek_probability: Number(probability) }),
      ...(closeDate && { geek_expectedclosedate: closeDate }),
      ...(customerId && { "geek_customerid@odata.bind": `/geek_customers(${customerId})` } as unknown as Partial<OpportunityCreate>),
      ...(description && { geek_description: description }),
    };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>商談名 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>フェーズ</Label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(StageOptions).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
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
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>金額</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <Label>確度(%)</Label>
          <Input type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)} />
        </div>
        <div>
          <Label>予定完了日</Label>
          <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>詳細</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
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
