import { useEffect, useState } from "react"
import { CircleHelp, X } from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "construction-cockpit-guide-seen"

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
    title: "工事オービットで工程を操作",
    body: "React Flow の工程ガントをパン・ズームし、作業ノードを選択して期間と進捗を確認します。",
  },
  {
    title: "データのつながりを探索",
    body: "工事を中心に作業、日報、KY、ヒヤリハット、ナレッジ、重機稼働を関係グラフでたどれます。",
  },
  {
    title: "現場を選んで記録へ",
    body: "上部の「今の現場」を選ぶと、KY・ヒヤリハット・日報へ現場情報を引き継げます。",
  },
]

export function OnboardingGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setIsOpen(true)
    }
  }, [])

  const close = () => {
    localStorage.setItem(STORAGE_KEY, "1")
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
                <p className="text-sm font-semibold text-primary">使い方ガイド {current + 1} / {slides.length}</p>
                <h2 id="guide-title" className="mt-2 text-2xl font-bold [overflow-wrap:anywhere]">{slides[current].title}</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={close} aria-label="ガイドを閉じる">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-4 min-h-20 text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">{slides[current].body}</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="flex gap-2" aria-label="ガイドの進捗">
                {slides.map((slide, index) => (
                  <span key={slide.title} className={`h-2 w-8 rounded-full ${index === current ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setCurrent((value) => Math.max(0, value - 1))} disabled={current === 0}>戻る</Button>
                {current < slides.length - 1 ? (
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
