import { useEffect, useState } from "react"
import { Loader2, Radio, Search, ShieldCheck, UserMinus, UserPlus } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { errorText } from "@/lib/agm/corpus"
import { addViewer, endLive, removeViewer, searchUsers, startLive, type LiveSession, type Viewer } from "@/lib/agm/live"

/** LIVE 共有の管理（配信の開始・終了、閲覧者の追加・解除）。操作できるのは配信している担当者だけ */
export function LiveDialog({
  open,
  onOpenChange,
  session,
  onSession,
  defaultTitle,
  meetingId,
  lastPublished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: LiveSession | null
  onSession: (s: LiveSession | null) => void
  defaultTitle: string
  meetingId?: string
  lastPublished?: { at: number; revision: number; bytes: number; ms: number } | null
}) {
  const [title, setTitle] = useState(defaultTitle)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Viewer[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  useEffect(() => setTitle(defaultTitle), [defaultTitle])
  useEffect(() => {
    if (!open || !session || query.trim().length < 1) {
      setResults([])
      return
    }
    const t = window.setTimeout(() => {
      searchUsers(query)
        .then(setResults)
        .catch((e) => setError(errorText(e)))
    }, 300)
    return () => window.clearTimeout(t)
  }, [query, open, session])

  const run = async (label: string, f: () => Promise<void>) => {
    setBusy(label)
    setError(undefined)
    try {
      await f()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="agm max-w-2xl border-agm-line text-agm-ink" data-testid="live-dialog">
        <DialogTitle className="flex items-center gap-2">
          <Radio className="size-5 text-agm-rec" aria-hidden />
          LIVE 共有（幹部への読み取り専用の配信）
        </DialogTitle>
        <DialogDescription className="text-agm-muted">
          文字起こし・質問・回答案をそのまま閲覧者の画面へ届けます。閲覧者はスクロールや根拠の確認だけができ、編集はできません。共有はこの LIVE のレコードに対する読み取り権限（Dataverse の共有）で行います。
        </DialogDescription>

        {!session ? (
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-0.5">
              <span className="text-[11px] text-agm-muted">LIVE の名前</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-md border border-agm-line bg-agm-bg px-3 outline-none focus:border-agm-accent" data-testid="live-title" />
            </label>
            <button
              type="button"
              disabled={!!busy || !title.trim()}
              onClick={() => void run("start", async () => onSession(await startLive(title.trim(), meetingId)))}
              className="flex h-10 items-center gap-1.5 rounded-md bg-agm-rec px-4 font-semibold text-white disabled:opacity-50"
              data-testid="live-start"
            >
              {busy === "start" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Radio className="size-4" aria-hidden />}
              LIVE を開始
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-agm-rec/50 bg-agm-rec/10 px-3 py-2 text-sm">
              <span className="agm-rec-dot size-2.5 rounded-full bg-agm-rec" aria-hidden />
              <span className="font-semibold">{session.title}</span>
              <span className="text-agm-muted" data-testid="live-publish-status">
                {lastPublished ? `更新 ${lastPublished.revision} 回目・${new Date(lastPublished.at).toLocaleTimeString("ja-JP")}・${Math.round(lastPublished.bytes / 1024)} KB・${lastPublished.ms} ms` : "最初の更新を待っています"}
              </span>
              <button
                type="button"
                disabled={!!busy}
                onClick={() =>
                  void run("end", async () => {
                    await endLive(session)
                    onSession(null)
                  })
                }
                className="ml-auto rounded-md border border-agm-line px-3 py-1 text-agm-muted hover:text-agm-ink"
                data-testid="live-end"
              >
                {busy === "end" ? "終了しています…" : "LIVE を終了（共有も解除）"}
              </button>
            </div>

            <section>
              <h3 className="mb-1 text-xs font-semibold text-agm-muted">閲覧者（{session.viewers.length} 人）</h3>
              <ul className="space-y-1" data-testid="live-viewers">
                {session.viewers.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 rounded-md bg-agm-raised px-3 py-1.5 text-sm">
                    <ShieldCheck className="size-4 text-agm-ok" aria-hidden />
                    <span className="font-semibold">{v.name}</span>
                    <span className="truncate text-xs text-agm-muted">{v.email}</span>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void run(`rm-${v.id}`, async () => onSession({ ...session, viewers: await removeViewer(session, v.id) }))}
                      className="ml-auto flex items-center gap-1 text-xs text-agm-muted hover:text-agm-danger"
                    >
                      {busy === `rm-${v.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserMinus className="size-3.5" aria-hidden />}
                      解除
                    </button>
                  </li>
                ))}
                {!session.viewers.length && <li className="text-sm text-agm-muted">まだ誰にも共有していません</li>}
              </ul>
            </section>

            <section>
              <label className="flex items-center gap-2 rounded-md border border-agm-line bg-agm-bg px-3 focus-within:border-agm-accent">
                <Search className="size-4 text-agm-muted" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="閲覧者を名前・メールで検索" className="h-10 flex-1 bg-transparent outline-none" data-testid="live-user-search" />
              </label>
              <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
                {results
                  .filter((u) => !session.viewers.some((v) => v.id === u.id))
                  .map((u) => (
                    <li key={u.id} className="flex items-center gap-2 px-3 py-1 text-sm">
                      <span>{u.name}</span>
                      <span className="truncate text-xs text-agm-muted">{u.email}</span>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => void run(`add-${u.id}`, async () => onSession({ ...session, viewers: await addViewer(session, u) }))}
                        className="ml-auto flex items-center gap-1 rounded-md border border-agm-accent px-2 py-0.5 text-xs text-agm-accent"
                        data-testid="live-add-viewer"
                      >
                        {busy === `add-${u.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <UserPlus className="size-3.5" aria-hidden />}
                        読み取りを共有
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
            <p className="text-[11px] leading-5 text-agm-muted">
              配信中はこのタブを前面に置いてください（裏に回ったタブはブラウザーが更新を間引き、閲覧側が数十秒遅れます）。
              閲覧者に必要なもの: このアプリの共有（利用者）／セキュリティ ロール「AGM 閲覧（幹部）」／Dataverse の接続（初回起動時に同意）。ロールは「LIVE 共有」をユーザー レベルで読むだけなので、共有されていない LIVE は見えません。
            </p>
          </div>
        )}
        {error && <p className="text-sm text-agm-danger">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
