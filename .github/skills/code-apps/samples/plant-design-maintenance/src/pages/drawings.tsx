import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, FileText, Layers, Link2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { DrawingFileLink } from "@/components/drawing-file-link"
import { ListTable, type FilterConfig, type TableColumn } from "@/components/list-table"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useDrawingIndex, type DrawingRecord } from "@/data/drawing-repository"
import { findSimilarDrawings } from "@/lib/similar-drawings"

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ja-JP")
}

export default function DrawingsPage() {
  const indexQuery = useDrawingIndex()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [selectedId])

  const index = indexQuery.data
  const drawings = useMemo(() => index?.drawings ?? [], [index])
  const selected = drawings.find((d) => d.id === selectedId) ?? null

  const columns: TableColumn<DrawingRecord>[] = [
    { key: "number", label: "図面番号", sortable: true, render: (d) => <span className="font-medium">{d.number}</span> },
    { key: "title", label: "図面名称" },
    { key: "projectName", label: "案件" },
    {
      key: "activeRevision",
      label: "有効改訂",
      render: (d) =>
        d.activeRevision ? (
          <Badge variant={d.activeRevision.status === "有効" ? "default" : "outline"}>
            {d.activeRevision.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "revisionCount", label: "改訂数", align: "right", render: (d) => d.revisions.length },
    {
      key: "tagLabels",
      label: "部位タグ",
      render: (d) => (
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {d.tagLabels.length ? d.tagLabels.join(", ") : "—"}
        </span>
      ),
    },
  ]

  const filters: FilterConfig<DrawingRecord>[] = [
    {
      key: "projectName",
      label: "案件",
      options: [...new Set(drawings.map((d) => d.projectName))].sort().map((v) => ({ value: v, label: v })),
    },
  ]

  // 検索は figure 名だけでなく表記ゆれ辞書も対象にする（DOC-05）
  const searchRows = useMemo(
    () => drawings.map((d) => ({ ...d, aliasText: d.aliases.join(" "), tagText: d.tagLabels.join(" ") })),
    [drawings],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">図面索引</h1>
        <p className="text-muted-foreground">
          図面と設計書の在り処を辿るための台帳です。実体は Azure Files にあり、ここには検索キーとパスだけを持ちます。
        </p>
      </div>

      {indexQuery.isLoading ? (
        <LoadingSkeletonList count={5} />
      ) : indexQuery.error ? (
        <Card>
          <CardHeader>
            <CardTitle>データを取得できませんでした</CardTitle>
            <CardDescription className="[overflow-wrap:anywhere]">
              {indexQuery.error instanceof Error ? indexQuery.error.message : "Dataverse への接続を確認してください。"}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <div ref={detailRef} className="scroll-mt-4">
            {selected && index && (
              <DrawingDetail drawing={selected} onClose={() => setSelectedId(null)} onSelect={setSelectedId} index={index} />
            )}
          </div>

          <div data-tour="drawing-list">
            <ListTable
              data={searchRows}
              columns={columns as TableColumn<(typeof searchRows)[number]>[]}
              title="図面一覧"
              description={`${drawings.length} 件`}
              searchPlaceholder="図面番号・名称・表記ゆれ・部位タグで検索..."
              searchKeys={["number", "title", "projectName", "aliasText", "tagText"]}
              filters={filters as FilterConfig<(typeof searchRows)[number]>[]}
              emptyMessage="図面が登録されていません"
              onRowClick={(d) => setSelectedId(d.id)}
            />
          </div>
        </>
      )}
    </div>
  )
}

type DetailProps = {
  drawing: DrawingRecord
  index: NonNullable<ReturnType<typeof useDrawingIndex>["data"]>
  onClose: () => void
  onSelect: (id: string) => void
}

function DrawingDetail({ drawing, index, onClose, onSelect }: DetailProps) {
  const revisionIds = new Set(drawing.revisions.map((r) => r.id))
  const links = index.links.filter(
    (l) =>
      (l.revisionId && revisionIds.has(l.revisionId)) ||
      (l.relatedRevisionId && revisionIds.has(l.relatedRevisionId)),
  )
  const features = index.features.filter((ft) => ft.revisionId && revisionIds.has(ft.revisionId))
  const similar = useMemo(() => findSimilarDrawings(drawing.id, index), [drawing.id, index])

  const documentById = new Map(index.documents.map((d) => [d.id, d]))
  const revisionById = new Map(
    index.drawings.flatMap((d) => d.revisions.map((r) => [r.id, { drawing: d, revision: r }] as const)),
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {drawing.number}
          </CardTitle>
          <CardDescription>
            {drawing.title || "図面名称なし"} ／ {drawing.projectName}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        <section>
          <SectionTitle>改訂</SectionTitle>
          <div className="space-y-2">
            {drawing.revisions.length === 0 && <Empty>改訂が登録されていません</Empty>}
            {drawing.revisions.map((rev) => (
              <div key={rev.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={rev.status === "有効" ? "default" : "outline"}>{rev.name}</Badge>
                  <span className="text-sm text-muted-foreground">{rev.status || "状態未設定"}</span>
                  <span className="text-sm text-muted-foreground">発行 {formatDate(rev.issuedDate)}</span>
                </div>
                <DrawingFileLink path={rev.filePath} />
              </div>
            ))}
          </div>
        </section>

        <Separator />

        <section>
          <SectionTitle>紐づく文書・図面</SectionTitle>
          <div className="space-y-2">
            {links.length === 0 && <Empty>リンクが登録されていません</Empty>}
            {links.map((link) => {
              const doc = link.documentId ? documentById.get(link.documentId) : null
              const related = link.relatedRevisionId ? revisionById.get(link.relatedRevisionId) : null
              return (
                <div key={link.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{link.linkType || "関係未設定"}</Badge>
                    {doc ? (
                      <span className="flex items-center gap-1 text-sm font-medium">
                        <FileText className="h-4 w-4" />
                        {doc.name}
                        <span className="text-muted-foreground">
                          （{doc.documentType} {doc.revision}）
                        </span>
                      </span>
                    ) : related ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                        onClick={() => onSelect(related.drawing.id)}
                      >
                        <Link2 className="h-4 w-4" />
                        {related.drawing.number} {related.revision.name}
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">リンク先未設定</span>
                    )}
                  </div>
                  {doc?.filePath && <DrawingFileLink path={doc.filePath} />}
                  {link.note && <p className="mt-1 text-sm text-muted-foreground">{link.note}</p>}
                </div>
              )
            })}
          </div>
        </section>

        <Separator />

        <section>
          <SectionTitle>設計特徴量</SectionTitle>
          {features.length === 0 ? (
            <Empty>特徴量が登録されていません</Empty>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((ft) => (
                <div key={ft.id} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{ft.name}</p>
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">
                    {ft.value}
                    {ft.unit}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[ft.categoryName, ft.tagLabel].filter(Boolean).join(" / ") || "分類未設定"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section>
          <SectionTitle>類似図面</SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            製品カテゴリ・部位タグのキー一致で絞り込み、設計諸元の近さで並べています。
          </p>
          {similar.length === 0 ? (
            <Empty>比較できる図面がありません</Empty>
          ) : (
            <div className="space-y-2">
              {similar.map((s) => (
                <button
                  key={s.drawing.id}
                  type="button"
                  onClick={() => onSelect(s.drawing.id)}
                  className="flex w-full items-start justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.drawing.number}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">{s.drawing.title}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      一致キー: {[...s.matchedCategories, ...s.matchedTags].join(", ") || "—"}
                    </p>
                    {s.comparedSpecs.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {s.comparedSpecs
                          .map((spec) => `${spec.name} ${spec.base} → ${spec.candidate}`)
                          .join(" / ")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="tabular-nums">
                      {Math.round(s.score * 100)}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-sm font-semibold">{children}</h3>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
