import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getConversationSummaries, getBots, getBotComponents, getTranscriptContent, triggerSummaryRefresh } from "@/services/copilot-analytics-service";

export function useConversationSummaries() {
  return useQuery({
    queryKey: ["conversationSummaries"],
    queryFn: getConversationSummaries,
  });
}

export function useBots() {
  return useQuery({
    queryKey: ["bots"],
    queryFn: getBots,
  });
}

export function useBotComponents() {
  return useQuery({
    queryKey: ["botComponents"],
    queryFn: getBotComponents,
  });
}

export function useTranscriptContent(transcriptId: string | null) {
  return useQuery({
    queryKey: ["transcriptContent", transcriptId],
    queryFn: () => getTranscriptContent(transcriptId!),
    enabled: !!transcriptId,
  });
}

export function useRefreshSummaries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: triggerSummaryRefresh,
    onSuccess: () => {
      // 非同期処理のため少し待ってからリフレッシュ
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["conversationSummaries"] });
        qc.invalidateQueries({ queryKey: ["bots"] });
      }, 15_000);
    },
  });
}
