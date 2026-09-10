import { selectionKey, type PlantAgentSelection } from "./plant-agent-contract.ts"

export type PlantAgentActivity = "overview" | "drawings" | "failures" | "maintenance" | "evidence"
export type PlantAgentQuickReply = { title: string; text: string }

export function isPlantImageQuestion(selection: PlantAgentSelection, question: string): boolean {
  return plantAgentQuickReplies(selection).groups.find(group => group.id === "drawings")?.replies
    .some(reply => reply.title === "図面画像" && reply.text === question.trim()) ?? false
}

export function plantAgentQuickReplies(selection: PlantAgentSelection, activity?: PlantAgentActivity) {
  const target = selection.nodeId ? selection.partId ? "選択中の部品" : "選択中の設備" : "この3D図面の設備全体"
  const reply = (title: string, question: string): PlantAgentQuickReply => ({ title, text: `${target}について、${question} 根拠は権限内の検証済み資料に限定し、出典と未確認事項を明示してください。` })
  const groups: { id: PlantAgentActivity; title: string; replies: PlantAgentQuickReply[] }[] = [
    { id: "overview", title: selection.nodeId ? "対象" : "全体", replies: [
      reply("役割と構成", "役割・構成・関連設備を整理してください。"),
      reply("設計意図", "設計意図と採用条件を説明してください。"),
      reply("重要な条件", "運用上重要な設計条件と制約を列挙してください。"),
      reply("関連資料", "関連する図面・設計文書・故障履歴を種類別に整理してください。"),
      reply("確認の優先度", "追加確認が必要な事項を、根拠と優先度付きで整理してください。"),
      reply("問い合わせ整理", "担当者へ確認すべき質問を、既知の事実と不明点に分けて下書きしてください。送信はしないでください。"),
    ] },
    { id: "drawings", title: "図面", replies: [
      reply("図面画像", "対応する図面のページ画像を表示してください。図面番号・改訂・ページを短く示してください。画像を取得できない場合は明示し、Base64は回答本文に含めないでください。"),
      reply("図面の要点", "対応する図面の主要な仕様と注記を図面番号・改訂・ページ付きで要約してください。"),
      reply("設計条件", "設計書に記載された温度・圧力・材質などの条件を整理してください。"),
      reply("図面と設計書", "図面と設計書に記載された条件を比較してください。"),
      reply("改訂を確認", "参照可能な資料の改訂と適用対象を確認し、改訂違いが不明なら明示してください。"),
      reply("寸法と接続", "資料に記載された寸法・接続仕様を単位付きで整理してください。欠けた値は推測しないでください。"),
      reply("不足する資料", "調査に必要だが参照できていない図面・設計書と、その確認目的を示してください。"),
    ] },
    { id: "failures", title: "故障", replies: [
      reply("過去の故障", "故障履歴と実施済み対策を故障ID付きで整理してください。"),
      reply("繰り返し故障", "繰り返し発生している故障と共通点を整理してください。"),
      reply("未解決の事象", "参照できる履歴から未解決の事象を抽出し、状態が不明なものとは分けてください。"),
      reply("原因と推測", "記録にある原因と未検証の仮説を明確に分けて整理してください。"),
      reply("対策の結果", "実施済み対策とその後の再発状況を整理し、効果が不明な場合は断定しないでください。"),
      reply("時系列で整理", "故障・修理・再発の経緯を記録された日時順に並べてください。"),
    ] },
    { id: "maintenance", title: "保守", replies: [
      reply("点検の観点", "資料と故障履歴を根拠に点検時の確認事項を整理してください。安全や法規への適合を保証しないでください。"),
      reply("交換前の確認", "部品交換前に担当者が確認すべき仕様・資料・不足条件を整理してください。"),
      reply("再発防止", "既存の対策と未検証の再発防止案を区別して整理してください。"),
      reply("停止時の準備", "停止点検の計画に必要な情報を整理してください。操作手順は生成せず、不明な条件を質問してください。"),
      reply("保守の優先度", "故障実績と記録された影響を基に、保守検討の優先度と判断できない事項を示してください。"),
      reply("引き継ぎメモ", "確認済み事項・未解決事項・参照資料をまとめた保守引き継ぎメモを下書きしてください。保存や共有はしないでください。"),
    ] },
    { id: "evidence", title: "根拠比較", replies: [
      reply("設計と故障", "設計条件と故障実績に矛盾や差異がないか比較してください。"),
      reply("根拠を一覧", "判断の根拠となる主張・参照資料・該当箇所を表にしてください。"),
      reply("事実と未確認", "確認済み事実・仮説・資料不足を分けてください。"),
      reply("記録の食い違い", "参照可能な資料間の条件や事象の食い違いを示し、結論を推測で補わないでください。"),
      reply("追加の調査", "現時点で結論を出せない点と、追加確認する資料・担当者への質問を整理してください。"),
      reply("調査を要約", "調査結果・根拠・制約・次の確認事項を短くまとめてください。"),
    ] },
  ]
  return {
    contextKey: JSON.stringify([selectionKey(selection), activity ?? null]),
    activeGroup: activity ?? (selection.partId && selection.nodeId ? "failures" : "overview"),
    groups,
  }
}