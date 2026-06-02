import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  getIncident,
  statusLabels,
  statusStyles,
  priorityLabels,
  priorityStyles,
  assetTypeLabels,
  type Incident,
} from "@/lib/api";
import {
  ArrowLeft,
  Loader2,
  XCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User,
  Monitor,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getIncident(id)
      .then(setIncident)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="text-center py-12 space-y-3">
        <XCircle className="h-12 w-12 text-destructive mx-auto" />
        <p className="text-destructive font-medium">
          {error ?? "インシデントが見つかりません"}
        </p>
        <Button variant="outline" onClick={() => navigate("/incidents")}>
          一覧に戻る
        </Button>
      </div>
    );
  }

  const statusSteps = [
    { value: 100000000, label: "新規", icon: AlertTriangle },
    { value: 100000001, label: "対応中", icon: Clock },
    { value: 100000002, label: "解決済", icon: CheckCircle2 },
    { value: 100000003, label: "クローズ", icon: XCircle },
  ];

  const currentStepIdx = statusSteps.findIndex(
    (s) => s.value === incident.geek_status,
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/incidents")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">
            {incident.geek_title}
          </h1>
        </div>
      </div>

      {/* ステータス + 優先度バッジ */}
      <div className="flex items-center gap-2 flex-wrap">
        {incident.geek_status != null && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium",
              statusStyles[incident.geek_status],
            )}
          >
            {statusLabels[incident.geek_status]}
          </span>
        )}
        {incident.geek_priority != null && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium",
              priorityStyles[incident.geek_priority],
            )}
          >
            {priorityLabels[incident.geek_priority]}
          </span>
        )}
      </div>

      {/* ステータスタイムライン */}
      <div className="p-4 rounded-xl border border-border/60 bg-card shadow-premium">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          進捗状況
        </p>
        <div className="flex items-center gap-1">
          {statusSteps.map((step, idx) => {
            const isCompleted = idx <= currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            return (
              <div key={step.value} className="flex items-center flex-1">
                <div
                  className={cn(
                    "flex items-center justify-center h-8 w-8 rounded-full border-2 transition-colors",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground",
                    isCurrent && "ring-4 ring-primary/20",
                  )}
                >
                  <step.icon className="h-3.5 w-3.5" />
                </div>
                {idx < statusSteps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-1",
                      idx < currentStepIdx ? "bg-primary" : "bg-border",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex mt-1.5">
          {statusSteps.map((step) => (
            <div key={step.value} className="flex-1 text-center">
              <span className="text-[10px] text-muted-foreground">
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 基本情報 */}
      <div className="p-5 rounded-xl border border-border/60 bg-card shadow-premium space-y-4">
        <h2 className="text-sm font-semibold text-foreground">基本情報</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoItem
            icon={User}
            label="報告者"
            value={incident.geek_reportedby}
          />
          <InfoItem
            icon={User}
            label="担当者"
            value={incident.geek_assignedto}
          />
          <InfoItem
            icon={Monitor}
            label="資産タイプ"
            value={
              incident.geek_assettype != null
                ? assetTypeLabels[incident.geek_assettype]
                : undefined
            }
          />
          <InfoItem
            icon={Calendar}
            label="報告日"
            value={
              incident.createdon
                ? new Date(incident.createdon).toLocaleDateString("ja-JP", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : undefined
            }
          />
        </div>
      </div>

      {/* 説明 */}
      {incident.geek_description && (
        <div className="p-5 rounded-xl border border-border/60 bg-card shadow-premium space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">説明</h2>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {incident.geek_description}
          </p>
        </div>
      )}

      {/* 解決策（解決済み/クローズ時のみ） */}
      {incident.geek_resolution &&
        (incident.geek_status === 100000002 ||
          incident.geek_status === 100000003) && (
          <div className="p-5 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 shadow-premium space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                解決策
              </h2>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
              {incident.geek_resolution}
            </p>
            {incident.geek_resolvedon && (
              <p className="text-xs text-muted-foreground">
                解決日:{" "}
                {new Date(incident.geek_resolvedon).toLocaleDateString("ja-JP")}
              </p>
            )}
          </div>
        )}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}
