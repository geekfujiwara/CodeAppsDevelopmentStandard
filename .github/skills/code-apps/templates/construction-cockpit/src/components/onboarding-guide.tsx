import { useEffect, useState } from "react"
import { CircleHelp, X } from "lucide-react"
import { useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "construction-cockpit-guide-seen"
const WORKSPACE_STORAGE_KEY = "construction-cockpit-workspace-guide-seen"

const slides = [
  {
    title: "現場の一日を一つにつなぐ",
    body: "朝の KY 活動から夕方の日報まで、現場の記録を同じアプリで管理します。",
  },
  {
    title: "Google Maps で現場を俯瞰",
    body: "施工中の工事と直近1年間の完了工事を、Google Maps の一覧で確認します。",
  },
  {
    title: "工事ワークスペースを開く",
    body: "工事メニューではマップ、日報写真、一覧を切り替え、Dataverse から工事を検索できます。",
  },
  {
    title: "データのつながりを探索",
    body: "工事を中心に作業、日報、KY、ヒヤリハット、ナレッジ、重機稼働を関係グラフでたどれます。",
  },
  {
    title: "3D と工程で施工状況を確認",
    body: "工事を選ぶとメニューが自動で折りたたまれ、3D モデル、工程ガント、因果関係、監督確認を一画面で操作できます。",
  },
]

export function OnboardingGuide() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [current, setCurrent] = useState(0)
  const inWorkspace = /^\/projects\/[^/]+$/.test(location.pathname)
  const activeKey = inWorkspace ? WORKSPACE_STORAGE_KEY : STORAGE_KEY
  const activeSlides = inWorkspace ? [
    { title: "施工状況を立体で確認", body: "3D モデルはドラッグで回転、ホイールで拡大できます。色で施工済・施工中・未施工を確認します。" },
    { title: "工程と因果関係を確認", body: "工程ガントと因果関係を切り替え、工程の前後関係と関連記録を確認します。" },
    { title: "Cowork の提出を監督確認", body: "右側の監督確認で日報と工程進捗を承認、または理由を付けて差し戻します。" },
  ] : slides

  useEffect(() => {
    setCurrent(0)
    if (localStorage.getItem(activeKey) !== "1") {
      setIsOpen(true)
    }
  }, [activeKey])

  const close = () => {
    localStorage.setItem(activeKey, "1")
    setIsOpen(false)
    setCurrent(0)
  }

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} aria-label="使い方を見る" title="使い方を見る">
        <CircleHelp className="h-5 w-5" />
      </Button>
      {isOpen && (
        <div className="fixed inset-0 z-[300] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="guide-title">
          <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">使い方ガイド {current + 1} / {activeSlides.length}</p>
                <h2 id="guide-title" className="mt-2 text-2xl font-bold [overflow-wrap:anywhere]">{activeSlides[current].title}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={close} aria-label="ガイドを閉じる">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-4 min-h-20 text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">{activeSlides[current].body}</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="flex gap-2" aria-label="ガイドの進捗">
                {activeSlides.map((slide, index) => (
                  <span key={slide.title} className={`h-2 w-8 rounded-full ${index === current ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}>戻る</Button>
                {current < activeSlides.length - 1 ? (
                  <Button onClick={() => setCurrent((value) => value + 1)}>次へ</Button>
                ) : (
                  <Button onClick={close}>始める</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
