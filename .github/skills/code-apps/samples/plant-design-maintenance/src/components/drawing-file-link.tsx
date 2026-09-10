import { useState } from "react"
import { Copy, ExternalLink, FileText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DRAWING_FILE_BASE_URL } from "@/config"

type Props = {
  /** Dataverse の fileurl 列に入っている Azure Files の相対パス。 */
  path: string | null | undefined
  /** パスが未設定のときに出す文言 */
  emptyLabel?: string
}

function fileName(path: string): string {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

/** 相対パスを開ける URL に変換する。基点 URL が未設定なら null（＝リンクにしない）。 */
export function toFileUrl(path: string): string | null {
  if (!DRAWING_FILE_BASE_URL) return null
  const base = DRAWING_FILE_BASE_URL.endsWith("/") ? DRAWING_FILE_BASE_URL : `${DRAWING_FILE_BASE_URL}/`
  const rel = path.replace(/^\/+/, "")
  // パスにマルチバイトや空白が入っても壊れないようセグメント単位でエンコードする
  return base + rel.split("/").map(encodeURIComponent).join("/")
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Code Apps は cross-origin iframe で動くため clipboard API が拒否されることがある
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement("textarea")
      el.value = text
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand("copy")
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * 図面・文書ファイルの在り処を「開けるリンク」として見せる。
 *
 * 実体は Azure Files にあり、Code Apps の CSP は connect-src: 'none' なので
 * アプリ内に埋め込んで表示することはしない。別タブで開くリンクとパスのコピーに割り切る。
 */
export function DrawingFileLink({ path, emptyLabel = "ファイルパス未設定" }: Props) {
  const [copied, setCopied] = useState(false)

  if (!path) {
    return <p className="mt-1 text-xs text-muted-foreground">{emptyLabel}</p>
  }

  const url = toFileUrl(path)

  const handleCopy = async () => {
    const ok = await copyToClipboard(url ?? path)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      toast.success("パスをコピーしました")
    } else {
      toast.error("コピーできませんでした。パスを手動で選択してください。")
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-medium [overflow-wrap:anywhere]">{fileName(path)}</span>
      <span className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{path}</span>
      <div className="ml-auto flex items-center gap-1">
        {url && (
          <Button asChild variant="outline" size="sm" className="h-7 px-2">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              開く
            </a>
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy}>
          <Copy className="mr-1 h-3.5 w-3.5" />
          {copied ? "コピー済" : "パスをコピー"}
        </Button>
      </div>
    </div>
  )
}
