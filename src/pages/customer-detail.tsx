import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Handshake,
  ClipboardList,
  TrendingUp,
  Target,
  BarChart3,
  Sparkles,
  Calendar,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { ListTable } from "@/components/list-table";
import type { TableColumn } from "@/components/list-table";
import {
  useCustomers,
  useOpportunities,
  useActivities,
  useTerritories,
  useCreateActivity,
  useUpdateCustomer,
  useDeleteCustomer,
} from "@/hooks/use-dataverse";
import {
  IndustryOptions,
  StageOptions,
  ActivityTypeOptions,
} from "@/types/dataverse";
import type { Opportunity, Activity, CustomerCreate } from "@/types/dataverse";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";
import { AiEmailDraft } from "@/components/ai-email-draft";
import { AiAppointment } from "@/components/ai-appointment";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const stageBadgeVariant = (
  stage?: number,
): "default" | "secondary" | "destructive" => {
  switch (stage) {
    case 100000004:
      return "default";
    case 100000005:
      return "destructive";
    default:
      return "secondary";
  }
};

type OpportunityRow = Opportunity & Record<string, unknown>;
type ActivityRow = Activity & Record<string, unknown>;

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: customers = [], isLoading: loadingCust } = useCustomers();
  const { data: opportunities = [] } = useOpportunities();
  const { data: activities = [] } = useActivities();
  const { data: territories = [] } = useTerritories();
  const createActivity = useCreateActivity();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 編集用 state
  const [editName, setEditName] = useState("");
  const [editIndustry, setEditIndustry] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const startEditing = () => {
    if (!customer) return;
    setEditName(customer.geek_name ?? "");
    setEditIndustry(customer.geek_industry?.toString() ?? "");
    setEditContactPerson(customer.geek_contactperson ?? "");
    setEditEmail(customer.geek_email ?? "");
    setEditPhone(customer.geek_phone ?? "");
    setEditAddress(customer.geek_address ?? "");
    setEditNotes(customer.geek_notes ?? "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!customer || !editName.trim()) return;
    const data: Partial<CustomerCreate> = {
      geek_name: editName,
      ...(editIndustry && { geek_industry: Number(editIndustry) }),
      geek_contactperson: editContactPerson || undefined,
      geek_email: editEmail || undefined,
      geek_phone: editPhone || undefined,
      geek_address: editAddress || undefined,
      geek_notes: editNotes || undefined,
    };
    updateCustomer.mutate(
      { id: customer.geek_customerid, data },
      { onSuccess: () => { setIsEditing(false); toast.success("顧客情報を更新しました"); } },
    );
  };

  const customer = useMemo(
    () => customers.find((c) => c.geek_customerid === id),
    [customers, id],
  );

  const relatedOpportunities = useMemo(
    () =>
      opportunities.filter((o) => o._geek_customerid_value === id),
    [opportunities, id],
  );

  const relatedActivities = useMemo(
    () =>
      activities
        .filter((a) => a._geek_customerid_value === id)
        .sort(
          (a, b) =>
            new Date(b.geek_activitydate ?? b.createdon ?? "").getTime() -
            new Date(a.geek_activitydate ?? a.createdon ?? "").getTime(),
        ),
    [activities, id],
  );

  // KPI
  const totalPipeline = relatedOpportunities
    .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005)
    .reduce((sum, o) => sum + (o.geek_amount ?? 0), 0);
  const wonAmount = relatedOpportunities
    .filter((o) => o.geek_stage === 100000004)
    .reduce((sum, o) => sum + (o.geek_amount ?? 0), 0);

  // テリトリー予算
  const territoryBudget = useMemo(() => {
    const t = territories.find((t) => t._geek_customerid_value === id);
    return t?.geek_budget ?? 0;
  }, [territories, id]);

  const achievementRate = territoryBudget > 0 ? Math.round((wonAmount / territoryBudget) * 100) : 0;

  // 同業種比較
  const industryComparison = useMemo(() => {
    if (customer?.geek_industry == null) return null;
    const sameIndustryCustomers = customers.filter(
      (c) => c.geek_industry === customer.geek_industry && c.geek_customerid !== id,
    );
    if (sameIndustryCustomers.length === 0) return null;

    const sameIds = new Set(sameIndustryCustomers.map((c) => c.geek_customerid));
    const sameOps = opportunities.filter((o) => sameIds.has(o._geek_customerid_value ?? ""));
    const avgWon =
      sameOps.filter((o) => o.geek_stage === 100000004).reduce((s, o) => s + (o.geek_amount ?? 0), 0) /
      sameIndustryCustomers.length;
    const avgPipeline =
      sameOps
        .filter((o) => o.geek_stage !== 100000004 && o.geek_stage !== 100000005)
        .reduce((s, o) => s + (o.geek_amount ?? 0), 0) / sameIndustryCustomers.length;
    const avgOppCount = sameOps.length / sameIndustryCustomers.length;

    return { avgWon, avgPipeline, avgOppCount, count: sameIndustryCustomers.length };
  }, [customer, customers, opportunities, id]);

  const oppColumns: TableColumn<OpportunityRow>[] = useMemo(
    () => [
      { key: "geek_name", label: "商談名", sortable: true },
      {
        key: "geek_stage",
        label: "フェーズ",
        render: (item) =>
          item.geek_stage != null ? (
            <Badge variant={stageBadgeVariant(item.geek_stage)}>
              {StageOptions[item.geek_stage] ?? ""}
            </Badge>
          ) : null,
      },
      {
        key: "geek_amount",
        label: "金額",
        align: "right" as const,
        render: (item) =>
          item.geek_amount != null
            ? `¥${item.geek_amount.toLocaleString()}`
            : "",
      },
      {
        key: "geek_expectedclosedate",
        label: "予定日",
        render: (item) =>
          item.geek_expectedclosedate
            ? new Date(item.geek_expectedclosedate).toLocaleDateString("ja-JP")
            : "",
      },
    ],
    [],
  );

  const actColumns: TableColumn<ActivityRow>[] = useMemo(
    () => [
      { key: "geek_name", label: "件名", sortable: true },
      {
        key: "geek_type",
        label: "種別",
        render: (item) =>
          item.geek_type != null ? (
            <Badge variant="outline">
              {ActivityTypeOptions[item.geek_type] ?? ""}
            </Badge>
          ) : null,
      },
      {
        key: "geek_activitydate",
        label: "日付",
        render: (item) =>
          item.geek_activitydate
            ? new Date(item.geek_activitydate).toLocaleDateString("ja-JP")
            : "",
      },
      { key: "geek_content", label: "内容" },
    ],
    [],
  );

  if (loadingCust) {
    return (
      <div className="p-4 md:p-6">
        <LoadingSkeletonGrid columns={1} count={3} variant="detailed" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          顧客一覧に戻る
        </Button>
        <p className="text-muted-foreground">顧客が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/customers")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="text-2xl font-bold h-auto py-1"
              placeholder="会社名"
            />
          ) : (
            <h2 className="text-2xl font-bold">{customer.geek_name}</h2>
          )}
          {!isEditing && customer.geek_industry != null && (
            <Badge variant="outline" className="mt-1">
              {IndustryOptions[customer.geek_industry] ?? ""}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEditing}>
                <X className="h-4 w-4 mr-1" />
                キャンセル
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateCustomer.isPending || !editName.trim()}>
                <Save className="h-4 w-4 mr-1" />
                保存
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={startEditing}
              >
                <Pencil className="h-4 w-4 mr-1" />
                編集
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAppointmentDialogOpen(true)}
              >
                <Sparkles className="h-4 w-4 mr-1 text-amber-500" />
                <Calendar className="h-4 w-4 mr-1" />
                AIアポ提案
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEmailDialogOpen(true)}
              >
                <Sparkles className="h-4 w-4 mr-1 text-purple-500" />
                <Mail className="h-4 w-4 mr-1" />
                AIメール
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 基本情報 — 編集モード */}
      {isEditing ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>業種</Label>
                <Select value={editIndustry} onValueChange={setEditIndustry}>
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
                <Input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>メール</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div>
                <Label>電話番号</Label>
                <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>住所</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
            <div>
              <Label>備考</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
            </div>
            <div className="pt-2 border-t">
              <Button type="button" variant="destructive" size="sm" onClick={() => { setIsEditing(false); setDeleteConfirmOpen(true); }}>
                <Trash2 className="h-4 w-4 mr-1" />顧客を削除
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* 基本情報 — 閲覧モード */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {customer.geek_contactperson && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <Handshake className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">担当者</p>
                  <p className="text-sm font-medium truncate">{customer.geek_contactperson}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {customer.geek_email && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">メール</p>
                  <p className="text-sm font-medium truncate">{customer.geek_email}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {customer.geek_phone && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">電話</p>
                  <p className="text-sm font-medium truncate">{customer.geek_phone}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {customer.geek_address && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">住所</p>
                  <p className="text-sm font-medium truncate">{customer.geek_address}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Google Map */}
      {customer.geek_address && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-500" />
              所在地
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md overflow-hidden border h-[300px]">
              <iframe
                title="Google Maps"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(customer.geek_address)}&output=embed`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 売上 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Handshake className="h-4 w-4 text-blue-600" />
              商談数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{relatedOpportunities.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              パイプライン
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(totalPipeline / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-green-600" />
              受注額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">¥{(wonAmount / 10000).toFixed(0)}万</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4 text-orange-600" />
              予算達成率
            </CardTitle>
          </CardHeader>
          <CardContent>
            {territoryBudget > 0 ? (
              <div className="space-y-1">
                <p className="text-2xl font-bold">{achievementRate}%</p>
                <Progress value={Math.min(achievementRate, 100)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  予算: ¥{(territoryBudget / 10000).toFixed(0)}万
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">未設定</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 同業種比較 */}
      {industryComparison && customer.geek_industry != null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-indigo-600" />
              同業種比較（{IndustryOptions[customer.geek_industry]}：{industryComparison.count}社平均）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">受注額 vs 業種平均</p>
                <p className="text-lg font-bold">
                  ¥{(wonAmount / 10000).toFixed(0)}万
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / 平均 ¥{(industryComparison.avgWon / 10000).toFixed(0)}万
                  </span>
                </p>
                <Badge variant={wonAmount >= industryComparison.avgWon ? "default" : "secondary"}>
                  {wonAmount >= industryComparison.avgWon ? "平均以上" : "平均以下"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">パイプライン vs 業種平均</p>
                <p className="text-lg font-bold">
                  ¥{(totalPipeline / 10000).toFixed(0)}万
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / 平均 ¥{(industryComparison.avgPipeline / 10000).toFixed(0)}万
                  </span>
                </p>
                <Badge variant={totalPipeline >= industryComparison.avgPipeline ? "default" : "secondary"}>
                  {totalPipeline >= industryComparison.avgPipeline ? "平均以上" : "平均以下"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">商談数 vs 業種平均</p>
                <p className="text-lg font-bold">
                  {relatedOpportunities.length}件
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    / 平均 {industryComparison.avgOppCount.toFixed(1)}件
                  </span>
                </p>
                <Badge variant={relatedOpportunities.length >= industryComparison.avgOppCount ? "default" : "secondary"}>
                  {relatedOpportunities.length >= industryComparison.avgOppCount ? "平均以上" : "平均以下"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 関連商談 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">商談</CardTitle>
          <Badge variant="secondary">{relatedOpportunities.length}件</Badge>
        </CardHeader>
        <CardContent>
          {relatedOpportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              商談なし
            </p>
          ) : (
            <ListTable
              data={relatedOpportunities as OpportunityRow[]}
              columns={oppColumns}
              searchKeys={["geek_name"]}
              onRowClick={(row) =>
                navigate(`/opportunities/${row.geek_opportunityid}`)
              }
            />
          )}
        </CardContent>
      </Card>

      {/* 関連活動 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">活動履歴</CardTitle>
          <Badge variant="secondary">{relatedActivities.length}件</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 活動頻度ヒートマップ (過去6ヶ月) */}
          {relatedActivities.length > 0 && (
            <ActivityHeatmap activities={relatedActivities} />
          )}
          {relatedActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              活動なし
            </p>
          ) : (
            <ListTable
              data={relatedActivities as ActivityRow[]}
              columns={actColumns}
              searchKeys={["geek_name"]}
            />
          )}
        </CardContent>
      </Card>

      {/* AI ダイアログ */}
      <AiEmailDraft
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        customer={customer}
        opportunities={relatedOpportunities}
      />
      <AiAppointment
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        customer={customer}
        recentActivities={relatedActivities}
        onCreateActivity={(data) => createActivity.mutate(data)}
      />

      {/* 顧客編集モーダル → 削除（インライン編集に変更） */}

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="顧客を削除"
        description={`「${customer.geek_name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          deleteCustomer.mutate(customer.geek_customerid, {
            onSuccess: () => navigate("/customers"),
          });
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

// ── 活動頻度ヒートマップ ──
function ActivityHeatmap({ activities }: { activities: Activity[] }) {
  const weeks = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const dayCount = new Map<string, number>();

    activities.forEach((a) => {
      const d = a.geek_activitydate?.split("T")[0];
      if (d) dayCount.set(d, (dayCount.get(d) ?? 0) + 1);
    });

    const result: { date: Date; count: number }[][] = [];
    let currentWeek: { date: Date; count: number }[] = [];
    const cursor = new Date(startDate);
    // Align to Monday
    while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() - 1);

    while (cursor <= now) {
      const key = cursor.toISOString().split("T")[0];
      currentWeek.push({ date: new Date(cursor), count: dayCount.get(key) ?? 0 });
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) result.push(currentWeek);
    return result;
  }, [activities]);

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted";
    if (count === 1) return "bg-green-200 dark:bg-green-900/50";
    if (count === 2) return "bg-green-400 dark:bg-green-700";
    return "bg-green-600 dark:bg-green-500";
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">活動頻度（過去6ヶ月）</p>
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((day, di) => (
              <div
                key={di}
                className={`w-3 h-3 rounded-sm ${getColor(day.count)}`}
                title={`${day.date.toLocaleDateString("ja-JP")}: ${day.count}件`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>少</span>
        <div className="w-3 h-3 rounded-sm bg-muted" />
        <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900/50" />
        <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" />
        <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
        <span>多</span>
      </div>
    </div>
  );
}
