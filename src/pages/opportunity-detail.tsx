import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  TrendingUp,
  Target,
  Pencil,
  Phone,
  Mail,
  Video,
  Users,
  MessageSquare,
  Save,
  X,
  Trash2,
  Swords,
  BarChart3,
} from "lucide-react";
import {
  useOpportunities,
  useCustomers,
  useActivities,
  useUpdateOpportunity,
  useDeleteOpportunity,
} from "@/hooks/use-dataverse";
import {
  StageOptions,
  ActivityTypeOptions,
} from "@/types/dataverse";
import type { Opportunity, OpportunityCreate } from "@/types/dataverse";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";
import { StageProgressBar } from "@/components/stage-progress-bar";
import { AiInsights } from "@/components/ai-insights";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

const activityIcon = (type?: number) => {
  switch (type) {
    case 100000000:
      return <Users className="h-4 w-4" />;
    case 100000001:
      return <Phone className="h-4 w-4" />;
    case 100000002:
      return <Mail className="h-4 w-4" />;
    case 100000003:
      return <Video className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: opportunities = [], isLoading: loadingOpp } = useOpportunities();
  const { data: customers = [] } = useCustomers();
  const { data: activities = [], isLoading: loadingAct } = useActivities();
  const updateMutation = useUpdateOpportunity();
  const deleteMutation = useDeleteOpportunity();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 編集用 state
  const [editName, setEditName] = useState("");
  const [editStage, setEditStage] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editProbability, setEditProbability] = useState("");
  const [editCloseDate, setEditCloseDate] = useState("");
  const [editCustomerId, setEditCustomerId] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const opportunity = useMemo(
    () => opportunities.find((o) => o.geek_opportunityid === id),
    [opportunities, id],
  );

  const customer = useMemo(() => {
    if (!opportunity?._geek_customerid_value) return null;
    return customers.find(
      (c) => c.geek_customerid === opportunity._geek_customerid_value,
    );
  }, [customers, opportunity]);

  const relatedActivities = useMemo(
    () =>
      activities
        .filter(
          (a) =>
            a._geek_opportunityid_value === id,
        )
        .sort(
          (a, b) =>
            new Date(b.geek_activitydate ?? b.createdon ?? "").getTime() -
            new Date(a.geek_activitydate ?? a.createdon ?? "").getTime(),
        ),
    [activities, id],
  );

  const startEditing = () => {
    if (!opportunity) return;
    setEditName(opportunity.geek_name ?? "");
    setEditStage(opportunity.geek_stage?.toString() ?? "100000000");
    setEditAmount(opportunity.geek_amount?.toString() ?? "");
    setEditProbability(opportunity.geek_probability?.toString() ?? "");
    setEditCloseDate(opportunity.geek_expectedclosedate?.split("T")[0] ?? "");
    setEditCustomerId(opportunity._geek_customerid_value ?? "");
    setEditDescription(opportunity.geek_description ?? "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!opportunity || !editName.trim()) return;
    const data: Partial<OpportunityCreate> = {
      geek_name: editName,
      geek_stage: Number(editStage),
      ...(editAmount && { geek_amount: Number(editAmount) }),
      ...(editProbability && { geek_probability: Number(editProbability) }),
      ...(editCloseDate && { geek_expectedclosedate: editCloseDate }),
      ...(editCustomerId && { "geek_customerid@odata.bind": `/geek_customers(${editCustomerId})` } as unknown as Partial<OpportunityCreate>),
      ...(editDescription && { geek_description: editDescription }),
    };
    updateMutation.mutate(
      { id: opportunity.geek_opportunityid, data },
      {
        onSuccess: () => {
          setIsEditing(false);
          toast.success("商談を更新しました");
        },
      },
    );
  };

  if (loadingOpp || loadingAct) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <LoadingSkeletonGrid columns={1} count={3} variant="detailed" />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate("/opportunities")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          商談一覧に戻る
        </Button>
        <p className="text-muted-foreground">商談が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/opportunities")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            {isEditing ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-2xl font-bold h-auto py-1"
                placeholder="商談名"
              />
            ) : (
              <h2 className="text-2xl font-bold">{opportunity.geek_name}</h2>
            )}
            {!isEditing && customer && (
              <span className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <Building2 className="h-3.5 w-3.5" />
                {customer.geek_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                削除
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEditing}>
                <X className="h-4 w-4 mr-1" />
                キャンセル
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !editName.trim()}>
                <Save className="h-4 w-4 mr-1" />
                保存
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" />編集
            </Button>
          )}
        </div>
      </div>

      {/* ステージプログレスバー */}
      <Card>
        <CardContent className="pt-6">
          <StageProgressBar
            currentStage={opportunity.geek_stage}
            onStageChange={(newStage) => {
              updateMutation.mutate(
                { id: opportunity.geek_opportunityid, data: { geek_stage: newStage } },
                {
                  onSuccess: () => {
                    toast.success(`フェーズを「${StageOptions[newStage]}」に変更しました`);
                  },
                },
              );
            }}
          />
        </CardContent>
      </Card>

      {/* AI インサイト */}
      <AiInsights opportunity={opportunity} relatedActivities={relatedActivities} />

      {/* 詳細カード — 編集モード */}
      {isEditing ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>フェーズ</Label>
                <Select value={editStage} onValueChange={setEditStage}>
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
                <Select value={editCustomerId} onValueChange={setEditCustomerId}>
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
                <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              </div>
              <div>
                <Label>確度(%)</Label>
                <Input type="number" min="0" max="100" value={editProbability} onChange={(e) => setEditProbability(e.target.value)} />
              </div>
              <div>
                <Label>予定完了日</Label>
                <Input type="date" value={editCloseDate} onChange={(e) => setEditCloseDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>詳細</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 詳細カード — 閲覧モード */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  金額
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {opportunity.geek_amount != null
                    ? `¥${opportunity.geek_amount.toLocaleString()}`
                    : "未設定"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  確度
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {opportunity.geek_probability != null
                    ? `${opportunity.geek_probability}%`
                    : "未設定"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  予定完了日
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {opportunity.geek_expectedclosedate
                    ? new Date(
                        opportunity.geek_expectedclosedate,
                      ).toLocaleDateString("ja-JP")
                    : "未設定"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 説明 */}
          {opportunity.geek_description && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">説明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">
                  {opportunity.geek_description}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* 類似商談の受注パターン + 競合メモ */}
      {!isEditing && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 類似商談の受注パターン */}
          <SimilarDealPatterns
            opportunity={opportunity}
            allOpportunities={opportunities}
            customers={customers}
          />

          {/* 競合情報メモ */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Swords className="h-4 w-4 text-red-500" />
                競合情報メモ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CompetitorNotes
                opportunityId={opportunity.geek_opportunityid}
                description={opportunity.geek_description}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 活動タイムライン */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">活動タイムライン</CardTitle>
        </CardHeader>
        <CardContent>
          {relatedActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              この商談に紐づく活動はまだありません
            </p>
          ) : (
            <div className="relative pl-6 space-y-6">
              {/* タイムラインの線 */}
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

              {relatedActivities.map((activity) => (
                <div
                  key={activity.geek_activityid}
                  className="relative flex gap-4"
                >
                  {/* ドット */}
                  <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background border-2 border-primary text-primary">
                    {activityIcon(activity.geek_type)}
                  </div>

                  {/* コンテンツ */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {activity.geek_name}
                      </span>
                      {activity.geek_type != null && (
                        <Badge variant="outline" className="text-[10px]">
                          {ActivityTypeOptions[activity.geek_type] ?? ""}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activity.geek_activitydate
                        ? new Date(
                            activity.geek_activitydate,
                          ).toLocaleDateString("ja-JP", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </p>
                    {activity.geek_content && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {activity.geek_content}
                      </p>
                    )}
                    {activity.geek_nextaction && (
                      <p className="text-xs mt-1 text-primary">
                        次のアクション: {activity.geek_nextaction}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="商談を削除"
        description={`「${opportunity.geek_name}」を削除しますか？この操作は取り消せません。`}
        onConfirm={() => {
          deleteMutation.mutate(opportunity.geek_opportunityid, {
            onSuccess: () => {
              toast.success("商談を削除しました");
              navigate("/opportunities");
            },
          });
        }}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}

// ── 類似商談の受注パターン ──
function SimilarDealPatterns({
  opportunity,
  allOpportunities,
  customers,
}: {
  opportunity: Opportunity;
  allOpportunities: Opportunity[];
  customers: { geek_customerid: string; geek_industry?: number }[];
}) {
  const patterns = useMemo(() => {
    // 同業種の顧客IDを取得
    const currentCustomer = customers.find(
      (c) => c.geek_customerid === opportunity._geek_customerid_value,
    );
    const currentIndustry = currentCustomer?.geek_industry;

    const sameIndustryIds = new Set(
      customers
        .filter((c) => c.geek_industry === currentIndustry && currentIndustry != null)
        .map((c) => c.geek_customerid),
    );

    // 同業種 + 金額帯（±50%）の受注案件
    const amount = opportunity.geek_amount ?? 0;
    const minAmount = amount * 0.5;
    const maxAmount = amount * 1.5;

    const similarWon = allOpportunities.filter((o) => {
      if (o.geek_opportunityid === opportunity.geek_opportunityid) return false;
      if (o.geek_stage !== 100000004) return false; // 受注のみ
      if (!sameIndustryIds.has(o._geek_customerid_value ?? "")) return false;
      const a = o.geek_amount ?? 0;
      return amount === 0 || (a >= minAmount && a <= maxAmount);
    });

    if (similarWon.length === 0) return null;

    // 平均サイクル日数
    const cycles = similarWon
      .filter((o) => o.createdon && o.modifiedon)
      .map((o) => {
        const start = new Date(o.createdon!).getTime();
        const end = new Date(o.modifiedon!).getTime();
        return Math.max(1, Math.round((end - start) / 86400000));
      });
    const avgCycle = cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : 0;

    // 平均金額
    const avgAmount = similarWon.reduce((s, o) => s + (o.geek_amount ?? 0), 0) / similarWon.length;

    return { count: similarWon.length, avgCycle, avgAmount };
  }, [opportunity, allOpportunities, customers]);

  if (!patterns) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            類似商談の受注パターン
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            同業種・同価格帯の受注実績がまだありません
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-blue-500" />
          類似商談の受注パターン
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-primary">{patterns.count}</p>
            <p className="text-xs text-muted-foreground">類似受注件数</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">{patterns.avgCycle}日</p>
            <p className="text-xs text-muted-foreground">平均受注期間</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-primary">¥{(patterns.avgAmount / 10000).toFixed(0)}万</p>
            <p className="text-xs text-muted-foreground">平均受注金額</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3 text-center">
          同業種・同価格帯の過去受注実績に基づく
        </p>
      </CardContent>
    </Card>
  );
}

// ── 競合情報メモ（ローカルストレージ保存） ──
function CompetitorNotes({
  opportunityId,
}: {
  opportunityId: string;
  description?: string;
}) {
  const storageKey = `competitor_${opportunityId}`;
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(notes);

  const handleSave = () => {
    try { localStorage.setItem(storageKey, draft); } catch { /* ignore */ }
    setNotes(draft);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="競合他社名、差別化ポイント、価格情報など..."
          className="text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave}>
            <Save className="h-3.5 w-3.5 mr-1" />保存
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setDraft(notes); setIsEditing(false); }}>
            キャンセル
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-[60px] cursor-pointer rounded-md border border-dashed p-3 hover:bg-muted/50 transition-colors"
      onClick={() => { setDraft(notes); setIsEditing(true); }}
    >
      {notes ? (
        <p className="text-sm whitespace-pre-wrap">{notes}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          クリックして競合情報を記入...
        </p>
      )}
    </div>
  );
}
