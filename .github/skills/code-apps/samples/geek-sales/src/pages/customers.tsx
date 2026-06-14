import { useMemo, useState, useRef } from "react";
import { PUBLISHER_PREFIX } from "@/config";
import { useNavigate } from "react-router-dom";
import { ListTable, type TableColumn, type FilterConfig } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useOpportunities, useActivities } from "@/hooks/use-dataverse";
import { IndustryOptions, type Customer, type CustomerCreate } from "@/types/dataverse";
import { LoadingSkeletonCard } from "@/components/loading-skeleton";
import { FormModal } from "@/components/form-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Plus, Trash2, LayoutGrid, List, Handshake, CalendarClock } from "lucide-react";

type ViewMode = "table" | "card";

export default function CustomersPage() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: opportunities = [] } = useOpportunities();
  const { data: activities = [] } = useActivities();
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();
  const deleteMutation = useDeleteCustomer();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [industryTab, setIndustryTab] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const submitRef = useRef<(() => void) | null>(null);

  const P = PUBLISHER_PREFIX;

  // ── 顧客別の商談サマリ ──
  const oppSummaryByCustomer = useMemo(() => {
    const m = new Map<string, { activeCount: number; pipelineAmount: number }>();
    opportunities.forEach((o) => {
      const cid = o._geek_customerid_value;
      if (!cid) return;
      const cur = m.get(cid) ?? { activeCount: 0, pipelineAmount: 0 };
      if (o.geek_stage != null && o.geek_stage >= 100000000 && o.geek_stage <= 100000003) {
        cur.activeCount += 1;
        cur.pipelineAmount += o.geek_amount ?? 0;
      }
      m.set(cid, cur);
    });
    return m;
  }, [opportunities]);

  // ── 顧客別の最終活動日 ──
  const lastActivityByCustomer = useMemo(() => {
    const m = new Map<string, string>();
    activities.forEach((a) => {
      const cid = a._geek_customerid_value;
      if (!cid || !a.geek_activitydate) return;
      const cur = m.get(cid);
      if (!cur || a.geek_activitydate > cur) {
        m.set(cid, a.geek_activitydate);
      }
    });
    return m;
  }, [activities]);

  // ── 業種タブでフィルタ ──
  const filteredCustomers = useMemo(() => {
    if (industryTab === "all") return customers;
    return customers.filter((c) => c.geek_industry?.toString() === industryTab);
  }, [customers, industryTab]);

  // ── 業種ごとの件数 ──
  const industryCounts = useMemo(() => {
    const m = new Map<string, number>();
    customers.forEach((c) => {
      const key = c.geek_industry?.toString() ?? "none";
      m.set(key, (m.get(key) ?? 0) + 1);
    });
    return m;
  }, [customers]);

  // ── テーブル列定義 ──
  const columns: TableColumn<Customer>[] = useMemo(() => [
    { key: `${P}_name`, label: "会社名", sortable: true },
    {
      key: `${P}_industry`,
      label: "業種",
      render: (item) =>
        item.geek_industry !== undefined ? (
          <Badge variant="secondary" className="text-xs">{IndustryOptions[item.geek_industry] ?? ""}</Badge>
        ) : null,
    },
    { key: `${P}_contactperson`, label: "担当者名" },
    {
      key: "_opp_summary" as keyof Customer,
      label: "商談",
      render: (item) => {
        const summary = oppSummaryByCustomer.get(item.geek_customerid);
        if (!summary || summary.activeCount === 0) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-xs">
            <span className="font-medium">{summary.activeCount}件</span>
            <span className="text-muted-foreground ml-1">¥{(summary.pipelineAmount / 10000).toFixed(0)}万</span>
          </span>
        );
      },
    },
    {
      key: "_last_activity" as keyof Customer,
      label: "最終活動",
      render: (item) => {
        const lastDate = lastActivityByCustomer.get(item.geek_customerid);
        if (!lastDate) return <span className="text-muted-foreground text-xs">—</span>;
        const d = new Date(lastDate);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        const label = d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
        const color = diffDays > 30 ? "text-red-500" : diffDays > 14 ? "text-amber-500" : "text-muted-foreground";
        return <span className={`text-xs ${color}`}>{label}</span>;
      },
    },
  ], [oppSummaryByCustomer, lastActivityByCustomer]);

  const filters: FilterConfig<Customer>[] = useMemo(() => [
    {
      key: `${P}_industry` as keyof Customer,
      label: "業種",
      placeholder: "業種で絞込",
      options: Object.entries(IndustryOptions).map(([value, label]) => ({
        value,
        label,
      })),
    },
  ], []);

  const handleSave = (formData: Partial<CustomerCreate>) => {
    if (editItem) {
      updateMutation.mutate(
        { id: editItem.geek_customerid, data: formData },
        { onSuccess: () => { setIsFormOpen(false); setEditItem(null); } }
      );
    } else {
      createMutation.mutate(formData as CustomerCreate, {
        onSuccess: () => { setIsFormOpen(false); },
      });
    }
  };

  if (isLoading) return <div className="p-4 md:p-6"><LoadingSkeletonCard variant="detailed" count={3} /></div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">顧客</h2>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => { setEditItem(null); setIsFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />新規作成
          </Button>
        </div>
      </div>

      {/* 業種タブ */}
      <Tabs value={industryTab} onValueChange={setIndustryTab}>
        <TabsList className="h-9">
          <TabsTrigger value="all" className="text-xs px-3">
            全て ({customers.length})
          </TabsTrigger>
          {Object.entries(IndustryOptions).map(([value, label]) => {
            const count = industryCounts.get(value) ?? 0;
            if (count === 0) return null;
            return (
              <TabsTrigger key={value} value={value} className="text-xs px-3">
                {label} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* テーブル表示 */}
      {viewMode === "table" && (
        <ListTable<Customer>
          data={filteredCustomers}
          columns={columns}
          searchKeys={[`${P}_name`, `${P}_contactperson`]}
          searchPlaceholder="会社名・担当者名で検索..."
          filters={filters}
          onRowClick={(item) => navigate(`/customers/${item.geek_customerid}`)}
          emptyMessage="顧客データがありません"
        />
      )}

      {/* カード表示 */}
      {viewMode === "card" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-8">顧客データがありません</p>
          )}
          {filteredCustomers.map((c) => {
            const summary = oppSummaryByCustomer.get(c.geek_customerid);
            const lastDate = lastActivityByCustomer.get(c.geek_customerid);
            const diffDays = lastDate ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)) : null;
            const hasActiveOpps = summary && summary.activeCount > 0;
            const isStale = hasActiveOpps && (diffDays === null || diffDays > 14);

            return (
              <Card
                key={c.geek_customerid}
                className={`cursor-pointer hover:shadow-md transition-shadow relative ${isStale ? "ring-1 ring-red-300 dark:ring-red-800" : ""}`}
                onClick={() => navigate(`/customers/${c.geek_customerid}`)}
              >
                {/* 警告インジケーター */}
                {isStale && (
                  <div className="absolute top-2 right-2 h-3 w-3 rounded-full bg-red-500 animate-pulse" title={`${diffDays ?? "∞"}日間 活動なし`} />
                )}
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{c.geek_name}</p>
                      {c.geek_contactperson && (
                        <p className="text-xs text-muted-foreground">{c.geek_contactperson}</p>
                      )}
                    </div>
                    {c.geek_industry != null && (
                      <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">
                        {IndustryOptions[c.geek_industry] ?? ""}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Handshake className="h-3.5 w-3.5" />
                      {summary && summary.activeCount > 0 ? (
                        <span><span className="font-medium text-foreground">{summary.activeCount}件</span> ¥{(summary.pipelineAmount / 10000).toFixed(0)}万</span>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      {lastDate ? (
                        <span className={diffDays != null && diffDays > 30 ? "text-red-500 font-medium" : diffDays != null && diffDays > 14 ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                          {diffDays != null && diffDays > 14 ? `${diffDays}日前` : new Date(lastDate).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        title={editItem ? "顧客編集" : "新規顧客"}
        onSave={() => submitRef.current?.()}
        isSaving={createMutation.isPending || updateMutation.isPending}
      >
        <CustomerForm
          item={editItem}
          onSubmit={handleSave}
          onDelete={editItem ? () => setDeleteTarget(editItem) : undefined}
          submitRef={submitRef}
        />
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="顧客を削除"
        description={`「${deleteTarget?.geek_name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.geek_customerid, {
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

function CustomerForm({
  item,
  onSubmit,
  onDelete,
  submitRef,
}: {
  item: Customer | null;
  onSubmit: (data: Partial<CustomerCreate>) => void;
  onDelete?: () => void;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [name, setName] = useState(item?.geek_name ?? "");
  const [industry, setIndustry] = useState(item?.geek_industry?.toString() ?? "");
  const [contactPerson, setContactPerson] = useState(item?.geek_contactperson ?? "");
  const [email, setEmail] = useState(item?.geek_email ?? "");
  const [phone, setPhone] = useState(item?.geek_phone ?? "");
  const [address, setAddress] = useState(item?.geek_address ?? "");
  const [notes, setNotes] = useState(item?.geek_notes ?? "");

  const doSubmit = () => {
    if (!name.trim()) return;
    const data: Partial<CustomerCreate> = {
      geek_name: name,
      ...(industry && { geek_industry: Number(industry) }),
      ...(contactPerson && { geek_contactperson: contactPerson }),
      ...(email && { geek_email: email }),
      ...(phone && { geek_phone: phone }),
      ...(address && { geek_address: address }),
      ...(notes && { geek_notes: notes }),
    };
    onSubmit(data);
  };
  if (submitRef) submitRef.current = doSubmit;

  return (
    <div className="space-y-4">
      <div>
        <Label>会社名 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>業種</Label>
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(IndustryOptions).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>担当者名</Label>
          <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>メール</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label>電話番号</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>住所</Label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div>
        <Label>備考</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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
