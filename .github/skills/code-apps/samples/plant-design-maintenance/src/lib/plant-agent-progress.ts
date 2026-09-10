export type PlantAgentProgress = {
  requestId: string
  status: "pending" | "running" | "succeeded" | "failed" | "cancelled"
  checkedAt: number
  needsReconciliation: boolean
}

export function plantProgressLabel(progress?: PlantAgentProgress): string {
  if (!progress) return "利用者・選択対象と要求の受付を確認中"
  if (progress.needsReconciliation) return "実行結果の確認が必要です"
  switch (progress.status) {
    case "pending": return "受付済み・Workflowの処理開始待ち"
    case "running": return "Workflowが要求を処理中・回答待ち"
    case "succeeded": return "回答の保存を確認しました"
    case "failed": return "処理が失敗しました"
    case "cancelled": return "処理が取り消されました"
  }
}