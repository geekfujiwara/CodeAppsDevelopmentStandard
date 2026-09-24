import { useState } from "react"
import { Bot, Copy } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

interface CoworkButtonProps {
  prompt: string
  label?: string
  variant?: "default" | "outline" | "secondary" | "ghost"
  size?: "default" | "sm"
}

// Code Apps の iframe ではクリップボード API が拒否される場合があるため、依頼文を必ず画面にも表示する
export function CoworkButton({ prompt, label = "Cowork に依頼", variant = "outline", size = "sm" }: CoworkButtonProps) {
  const [open, setOpen] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success("依頼文をコピーしました。Cowork に貼り付けてください")
    } catch {
      toast.info("依頼文を選択してコピーしてください")
    }
  }
  return (
    <>
      <Button variant={variant} size={size} onClick={() => { setOpen(true); void copy() }}>
        <Bot className="h-4 w-4" />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cowork への依頼文</DialogTitle>
            <DialogDescription>Microsoft 365 Copilot の Cowork に貼り付けてください。CRM への登録やメール送信は、Cowork が確認を求めてから実行します。</DialogDescription>
          </DialogHeader>
          <Textarea readOnly rows={5} value={prompt} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void copy()}><Copy className="h-4 w-4" />コピー</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
