export const GUIDE_STORAGE_KEY = "sales-crm-guide-seen"
export const GUIDE_OPEN_EVENT = "sales-crm:guide-open"

export const openGuide = () => window.dispatchEvent(new Event(GUIDE_OPEN_EVENT))

export const GUIDE_SLIDES = [
  { title: "目標達成を、チームで", body: "マネージャーはチームの達成状況と障害を、営業は自分の達成への道筋を、ひと目で確認できます。" },
  { title: "チーム ダッシュボード", body: "期間とチームを選ぶと、目標・受注・着地見込み・カバレッジと、要支援メンバーが表示されます。障害ボードから 1on1 や Teams での声かけをすぐに始められます。" },
  { title: "営業ホーム", body: "目標までの残りと、優先して動くべき商談・期限切れの活動を提示します。メール下書きや日程調整は Outlook / Teams で確認してから送信します。" },
  { title: "報告は Cowork に任せる", body: "「Cowork で報告」を押すと依頼文をコピーします。Cowork に貼り付けると、予定表・メール・チャットから活動を抽出し、確認後に CRM へ登録します。" },
  { title: "データはすべて Dataverse", body: "商談・リード・活動・目標は Dataverse に保存され、Cowork の Dataverse MCP と同じデータを共有します。権限は Dataverse のセキュリティ ロールに従います。" },
]
