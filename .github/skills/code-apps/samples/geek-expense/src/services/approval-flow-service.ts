import { getClient } from "@microsoft/power-apps"
import { dataSourcesInfo } from "@/lib/dataSourcesInfo"

function client() {
  return getClient(dataSourcesInfo)
}

// Trigger approval notification flow
// Requires: pac code add-data-source -a logicflows -t {FLOW_WORKFLOW_ID}
// env var: FLOW_WORKFLOW_ID (CONNREF_OUTLOOK for the Outlook connection reference)
export async function triggerApprovalNotification(params: {
  expenseId: string
  expenseTitle: string
  amount: number
  submittedBy: string
}): Promise<{ success: boolean; message: string }> {
  const result = await client().executeAsync("NotifyApproval", {
    expense_id:    params.expenseId,
    expense_title: params.expenseTitle,
    amount:        String(params.amount),
    submitted_by:  params.submittedBy,
  })
  if (!result.success) return { success: false, message: "承認通知フローの実行に失敗しました" }
  return { success: true, message: "承認依頼を送信しました" }
}
