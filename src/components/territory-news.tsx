import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Newspaper, TrendingUp, AlertTriangle, Lightbulb, Loader2 } from "lucide-react";
import { useNewsInsights } from "@/hooks/use-dataverse";
import type { NewsInsight } from "@/types/dataverse";

const impactColors: Record<number, string> = {
  100000000: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  100000001: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  100000002: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const impactLabels: Record<number, string> = {
  100000000: "高",
  100000001: "中",
  100000002: "低",
};

const categoryIcons: Record<string, React.ReactNode> = {
  "DX・AI": <TrendingUp className="h-4 w-4 text-purple-500" />,
  "法規制": <AlertTriangle className="h-4 w-4 text-red-500" />,
  "市場動向": <TrendingUp className="h-4 w-4 text-blue-500" />,
  "技術革新": <Lightbulb className="h-4 w-4 text-amber-500" />,
};

function InsightCard({ insight }: { insight: NewsInsight }) {
  const impact = insight.geek_impact ?? 100000001;
  const customers = insight.geek_relatedcustomers?.split(",").filter(Boolean) ?? [];

  return (
    <div className="rounded-lg border p-4 space-y-2 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {categoryIcons[insight.geek_category ?? ""] ?? <Newspaper className="h-4 w-4 text-gray-500" />}
          <h4 className="text-sm font-semibold leading-tight">{insight.geek_headline}</h4>
        </div>
        <Badge className={`shrink-0 text-[10px] ${impactColors[impact] ?? impactColors[100000001]}`}>
          影響{impactLabels[impact] ?? "中"}
        </Badge>
      </div>
      {insight.geek_summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">{insight.geek_summary}</p>
      )}
      {customers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {customers.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px]">{c.trim()}</Badge>
          ))}
        </div>
      )}
      {insight.geek_action && (
        <div className="text-xs text-primary font-medium pt-1 border-t border-dashed">
          💡 {insight.geek_action}
        </div>
      )}
    </div>
  );
}

export function TerritoryNews() {
  const { data: insights, isLoading } = useNewsInsights();

  const generatedDate = insights?.[0]?.geek_generateddate;
  const formattedDate = generatedDate
    ? new Date(generatedDate).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-blue-600" />
            AI ニュースインサイト
            <Badge variant="secondary" className="text-[10px]">Copilot Studio</Badge>
          </CardTitle>
          {formattedDate && (
            <span className="text-[10px] text-muted-foreground">
              {formattedDate} 更新
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-3" />
            <span className="text-sm">インサイトを読み込み中...</span>
          </div>
        )}

        {!isLoading && (!insights || insights.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-6">
            ニュースインサイトはまだ生成されていません。
            <br />
            毎日自動生成されます。
          </p>
        )}

        {!isLoading && insights && insights.length > 0 && (
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {insights.map((insight) => (
              <InsightCard key={insight.geek_newsinsightid} insight={insight} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
