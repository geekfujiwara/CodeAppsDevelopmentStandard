import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  getIncidents,
  statusLabels,
  statusStyles,
  priorityLabels,
  priorityStyles,
  assetTypeLabels,
  type Incident,
} from "@/lib/api";
import {
  PlusCircle,
  Search,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function IncidentsPage() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getIncidents()
      .then(setIncidents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── ステータス件数 ──
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = { all: incidents.length };
    incidents.forEach((i) => {
      const key = String(i.geek_status ?? "none");
      m[key] = (m[key] ?? 0) + 1;
    });
    return m;
  }, [incidents]);

  // ── フィルタ ──
  const filtered = useMemo(() => {
    let list = incidents;
    if (statusTab !== "all") {
      list = list.filter((i) => String(i.geek_status) === statusTab);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.geek_title?.toLowerCase().includes(q) ||
          (i["_geek_inquirerid_value@OData.Community.Display.V1.FormattedValue"] as string | undefined)?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [incidents, statusTab, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="text-destructive font-medium">{error}</p>
      </div>
    );
  }

  const statusIcons: Record<number, React.ReactNode> = {
    100000000: <AlertTriangle className="h-3.5 w-3.5" />,
    100000001: <Clock className="h-3.5 w-3.5" />,
    100000002: <CheckCircle2 className="h-3.5 w-3.5" />,
    100000003: <XCircle className="h-3.5 w-3.5" />,
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">サービスリクエスト一覧</h1>
        <Button onClick={() => navigate("/incidents/new")} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          新規リクエスト
        </Button>
      </div>

      {/* サマリカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            key: "all",
            label: "全件",
            icon: AlertTriangle,
            color: "text-primary",
          },
          {
            key: "100000000",
            label: "新規",
            icon: AlertTriangle,
            color: "text-blue-600",
          },
          {
            key: "100000001",
            label: "対応中",
            icon: Clock,
            color: "text-amber-600",
          },
          {
            key: "100000002",
            label: "解決済",
            icon: CheckCircle2,
            color: "text-emerald-600",
          },
        ].map((s) => (
          <div
            key={s.key}
            onClick={() => setStatusTab(s.key)}
            className={cn(
              "p-4 rounded-xl border bg-card shadow-premium cursor-pointer transition-all",
              statusTab === s.key
                ? "border-primary/40 ring-2 ring-primary/20"
                : "border-border/60 card-hover",
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={cn("h-4 w-4", s.color)} />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {statusCounts[s.key] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {/* 検索 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="タイトル・送信者で検索..."
          className="w-full h-10 pl-10 pr-4 rounded-lg border border-border/60 bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
        />
      </div>

      {/* ステータスタブ */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[
          { key: "all", label: "全て" },
          ...Object.entries(statusLabels).map(([k, v]) => ({
            key: k,
            label: v,
          })),
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusTab(tab.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
              statusTab === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {tab.label} ({statusCounts[tab.key] ?? 0})
          </button>
        ))}
      </div>

      {/* カードギャラリー */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">リクエストがありません</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => (
            <div
              key={item.geek_incidentid}
              onClick={() => navigate(`/incidents/${item.geek_incidentid}`)}
              className="p-4 rounded-xl border border-border/60 bg-card shadow-premium card-hover cursor-pointer space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">
                  {item.geek_title}
                </h3>
                {item.geek_priority != null && (
                  <span
                    className={cn(
                      "shrink-0 px-2 py-0.5 rounded-md text-[10px] font-medium",
                      priorityStyles[item.geek_priority],
                    )}
                  >
                    {priorityLabels[item.geek_priority]}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {item.geek_status != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium",
                      statusStyles[item.geek_status],
                    )}
                  >
                    {statusIcons[item.geek_status]}
                    {statusLabels[item.geek_status]}
                  </span>
                )}
                {item.geek_assettype != null && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground">
                    {assetTypeLabels[item.geek_assettype]}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{(item["_geek_inquirerid_value@OData.Community.Display.V1.FormattedValue"] as string) ?? "—"}</span>
                <span>
                  {item.createdon
                    ? new Date(item.createdon).toLocaleDateString("ja-JP")
                    : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
