import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { KanbanBoard, type KanbanCardItem } from "@/components/kanban-board"
import { useSuggestions, useUpdateSuggestion } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, FEATURE_VOTING } from "@/config"
import {
  KANBAN_COLUMNS,
  SUGGESTION_STATUS_LABEL,
  SUGGESTION_STATUS_COLOR,
} from "@/types/dataverse"
import { categoryColor } from "@/lib/category-color"
import { ThumbsUp } from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:            `${P}_suggestionid`,
  name:          `${P}_name`,
  category:      `${P}_category`,
  proposer:      `${P}_proposer`,
  department:    `${P}_department`,
  status:        `${P}_status`,
  votes:         `${P}_votes`,
  proposed_date: `${P}_proposed_date`,
  description:   `${P}_description`,
  effect:        `${P}_effect`,
}

type DVRecord = Record<string, unknown>

export default function BoardPage() {
  const { data: suggestions = [], isLoading } = useSuggestions()
  const updateSuggestion = useUpdateSuggestion()
  const queryClient = useQueryClient()

  const [detailId, setDetailId] = useState<string | null>(null)
  const detail = useMemo(
    () => suggestions.find(s => String(s[f.id] ?? "") === detailId),
    [suggestions, detailId]
  )

  const items: KanbanCardItem[] = useMemo(() =>
    suggestions
      .filter(s => s[f.status] != null)
      .map(s => {
        const category = String(s[f.category] ?? "")
        const accent = category ? categoryColor(category) : undefined
        const votes = (s[f.votes] as number) ?? 0
        return {
          id: String(s[f.id] ?? ""),
          columnValue: s[f.status] as number,
          title: String(s[f.name] ?? ""),
          subtitle: [String(s[f.proposer] ?? ""), String(s[f.department] ?? "")].filter(Boolean).join(" / "),
          accent,
          meta: (
            <div className="flex items-center gap-2">
              {category && (
                <span
                  className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: `${accent}1f`, color: accent }}
                >
                  {category}
                </span>
              )}
              {FEATURE_VOTING && votes > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <ThumbsUp className="h-3 w-3" />{votes}
                </span>
              )}
            </div>
          ),
        }
      }),
    [suggestions]
  )

  // 楽観的更新: 応答を待たずにキャッシュを書き換えてから mutate、失敗時はロールバック
  const handleMove = (id: string, newStatus: number) => {
    const previous = queryClient.getQueryData<DVRecord[]>(["suggestions"])
    queryClient.setQueryData<DVRecord[]>(["suggestions"], (old) =>
      (old ?? []).map(s => (String(s[f.id]) === id ? { ...s, [f.status]: newStatus } : s)),
    )
    updateSuggestion.mutate({ id, data: { [f.status]: newStatus } }, {
      onSuccess: () => toast.success(
        `「${(SUGGESTION_STATUS_LABEL as Record<number, string>)[newStatus] ?? ""}」に移動しました`
      ),
      onError: () => {
        queryClient.setQueryData(["suggestions"], previous)
        toast.error("更新に失敗しました")
      },
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">カンバン</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  const detailStatus = detail?.[f.status] as number | undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">カンバン</h1>
        <p className="text-muted-foreground text-sm mt-1">
          カードをドラッグしてステータスを変更できます。クリックで内容を確認できます
        </p>
      </div>

      <KanbanBoard
        columns={KANBAN_COLUMNS}
        items={items}
        onMove={handleMove}
        onCardClick={setDetailId}
      />

      {items.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>提案がありません</CardTitle>
            <CardDescription>「提案一覧」ページから新しい改善提案を登録してください。</CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* カード詳細ダイアログ */}
      <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetailId(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{String(detail?.[f.name] ?? "")}</DialogTitle>
            <DialogDescription>
              {[String(detail?.[f.proposer] ?? ""), String(detail?.[f.department] ?? "")].filter(Boolean).join(" / ")}
              {detail?.[f.proposed_date] ? `（${String(detail[f.proposed_date])}）` : ""}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                {detailStatus != null && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SUGGESTION_STATUS_COLOR[detailStatus as keyof typeof SUGGESTION_STATUS_COLOR] ?? "bg-gray-100 text-gray-600"}`}>
                    {SUGGESTION_STATUS_LABEL[detailStatus as keyof typeof SUGGESTION_STATUS_LABEL] ?? ""}
                  </span>
                )}
                {String(detail[f.category] ?? "") && (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: `${categoryColor(String(detail[f.category]))}1f`,
                      color: categoryColor(String(detail[f.category])),
                    }}>
                    {String(detail[f.category])}
                  </span>
                )}
                {FEATURE_VOTING && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ThumbsUp className="h-3.5 w-3.5" />{(detail[f.votes] as number) ?? 0}
                  </span>
                )}
              </div>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">提案内容</p>
                  <p className="whitespace-pre-wrap">
                    {String(detail[f.description] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-1">期待効果</p>
                  <p className="whitespace-pre-wrap">
                    {String(detail[f.effect] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
                  </p>
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setDetailId(null)}>閉じる</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
