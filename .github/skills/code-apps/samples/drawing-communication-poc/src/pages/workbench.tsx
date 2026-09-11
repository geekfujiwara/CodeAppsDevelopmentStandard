import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Download, FileDown, Save, Undo2 } from "lucide-react"
import { DrawingCanvas } from "@/components/drawing/drawing-canvas"
import { DesignPanel } from "@/components/drawing/design-panel"
import { AnnotationPanel } from "@/components/drawing/annotation-panel"
import { ConversationPanel } from "@/components/drawing/conversation-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AnnotationSeverity } from "@/drawing/drawing-schema"
import { hashDrawing } from "@/drawing/drawing-schema"
import { createAnnotation, nextAnnotationId } from "@/drawing/drawing-factory"
import { downloadBlob, downloadSvg, exportPdf } from "@/drawing/drawing-export"
import { useWorkspace } from "@/state/workspace-context"
import { createDrawingRepository } from "@/services/drawing-backend"

export default function WorkbenchPage() {
  const { state, dispatch } = useWorkspace()
  const drawing = state.drawing
  const repository = useMemo(() => createDrawingRepository(), [])
  const [pickMode, setPickMode] = useState(true)
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState({ title: "", body: "", severity: "minor" as AnnotationSeverity })
  const [exporting, setExporting] = useState(false)

  const fileBase = `${drawing.titleBlock.drawingNumber || "drawing"}-rev${drawing.revision}`

  const handleSaveRevision = async () => {
    try {
      const result = await repository.appendRevision({ drawing, hash: hashDrawing(drawing), note: "ワークベンチから保存" })
      dispatch({ type: "save-revision", note: repository.kind === "local" ? "ローカル下書き" : "共有保存", savedAt: result.savedAt })
      toast.success(result.shared ? "共有保存しました" : "ローカル下書きに改訂を記録しました（共有保存ではありません）")
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const handleExportPdf = async () => {
    setExporting(true)
    try {
      const blob = await exportPdf(drawing)
      downloadBlob(blob, `${fileBase}.pdf`)
      toast.success("PDF を書き出しました（A3 ラスター）")
    } catch (error) {
      toast.error(`PDF を生成できませんでした: ${(error as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold [overflow-wrap:anywhere]">
            {drawing.titleBlock.drawingNumber} {drawing.titleBlock.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="max-w-full break-words">
              Rev.{drawing.revision}
            </Badge>
            <Badge variant="outline" className="max-w-full break-words">
              編集 v{state.version}
            </Badge>
            <span className="font-mono [overflow-wrap:anywhere]">hash {hashDrawing(drawing)}</span>
            <span className="[overflow-wrap:anywhere]">{repository.label}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" data-tour="workbench-toolbar">
          <Button variant="outline" disabled={state.undo.length === 0} onClick={() => dispatch({ type: "undo" })}>
            <Undo2 className="mr-1 h-4 w-4" />
            元に戻す（{state.undo.length}）
          </Button>
          <Button variant="outline" onClick={() => void handleSaveRevision()}>
            <Save className="mr-1 h-4 w-4" />
            改訂を保存
          </Button>
          <Button variant="outline" onClick={() => downloadSvg(drawing, `${fileBase}.svg`)}>
            <Download className="mr-1 h-4 w-4" />
            SVG
          </Button>
          <Button variant="outline" disabled={exporting} onClick={() => void handleExportPdf()}>
            <FileDown className="mr-1 h-4 w-4" />
            {exporting ? "生成中…" : "PDF"}
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={pickMode} onCheckedChange={(checked) => setPickMode(checked === true)} />
            図面をクリックして注釈を追加する
          </label>
          <DrawingCanvas
            drawing={drawing}
            selectedAnnotationId={state.selectedAnnotationId}
            onSelectAnnotation={(id) => dispatch({ type: "select-annotation", id })}
            onPickPoint={pickMode ? (point) => setPendingPoint(point) : null}
          />
          <p className="text-xs text-muted-foreground">
            図形は寸法パラメーターから生成した検討用の作図です。干渉・強度・法規は評価していません。
          </p>
        </div>

        <div className="min-w-0">
          <Tabs defaultValue="design">
            <TabsList className="w-full">
              <TabsTrigger value="design" className="flex-1">
                寸法・表題欄
              </TabsTrigger>
              <TabsTrigger value="annotations" className="flex-1">
                注釈（{drawing.annotations.length}）
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex-1">
                依頼
              </TabsTrigger>
            </TabsList>
            <TabsContent value="design" className="mt-3">
              <DesignPanel />
            </TabsContent>
            <TabsContent value="annotations" className="mt-3">
              <AnnotationPanel />
            </TabsContent>
            <TabsContent value="chat" className="mt-3">
              <ConversationPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog
        open={pendingPoint !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingPoint(null)
            setDraft({ title: "", body: "", severity: "minor" })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>注釈を追加</DialogTitle>
            <DialogDescription>
              位置 X {pendingPoint?.x ?? 0} mm / Y {pendingPoint?.y ?? 0} mm（用紙座標）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-annotation-title">見出し</Label>
              <Input
                id="new-annotation-title"
                maxLength={120}
                value={draft.title}
                placeholder="通路幅を確認"
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-annotation-body">本文</Label>
              <Textarea
                id="new-annotation-body"
                rows={3}
                maxLength={400}
                value={draft.body}
                placeholder="確認してほしいことを書く"
                onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>重要度</Label>
              <Select value={draft.severity} onValueChange={(value) => setDraft((current) => ({ ...current, severity: value as AnnotationSeverity }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">情報</SelectItem>
                  <SelectItem value="minor">軽微</SelectItem>
                  <SelectItem value="major">重大</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingPoint(null)
                setDraft({ title: "", body: "", severity: "minor" })
              }}
            >
              キャンセル
            </Button>
            <Button
              disabled={draft.title.trim() === "" || pendingPoint === null}
              onClick={() => {
                if (!pendingPoint) return
                dispatch({
                  type: "add-annotation",
                  annotation: createAnnotation({
                    id: nextAnnotationId(drawing.annotations),
                    title: draft.title.trim(),
                    body: draft.body.trim(),
                    severity: draft.severity,
                    at: pendingPoint,
                  }),
                })
                setPendingPoint(null)
                setDraft({ title: "", body: "", severity: "minor" })
                toast.success("注釈を追加しました")
              }}
            >
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
