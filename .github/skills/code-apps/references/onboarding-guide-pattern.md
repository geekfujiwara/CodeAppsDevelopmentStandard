# 使い方ガイドパターン（カルーセル＋実操作ツアー）

業務アプリを初めて開いた利用者に、**「何ができるアプリか」を 5 枚前後のカルーセルで伝え、続けて実際の画面を操作しながら案内するツアー**を見せる標準パターン。

- 初回起動時に自動で 1 回だけ開く（`localStorage` のフラグ）。2 回目以降はサイドバー／ヘッダーのボタンから任意に開く
- カルーセルの最後（どのスライドでも可）にある **「使い方を見る」** でツアーが始まり、ルート遷移・要素ハイライト・実クリックのデモまで自動で進む
- ハイライト対象は **`data-tour="..."` 属性**だけで指定する。画面側の実装に手を入れるのは属性 1 つのみ
- 追加依存なし（React Router + lucide-react + 既存の Dialog / Button のみ）

> **すべての Code Apps で標準実装する。** 指示がなくても、画面が 3 つ以上あるアプリにはこのガイドを入れる。
> プレースホルダー `{アプリ名}` ・スライド文言・ツアー手順はプロジェクトの業務に読み替える。コンポーネント本体はそのまま流用できる。

---

## ファイル構成

```
src/
  guide-config.ts                    # スライドとツアー手順の定義（ここだけ書き換える）
  components/guide/
    guide-context.ts                 # Context + useGuide（コンポーネントを含めない .ts）
    guide-provider.tsx               # 初回判定・状態・Dialog/Tour の実体
    guide-dialog.tsx                 # カルーセル本体
    guide-tour.tsx                   # スポットライト付きツアー
```

> **`guide-context.ts` を `guide-provider.tsx` に混ぜないこと。**
> コンポーネントを export するファイルからフックや定数を同時に export すると eslint の
> `react-refresh/only-export-components` でビルドが止まる（→ [トラブルシューティング #50](troubleshooting.md)）。

---

## 1. 設定ファイル（プロジェクトごとに書き換える唯一の場所）

`src/guide-config.ts`:

```ts
import { BookOpenCheck, LayoutDashboard, Layers, Workflow, type LucideIcon } from "lucide-react"

/** 初回起動でガイドを出したかどうかを覚えるキー */
export const GUIDE_STORAGE_KEY =
  import.meta.env.VITE_GUIDE_STORAGE_KEY?.trim() || "{app-slug}-guide-seen"

export type GuideSlide = {
  id: string
  icon: LucideIcon
  title: string
  lead: string
  points: string[]
}

/** 使い方カルーセルのスライド。1 枚 = 1 つの業務ステップにする */
export const GUIDE_SLIDES: GuideSlide[] = [
  {
    id: "welcome",
    icon: LayoutDashboard,
    title: "{アプリ名} へようこそ",
    lead: "このアプリが何を解決するのかを 1〜2 文で書く。",
    points: [
      "概要画面で全体の指標を確認します",
      "一覧画面で対象を絞り込みます",
      "詳細画面で編集・承認します",
    ],
  },
  // 以降、画面（または業務ステップ）ごとに 1 枚。合計 4〜6 枚に収める
]

export type TourStep = {
  id: string
  /** 表示前に移動するルート。省略時は現在の画面のまま */
  path?: string
  /** ハイライト対象。data-tour 属性で指定する */
  target?: string
  /** このステップに入ったときに実際にクリックして見せる要素の data-tour */
  autoClick?: string
  title: string
  body: string
}

/** 「使い方を見る」で実際の画面を操作しながら案内する手順 */
export const TOUR_STEPS: TourStep[] = [
  { id: "nav", path: "/dashboard", target: "sidebar-nav", title: "メニューの見かた", body: "…" },
  { id: "kpi", path: "/dashboard", target: "page-body", title: "まず KPI を確認", body: "…" },
  { id: "filter", path: "/records", target: "stage-path", autoClick: "stage-resolved",
    title: "段階で絞り込む", body: "矢羽をクリックすると一覧が絞り込まれます。いま実際に押してみました。" },
  { id: "list", path: "/records", target: "record-list", title: "行から詳細へ", body: "…" },
  { id: "help", target: "guide-button", title: "いつでも呼び出せます", body: "…" },
]
```

**設計ルール**

| 項目 | ルール |
| --- | --- |
| スライド枚数 | 4〜6 枚。1 枚 = 1 画面 or 1 業務ステップ |
| `points` | 各 3 項目まで。機能名ではなく「利用者が何をするか」で書く |
| ツアー手順 | 8 ステップ前後。`path` は必ず `router.tsx` に存在するルートにする |
| `autoClick` | 「押すと何が起きるか」を見せたいときだけ使う。破壊的操作（削除・送信）には**絶対に付けない** |
| 保存キー | アプリごとに変える。文言を大きく変えたら `-v2` を付けて再表示させる |

---

## 2. Context（コンポーネントを含めない）

`src/components/guide/guide-context.ts`:

```ts
import { createContext, useContext } from "react"

export type GuideContextValue = {
  /** 使い方カルーセルを開く */
  openGuide: () => void
  /** 画面を実際に操作しながら案内するツアーを開始する */
  startTour: () => void
}

export const GuideContext = createContext<GuideContextValue | null>(null)

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext)
  if (!ctx) throw new Error("useGuide は GuideProvider の内側でのみ使えます")
  return ctx
}
```

---

## 3. Provider（初回判定）

`src/components/guide/guide-provider.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react"
import { GUIDE_STORAGE_KEY } from "@/guide-config"
import { GuideContext, type GuideContextValue } from "@/components/guide/guide-context"
import { GuideDialog } from "@/components/guide/guide-dialog"
import { GuideTour } from "@/components/guide/guide-tour"

function readSeen(): boolean {
  try {
    return localStorage.getItem(GUIDE_STORAGE_KEY) === "1"
  } catch {
    return true // 使えない環境では「見た」扱いにして邪魔しない
  }
}

function writeSeen() {
  try {
    localStorage.setItem(GUIDE_STORAGE_KEY, "1")
  } catch {
    // プライベートブラウズなどで localStorage が使えなくても機能は落とさない
  }
}

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [isDialogOpen, setDialogOpen] = useState(false)
  const [isTourOpen, setTourOpen] = useState(false)

  // 初回起動時だけ自動で開く
  useEffect(() => {
    if (!readSeen()) setDialogOpen(true)
  }, [])

  const openGuide = useCallback(() => setDialogOpen(true), [])

  const startTour = useCallback(() => {
    writeSeen()
    setDialogOpen(false)
    setTourOpen(true)
  }, [])

  const closeDialog = useCallback((open: boolean) => {
    if (!open) writeSeen()
    setDialogOpen(open)
  }, [])

  const value = useMemo<GuideContextValue>(() => ({ openGuide, startTour }), [openGuide, startTour])

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideDialog open={isDialogOpen} onOpenChange={closeDialog} onStartTour={startTour} />
      <GuideTour open={isTourOpen} onClose={() => setTourOpen(false)} />
    </GuideContext.Provider>
  )
}
```

> `try/catch` は必須。Power Apps は iframe で動くため、サードパーティ Cookie／ストレージ制限のあるブラウザ設定では
> `localStorage` アクセスが例外を投げる。落ちると**アプリ全体が白画面**になる。

---

## 4. カルーセル

`src/components/guide/guide-dialog.tsx`:

```tsx
import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Check, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { GUIDE_SLIDES } from "@/guide-config"
import { cn } from "@/lib/utils"

type GuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartTour: () => void
}

export function GuideDialog({ open, onOpenChange, onStartTour }: GuideDialogProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  const slide = GUIDE_SLIDES[index]
  const isLast = index === GUIDE_SLIDES.length - 1
  const Icon = slide.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <div className="bg-gradient-to-br from-primary/90 via-primary to-primary/70 px-6 py-7 text-primary-foreground">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Icon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-widest opacity-80">
                使い方 {index + 1} / {GUIDE_SLIDES.length}
              </p>
              <DialogTitle className="mt-1 text-xl [overflow-wrap:anywhere]">{slide.title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="mt-4 text-sm leading-6 text-primary-foreground/90 [overflow-wrap:anywhere]">
            {slide.lead}
          </DialogDescription>
        </div>

        <div className="px-6 pt-5">
          <ul className="space-y-3">
            {slide.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-6">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="[overflow-wrap:anywhere]">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-4 border-t px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2" aria-label="スライド位置">
            {GUIDE_SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`${i + 1} 枚目: ${s.title}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === index ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="mr-1 h-4 w-4" />戻る
            </Button>
            {isLast ? (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                閉じる
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setIndex((i) => i + 1)}>
                次へ<ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            )}
            <Button size="sm" onClick={onStartTour}>
              <PlayCircle className="mr-1 h-4 w-4" />使い方を見る
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- ヘッダーはテーマの `primary` グラデーション。テンプレートを変えても配色が自動で追随する
- ドットは**クリックできるページネーション**にする（読み飛ばし・見返しの導線）
- 「使い方を見る」は**全スライドで常時表示**する。最後まで送らせない

---

## 5. ツアー（スポットライト＋自動操作）

`src/components/guide/guide-tour.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { ArrowLeft, ArrowRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TOUR_STEPS } from "@/guide-config"

const PADDING = 8
const CARD_WIDTH = 360

type Rect = { top: number; left: number; width: number; height: number }

function findTarget(name: string | undefined): HTMLElement | null {
  if (!name) return null
  return document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** 対象要素の位置に合わせてカードを置く。下に入らなければ上、それも無理なら中央寄せ */
function cardStyle(rect: Rect | null): React.CSSProperties {
  const width = Math.min(CARD_WIDTH, window.innerWidth - 32)
  if (!rect) {
    return {
      width,
      top: Math.round(window.innerHeight / 2 - 120),
      left: Math.round((window.innerWidth - width) / 2),
    }
  }
  const below = rect.top + rect.height + PADDING + 16
  const fitsBelow = below + 220 < window.innerHeight
  const top = fitsBelow ? below : Math.max(16, rect.top - PADDING - 236)
  const left = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16)
  return { width, top: Math.round(top), left: Math.round(left) }
}

export function GuideTour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = TOUR_STEPS[index]
  const isLast = index === TOUR_STEPS.length - 1

  useEffect(() => {
    if (open) setIndex(0)
  }, [open])

  // ステップが指定する画面へ移動する
  useEffect(() => {
    if (!open || !step?.path) return
    if (location.pathname !== step.path) navigate(step.path)
  }, [open, step, location.pathname, navigate])

  // 実際の操作を見せる（対象は遅延描画されるので現れるまで待つ）
  useEffect(() => {
    if (!open || !step?.autoClick) return
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(() => {
      if (cancelled) return
      const el = findTarget(step.autoClick)
      if (el) {
        el.click()
        window.clearInterval(timer)
      } else if (++attempts > 20) {
        window.clearInterval(timer)
      }
    }, 150)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [open, step])

  // ハイライト位置の追従。ルート遷移・遅延描画・スクロールのいずれでもずれないよう定期的に測る
  useEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    let scrolled = false
    const measure = () => {
      const el = findTarget(step?.target)
      if (!el) {
        setRect((prev) => (prev === null ? prev : null))
        return
      }
      if (!scrolled) {
        scrolled = true
        el.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      const r = el.getBoundingClientRect()
      const next = { top: r.top, left: r.left, width: r.width, height: r.height }
      setRect((prev) => (sameRect(prev, next) ? prev : next))
    }
    measure()
    const timer = window.setInterval(measure, 200)
    window.addEventListener("resize", measure)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("resize", measure)
    }
  }, [open, step])

  const finish = useCallback(() => {
    setIndex(0)
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, finish])

  if (!open || !step) return null

  return createPortal(
    <div className="fixed inset-0 z-[500]" role="dialog" aria-modal="true" aria-label="使い方ガイド">
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary transition-all duration-300"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-slate-950/60" />
      )}

      <div
        className="absolute rounded-xl border bg-background p-5 shadow-2xl transition-all duration-300"
        style={cardStyle(rect)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              STEP {index + 1} / {TOUR_STEPS.length}
            </p>
            <p className="mt-1 font-semibold [overflow-wrap:anywhere]">{step.title}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={finish} aria-label="ガイドを終了">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            終了
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
              <ArrowLeft className="mr-1 h-4 w-4" />戻る
            </Button>
            <Button size="sm" onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}>
              {isLast ? "完了" : "次へ"}
              {!isLast && <ArrowRight className="ml-1 h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
```

**実装上の勘所**

| 論点 | 対処 |
| --- | --- |
| 穴あきオーバーレイ | 別要素で被せず、**ハイライト枠に `boxShadow: "0 0 0 9999px rgba(...)"`** を当てる（`clip-path` や 4 枚の div は不要） |
| 対象が未描画 | 位置測定は `setInterval(200ms)`。React Query のローディング後に現れる一覧でもズレない |
| ルート遷移直後 | `path` が変わると DOM が入れ替わる。`measure()` が `null` を返す間はカードを中央に出す |
| スクロール | `scrollIntoView` は **ステップごとに 1 回だけ**（`scrolled` フラグ）。毎回呼ぶと画面が揺れる |
| `z-index` | `z-[500]`。Radix Dialog（`z-50`）より上、Power Apps ホストの UI より下 |
| 破壊的操作 | `autoClick` に削除・送信ボタンを指定しない。デモが実データを壊す |

---

## 6. 画面側の組み込み（属性 1 つずつ）

**`src/pages/_layout.tsx`** — Provider を Router の内側に置く（ツアーが `useNavigate` を使うため）:

```tsx
import { GuideProvider } from "@/components/guide/guide-provider"
import { useGuide } from "@/components/guide/guide-context"

function LayoutContent() {
  const { openGuide } = useGuide()
  return (
    <>
      <header>
        {/* … */}
        <Button variant="ghost" size="icon" data-tour="guide-button"
                onClick={openGuide} aria-label="使い方を見る" title="使い方を見る">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </header>
      <div data-tour="page-body">
        <Outlet />
      </div>
    </>
  )
}

export function Layout() {
  return (
    <SidebarProvider>
      <GuideProvider>
        <LayoutContent />
      </GuideProvider>
    </SidebarProvider>
  )
}
```

**`src/components/sidebar.tsx`** — ナビに `data-tour`、フッターにガイド起動ボタン:

```tsx
<nav data-tour="sidebar-nav"> … </nav>

<div className="border-t border-border">
  <button onClick={openGuide}>
    <HelpCircle className="h-4 w-4" />
    {!collapsed && <span>使い方ガイド</span>}
  </button>
</div>
```

**各ページ** — ハイライトしたい塊に属性を足すだけ:

```tsx
<div data-tour="record-list">
  <ListTable … />
</div>
```

### `data-tour` の命名規約

| 用途 | 名前 |
| --- | --- |
| サイドバーのナビ | `sidebar-nav` |
| ページ本体（`<Outlet />` の外枠） | `page-body` |
| 一覧 | `{entity}-list`（例: `incident-list`） |
| 矢羽・タブなどの絞り込み UI | `{feature}-path` / `{feature}-tabs` |
| 個別の選択肢（`autoClick` 対象） | `{feature}-{value}`（例: `lifecycle-stage-resolved`） |
| ヘッダーのガイドボタン | `guide-button` |

---

## 7. 検証チェックリスト

- [ ] `TOUR_STEPS` の全 `path` が `router.tsx` に存在する（存在しないと真っ白なページでツアーが続く）
- [ ] `target` / `autoClick` の全名称が実 DOM に存在する（`grep "data-tour=" src/` と突き合わせる）
- [ ] `localStorage` をクリアして開き直すとカルーセルが自動表示される
- [ ] 2 回目以降は自動表示されず、サイドバー／ヘッダーのボタンから開ける
- [ ] ツアーを STEP 1 から最終ステップまで送り、各ステップでハイライトが対象に重なる
- [ ] Escape・「終了」・「完了」のいずれでも閉じ、元の画面が操作できる
- [ ] `npm run lint`（`react-refresh/only-export-components` が出ないこと）→ `npm run build` → `npm run predeploy`

デプロイ後の実機確認は、**新しいタブで開き直し**「You're using an old version of this app.」の Refresh を押してから行う
（詳細は [トラブルシューティング #37](troubleshooting.md)）。
