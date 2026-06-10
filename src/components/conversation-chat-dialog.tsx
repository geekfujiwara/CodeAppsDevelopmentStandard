import { useMemo } from "react";
import { useTranscriptContent } from "@/hooks/use-copilot-analytics";
import {
  parseTranscriptActivities,
  OUTCOME_LABELS,
  OUTCOME_COLORS,
} from "@/types/copilot-analytics";
import type { ConversationSummary } from "@/types/copilot-analytics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Wrench } from "lucide-react";

function fmtTime(ms: number | null): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function ConversationChatDialog({
  summary,
  open,
  onOpenChange,
}: {
  summary: ConversationSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const transcriptId = open ? summary?.geek_transcriptid ?? null : null;
  const { data: content, isLoading, error } = useTranscriptContent(transcriptId);

  const activities = useMemo(
    () => (content ? parseTranscriptActivities(content) : []),
    [content],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            {summary?.geek_botname || "会話"}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <span>{summary?.geek_starttime?.slice(0, 16).replace("T", " ")}</span>
            {summary && (
              <Badge
                variant="outline"
                style={{
                  borderColor: OUTCOME_COLORS[summary.geek_outcome],
                  color: OUTCOME_COLORS[summary.geek_outcome],
                }}
                className="text-xs"
              >
                {OUTCOME_LABELS[summary.geek_outcome] ?? summary.geek_outcome}
              </Badge>
            )}
            {summary?.geek_channel && (
              <Badge variant="secondary" className="text-xs">{summary.geek_channel}</Badge>
            )}
            <span className="text-xs">{summary?.geek_durationsec?.toFixed(0)}秒</span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="space-y-3 py-2">
            {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">読み込み中…</p>}
            {error && <p className="text-sm text-destructive py-8 text-center">トランスクリプトを取得できませんでした</p>}
            {!isLoading && !error && activities.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">表示できるメッセージがありません</p>
            )}

            {activities.map((a) => {
              if (a.kind === "event") {
                return (
                  <div key={a.id} className="flex justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted rounded-full px-3 py-1">
                      <Wrench className="size-3" />
                      <span>{a.text}</span>
                    </div>
                  </div>
                );
              }
              const isUser = a.role === "user";
              return (
                <div key={a.id} className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
                  </div>
                  <div className={`flex flex-col gap-0.5 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-muted text-foreground rounded-tl-sm"
                      }`}
                    >
                      {a.text}
                    </div>
                    {a.timestamp && (
                      <span className="text-[10px] text-muted-foreground px-1">{fmtTime(a.timestamp)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
