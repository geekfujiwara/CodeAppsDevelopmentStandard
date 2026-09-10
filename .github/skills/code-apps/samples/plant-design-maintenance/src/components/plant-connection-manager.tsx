import { ExternalLink, KeyRound, Plug, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { plantConnectionManagerUrl, PLANT_CONNECTION_SERVICES, type PlantAuthenticationReason } from "@/lib/plant-agent-auth"
import "./plant-connection-manager.css"

export function PlantAuthenticationCard({ reason, pending, busy, onManage, onRetry }: {
  reason: PlantAuthenticationReason
  pending: boolean
  busy: boolean
  onManage: () => void
  onRetry: () => void
}) {
  return <section className="plant-auth-card" aria-label="接続の認証" role="status">
    <h4><KeyRound size={18} aria-hidden="true" />{reason === "consent" ? "サインインと同意が必要です" : "サインインが必要です"}</h4>
    <p>利用する接続の認証を完了してください。パスワードや認証コードをチャットに入力しないでください。</p>
    <div className="plant-connection-actions">
      <Button variant="outline" size="sm" onClick={onManage}><Plug size={15} />接続を構成</Button>
      <Button variant="ghost" size="sm" disabled={busy} onClick={onRetry}><RotateCcw size={15} />{pending ? "受付済みの結果を確認" : "接続後に再試行"}</Button>
    </div>
    {pending && <p>受付済みの要求は再送しません。接続の修復だけでは処理が再開しない場合があります。</p>}
  </section>
}

export function PlantConnectionManager({ open, onOpenChange, environmentId }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  environmentId?: string
}) {
  let url: string | undefined
  try { if (environmentId) url = plantConnectionManagerUrl(environmentId) } catch { url = undefined }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="plant-connection-manager">
      <DialogHeader>
        <DialogTitle>接続マネージャー</DialogTitle>
        <DialogDescription>ご自身のアカウントで接続を構成します。認証情報はMicrosoftの画面で入力してください。</DialogDescription>
      </DialogHeader>
      <ul className="plant-connection-list">
        {PLANT_CONNECTION_SERVICES.map(service => <li key={service.id}>
          <div><strong>{service.name}</strong><p>{service.detail}</p><small>{service.connector}</small></div>
          <span className="plant-connection-state">状態未確認</span>
        </li>)}
      </ul>
      <p className="plant-connection-note">Power Appsで対象の接続を選び、作成または再認証してください。Copilot Studioでの接続の割り当て・確認には、エージェント編集者の操作が必要な場合があります。</p>
      {url ? <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><ExternalLink size={16} />Power Appsで接続を管理</a></Button>
        : <p role="alert" className="plant-connection-note">利用者の環境を確認できません。アプリを再読み込みしてください。</p>}
      <p className="plant-connection-note">この画面では接続状態を直接取得していません。戻っただけでは認証完了になりません。要求の再試行で結果を確認してください。</p>
    </DialogContent>
  </Dialog>
}