import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, Box, Building2, Cpu, FileImage, Footprints, Handshake, MessageSquare, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { useProjects } from "@/hooks/use-projects"
import { STAGES, stageLabel } from "@/types/project"
import { STAGE_TONE, projectThumbnail } from "@/lib/project-utils"
import { CODEAPPS_APP_NAME } from "@/config"

const FLOW = [
  { icon: FileImage, title: "1. パース受領", body: "依頼主から SUUMO 掲載画像・外観パース・間取り図を受け取り、案件に登録" },
  { icon: Box, title: "2. 画像から 3D 化", body: "間取り図の壁・窓・ドア・部屋を自動抽出し、パースの色味で 3D モデルを生成" },
  { icon: MessageSquare, title: "3. 設計レビュー", body: "設計チームが寸法・屋根を確認し、3D 上にピン留めコメントで指摘" },
  { icon: Footprints, title: "4. 営業提案・内見", body: "営業がカラーバリエーションを保存し、お客様と一緒にウォークスルー内見" },
  { icon: Cpu, title: "5. Blender 仕上げ", body: "同じモデルを Blender でフォトリアル画像・360° パノラマ・日影図に" },
]

export default function Dashboard() {
  const { data = [], isLoading } = useProjects()
  const navigate = useNavigate()
  const counts = STAGES.map(s => ({ ...s, count: data.filter(p => p.stage === s.value).length }))
  const withModel = data.filter(p => p.spec).length
  const recent = data.slice(0, 4)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{CODEAPPS_APP_NAME}</h1>
          <p className="text-muted-foreground">2D のパース・間取り図から 3D 建築モデルを生成し、設計と営業が同じモデルで内見提案まで進めます。</p>
        </div>
        <Button className="gap-1" onClick={() => navigate("/projects?new=1")}><Plus className="h-4 w-4" />新規案件</Button>
      </div>

      {isLoading ? (
        <LoadingSkeletonList count={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {counts.map(s => (
              <Link key={s.value} to={`/projects?stage=${s.value}`} className="min-w-0 rounded-lg border bg-card p-3 transition-shadow hover:shadow-md" title={s.description}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${STAGE_TONE[s.value]}`} />
                  {s.label}
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums">{s.count}</p>
              </Link>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card className="min-w-0">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">最近の案件</CardTitle>
                  <CardDescription>全 {data.length} 件・3D モデルあり {withModel} 件</CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild><Link to="/projects" className="gap-1">すべて表示<ArrowRight className="h-4 w-4" /></Link></Button>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {recent.map(p => {
                  const thumb = projectThumbnail(p)
                  return (
                    <div
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/projects/${p.id}${p.spec ? "?tab=viewer" : ""}`)}
                      onKeyDown={e => e.key === "Enter" && navigate(`/projects/${p.id}`)}
                      className="flex min-w-0 cursor-pointer gap-3 rounded-md border p-2 hover:border-primary"
                    >
                      <div className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Building2 className="h-6 w-6 text-muted-foreground" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.clientName}</p>
                        <Badge className={`mt-1 text-white ${STAGE_TONE[p.stage]}`}>{stageLabel(p.stage)}</Badge>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Handshake className="h-4 w-4" />設計 × 営業の提案フロー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {FLOW.map(f => (
                  <div key={f.title} className="flex gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><f.icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{f.title}</p>
                      <p className="text-xs text-muted-foreground">{f.body}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
