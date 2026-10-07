import type { BuildingSpec, Materials } from "@/lib/building-spec"
import type { CameraPose } from "@/lib/building-scene"
import type { ListingInfo } from "@/lib/listing"

export type Stage = "received" | "analyzing" | "design-review" | "proposal" | "won" | "lost"

export const STAGES: { value: Stage; label: string; description: string }[] = [
  { value: "received", label: "パース受領", description: "依頼主からパース・間取り図を受け取った" },
  { value: "analyzing", label: "3D 化", description: "画像を解析して 3D モデルを生成中" },
  { value: "design-review", label: "設計レビュー", description: "設計チームが寸法・構成を確認" },
  { value: "proposal", label: "営業提案", description: "営業がバリエーションと内見で提案中" },
  { value: "won", label: "受注", description: "依頼主が承認" },
  { value: "lost", label: "失注", description: "見送り" },
]

export const stageLabel = (s: Stage) => STAGES.find(x => x.value === s)?.label ?? s

export type Role = "design" | "sales" | "client"

export const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "design", label: "設計", color: "#2563eb" },
  { value: "sales", label: "営業", color: "#ea580c" },
  { value: "client", label: "依頼主", color: "#16a34a" },
]

export const roleOf = (r: Role) => ROLES.find(x => x.value === r) ?? ROLES[0]

export type SourceImages = {
  /** 階（"0" = 1F）ごとの間取り図 */
  floorplans: Record<string, string>
  perspective?: string
  /** 間取り図を 1 枚の画像から階ごとに切り出した（縮尺が共通。横幅は画素幅の比を保つ） */
  floorplanSheet?: boolean
}

export type Variant = {
  id: string
  name: string
  presetId?: string
  materials: Materials
  roofType?: BuildingSpec["roof"]["type"]
  note: string
  thumbnail?: string
  createdOn: string
}

export type Project = {
  id: string
  name: string
  clientName: string
  address: string
  stage: Stage
  budget: number | null
  designOwner: string
  salesOwner: string
  notes: string
  images: SourceImages
  spec: BuildingSpec | null
  variants: Variant[]
  activeVariantId: string | null
  /** 不動産ポータルから取り込んだ物件概要（無ければ null） */
  listing?: ListingInfo | null
  createdOn: string
  modifiedOn: string
}

export type ProjectInput = Pick<Project, "name" | "clientName" | "address" | "stage" | "budget" | "designOwner" | "salesOwner" | "notes"> & { listing?: ListingInfo | null; images?: SourceImages }

export type ProjectComment = {
  id: string
  projectId: string
  role: Role
  author: string
  body: string
  position: [number, number, number] | null
  pose: CameraPose | null
  resolved: boolean
  createdOn: string
}

export type CommentInput = Omit<ProjectComment, "id" | "createdOn">
