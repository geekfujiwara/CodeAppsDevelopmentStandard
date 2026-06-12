import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Lightbulb,
  AlertTriangle,
  TrendingUp,
  Clock,
  Phone,
  FileText,
  Users,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Opportunity, Activity } from "@/types/dataverse";

// ── AI インサイト型 ──
interface AiInsightData {
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  riskFactors: string[];
  nextActions: { action: string; priority: "high" | "medium" | "low"; reason: string }[];
  summary?: string;
  generatedAt?: string;
}

// ── Dataverse の geek_aiinsights JSON をパースする ──
function parseAiInsights(jsonStr: string | undefined): AiInsightData | null {
  if (!jsonStr) return null;
  try {
    const data = JSON.parse(jsonStr);
    if (
      typeof data.riskScore === "number" &&
      Array.isArray(data.riskFactors) &&
      Array.isArray(data.nextActions)
    ) {
      return data as AiInsightData;
    }
  } catch {
    // パース失敗 → フォールバック
  }
  return null;
}

// ── フォールバック: ルールベースリスクスコア ──
function computeRiskScore(
  opportunity: Opportunity,
  relatedActivities: Activity[],
): { score: number; level: "low" | "medium" | "high"; factors: string[] } {
  let score = 0;
  const factors: string[] = [];

  if (!opportunity.geek_amount) {
    score += 15;
    factors.push("金額が未設定です");
  }

  if (
    opportunity.geek_stage != null &&
    opportunity.geek_stage >= 100000002 &&
    (opportunity.geek_probability ?? 0) < 50
  ) {
    score += 20;
    factors.push("交渉フェーズ以降で確度が50%未満");
  }

  if (opportunity.geek_expectedclosedate) {
    const closeDate = new Date(opportunity.geek_expectedclosedate);
    const now = new Date();
    if (closeDate < now) {
      score += 25;
      factors.push("予定完了日を超過しています");
    } else {
      const daysUntilClose = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilClose <= 7) {
        score += 10;
        factors.push("完了予定まで7日以内");
      }
    }
  } else {
    score += 10;
    factors.push("予定完了日が未設定");
  }

  if (relatedActivities.length > 0) {
    const lastActivity = relatedActivities[0];
    const lastDate = new Date(
      lastActivity.geek_activitydate ?? lastActivity.createdon ?? "",
    );
    const daysSince = Math.ceil(
      (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSince > 30) {
      score += 25;
      factors.push(`最終活動から${daysSince}日経過（30日超）`);
    } else if (daysSince > 14) {
      score += 15;
      factors.push(`最終活動から${daysSince}日経過（14日超）`);
    }
  } else {
    score += 20;
    factors.push("活動履歴がありません");
  }

  if (relatedActivities.length < 3 && (opportunity.geek_stage ?? 0) >= 100000002) {
    score += 10;
    factors.push("見積以降で活動回数が3回未満");
  }

  score = Math.min(score, 100);
  const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
  return { score, level, factors };
}

// ── フォールバック: ルールベースネクストアクション ──
function computeNextBestActions(
  opportunity: Opportunity,
  relatedActivities: Activity[],
): { action: string; priority: "high" | "medium" | "low"; reason: string }[] {
  const actions: { action: string; priority: "high" | "medium" | "low"; reason: string }[] = [];
  const stage = opportunity.geek_stage ?? 100000000;

  let daysSinceLastActivity = 999;
  if (relatedActivities.length > 0) {
    const lastDate = new Date(
      relatedActivities[0].geek_activitydate ?? relatedActivities[0].createdon ?? "",
    );
    daysSinceLastActivity = Math.ceil(
      (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  if (stage === 100000000) {
    actions.push({ action: "顧客にヒアリングの電話をかける", priority: "high", reason: "リード段階ではニーズ把握が最優先" });
    actions.push({ action: "顧客の課題と予算感を確認する", priority: "medium", reason: "提案フェーズに進めるための情報収集" });
  } else if (stage === 100000001) {
    actions.push({ action: "提案書を作成して送付する", priority: "high", reason: "提案フェーズでは具体的な価値提案が必要" });
    actions.push({ action: "決裁者との面談を設定する", priority: "medium", reason: "意思決定者への直接アプローチが効果的" });
  } else if (stage === 100000002) {
    actions.push({ action: "正式見積書を提出する", priority: "high", reason: "見積段階では迅速な見積提出が競争優位に" });
    if (!opportunity.geek_expectedclosedate) {
      actions.push({ action: "クローズ予定日を設定する", priority: "high", reason: "予定日未設定は管理漏れリスク" });
    }
  } else if (stage === 100000003) {
    actions.push({ action: "最終交渉のミーティングを設定する", priority: "high", reason: "交渉段階では対面での最終合意が重要" });
    actions.push({ action: "契約書ドラフトを準備する", priority: "medium", reason: "迅速なクロージングのため事前準備" });
  }

  if (daysSinceLastActivity > 14) {
    actions.unshift({ action: "フォローアップの連絡をとる", priority: "high", reason: `${daysSinceLastActivity}日間活動なし — 放置による機会損失リスク` });
  }

  if (stage >= 100000002 && (opportunity.geek_probability ?? 0) < 40) {
    actions.push({ action: "受注確度を引き上げる施策を検討する", priority: "medium", reason: "確度40%未満は追加アクションが必要" });
  }

  return actions.slice(0, 4);
}

// ── アクションのアイコンを推定 ──
function getActionIcon(action: string) {
  if (action.includes("電話") || action.includes("フォロー") || action.includes("連絡")) return Phone;
  if (action.includes("提案") || action.includes("見積") || action.includes("契約")) return FileText;
  if (action.includes("面談") || action.includes("ミーティング") || action.includes("ヒアリング")) return Users;
  if (action.includes("予定") || action.includes("期日")) return Clock;
  if (action.includes("確度") || action.includes("施策")) return TrendingUp;
  return Shield;
}

// ── コンポーネント ──
type AiInsightsProps = {
  opportunity: Opportunity;
  relatedActivities: Activity[];
};

export function AiInsights({ opportunity, relatedActivities }: AiInsightsProps) {
  // AI 生成データを優先、なければヒューリスティック
  const aiData = useMemo(
    () => parseAiInsights(opportunity.geek_aiinsights),
    [opportunity.geek_aiinsights],
  );

  const isAiGenerated = aiData !== null;

  const risk = useMemo(() => {
    if (aiData) {
      return { score: aiData.riskScore, level: aiData.riskLevel, factors: aiData.riskFactors };
    }
    return computeRiskScore(opportunity, relatedActivities);
  }, [aiData, opportunity, relatedActivities]);

  const nextActions = useMemo(() => {
    if (aiData) {
      return aiData.nextActions.slice(0, 4);
    }
    return computeNextBestActions(opportunity, relatedActivities);
  }, [aiData, opportunity, relatedActivities]);

  const riskColorClass =
    risk.level === "high"
      ? "text-red-600"
      : risk.level === "medium"
        ? "text-yellow-600"
        : "text-green-600";

  const riskBgClass =
    risk.level === "high"
      ? "bg-red-500"
      : risk.level === "medium"
        ? "bg-yellow-500"
        : "bg-green-500";

  const riskLabel =
    risk.level === "high" ? "高リスク" : risk.level === "medium" ? "中リスク" : "低リスク";

  const priorityColor = (p: string) =>
    p === "high" ? "text-red-600 bg-red-50 dark:bg-red-950/30" : p === "medium" ? "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30" : "text-green-600 bg-green-50 dark:bg-green-950/30";

  return (
    <div className="space-y-4">
      {/* AI 生成サマリー */}
      {isAiGenerated && aiData?.summary && (
        <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/30">
          <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-300">AI分析サマリー</p>
            <p className="text-sm text-purple-900 dark:text-purple-100 mt-0.5">{aiData.summary}</p>
            {aiData.generatedAt && (
              <p className="text-[10px] text-purple-500 mt-1">
                生成: {new Date(aiData.generatedAt).toLocaleString("ja-JP")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* リスクスコア */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={cn("h-4 w-4", riskColorClass)} />
              リスクスコア
              <Badge
                variant="outline"
                className={cn("ml-auto text-[10px]", isAiGenerated ? "text-purple-600 border-purple-300" : riskColorClass)}
              >
                {isAiGenerated ? "AI生成" : "ルール分析"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={cn("text-3xl font-bold", riskColorClass)}>
                {risk.score}
              </span>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", riskColorClass)}>
                    {riskLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
                <Progress
                  value={risk.score}
                  className={cn("h-2", `[&>div]:${riskBgClass}`)}
                />
              </div>
            </div>
            {risk.factors.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground">要因:</p>
                {risk.factors.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">•</span>
                    {f}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ネクストベストアクション */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              ネクストベストアクション
              <Badge
                variant="outline"
                className={cn("ml-auto text-[10px]", isAiGenerated ? "text-purple-600 border-purple-300" : "text-amber-600")}
              >
                {isAiGenerated ? "AI推奨" : "ルール推奨"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextActions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                推奨アクションなし
              </p>
            ) : (
              <div className="space-y-3">
                {nextActions.map((a, i) => {
                  const Icon = getActionIcon(a.action);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-md p-2.5 flex items-start gap-2.5",
                        priorityColor(a.priority),
                      )}
                    >
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{a.action}</p>
                        <p className="text-[10px] opacity-80 mt-0.5">{a.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
