import { useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { deepLinkTarget } from "@/lib/power-context"

/** 共有リンク（play URL の ?projectId=...&tab=...）から案件画面へ遷移する */
export function DeepLinkRedirect() {
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    deepLinkTarget().then(t => !cancelled && setTarget(t))
    return () => {
      cancelled = true
    }
  }, [])
  if (target === undefined) return null
  return <Navigate to={target ?? "/dashboard"} replace />
}
