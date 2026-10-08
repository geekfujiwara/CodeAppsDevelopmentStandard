import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquareHeart, Search, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { UpdateNote } from "@/components/update-note"
import { formatDateTime } from "@/lib/date-format"
import {
  FEEDBACK_KEY,
  listFeedback,
  STATUS_OPTIONS,
  updateFeedbackGithubIssueUrl,
  updateFeedbackStatus,
  type Feedback,
} from "@/lib/eval-feedback"

const STATUS_BADGE_VARIANT: Record<number, "default" | "secondary" | "outline" | "destructive"> = {
  1: "outline",
  2: "secondary",
  3: "secondary",
  4: "default",
  5: "default",
  6: "destructive",
}

export default function FeedbackPage() {
  const [search, setSearch] = useState("")
  // スキル画面と同じく、選択は URL に置く（?id=）。
  const [searchParams, setSearchParams] = useSearchParams()
  const openId = searchParams.get("id")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: FEEDBACK_KEY,
    queryFn: listFeedback,
    staleTime: 60 * 1000,
  })

  const items = useMemo(() => data ?? [], [data])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items
    return items.filter((item) =>
      [item.title, item.summary, item.requirements, item.requesterName, item.requesterEmail].some(
        (field) => field.toLowerCase().includes(term),
      ),
    )
  }, [items, search])

  // 選んだフィードバックが絞り込みで消えたら、先頭に落とす。
  const current: Feedback | undefined =
    visible.find((item) => item.id === openId) ?? visible[0]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">AI チームメイト フィードバック</h2>
        <p className="text-sm text-muted-foreground">
          このエージェントが Teams で受け取った改善要望・不具合報告を、Dataverse MCP 経由で登録した一覧です。
        </p>
      </div>

      <UpdateNote>
        <p>
          このエージェントに「こうしてほしい」と伝えると、ここへ 1 件ずつ記録されます。依頼者は
          <code className="mx-1 font-mono">systemuser</code>
          の Lookup で解決され、解決できない場合は依頼者名・メールのテキストが代わりに表示されます。
        </p>
      </UpdateNote>

      {isError ? (
        <p className="text-sm text-destructive">
          フィードバックを取得できませんでした: {(error as Error)?.message}
        </p>
      ) : isLoading ? (
        <LoadingSkeletonList count={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          まだフィードバックは登録されていません。
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="flex h-[calc(100dvh-13rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:sticky lg:top-[5.5rem] lg:self-start">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <MessageSquareHeart className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">一覧</span>
              <span className="ml-auto text-xs text-muted-foreground">{visible.length}</span>
            </div>
            <div className="relative border-b p-2">
              <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="タイトル・依頼者で検索"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <ul className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ id: item.id }, { replace: true })}
                    className={`block w-full rounded-md px-2 py-2 text-left text-xs ${
                      item.id === current?.id ? "bg-primary/10 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <Badge
                        variant={STATUS_BADGE_VARIANT[item.status ?? 0] ?? "outline"}
                        className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                      >
                        {item.statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                      {item.summary}
                    </p>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-3 py-4 text-xs text-muted-foreground">該当するフィードバックがありません</li>
              )}
            </ul>
          </aside>

          {current && <FeedbackDetail key={current.id} item={current} />}
        </div>
      )}
    </div>
  )
}

function FeedbackDetail({ item }: { item: Feedback }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState(String(item.status ?? ""))
  const [githubIssueUrl, setGithubIssueUrl] = useState(item.githubIssueUrl)

  const mutation = useMutation({
    mutationFn: (next: number) => updateFeedbackStatus(item.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY })
    },
  })

  const issueMutation = useMutation({
    mutationFn: (next: string) => updateFeedbackGithubIssueUrl(item.id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY })
    },
  })

  return (
    <div className="min-w-0 rounded-lg border bg-card p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 text-lg font-semibold">{item.title}</h3>
        <Badge variant={STATUS_BADGE_VARIANT[item.status ?? 0] ?? "outline"}>
          {item.statusLabel}
        </Badge>
        {item.createdOn && (
          <span className="ml-auto text-xs text-muted-foreground">
            受付 {formatDateTime(item.createdOn)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{item.summary}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">依頼者</div>
          <div className="truncate">{item.requesterName || "不明"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">目的</div>
          <div>{item.purposeLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">カテゴリ</div>
          <div>{item.categoryLabel}</div>
        </div>
        <div className="flex items-end gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!status || Number(status) === item.status || mutation.isPending}
            onClick={() => mutation.mutate(Number(status))}
          >
            更新
          </Button>
        </div>
      </div>

      <div className="mt-4 text-sm [overflow-wrap:anywhere]">
        <div className="mb-1 text-xs text-muted-foreground">要件</div>
        <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3">
          {item.requirements || "（記載なし）"}
        </p>
      </div>

      <div className="mt-4 text-sm">
        <div className="mb-1 text-xs text-muted-foreground">GitHub Issue</div>
        <div className="flex items-center gap-2">
          <Input
            value={githubIssueUrl}
            onChange={(event) => setGithubIssueUrl(event.target.value)}
            placeholder="https://github.com/{owner}/{repo}/issues/{番号}"
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={githubIssueUrl.trim() === item.githubIssueUrl || issueMutation.isPending}
            onClick={() => issueMutation.mutate(githubIssueUrl.trim())}
          >
            保存
          </Button>
          {item.githubIssueUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={item.githubIssueUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 size-3.5" />
                開く
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
