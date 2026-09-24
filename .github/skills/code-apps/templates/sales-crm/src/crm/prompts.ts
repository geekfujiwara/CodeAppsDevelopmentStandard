// Cowork（Sales CRM プラグイン）に渡す依頼文。プラグインのスキル description のトリガー語と揃える。
import type { Opportunity } from "@/crm/api"

export const coworkPrompts = {
  dailyReport: "今日の予定表・送受信メール・Teams チャットから営業活動を洗い出し、CRM の活動と商談の次のアクションに反映して（登録前に一覧で確認させて）",
  weeklyReport: "今週の予定表とメールから営業報告を作って、CRM に未登録の活動だけ追加して（登録前に確認させて）",
  gapPlan: (gapText: string) => `今期の目標まであと ${gapText}。CRM のパイプラインから達成プランを作り、優先商談ごとに予定調整の候補とメール下書きを用意して（送信・予定作成は確認後）`,
  dealPlan: (o: Opportunity) => `商談「${o.name}」の直近のメール・会議・チャットを要約し、次のアクションと決裁者への打ち手を提案して。CRM の次のアクションも更新して（更新前に確認させて）`,
  managerReview: (scope: string) => `${scope}の営業目標の達成状況と障害（期限超過・停滞・次アクション未設定）をCRMから整理し、メンバーごとの1on1アジェンダと支援メッセージの下書きを作って`,
  blockerSupport: (member: string, deal: string, reason: string) => `${member}さんの商談「${deal}」で「${reason}」が起きています。関連するメール・会議・チャットを確認し、障害を取り除く支援プランと声かけの下書きを作って`,
}
