import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Ban, XCircle } from "lucide-react";

// ── ステージ定義 ──
export const STAGES = [
  { stage: 100000000, label: "リード" },
  { stage: 100000001, label: "提案" },
  { stage: 100000002, label: "見積" },
  { stage: 100000003, label: "交渉" },
  { stage: 100000004, label: "受注" },
] as const;

// ── ステージ別の必須入力項目 ──
export const STAGE_REQUIREMENTS: Record<number, { label: string; fields: { name: string; description: string; required: boolean }[] }> = {
  100000000: {
    label: "リード",
    fields: [
      { name: "顧客名", description: "対象企業を特定する", required: true },
      { name: "商談名", description: "案件を識別できる名称", required: true },
      { name: "概算金額", description: "想定される取引規模", required: false },
    ],
  },
  100000001: {
    label: "提案",
    fields: [
      { name: "提案金額", description: "提案する見積金額", required: true },
      { name: "提案内容", description: "ソリューション概要を記載", required: true },
      { name: "決裁者", description: "顧客側の意思決定者", required: false },
    ],
  },
  100000002: {
    label: "見積",
    fields: [
      { name: "見積金額（確定）", description: "正式な見積書の金額", required: true },
      { name: "予定完了日", description: "契約締結の想定日", required: true },
      { name: "競合情報", description: "他社提案の有無・状況", required: false },
    ],
  },
  100000003: {
    label: "交渉",
    fields: [
      { name: "確度", description: "受注見込み（%）を設定", required: true },
      { name: "交渉条件", description: "値引き・条件等の合意事項", required: true },
      { name: "契約書ドラフト", description: "契約書の準備状況", required: false },
    ],
  },
  100000004: {
    label: "受注",
    fields: [
      { name: "最終金額", description: "契約確定金額を入力", required: true },
      { name: "受注日", description: "契約締結日", required: true },
      { name: "納品予定", description: "サービス開始・納品日", required: false },
    ],
  },
};

type StageProgressBarProps = {
  currentStage?: number;
  onStageChange?: (stage: number) => void;
  compact?: boolean;
};

/** コンパクト: ステージ名だけのラベルカード */
function StageLabel({ currentStage }: { currentStage: number }) {
  const isLost = currentStage === 100000005;
  const isCancelled = currentStage === 100000006;
  const isWon = currentStage === 100000004;
  const stageInfo = STAGES.find((s) => s.stage === currentStage);
  const label = isLost ? "失注" : isCancelled ? "キャンセル" : stageInfo?.label ?? "—";

  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap",
        isWon && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
        isLost && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        isCancelled && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
        !isWon && !isLost && !isCancelled && "bg-primary/10 text-primary dark:bg-primary/20",
      )}
    >
      {label}
    </span>
  );
}

export function StageProgressBar({
  currentStage = 100000000,
  onStageChange,
  compact = false,
}: StageProgressBarProps) {
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const isLost = currentStage === 100000005;
  const isCancelled = currentStage === 100000006;

  const currentIndex = STAGES.findIndex((s) => s.stage === currentStage);

  // コンパクトモード: ステージ名カードのみ
  if (compact) {
    return <StageLabel currentStage={currentStage} />;
  }

  const handleStageClick = (stage: number) => {
    if (expandedStage === stage) {
      setExpandedStage(null);
    } else {
      setExpandedStage(stage);
    }
  };

  return (
    <div className="space-y-3">
      {/* シェブロン矢羽型プログレス */}
      <div className="flex items-stretch w-full">
        {STAGES.map((s, idx) => {
          const isPast = !isLost && !isCancelled && currentIndex > idx;
          const isCurrent = !isLost && !isCancelled && currentIndex === idx;
          const isFuture = isLost || isCancelled || currentIndex < idx;

          return (
            <button
              key={s.stage}
              onClick={() => handleStageClick(s.stage)}
              className={cn(
                "relative flex items-center justify-center flex-1 h-10 text-xs font-semibold transition-all cursor-pointer",
                "hover:opacity-80",
                // 矢羽型のクリップパス
                idx === 0 && "rounded-l-md",
                idx === STAGES.length - 1 && "rounded-r-md",
                // 色
                isPast && "bg-primary text-primary-foreground",
                isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/40 ring-offset-1",
                isFuture && "bg-muted text-muted-foreground",
              )}
              style={{
                clipPath:
                  idx === 0
                    ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)"
                    : idx === STAGES.length - 1
                      ? "polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)"
                      : "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)",
              }}
              title={s.label}
            >
              <span className="flex items-center gap-1">
                {isPast && <Check className="h-3.5 w-3.5" />}
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 失注 / キャンセル バッジ or ステータス変更ボタン */}
      {(isLost || isCancelled) ? (
        <div className="flex items-center gap-2">
          <Badge variant={isLost ? "destructive" : "secondary"} className="text-xs">
            {isLost ? "失注" : "キャンセル"}
          </Badge>
          {onStageChange && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2 text-muted-foreground"
              onClick={() => onStageChange(100000000)}
            >
              リードに戻す
            </Button>
          )}
        </div>
      ) : onStageChange ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:hover:bg-red-950"
            onClick={() => onStageChange(100000005)}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            失注
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:hover:bg-gray-800"
            onClick={() => onStageChange(100000006)}
          >
            <Ban className="h-3.5 w-3.5 mr-1" />
            キャンセル
          </Button>
        </div>
      ) : null}

      {/* ステージ別入力項目パネル */}
      {expandedStage != null && STAGE_REQUIREMENTS[expandedStage] && (
        <div className="rounded-lg border bg-card p-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">
              {STAGE_REQUIREMENTS[expandedStage].label} — 入力項目
            </h4>
            {onStageChange && expandedStage !== currentStage && (
              <button
                onClick={() => onStageChange(expandedStage)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                このフェーズに変更 <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {STAGE_REQUIREMENTS[expandedStage].fields.map((field) => (
              <div
                key={field.name}
                className="flex items-start gap-2 text-sm"
              >
                <div
                  className={cn(
                    "mt-0.5 h-2 w-2 rounded-full shrink-0",
                    field.required ? "bg-red-500" : "bg-muted-foreground/40",
                  )}
                />
                <div>
                  <span className="font-medium">{field.name}</span>
                  {field.required && (
                    <span className="text-red-500 text-xs ml-1">*</span>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {field.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
