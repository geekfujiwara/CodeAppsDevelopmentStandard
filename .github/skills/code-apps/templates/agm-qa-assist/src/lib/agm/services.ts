// 生成サービス（npx pa app add data-source で src/generated/services に作られる）を遅延で解決する。
// 静的に import すると、データソースを追加する前の初回ビルド（scaffold 直後）が型エラーで止まるため、
// import.meta.glob で見つかったものだけを読み込む。見つからないときは失敗の結果を返し、画面に追加手順を出す。
// カスタム コネクタのサービスは名前が環境ごとに違う（表示名から作られる）ため、操作名で探す。

export interface OperationResult<T = Record<string, unknown>> {
  success: boolean
  data?: T
  error?: unknown
}

type Method = (...args: unknown[]) => Promise<OperationResult>
type ServiceClass = Record<string, Method>
type Loader = () => Promise<Record<string, unknown>>

const modules = import.meta.glob("../../generated/services/*Service.ts") as Record<string, Loader>

const missing = (label: string, hint: string): OperationResult => ({
  success: false,
  error: new Error(`${label} のデータソースがアプリに追加されていません（${hint}）`),
})

async function classOf(loader: Loader): Promise<ServiceClass | null> {
  const mod = await loader()
  const cls = Object.values(mod).find((v) => typeof v === "function")
  return (cls as unknown as ServiceClass) ?? null
}

/** ファイル名で選ぶ（Dataverse・SharePoint）、または操作名で探す（カスタム コネクタ） */
function lazy(label: string, hint: string, pick: (file: string) => boolean, method?: string): Record<string, Method> {
  let cached: Promise<ServiceClass | null> | null = null
  const resolve = () =>
    (cached ??= (async () => {
      for (const [file, loader] of Object.entries(modules)) {
        if (!pick(file)) continue
        const cls = await classOf(loader)
        if (cls && (!method || typeof cls[method] === "function")) return cls
      }
      return null
    })())
  return new Proxy({} as Record<string, Method>, {
    get: (_target, name: string) => async (...args: unknown[]) => {
      const cls = await resolve()
      if (!cls || typeof cls[name] !== "function") return missing(label, hint)
      return cls[name](...args)
    },
  })
}

const known = (file: string) => /\/(MicrosoftDataverse|SharePoint)Service\.ts$/.test(file)

/** 追加済みの生成サービスがあるか（開始ボタンの無効化・案内に使う） */
export const hasService = (pattern: RegExp) => Object.keys(modules).some((f) => pattern.test(f))

export const MicrosoftDataverseService = lazy("Dataverse", "add_data_source.py --connector dataverse", (f) => f.endsWith("/MicrosoftDataverseService.ts"))
export const SharePointService = lazy("SharePoint", "add_data_source.py --connector sharepoint --as action", (f) => f.endsWith("/SharePointService.ts"))
/** トークン発行・生成チケットのカスタム コネクタ（GetAnswerTicket を持つサービス） */
export const AGMSpeechTokenBrokerService = lazy("トークン発行のカスタム コネクタ", "custom-connector スキルで接続してデータソースに追加", (f) => !known(f), "GetAnswerTicket")
