import type { CommentInput, Project, ProjectComment, ProjectInput } from "@/types/project"
import { DEFAULT_MASSING, MATERIAL_PRESETS, generateFromMassing, DEFAULT_MATERIALS, parseBuildingSpec, type BuildingSpec } from "@/lib/building-spec"
import { safeStorage } from "@/lib/safe-storage"
import sampleSpecJson from "@/data/sample-spec.json"

/**
 * データアクセスの境界。画面はこのインターフェースだけに依存する。
 * - demo: ブラウザの localStorage（Dataverse 未接続時。UI に DEMO と明示する）
 * - dataverse: Dataverse テーブル（src/data/dataverse-repository.ts）
 */
export interface ProjectRepository {
  readonly mode: "demo" | "dataverse"
  listProjects(): Promise<Project[]>
  getProject(id: string): Promise<Project | null>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(id: string, patch: Partial<Project>): Promise<Project>
  deleteProject(id: string): Promise<void>
  listComments(projectId: string): Promise<ProjectComment[]>
  addComment(input: CommentInput): Promise<ProjectComment>
  updateComment(id: string, patch: Partial<ProjectComment>): Promise<void>
  deleteComment(id: string): Promise<void>
}

const PROJECTS_KEY = "perse3d:projects:v1"
const COMMENTS_KEY = "perse3d:comments:v1"

export const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

const now = () => new Date().toISOString()

let sampleSpec: BuildingSpec | null = null

/** 初回だけ、サンプル間取り図の解析結果（バンドル済み JSON）で初期データを作る。Code Apps は fetch 不可 */
async function ensureSeeded() {
  if (safeStorage.get(PROJECTS_KEY)) return
  try {
    sampleSpec = parseBuildingSpec(sampleSpecJson)
  } catch {
    // 不正なら手続き生成のモデルで代用する
  }
  write(PROJECTS_KEY, seedProjects())
}

function seedProjects(): Project[] {
  const spec = sampleSpec ?? generateFromMassing({ ...DEFAULT_MASSING, name: "サンプル邸 2 階建て" })
  const created = new Date(Date.now() - 5 * 86400000).toISOString()
  const variants = MATERIAL_PRESETS.slice(0, 3).map((p, i) => ({
    id: `seed-variant-${p.id}`,
    name: `プラン${"ABC"[i]}（${p.name}）`,
    presetId: p.id,
    materials: { ...DEFAULT_MATERIALS, ...p.materials },
    note: p.description,
    createdOn: created,
  }))
  return [
    {
      id: "seed-sample-house",
      name: "サンプル邸 新築計画",
      clientName: "山田 太郎 様",
      address: "東京都世田谷区（サンプル）",
      stage: "proposal",
      budget: 38000000,
      designOwner: "設計 佐藤",
      salesOwner: "営業 鈴木",
      notes: "SUUMO 掲載の参考パースを元に、南道路・2 階建て・切妻で提案。LDK 20 帖以上が希望。",
      images: {
        floorplans: { "0": "./samples/floorplan-1f.png", "1": "./samples/floorplan-2f.png" },
        perspective: "./samples/perspective.jpg",
      },
      spec,
      variants,
      activeVariantId: variants[0].id,
      createdOn: created,
      modifiedOn: created,
    },
    {
      id: "seed-renovation",
      name: "平屋リノベーション相談",
      clientName: "高橋 花子 様",
      address: "神奈川県鎌倉市（サンプル）",
      stage: "received",
      budget: 18000000,
      designOwner: "設計 伊藤",
      salesOwner: "営業 鈴木",
      notes: "間取り図のみ受領。パースは後日。",
      images: { floorplans: { "0": "./samples/floorplan-1f.png" } },
      spec: null,
      variants: [],
      activeVariantId: null,
      createdOn: new Date(Date.now() - 2 * 86400000).toISOString(),
      modifiedOn: new Date(Date.now() - 2 * 86400000).toISOString(),
    },
    {
      id: "seed-flat-roof",
      name: "陸屋根モダン 二世帯",
      clientName: "株式会社サンプル不動産",
      address: "埼玉県さいたま市（サンプル）",
      stage: "design-review",
      budget: 52000000,
      designOwner: "設計 佐藤",
      salesOwner: "営業 田中",
      notes: "外観パースのみ。3 階建て・陸屋根。",
      images: { floorplans: {}, perspective: "./samples/perspective.jpg" },
      spec: generateFromMassing({ ...DEFAULT_MASSING, name: "陸屋根モダン", floors: 3, roof: "flat", width: 8.19, depth: 9.1, materials: { ...DEFAULT_MATERIALS, ...MATERIAL_PRESETS[1].materials } }),
      variants: [],
      activeVariantId: null,
      createdOn: new Date(Date.now() - 86400000).toISOString(),
      modifiedOn: new Date(Date.now() - 86400000).toISOString(),
    },
  ]
}

function seedComments(): ProjectComment[] {
  const t = new Date(Date.now() - 3 * 86400000).toISOString()
  return [
    { id: "seed-c1", projectId: "seed-sample-house", role: "design", author: "設計 佐藤", body: "LDK の南面は掃き出し窓 3 連で採光を確保。梁せいは要確認。", position: [5.5, 1.2, 7.1], pose: null, resolved: false, createdOn: t },
    { id: "seed-c2", projectId: "seed-sample-house", role: "sales", author: "営業 鈴木", body: "お客様は外壁をもう少し明るい色にしたいとのこと。プラン D（ホワイトキューブ）も作成予定。", position: [9.1, 4.5, 3.6], pose: null, resolved: false, createdOn: t },
    { id: "seed-c3", projectId: "seed-sample-house", role: "client", author: "山田 様", body: "玄関からの動線が良いですね。2 階の洋室をもう少し広くできますか？", position: null, pose: null, resolved: false, createdOn: t },
  ]
}

function read<T>(key: string, seed: () => T): T {
  try {
    const raw = safeStorage.get(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    // 破損時は初期データに戻す
  }
  const value = seed()
  write(key, value)
  return value
}

function write<T>(key: string, value: T) {
  try {
    safeStorage.set(key, JSON.stringify(value))
  } catch (e) {
    throw new Error("ブラウザ保存容量の上限に達しました。画像を減らすか Dataverse モードで利用してください。", { cause: e })
  }
}

export class LocalProjectRepository implements ProjectRepository {
  readonly mode = "demo" as const

  async listProjects() {
    await ensureSeeded()
    return read(PROJECTS_KEY, seedProjects).sort((a, b) => b.modifiedOn.localeCompare(a.modifiedOn))
  }

  async getProject(id: string) {
    await ensureSeeded()
    return read(PROJECTS_KEY, seedProjects).find(p => p.id === id) ?? null
  }

  async createProject(input: ProjectInput) {
    await ensureSeeded()
    const all = read(PROJECTS_KEY, seedProjects)
    const p: Project = { ...input, listing: input.listing ?? null, id: newId(), images: input.images ?? { floorplans: {} }, spec: null, variants: [], activeVariantId: null, createdOn: now(), modifiedOn: now() }
    write(PROJECTS_KEY, [p, ...all])
    return p
  }

  async updateProject(id: string, patch: Partial<Project>) {
    await ensureSeeded()
    const all = read(PROJECTS_KEY, seedProjects)
    const i = all.findIndex(p => p.id === id)
    if (i < 0) throw new Error("案件が見つかりません")
    all[i] = { ...all[i], ...patch, id, modifiedOn: now() }
    write(PROJECTS_KEY, all)
    return all[i]
  }

  async deleteProject(id: string) {
    await ensureSeeded()
    write(PROJECTS_KEY, read(PROJECTS_KEY, seedProjects).filter(p => p.id !== id))
    write(COMMENTS_KEY, read(COMMENTS_KEY, seedComments).filter(c => c.projectId !== id))
  }

  async listComments(projectId: string) {
    await ensureSeeded()
    return read(COMMENTS_KEY, seedComments)
      .filter(c => c.projectId === projectId)
      .sort((a, b) => a.createdOn.localeCompare(b.createdOn))
  }

  async addComment(input: CommentInput) {
    await ensureSeeded()
    const c: ProjectComment = { ...input, id: newId(), createdOn: now() }
    write(COMMENTS_KEY, [...read(COMMENTS_KEY, seedComments), c])
    return c
  }

  async updateComment(id: string, patch: Partial<ProjectComment>) {
    await ensureSeeded()
    write(COMMENTS_KEY, read(COMMENTS_KEY, seedComments).map(c => (c.id === id ? { ...c, ...patch, id } : c)))
  }

  async deleteComment(id: string) {
    await ensureSeeded()
    write(COMMENTS_KEY, read(COMMENTS_KEY, seedComments).filter(c => c.id !== id))
  }
}
