import type { IContext } from "@microsoft/power-apps/app"

let pending: Promise<IContext | null> | null = null

/** Power Apps ホストのコンテキスト（ローカル開発時は null） */
export function getPowerContext(): Promise<IContext | null> {
  if (!pending) {
    // Power Apps は iframe でホストする。トップレベル（ローカル開発）では SDK 応答を待たない
    const hosted = (() => {
      try {
        return window.self !== window.top
      } catch {
        return true
      }
    })()
    pending = !hosted
      ? Promise.resolve(null)
      : import("@microsoft/power-apps/app")
          .then(m => Promise.race([m.getContext(), new Promise<null>(r => setTimeout(() => r(null), 3000))]))
          .catch(() => null)
  }
  return pending
}

/** 案件の内見画面を開く共有リンク。Power Apps 上では play URL + クエリ、ローカルではハッシュ URL */
export async function buildProjectLink(projectId: string, tab = "viewer"): Promise<string> {
  const ctx = await getPowerContext()
  if (ctx?.app?.appId && ctx.app.environmentId) {
    const q = new URLSearchParams({ projectId, tab })
    if (ctx.user?.tenantId) q.set("tenantId", ctx.user.tenantId)
    return `https://apps.powerapps.com/play/e/${ctx.app.environmentId}/app/${ctx.app.appId}?${q}`
  }
  return `${location.origin}${location.pathname}#/projects/${projectId}?tab=${tab}`
}

/** 共有リンクのクエリ（projectId / tab）からアプリ内ルートを求める */
export async function deepLinkTarget(): Promise<string | null> {
  const ctx = await getPowerContext()
  const params = ctx?.app?.queryParams ?? {}
  const id = params.projectId ?? params.projectid ?? params.ProjectId
  if (!id) return null
  const tab = params.tab ?? params.Tab
  return `/projects/${encodeURIComponent(id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`
}
