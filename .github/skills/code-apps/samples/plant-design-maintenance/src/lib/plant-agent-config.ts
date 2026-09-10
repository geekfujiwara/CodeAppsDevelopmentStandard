// Code Apps サイドバー AI アシスタントが呼ぶ v1 エージェント（Standard harness）のスキーマ名。
export const PLANT_AGENT_SCHEMA = import.meta.env.VITE_PLANT_AGENT_SCHEMA?.trim() ?? ""
export const PLANT_AGENT_RETRIEVAL_READY = import.meta.env.VITE_FEATURE_RETRIEVAL === "true"

export const PLANT_DESIGN_COPILOT_ENVIRONMENT = import.meta.env.VITE_PLANT_DESIGN_COPILOT_ENVIRONMENT?.trim() ?? ""
export const PLANT_DESIGN_COPILOT_SCHEMA = import.meta.env.VITE_PLANT_DESIGN_COPILOT_SCHEMA?.trim() ?? ""

export const PLANT_AGENT_QUICK_REPLIES = [
  { title: "設計意図", text: "この部品の設計意図を、図面と設計書の出典付きで示してください。" },
  { title: "過去の故障", text: "この部品の故障と対策を、再発の有無も含めて示してください。" },
  { title: "根拠の比較", text: "設計条件と故障実績の矛盾、不足している資料を示してください。" },
] as const
