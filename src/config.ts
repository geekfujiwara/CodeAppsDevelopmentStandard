export type CodeAppsNavItemConfig = {
  label: string
  path: string
  iconKey?: string
}

export type CodeAppsNavSectionConfig = {
  category: string
  items: CodeAppsNavItemConfig[]
}

const defaultNavSections: CodeAppsNavSectionConfig[] = [
  {
    category: "概況",
    items: [
      { label: "ダッシュボード", path: "dashboard", iconKey: "dashboard" },
      { label: "テリトリー", path: "territory", iconKey: "territory" },
    ],
  },
  {
    category: "顧客・商談",
    items: [
      { label: "顧客", path: "customers", iconKey: "customers" },
      { label: "商談", path: "opportunities", iconKey: "opportunities" },
      { label: "パイプライン", path: "pipeline", iconKey: "pipeline" },
    ],
  },
  {
    category: "活動",
    items: [{ label: "活動履歴", path: "activities", iconKey: "activities" }],
  },
  {
    category: "インシデント",
    items: [{ label: "インシデント", path: "incidents", iconKey: "incidents" }],
  },
]

function parseJsonEnv<T>(key: string, fallback: T): T {
  const value = import.meta.env[key as keyof ImportMetaEnv]

  if (typeof value !== "string" || value.trim() === "") {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch (error) {
    console.warn(`[config] Failed to parse ${key}:`, error)
    return fallback
  }
}

export const CODEAPPS_APP_NAME =
  import.meta.env.VITE_CODEAPPS_APP_NAME?.trim() || "Code Apps"

export const CODEAPPS_APP_SUBTITLE =
  import.meta.env.VITE_CODEAPPS_APP_SUBTITLE?.trim() || ""

export const CODEAPPS_DOCUMENT_TITLE =
  import.meta.env.VITE_CODEAPPS_DOCUMENT_TITLE?.trim() || CODEAPPS_APP_NAME

export const CODEAPPS_THEME_STORAGE_KEY =
  import.meta.env.VITE_CODEAPPS_THEME_STORAGE_KEY?.trim() || "app-theme"

export const CODEAPPS_NAV_SECTIONS = parseJsonEnv(
  "VITE_CODEAPPS_NAV_SECTIONS_JSON",
  defaultNavSections,
)
