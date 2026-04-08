const LEARN_API_BASE_URL = "https://learn.microsoft.com/api/learn/catalog"
const DEFAULT_LOCALE = "ja-jp"
const DEFAULT_TOP = 200

export interface LearnModule {
  uid: string
  title: string
  summary: string
  levels: string[]
  roles: string[]
  products: string[]
  durationInMinutes: number
  rating?: {
    count: number
    average?: number
  }
  popularity?: number
  iconUrl?: string
  lastModified?: string
  url: string
}

export interface LearnLearningPath {
  uid: string
  title: string
  summary: string
  levels: string[]
  roles: string[]
  products: string[]
  durationInMinutes: number
  modules: string[]
  iconUrl?: string
  lastModified?: string
  url: string
}

export interface LearnCertification {
  uid: string
  title: string
  summary: string
  levels: string[]
  roles: string[]
  products: string[]
  lastModified?: string
  url: string
  type: string
}

export interface LearnAuxiliaryItem {
  id: string
  name: string
  children?: LearnAuxiliaryItem[]
}

export interface LearnCatalogSnapshot {
  modules: LearnModule[]
  learningPaths: LearnLearningPath[]
  certifications: LearnCertification[]
  levels: string[]
  roles: LearnAuxiliaryItem[]
  products: LearnAuxiliaryItem[]
  fetchedAt: string
}

export interface LearnCatalogOptions {
  locale?: string
  top?: number
}

interface RawModule {
  uid: string
  title: string
  summary?: string
  levels?: string[]
  roles?: string[]
  products?: string[]
  duration_in_minutes?: number
  rating?: {
    count: number
    average?: number
  }
  popularity?: number
  icon_url?: string
  last_modified?: string
  url: string
}

interface RawLearningPath {
  uid: string
  title: string
  summary?: string
  levels?: string[]
  roles?: string[]
  products?: string[]
  duration_in_minutes?: number
  modules?: string[]
  icon_url?: string
  last_modified?: string
  url: string
}

interface RawCertification {
  uid: string
  title: string
  summary?: string
  levels?: string[]
  roles?: string[]
  products?: string[]
  last_modified?: string
  url: string
  type: string
}

interface RawCatalogResponse {
  modules?: RawModule[]
  learningPaths?: RawLearningPath[]
  certifications?: RawCertification[]
  levels?: string[]
  products?: LearnAuxiliaryItem[]
  roles?: LearnAuxiliaryItem[]
}

export async function fetchLearnCatalog(options: LearnCatalogOptions = {}): Promise<LearnCatalogSnapshot> {
  const locale = options.locale ?? DEFAULT_LOCALE
  const top = options.top ?? DEFAULT_TOP

  const params = new URLSearchParams({
    locale,
    "$top": String(top)
  })

  const response = await fetch(`${LEARN_API_BASE_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json"
    }
  })

  if (!response.ok) {
    throw new Error(`Microsoft Learn カタログの取得に失敗しました: ${response.status}`)
  }

  const raw = (await response.json()) as RawCatalogResponse

  const modules: LearnModule[] = (raw.modules ?? []).map((module) => ({
    uid: module.uid,
    title: module.title,
    summary: module.summary ?? "概要情報が見つかりませんでした",
    levels: module.levels ?? [],
    roles: module.roles ?? [],
    products: module.products ?? [],
    durationInMinutes: module.duration_in_minutes ?? 0,
    rating: module.rating,
    popularity: module.popularity,
    iconUrl: module.icon_url,
    lastModified: module.last_modified,
    url: module.url
  }))

  const learningPaths: LearnLearningPath[] = (raw.learningPaths ?? []).map((path) => ({
    uid: path.uid,
    title: path.title,
    summary: path.summary ?? "概要情報が見つかりませんでした",
    levels: path.levels ?? [],
    roles: path.roles ?? [],
    products: path.products ?? [],
    durationInMinutes: path.duration_in_minutes ?? 0,
    modules: path.modules ?? [],
    iconUrl: path.icon_url,
    lastModified: path.last_modified,
    url: path.url
  }))

  const certifications: LearnCertification[] = (raw.certifications ?? []).map((cert) => ({
    uid: cert.uid,
    title: cert.title,
    summary: cert.summary ?? "概要情報が見つかりませんでした",
    levels: cert.levels ?? [],
    roles: cert.roles ?? [],
    products: cert.products ?? [],
    lastModified: cert.last_modified,
    url: cert.url,
    type: cert.type
  }))

  return {
    modules,
    learningPaths,
    certifications,
    levels: raw.levels ?? [],
    products: raw.products ?? [],
    roles: raw.roles ?? [],
    fetchedAt: new Date().toISOString()
  }
}
