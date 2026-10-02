// 設定の型と、重ね方・出どころ・許可リストでの補正（画面・通信に依存しない純粋関数）

export type SttEngine = "azure" | "mai" | "compare"

export interface ModelSetting {
  deployment: string
  reasoningEffort: string
  maxTokens: number
}

export interface AppSettings {
  stt: { engine: SttEngine; endpointId: string; model: string; style: "verbatim" | "clean"; phrases: boolean }
  answer: ModelSetting
  identify: ModelSetting
}

export const INITIAL_SETTINGS: AppSettings = {
  stt: { engine: "azure", endpointId: "mai", model: "MAI-Transcribe-2", style: "verbatim", phrases: true },
  answer: { deployment: "", reasoningEffort: "none", maxTokens: 1200 },
  identify: { deployment: "", reasoningEffort: "none", maxTokens: 300 },
}

export interface RemoteConfig {
  deployments: string[]
  defaultDeployment: string | null
  efforts: string[]
  defaultEffort: string
  limits: { answer: { min: number; max: number; default: number }; identify: { min: number; max: number; default: number } }
  stt: { id: string; label: string; region: string; models: string[] }[]
  realtime: { region: string }
}

type Partial2<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] }
export type SettingsPatch = Partial2<AppSettings>
export type Source = "initial" | "org" | "local"

/** 2 段の入れ子だけを重ねる（設定は section → 値 の形） */
export function mergeSettings(...layers: SettingsPatch[]): AppSettings {
  const out = structuredClone(INITIAL_SETTINGS) as unknown as Record<string, Record<string, unknown>>
  for (const layer of layers)
    for (const [section, values] of Object.entries(layer ?? {}))
      if (values && typeof values === "object" && out[section]) Object.assign(out[section], Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== "")))
  return out as unknown as AppSettings
}

/** 項目ごとに、どの層の値が効いているか */
export function sourceOf(section: keyof AppSettings, key: string, org: SettingsPatch, local: SettingsPatch): Source {
  const has = (p: SettingsPatch) => {
    const v = (p[section] as Record<string, unknown> | undefined)?.[key]
    return v !== undefined && v !== ""
  }
  return has(local) ? "local" : has(org) ? "org" : "initial"
}

/** 許可リストに無い値（Function 側で外されたデプロイなど）は既定に戻す */
export function sanitize(s: AppSettings, config?: RemoteConfig): AppSettings {
  if (!config) return s
  const fix = (m: ModelSetting, kind: "answer" | "identify"): ModelSetting => {
    const limit = config.limits[kind]
    return {
      deployment: config.deployments.includes(m.deployment) ? m.deployment : config.defaultDeployment ?? "",
      reasoningEffort: config.efforts.includes(m.reasoningEffort) ? m.reasoningEffort : config.defaultEffort,
      maxTokens: Math.min(limit.max, Math.max(limit.min, Number(m.maxTokens) || limit.default)),
    }
  }
  const endpoint = config.stt.find((e) => e.id === s.stt.endpointId) ?? config.stt.find((e) => e.models.some((m) => m.startsWith("MAI")))
  const model = endpoint?.models.includes(s.stt.model) ? s.stt.model : endpoint?.models.find((m) => m.startsWith("MAI")) ?? s.stt.model
  return { ...s, stt: { ...s.stt, endpointId: endpoint?.id ?? s.stt.endpointId, model }, answer: fix(s.answer, "answer"), identify: fix(s.identify, "identify") }
}

