// プラント設計ウィザードから、画面右下に開いている AI アシスタント（Copilot Studio）へ質問を委譲する。
// 会話履歴をアシスタント側に残したまま応答本文を受け取れるように、単一のハンドラーだけを登録する。
type AskHandler = (text: string) => Promise<string>

let handler: AskHandler | null = null

export function registerPlantAgentAsk(fn: AskHandler) {
  handler = fn
  return () => { if (handler === fn) handler = null }
}

export async function askPlantAgent(text: string): Promise<string> {
  if (!handler) throw new Error("AI アシスタントが応答できません。画面右下の AI アシスタントを開き、利用できる状態か確認してください。")
  return handler(text)
}
