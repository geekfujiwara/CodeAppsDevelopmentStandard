import { useMemo, useState, useEffect } from "react";
import { useConversationSummaries, useTranscriptContent } from "@/hooks/use-copilot-analytics";
import {
  parseTranscriptActivities,
  OUTCOME_LABELS,
  OUTCOME_COLORS,
} from "@/types/copilot-analytics";
import type { ConversationSummary, ChatActivity } from "@/types/copilot-analytics";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Bot, User, Wrench, Search, ChevronDown, MessageSquare, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── 時刻フォーマット ──
function fmtTime(ms: number | null): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

// ── ツールイベントグループをまとめる ──
interface ActivityGroup {
  kind: "message" | "tool-group";
  activities: ChatActivity[];
}

function groupActivities(activities: ChatActivity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let toolBuffer: ChatActivity[] = [];

  const flushTools = () => {
    if (toolBuffer.length > 0) {
      groups.push({ kind: "tool-group", activities: [...toolBuffer] });
      toolBuffer = [];
    }
  };

  for (const a of activities) {
    if (a.kind === "event") {
      toolBuffer.push(a);
    } else {
      flushTools();
      groups.push({ kind: "message", activities: [a] });
    }
  }
  flushTools();
  return groups;
}

// ── ToolGroupAccordion ──
function ToolGroupAccordion({ events }: { events: ChatActivity[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full px-3 py-1 transition-colors mx-auto cursor-pointer">
          <Wrench className="size-3" />
          <span>ツール呼び出し ({events.length}件)</span>
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 mt-1">
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-1 justify-center"
            >
              <Wrench className="size-3 shrink-0" />
              <span className="truncate max-w-md">{e.text}</span>
              {e.timestamp && (
                <span className="text-[10px] ml-auto shrink-0">
                  {fmtTime(e.timestamp)}
                </span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── チャットパネル ──
const MSG_TRUNCATE_LEN = 200;

function MessageBubble({ text, isUser }: { text: string; isUser: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > MSG_TRUNCATE_LEN;

  return (
    <div
      className={cn(
        "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words overflow-hidden",
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted text-foreground rounded-tl-sm",
      )}
    >
      {isLong && !expanded ? (
        <>
          {text.slice(0, MSG_TRUNCATE_LEN)}…
          <button
            onClick={() => setExpanded(true)}
            className={cn(
              "flex items-center gap-0.5 mt-1 text-xs font-medium cursor-pointer",
              isUser ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ChevronsUpDown className="size-3" /> 全文を表示
          </button>
        </>
      ) : (
        <>
          {text}
          {isLong && (
            <button
              onClick={() => setExpanded(false)}
              className={cn(
                "flex items-center gap-0.5 mt-1 text-xs font-medium cursor-pointer",
                isUser ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ChevronsUpDown className="size-3" /> 折りたたむ
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ChatPanel({ summary }: { summary: ConversationSummary }) {
  const { data: content, isLoading, error } = useTranscriptContent(
    summary.geek_transcriptid,
  );

  const activities = useMemo(
    () => (content ? parseTranscriptActivities(content) : []),
    [content],
  );

  const groups = useMemo(() => groupActivities(activities), [activities]);

  return (
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary shrink-0" />
          <h2 className="font-semibold truncate">{summary.geek_botname || "会話"}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">
            {summary.geek_starttime?.slice(0, 16).replace("T", " ")}
          </span>
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
          {summary.geek_channel && (
            <Badge variant="secondary" className="text-xs">
              {summary.geek_channel}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {summary.geek_durationsec?.toFixed(0)}秒 · {summary.geek_usermsgcount}ターン
          </span>
        </div>
      </div>

      {/* メッセージ */}
      <ScrollArea className="flex-1 h-0 px-4">
        <div className="space-y-3 py-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              読み込み中…
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive py-8 text-center">
              トランスクリプトを取得できませんでした
            </p>
          )}
          {!isLoading && !error && activities.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              表示できるメッセージがありません
            </p>
          )}

          {groups.map((g, gi) => {
            if (g.kind === "tool-group") {
              return (
                <div key={`tg-${gi}`} className="flex justify-center">
                  <ToolGroupAccordion events={g.activities} />
                </div>
              );
            }
            const a = g.activities[0];
            const isUser = a.role === "user";
            return (
              <div
                key={a.id}
                className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {isUser ? (
                    <User className="size-4" />
                  ) : (
                    <Bot className="size-4" />
                  )}
                </div>
                <div
                  className={`flex flex-col gap-0.5 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}
                >
                  <MessageBubble text={a.text} isUser={isUser} />
                  {a.timestamp && (
                    <span className="text-[10px] text-muted-foreground px-1">
                      {fmtTime(a.timestamp)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── 会話一覧アイテム ──
function ConversationListItem({
  summary,
  isSelected,
  onClick,
}: {
  summary: ConversationSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-3 border-b transition-colors cursor-pointer",
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/50 border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">
          {summary.geek_botname || "不明"}
        </span>
        <Badge
          variant="outline"
          style={{
            borderColor: OUTCOME_COLORS[summary.geek_outcome],
            color: OUTCOME_COLORS[summary.geek_outcome],
          }}
          className="text-[10px] shrink-0"
        >
          {OUTCOME_LABELS[summary.geek_outcome] ?? summary.geek_outcome}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground truncate mt-0.5">
        {summary.geek_firstusertext?.slice(0, 60) || "（発話なし）"}
      </p>
      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
        <span>{summary.geek_starttime?.slice(0, 16).replace("T", " ")}</span>
        <span>·</span>
        <span>{summary.geek_durationsec?.toFixed(0)}秒</span>
        {(summary.geek_tooleventcount ?? 0) > 0 && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Wrench className="size-2.5" />
              {summary.geek_tooleventcount}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

// ── メインページ ──
export default function ConversationsPage() {
  const { data: summaries, isLoading } = useConversationSummaries();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!summaries) return [];
    if (!searchQuery.trim()) return summaries;
    const q = searchQuery.toLowerCase();
    return summaries.filter(
      (s) =>
        s.geek_botname?.toLowerCase().includes(q) ||
        s.geek_firstusertext?.toLowerCase().includes(q) ||
        s.geek_channel?.toLowerCase().includes(q) ||
        (OUTCOME_LABELS[s.geek_outcome] ?? "").includes(q),
    );
  }, [summaries, searchQuery]);

  const selected = useMemo(
    () => filtered.find((s) => s.geek_conversationsummaryid === selectedId) ?? null,
    [filtered, selectedId],
  );

  // 選択がフィルタ結果に無い場合はクリア
  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null);
  }, [selectedId, selected]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      <div className="px-4 pt-2 pb-3 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">会話</h1>
        <p className="text-sm text-muted-foreground">
          エージェントとの会話履歴を確認
        </p>
      </div>

      <div className="flex flex-1 border rounded-lg overflow-hidden mx-4 mb-4">
        {/* 左カラム: 一覧 */}
        <div className="w-80 shrink-0 border-r flex flex-col bg-background">
          {/* 検索 */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 px-1">
              {filtered.length}件
              {searchQuery && ` / ${summaries?.length ?? 0}件`}
            </div>
          </div>

          {/* リスト */}
          <ScrollArea className="flex-1">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                該当する会話がありません
              </p>
            )}
            {filtered.map((s) => (
              <ConversationListItem
                key={s.geek_conversationsummaryid}
                summary={s}
                isSelected={s.geek_conversationsummaryid === selectedId}
                onClick={() => setSelectedId(s.geek_conversationsummaryid)}
              />
            ))}
          </ScrollArea>
        </div>

        {/* 右カラム: チャット */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selected ? (
            <ChatPanel
              key={selected.geek_conversationsummaryid}
              summary={selected}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageSquare className="size-10 opacity-30" />
              <p className="text-sm">左の一覧から会話を選択してください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
