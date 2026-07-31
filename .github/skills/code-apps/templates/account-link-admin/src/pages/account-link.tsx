import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  useAccountSearch,
  useContact,
  useLinkContact,
  useLinkRequests,
  useRejectLinkRequest,
} from "@/hooks/use-account-link"
import type { LinkRequest } from "@/services/account-link-service"

export default function AccountLinkAdminPage() {
  const [selected, setSelected] = useState<LinkRequest | null>(null)
  const [keyword, setKeyword] = useState("")
  const [accountId, setAccountId] = useState<string>("")
  const [note, setNote] = useState("")

  const requests = useLinkRequests(true)
  const contact = useContact(selected?.contactId ?? null)
  const accounts = useAccountSearch(keyword)
  const link = useLinkContact()
  const reject = useRejectLinkRequest()

  const accountOptions = useMemo(
    () => (accounts.data ?? []).map((a) => ({ value: a.accountid, label: a.name ?? a.accountid })),
    [accounts.data],
  )

  const select = (request: LinkRequest) => {
    setSelected(request)
    setAccountId("")
    setNote("")
  }

  const handleLink = async () => {
    if (!selected?.contactId || !accountId) return
    try {
      await link.mutateAsync({
        requestId: selected.id,
        contactId: selected.contactId,
        accountId,
        note,
      })
      toast.success("取引先企業を紐づけました")
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "紐づけに失敗しました")
    }
  }

  const handleReject = async () => {
    if (!selected) return
    if (!note.trim()) {
      toast.error("却下理由を入力してください")
      return
    }
    try {
      await reject.mutateAsync({ requestId: selected.id, reason: note })
      toast.success("依頼を却下しました")
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "却下に失敗しました")
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle>紐づけ依頼（未対応）</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>依頼日時</TableHead>
                <TableHead>依頼者</TableHead>
                <TableHead>申告された会社名</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(requests.data ?? []).map((r) => (
                <TableRow
                  key={r.id}
                  onClick={() => select(r)}
                  className={selected?.id === r.id ? "bg-muted cursor-pointer" : "cursor-pointer"}
                >
                  <TableCell>{r.createdOn ? new Date(r.createdOn).toLocaleString() : "-"}</TableCell>
                  <TableCell>{r.contactName ?? "-"}</TableCell>
                  <TableCell>{r.requestedCompany ?? "-"}</TableCell>
                </TableRow>
              ))}
              {!requests.isLoading && (requests.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>未対応の依頼はありません</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>紐づけ操作</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-muted-foreground text-sm">左の一覧から依頼を選択してください。</p>
          ) : (
            <>
              <div className="space-y-1 text-sm">
                <div>氏名: {contact.data?.fullname ?? "-"}</div>
                <div>メール: {contact.data?.emailaddress1 ?? "-"}</div>
                <div>現在の取引先企業: {contact.data?.accountName ?? "未設定"}</div>
                <div>申告された会社名: {selected.requestedCompany ?? "-"}</div>
              </div>

              <p className="text-muted-foreground text-xs">
                申告された会社名は自己申告です。正規の名簿と突き合わせてから紐づけてください。
              </p>

              <div className="space-y-2">
                <Label htmlFor="account-search">取引先企業を検索</Label>
                <Input
                  id="account-search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="会社名の一部を入力"
                />
                <Combobox
                  options={accountOptions}
                  value={accountId}
                  onValueChange={setAccountId}
                  placeholder="取引先企業を選択"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">メモ / 却下理由</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleLink} disabled={!accountId || link.isPending}>
                  {link.isPending ? "処理中..." : "紐づける"}
                </Button>
                <Button variant="outline" onClick={handleReject} disabled={reject.isPending}>
                  却下
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
