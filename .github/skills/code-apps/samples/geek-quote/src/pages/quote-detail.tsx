import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormModal, FormColumns } from "@/components/form-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingSkeletonList } from "@/components/loading-skeleton"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StagePath } from "@/components/stage-path"
import {
  useQuotes,
  useUpdateQuote,
  useQuoteLines,
  useCreateQuoteLine,
  useUpdateQuoteLine,
  useDeleteQuoteLine,
  useCreateInvoice,
} from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX, TAX_RATE, FEATURE_INVOICES, CODEAPPS_APP_NAME } from "@/config"
import {
  QUOTE_STAGE_PATH_ITEMS,
  QUOTE_STATUS_LOST,
  QUOTE_STATUS_WON,
  QUOTE_STATUS_LABEL,
} from "@/types/dataverse"
import {
  ArrowLeft, Plus, Pencil, Trash2, Building2, CalendarDays, Coins, Hash, Printer, Receipt,
} from "lucide-react"
import { toast } from "sonner"

const P = PUBLISHER_PREFIX

const f = {
  id:           `${P}_quoteid`,
  name:         `${P}_name`,
  quote_number: `${P}_quote_number`,
  client:       `${P}_client`,
  status:       `${P}_status`,
  issue_date:   `${P}_issue_date`,
  expiry_date:  `${P}_expiry_date`,
  subtotal:     `${P}_subtotal`,
  tax:          `${P}_tax`,
  total:        `${P}_total`,
  notes:        `${P}_notes`,
}

const l = {
  id:         `${P}_quote_lineid`,
  name:       `${P}_name`,
  quote_ref:  `${P}_quote_ref`,
  quantity:   `${P}_quantity`,
  unit_price: `${P}_unit_price`,
  amount:     `${P}_amount`,
}

const i = {
  name:           `${P}_name`,
  invoice_number: `${P}_invoice_number`,
  client:         `${P}_client`,
  quote_ref:      `${P}_quote_ref`,
  status:         `${P}_status`,
  issue_date:     `${P}_issue_date`,
  due_date:       `${P}_due_date`,
  total:          `${P}_total`,
}

type LineForm = { name: string; quantity: string; unit_price: string }
const EMPTY_LINE: LineForm = { name: "", quantity: "1", unit_price: "" }

const yen = (v: number) => v.toLocaleString("ja-JP", { style: "currency", currency: "JPY" })

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: quotes = [], isLoading } = useQuotes()
  const { data: allLines = [] } = useQuoteLines()
  const updateQuote = useUpdateQuote()
  const createLine = useCreateQuoteLine()
  const updateLine = useUpdateQuoteLine()
  const deleteLine = useDeleteQuoteLine()
  const createInvoice = useCreateInvoice()

  const [isLineFormOpen, setIsLineFormOpen] = useState(false)
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [lineForm, setLineForm] = useState<LineForm>(EMPTY_LINE)
  const [deleteLineId, setDeleteLineId] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const quote = useMemo(
    () => quotes.find(q => String(q[f.id] ?? "") === id),
    [quotes, id]
  )

  const lines = useMemo(
    () => allLines
      .filter(ln => String(ln[l.quote_ref] ?? "") === id)
      .sort((a, b) => String(a.createdon ?? "").localeCompare(String(b.createdon ?? ""))),
    [allLines, id]
  )

  const computedLineAmount = Math.round(
    parseFloat(lineForm.quantity || "0") * parseFloat(lineForm.unit_price || "0")
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">見積詳細</h1>
        <LoadingSkeletonList count={3} />
      </div>
    )
  }

  if (!quote || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/quotes")}>
          <ArrowLeft className="h-4 w-4" />見積一覧へ戻る
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>見積が見つかりません</CardTitle>
            <CardDescription>削除されたか、URL が正しくない可能性があります。</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const status = quote[f.status] as number | undefined
  const subtotal = (quote[f.subtotal] as number) ?? 0
  const tax = (quote[f.tax] as number) ?? 0
  const total = (quote[f.total] as number) ?? 0

  /** 明細行の変化後に見積の小計・消費税・合計を再計算して patch する */
  const syncTotals = async (nextLines: { amount: number }[]) => {
    const nextSubtotal = nextLines.reduce((sum, ln) => sum + ln.amount, 0)
    const nextTax = Math.round(nextSubtotal * TAX_RATE)
    await updateQuote.mutateAsync({
      id,
      data: {
        [f.subtotal]: nextSubtotal,
        [f.tax]:      nextTax,
        [f.total]:    nextSubtotal + nextTax,
      },
    })
  }

  const currentLineAmounts = () =>
    lines.map(ln => ({
      lineId: String(ln[l.id] ?? ""),
      amount: (ln[l.amount] as number) ?? 0,
    }))

  const handleStageSelect = async (value: number) => {
    try {
      await updateQuote.mutateAsync({ id, data: { [f.status]: value } })
      toast.success(`ステータスを「${(QUOTE_STATUS_LABEL as Record<number, string>)[value] ?? ""}」に変更しました`)
    } catch {
      toast.error("更新に失敗しました")
    }
  }

  const handleNewLine = () => {
    setEditingLineId(null)
    setLineForm(EMPTY_LINE)
    setIsLineFormOpen(true)
  }

  const handleEditLine = (line: Record<string, unknown>) => {
    setEditingLineId(String(line[l.id] ?? ""))
    setLineForm({
      name:       String(line[l.name] ?? ""),
      quantity:   line[l.quantity] != null ? String(line[l.quantity]) : "1",
      unit_price: line[l.unit_price] != null ? String(line[l.unit_price]) : "",
    })
    setIsLineFormOpen(true)
  }

  const handleSaveLine = async () => {
    if (!lineForm.name.trim()) {
      toast.error("品目名は必須です")
      return
    }
    const quantity = parseInt(lineForm.quantity || "0", 10)
    const unitPrice = parseFloat(lineForm.unit_price || "0")
    const amount = Math.round(quantity * unitPrice)
    const data: Record<string, unknown> = {
      [l.name]:       lineForm.name,
      [l.quote_ref]:  id,
      [l.quantity]:   quantity,
      [l.unit_price]: unitPrice,
      [l.amount]:     amount,
    }
    try {
      const amounts = currentLineAmounts()
      if (editingLineId) {
        await updateLine.mutateAsync({ id: editingLineId, data })
        await syncTotals(amounts.map(a => a.lineId === editingLineId ? { amount } : a))
        toast.success("明細を更新しました")
      } else {
        await createLine.mutateAsync(data)
        await syncTotals([...amounts, { amount }])
        toast.success("明細を追加しました")
      }
      setIsLineFormOpen(false)
    } catch {
      toast.error("保存に失敗しました")
    }
  }

  const handleDeleteLine = async () => {
    if (!deleteLineId) return
    try {
      const amounts = currentLineAmounts()
      await deleteLine.mutateAsync(deleteLineId)
      await syncTotals(amounts.filter(a => a.lineId !== deleteLineId))
      toast.success("明細を削除しました")
      setDeleteLineId(null)
    } catch {
      toast.error("削除に失敗しました")
    }
  }

  const handleCreateInvoice = async () => {
    try {
      const today = new Date()
      const due = new Date(today)
      due.setDate(due.getDate() + 30)
      await createInvoice.mutateAsync({
        [i.name]:           String(quote[f.name] ?? ""),
        [i.invoice_number]: `INV-${Date.now().toString().slice(-8)}`,
        [i.client]:         String(quote[f.client] ?? ""),
        [i.quote_ref]:      id,
        [i.status]:         100000000,
        [i.issue_date]:     today.toISOString().slice(0, 10),
        [i.due_date]:       due.toISOString().slice(0, 10),
        [i.total]:          total,
      })
      toast.success("請求を作成しました（支払期限: 30日後）")
      navigate("/invoices")
    } catch {
      toast.error("請求の作成に失敗しました")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" className="gap-1 -ml-2 mb-1" onClick={() => navigate("/quotes")}>
            <ArrowLeft className="h-4 w-4" />見積一覧へ戻る
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{String(quote[f.name] ?? "")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setIsPreviewOpen(true)}>
            <Printer className="h-4 w-4" />見積書プレビュー
          </Button>
          {FEATURE_INVOICES && status === QUOTE_STATUS_WON && (
            <Button className="gap-2" onClick={handleCreateInvoice} disabled={createInvoice.isPending}>
              <Receipt className="h-4 w-4" />請求を作成
            </Button>
          )}
        </div>
      </div>

      {/* サマリーヘッダー + 矢羽 */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-start gap-2">
              <Hash className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">見積番号</div>
                <div className="truncate text-sm font-medium font-mono">{String(quote[f.quote_number] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">取引先</div>
                <div className="truncate text-sm font-medium">{String(quote[f.client] ?? "—")}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Coins className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">合計金額（税込）</div>
                <div className="truncate text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {yen(total)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">発行日 / 有効期限</div>
                <div className="truncate text-sm font-medium">
                  {String(quote[f.issue_date] ?? "—")} / {String(quote[f.expiry_date] ?? "—")}
                </div>
              </div>
            </div>
          </div>

          {/* ステータス矢羽 */}
          <div className="mt-4 border-t pt-4">
            <StagePath
              stages={QUOTE_STAGE_PATH_ITEMS}
              current={status}
              negativeValue={QUOTE_STATUS_LOST}
              onSelect={handleStageSelect}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              矢羽をクリックするとステータスを変更できます
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 明細 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">明細</CardTitle>
              <CardDescription>{lines.length} 行（金額は自動計算されます）</CardDescription>
            </div>
            <Button size="sm" className="gap-1" onClick={handleNewLine}>
              <Plus className="h-3.5 w-3.5" />明細を追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>品目名</TableHead>
                  <TableHead className="text-right">数量</TableHead>
                  <TableHead className="text-right">単価</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      明細がありません。「明細を追加」から登録してください
                    </TableCell>
                  </TableRow>
                ) : (
                  lines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{String(line[l.name] ?? "")}</TableCell>
                      <TableCell className="text-right">{String(line[l.quantity] ?? "")}</TableCell>
                      <TableCell className="text-right">{yen((line[l.unit_price] as number) ?? 0)}</TableCell>
                      <TableCell className="text-right">{yen((line[l.amount] as number) ?? 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEditLine(line)}
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteLineId(String(line[l.id] ?? ""))}
                            title="削除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* 合計 */}
          <div className="flex justify-end px-6 py-4">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">小計</span>
                <span>{yen(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">消費税（{Math.round(TAX_RATE * 100)}%）</span>
                <span>{yen(tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>合計（税込）</span>
                <span className="text-emerald-600 dark:text-emerald-400">{yen(total)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 備考 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">備考</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">
            {String(quote[f.notes] ?? "") || <span className="text-muted-foreground">（未入力）</span>}
          </p>
        </CardContent>
      </Card>

      {/* 明細フォーム */}
      <FormModal
        open={isLineFormOpen}
        onOpenChange={setIsLineFormOpen}
        title={editingLineId ? "明細編集" : "明細追加"}
        onSave={handleSaveLine}
        isSaving={createLine.isPending || updateLine.isPending || updateQuote.isPending}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="line_name">品目名 <span className="text-destructive">*</span></Label>
            <Input
              id="line_name"
              value={lineForm.name}
              onChange={e => setLineForm(p => ({ ...p, name: e.target.value }))}
              placeholder="品目・サービス名"
            />
          </div>
          <FormColumns columns={2}>
            <div className="space-y-1.5">
              <Label htmlFor="line_quantity">数量</Label>
              <Input
                id="line_quantity"
                type="number"
                min={0}
                value={lineForm.quantity}
                onChange={e => setLineForm(p => ({ ...p, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="line_unit_price">単価</Label>
              <Input
                id="line_unit_price"
                type="number"
                min={0}
                step="1"
                value={lineForm.unit_price}
                onChange={e => setLineForm(p => ({ ...p, unit_price: e.target.value }))}
                placeholder="0"
              />
            </div>
          </FormColumns>
          <div className="space-y-1.5">
            <Label>金額 <span className="text-muted-foreground text-xs">(自動計算)</span></Label>
            <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/50 text-sm">
              {yen(computedLineAmount)}
            </div>
          </div>
        </div>
      </FormModal>

      {/* 明細削除確認 */}
      <ConfirmDialog
        open={!!deleteLineId}
        onOpenChange={open => { if (!open) setDeleteLineId(null) }}
        title="明細を削除しますか？"
        description="この操作は取り消せません。明細を削除し、見積金額を再計算します。"
        confirmLabel="削除"
        variant="destructive"
        onConfirm={handleDeleteLine}
      />

      {/* 見積書プレビュー */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">見積書プレビュー</DialogTitle>
          </DialogHeader>
          <div className="bg-white text-gray-900 p-8 rounded-md border">
            <h2 className="text-center text-2xl font-bold tracking-[0.5em] mb-8">見積書</h2>
            <div className="flex justify-between items-start mb-8">
              <div>
                <p className="text-lg font-semibold border-b border-gray-400 pb-1 pr-8">
                  {String(quote[f.client] ?? "") || "（取引先未設定）"} 御中
                </p>
                <p className="text-xs text-gray-500 mt-2">下記の通りお見積り申し上げます。</p>
              </div>
              <div className="text-right text-sm space-y-0.5">
                <p>見積番号: <span className="font-mono">{String(quote[f.quote_number] ?? "—")}</span></p>
                <p>発行日: {String(quote[f.issue_date] ?? "—")}</p>
                <p>有効期限: {String(quote[f.expiry_date] ?? "—")}</p>
                <p className="pt-2 font-medium">{CODEAPPS_APP_NAME}</p>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm text-gray-500">お見積金額（税込）</p>
              <p className="text-3xl font-bold border-b-2 border-gray-800 inline-block pr-12 pb-1">
                {yen(total)}
              </p>
            </div>
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="bg-gray-100 border-y border-gray-300">
                  <th className="text-left py-2 px-2">品目</th>
                  <th className="text-right py-2 px-2 w-[70px]">数量</th>
                  <th className="text-right py-2 px-2 w-[110px]">単価</th>
                  <th className="text-right py-2 px-2 w-[120px]">金額</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-2 px-2">{String(line[l.name] ?? "")}</td>
                    <td className="py-2 px-2 text-right">{String(line[l.quantity] ?? "")}</td>
                    <td className="py-2 px-2 text-right">{yen((line[l.unit_price] as number) ?? 0)}</td>
                    <td className="py-2 px-2 text-right">{yen((line[l.amount] as number) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end mb-6">
              <div className="w-56 text-sm space-y-1">
                <div className="flex justify-between"><span>小計</span><span>{yen(subtotal)}</span></div>
                <div className="flex justify-between"><span>消費税（{Math.round(TAX_RATE * 100)}%）</span><span>{yen(tax)}</span></div>
                <div className="flex justify-between border-t border-gray-400 pt-1 font-bold"><span>合計</span><span>{yen(total)}</span></div>
              </div>
            </div>
            {String(quote[f.notes] ?? "") && (
              <div className="text-sm">
                <p className="font-medium border-b border-gray-300 mb-1 pb-0.5">備考</p>
                <p className="whitespace-pre-wrap text-gray-700">{String(quote[f.notes])}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PDF 化してメール送信するには Power Automate 連携（mail-pdf パターン）を利用します。詳細はサンプル README を参照してください。
          </p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
