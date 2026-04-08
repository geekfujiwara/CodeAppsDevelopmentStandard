import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, Copy } from "lucide-react"
import { toast } from "sonner"

interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  description?: string
}

export function CodeBlock({ code, language = "bash", showLineNumbers = false, description }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success("コードをコピーしました")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("コピーに失敗しました")
    }
  }

  const lines = code.split("\n")
  
  const getTitle = () => {
    if (language === "text") return "プロンプト"
    if (language === "bash") return "コマンド"
    return "コード"
  }

  return (
    <div className="bg-muted p-4 rounded-md space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h5 className="font-semibold text-sm">{getTitle()}</h5>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="gap-2 h-8 hover:bg-accent"
        >
          {copied ? (
            <>
              <CheckCircle className="h-4 w-4" />
              コピー済み
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              コピー
            </>
          )}
        </Button>
      </div>
      <div className="font-mono text-sm bg-background p-3 rounded border overflow-x-auto">
        {showLineNumbers ? (
          <div className="space-y-1">
            {lines.map((line, index) => (
              <div key={index} className="flex">
                <span className="text-muted-foreground select-none mr-4 text-right w-6">
                  {index + 1}
                </span>
                <span className="whitespace-pre">{line || " "}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="whitespace-pre">{code}</div>
        )}
      </div>
    </div>
  )
}
