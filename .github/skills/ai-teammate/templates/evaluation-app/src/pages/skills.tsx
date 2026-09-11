import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { BookOpen, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Markdown } from "@/components/markdown"
import { UpdateNote } from "@/components/update-note"
import { formatDateTime } from "@/lib/date-format"
import { listSkills, SKILLS_KEY, type Skill } from "@/lib/eval-skills"

export default function Skills() {
  const [search, setSearch] = useState("")
  // 評価ターンのツール呼び出しから ?name= で飛んでこられるよう、選択は URL に置く。
  const [searchParams, setSearchParams] = useSearchParams()
  const openName = searchParams.get("name")

  const { data, isLoading, isError, error } = useQuery({
    queryKey: SKILLS_KEY,
    queryFn: listSkills,
    staleTime: 5 * 60 * 1000,
  })

  const skills = useMemo(() => data ?? [], [data])
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return skills
    return skills.filter((skill) =>
      [skill.name, skill.title, skill.summary, skill.body].some((field) =>
        field.toLowerCase().includes(term),
      ),
    )
  }, [skills, search])

  // 選んだスキルが絞り込みで消えたら、先頭に落とす。
  const current: Skill | undefined =
    visible.find((skill) => skill.name === openName) ?? visible[0]
  const missing = Boolean(openName) && !skills.some((skill) => skill.name === openName)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">スキル</h2>
        <p className="text-sm text-muted-foreground">
          エージェントが作業手順として読んでいる Markdown です。中身はエージェント側が持ち、
          ここは定期同期された写しを表示しています。
        </p>
      </div>

      <UpdateNote>
        <p>
          標準スキルは <code className="font-mono">agent プロジェクト/skills</code> 配下の Markdown を編集するか、
          エージェントに依頼して <code className="font-mono">save_skill</code> ツールで追加・更新してもらいます。
          変更は Dataverse への定期同期（既定 <code className="font-mono">Skills:SyncMinutes</code> = 30 分）後に
          この画面へ反映されます。
        </p>
      </UpdateNote>

      {missing && !isLoading && !isError && (
        <p className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm">
          <code className="font-mono">{openName}</code>{" "}
          は今のスキル一覧にありません。そのターンのあとで名前が変わったか、削除されています。
        </p>
      )}

      {isError ? (
        <p className="text-sm text-destructive">
          スキルを取得できませんでした: {(error as Error)?.message}
        </p>
      ) : isLoading ? (
        <LoadingSkeletonList count={3} />
      ) : skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          まだ同期されていません。エージェントの起動から数分待って開き直してください。
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="flex h-[calc(100dvh-13rem)] min-w-0 flex-col overflow-hidden rounded-lg border bg-card lg:sticky lg:top-[5.5rem] lg:self-start">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <BookOpen className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">一覧</span>
              <span className="ml-auto text-xs text-muted-foreground">{visible.length}</span>
            </div>
            <div className="relative border-b p-2">
              <Search className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="スキルを検索"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <ul className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-1">
              {visible.map((skill) => (
                <li key={skill.id}>
                  <button
                    type="button"
                    onClick={() => setSearchParams({ name: skill.name }, { replace: true })}
                    className={`block w-full rounded-md px-2 py-2 text-left text-xs ${
                      skill.name === current?.name ? "bg-primary/10 font-medium" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate">{skill.title || skill.name}</span>
                      <Badge
                        variant={skill.builtIn ? "outline" : "secondary"}
                        className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                      >
                        {skill.builtIn ? "標準" : "追加"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                      {skill.summary}
                    </p>
                  </button>
                </li>
              ))}
              {visible.length === 0 && (
                <li className="px-3 py-4 text-xs text-muted-foreground">該当するスキルがありません</li>
              )}
            </ul>
          </aside>

          {current && (
            <div className="min-w-0 rounded-lg border bg-card p-5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="min-w-0 text-lg font-semibold">{current.title || current.name}</h3>
                <Badge variant={current.builtIn ? "outline" : "secondary"}>
                  {current.builtIn ? "標準" : "追加"}
                </Badge>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {current.name}
                </code>
                {current.syncedOn && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    同期 {formatDateTime(current.syncedOn)}
                  </span>
                )}
              </div>
              <div className="mt-4 text-sm [overflow-wrap:anywhere]">
                <Markdown>{current.body}</Markdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
