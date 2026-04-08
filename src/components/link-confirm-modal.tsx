/* eslint-disable react-refresh/only-export-components */
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExternalLink, AlertTriangle } from "lucide-react"

interface LinkConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  url: string
  title: string
  description?: string
}

export function LinkConfirmModal({ 
  isOpen, 
  onClose, 
  url, 
  title, 
  description 
}: LinkConfirmModalProps) {
  const handleConfirm = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-0 gap-0 max-h-[90vh] flex flex-col max-w-2xl"
      >
        {/* ヘッダー */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-primary/10 flex-shrink-0">
          <div className="flex items-start gap-4 flex-1">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <ExternalLink className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 space-y-1.5">
              <DialogTitle className="text-xl font-semibold text-foreground">
                外部リンクを開きますか？
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                以下のページに移動します。新しいタブで開かれます。
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* スクロール可能なコンテンツエリア */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-6 space-y-4">
            {/* タイトル */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span>タイトル</span>
                <Badge variant="destructive" className="text-xs">必須</Badge>
              </Label>
              <Input
                value={title}
                readOnly
                autoFocus={false}
                className="bg-muted border-border"
              />
            </div>
            
            {/* URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span>URL</span>
                <Badge variant="destructive" className="text-xs">必須</Badge>
              </Label>
              <Input
                value={url}
                readOnly
                autoFocus={false}
                className="bg-muted border-border font-mono text-xs"
              />
            </div>
            
            {/* 説明（オプション） */}
            {description && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <span>説明</span>
                  <Badge variant="outline" className="text-xs">任意</Badge>
                </Label>
                <Textarea
                  value={description}
                  readOnly
                  className="bg-muted border-border resize-none"
                  rows={3}
                />
              </div>
            )}

            {/* 警告メッセージ */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-1">
                  外部サイトへの移動について
                </p>
                <p className="text-xs text-muted-foreground">
                  外部サイトに移動します。移動先のサイトについては、リンク先の責任においてご利用ください。
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* フッター */}
        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/30 flex-shrink-0">
          <div className="flex items-center justify-end w-full gap-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="border-border hover:bg-secondary"
            >
              キャンセル
            </Button>
            <Button 
              onClick={handleConfirm}
              className="gap-2 shadow-sm hover:shadow-md transition-shadow"
            >
              <ExternalLink className="h-4 w-4" />
              開く
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// カスタムフック: リンクモーダルの管理
export function useLinkModal() {
  const [modalData, setModalData] = useState<{
    isOpen: boolean
    url: string
    title: string
    description?: string
  }>({
    isOpen: false,
    url: '',
    title: '',
    description: ''
  })

  const openModal = (url: string, title: string, description?: string) => {
    setModalData({
      isOpen: true,
      url,
      title,
      description
    })
  }

  const closeModal = () => {
    setModalData(prev => ({ ...prev, isOpen: false }))
  }

  return {
    modalData,
    openModal,
    closeModal
  }
}