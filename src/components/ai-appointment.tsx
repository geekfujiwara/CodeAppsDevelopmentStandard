import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Sparkles, Calendar, Check, Loader2, Clock } from "lucide-react";
import type { Customer, Activity, ActivityCreate } from "@/types/dataverse";
import {
  suggestAppointment,
  createOutlookEvent,
  getOutlookEvents,
  type OutlookEvent,
} from "@/services/ai-flow-service";

interface AiAppointmentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  recentActivities: Activity[];
  onCreateActivity: (data: ActivityCreate) => void;
}

interface Suggestion {
  date: Date;
  label: string;
  reason: string;
  agenda?: string;
}

// AI 入力用テキスト生成
function buildCustomerInfo(customer: Customer): string {
  return `顧客名: ${customer.geek_name}\n担当者: ${customer.geek_contactperson ?? "不明"}`;
}

function buildActivityHistory(activities: Activity[]): string {
  if (activities.length === 0) return "活動履歴なし";
  return activities
    .slice(0, 5)
    .map((a) => {
      const d = a.geek_activitydate
        ? new Date(a.geek_activitydate).toLocaleDateString("ja-JP")
        : "日付不明";
      return `- ${d}: ${a.geek_name ?? "活動"}`;
    })
    .join("\n");
}

// テンプレートフォールバック
function fallbackSuggestions(recentActivities: Activity[]): Suggestion[] {
  const now = new Date();
  const lastActivity = recentActivities[0];
  const daysSinceLast = lastActivity?.geek_activitydate
    ? Math.floor(
        (now.getTime() - new Date(lastActivity.geek_activitydate).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 30;

  const nextBiz = getNextBusinessDay(now, 1);
  nextBiz.setHours(10, 0, 0, 0);
  const threeDays = getNextBusinessDay(now, 3);
  threeDays.setHours(14, 0, 0, 0);
  const oneWeek = getNextBusinessDay(now, 5);
  oneWeek.setHours(11, 0, 0, 0);

  return [
    {
      date: nextBiz,
      label: "翌営業日 10:00",
      reason:
        daysSinceLast > 14
          ? `前回から${daysSinceLast}日経過 — 早めのフォローアップ推奨`
          : "短期フォローアップ",
    },
    {
      date: threeDays,
      label: "3営業日後 14:00",
      reason: "提案準備期間を考慮した日程",
    },
    {
      date: oneWeek,
      label: "1週間後 11:00",
      reason:
        recentActivities.length === 0
          ? "初回ミーティング — 余裕を持った日程"
          : "次ステップの検討期間を考慮",
    },
  ];
}

function getNextBusinessDay(from: Date, businessDays: number): Date {
  const result = new Date(from);
  let count = 0;
  while (count < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return result;
}

function formatDateJP(date: Date): string {
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventTime(dateTimeStr: string): string {
  try {
    const d = new Date(dateTimeStr);
    return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AiAppointment({
  open,
  onOpenChange,
  customer,
  recentActivities,
  onCreateActivity,
}: AiAppointmentProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [created, setCreated] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [outlookCreated, setOutlookCreated] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

  // Calendar & Outlook events state
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);
  const [outlookEvents, setOutlookEvents] = useState<OutlookEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  const callAi = async () => {
    setIsGenerating(true);
    setAiUsed(false);
    try {
      const result = await suggestAppointment(
        buildCustomerInfo(customer),
        buildActivityHistory(recentActivities),
      );
      if (result?.suggestions?.length) {
        const now = new Date();
        const mapped: Suggestion[] = result.suggestions.map((s) => {
          const d = getNextBusinessDay(now, s.days_from_now || 1);
          const timeParts = (s.time || "10:00").split(":");
          d.setHours(
            parseInt(timeParts[0]) || 10,
            parseInt(timeParts[1]) || 0,
            0,
            0,
          );
          return {
            date: d,
            label: `${s.days_from_now}営業日後 ${s.time || "10:00"}`,
            reason: s.reason || "AI提案",
            agenda: s.agenda,
          };
        });
        setSuggestions(mapped);
        setAiUsed(true);
      } else {
        setSuggestions(fallbackSuggestions(recentActivities));
      }
    } catch {
      setSuggestions(fallbackSuggestions(recentActivities));
    } finally {
      setIsGenerating(false);
    }
  };

  // Fetch Outlook events around selected date (±2 days)
  const fetchEvents = async (targetDate: Date) => {
    setIsLoadingEvents(true);
    try {
      const start = new Date(targetDate);
      start.setDate(start.getDate() - 2);
      start.setHours(0, 0, 0, 0);
      const end = new Date(targetDate);
      end.setDate(end.getDate() + 2);
      end.setHours(23, 59, 59, 999);

      const startStr = start.toISOString();
      const endStr = end.toISOString();

      const events = await getOutlookEvents(startStr, endStr);
      setOutlookEvents(events);
    } catch {
      setOutlookEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedIdx(null);
      setCreated(false);
      setOutlookCreated(false);
      setIsCreating(false);
      setCalendarDate(undefined);
      setOutlookEvents([]);
      callAi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When user selects a suggestion, update calendar & fetch events
  const handleSelectSuggestion = (idx: number) => {
    setSelectedIdx(idx);
    setCreated(false);
    const date = suggestions[idx].date;
    setCalendarDate(date);
    fetchEvents(date);
  };

  // When user clicks on calendar date directly
  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setCalendarDate(date);
    fetchEvents(date);
  };

  const handleConfirm = async () => {
    if (selectedIdx == null) return;
    const suggestion = suggestions[selectedIdx];
    const dateStr = suggestion.date.toISOString();

    setIsCreating(true);

    // 1. 内部活動レコード作成
    const activityData: ActivityCreate = {
      geek_name: `${customer.geek_name} — アポイントメント`,
      geek_type: 100000000, // 訪問
      geek_activitydate: dateStr,
      geek_content: `AI提案: ${suggestion.reason}${suggestion.agenda ? `\nアジェンダ: ${suggestion.agenda}` : ""}`,
      "geek_customerid@odata.bind": `/geek_customers(${customer.geek_customerid})`,
    } as unknown as ActivityCreate;

    onCreateActivity(activityData);
    setCreated(true);

    // 2. Outlook カレンダーイベント作成
    try {
      const endDate = new Date(suggestion.date.getTime() + 60 * 60 * 1000);
      const subject = `${customer.geek_name} — アポイントメント`;
      const body = `${customer.geek_contactperson || customer.geek_name} 様との打ち合わせ\n\n${suggestion.reason}${suggestion.agenda ? `\n\nアジェンダ:\n${suggestion.agenda}` : ""}`;
      const location = customer.geek_address ?? "";

      const eventId = await createOutlookEvent(
        subject,
        suggestion.date.toISOString(),
        endDate.toISOString(),
        body,
        location,
      );
      if (eventId) {
        setOutlookCreated(true);
      }
    } catch {
      console.warn("[AiAppointment] Outlook event creation failed");
    } finally {
      setIsCreating(false);
    }
  };

  // Group events by day
  const eventsByDay = outlookEvents.reduce<Record<string, OutlookEvent[]>>(
    (acc, ev) => {
      const dayKey = new Date(ev.start?.dateTime || "").toLocaleDateString(
        "ja-JP",
      );
      if (!acc[dayKey]) acc[dayKey] = [];
      acc[dayKey].push(ev);
      return acc;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AIアポ提案
            {aiUsed && (
              <Badge variant="secondary" className="text-xs">
                AI Builder
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-2">
          {/* ── 左カラム: AI 提案リスト ── */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {customer.geek_name} への次回アポイント候補
            </p>

            {isGenerating ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-3" />
                <span>AI がアポイントを提案中...</span>
              </div>
            ) : (
              suggestions.map((s, i) => (
                <Card
                  key={i}
                  className={`cursor-pointer transition-all ${
                    selectedIdx === i
                      ? "ring-2 ring-primary border-primary"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => handleSelectSuggestion(i)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium flex items-center gap-2 text-sm">
                          <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
                          <span className="truncate">
                            {formatDateJP(s.date)} {formatTime(s.date)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {s.reason}
                        </p>
                        {s.agenda && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            📋 {s.agenda}
                          </p>
                        )}
                      </div>
                      {selectedIdx === i && (
                        <Badge variant="default" className="shrink-0 text-xs">
                          選択中
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {created && (
              <div className="flex items-center gap-2 text-green-600 text-sm font-medium p-2 bg-green-50 rounded-md dark:bg-green-950/20">
                <Check className="h-4 w-4" />
                活動履歴に登録しました
                {outlookCreated && " ＆ Outlook に追加"}
              </div>
            )}

            <div className="pt-2 border-t">
              <Button
                onClick={handleConfirm}
                disabled={
                  selectedIdx == null ||
                  created ||
                  isGenerating ||
                  isCreating
                }
                className="w-full"
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4 mr-1" />
                )}
                {isCreating ? "登録中..." : "予定を作成 & Outlookに登録"}
              </Button>
            </div>
          </div>

          {/* ── 右カラム: カレンダー + Outlook 予定 ── */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              カレンダー &amp; 前後の予定
            </p>

            <div className="flex justify-center">
              <CalendarUI
                mode="single"
                selected={calendarDate}
                onSelect={handleCalendarSelect}
                className="rounded-md border"
              />
            </div>

            {/* Outlook events */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {calendarDate
                  ? `${formatDateJP(calendarDate)} 前後の Outlook 予定`
                  : "日程を選択すると予定が表示されます"}
              </p>

              {isLoadingEvents ? (
                <div className="flex items-center gap-2 text-muted-foreground text-xs py-4 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  予定を取得中...
                </div>
              ) : outlookEvents.length === 0 && calendarDate ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  この期間に予定はありません ✨
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {Object.entries(eventsByDay).map(([day, events]) => (
                    <div key={day}>
                      <p className="text-xs font-semibold text-muted-foreground mb-1 sticky top-0 bg-background">
                        {day}
                      </p>
                      {events.map((ev, idx) => (
                        <div
                          key={idx}
                          className="text-xs p-2 rounded bg-muted/50 mb-1 flex items-start gap-2"
                        >
                          <span className="font-mono text-muted-foreground whitespace-nowrap">
                            {formatEventTime(ev.start?.dateTime)}
                          </span>
                          <span className="truncate">{ev.subject}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
