import type { Project } from "../types/project"
import { listingRows } from "./listing.ts"

export type BrochureDraft = {
  title: string
  price: string
  address: string
  headline: string
  description: string
  company: string
  companyAddress: string
  phone: string
  license: string
  transaction: string
  issuedOn: string
  validUntil: string
  rightsConfirmed: boolean
  factsConfirmed: boolean
}

export type BrochureImage = { label: string; dataUrl: string }
export type BrochureInput = {
  draft: BrochureDraft
  facts: { label: string; value: string }[]
  hero?: BrochureImage
  floorplans: BrochureImage[]
  source?: { url?: string; fetchedAt?: string }
  modelDisclaimer: string
}

export function jstDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function brochureDraft(project: Project, now = new Date()): BrochureDraft {
  return {
    title: project.listing?.title || project.name,
    price: project.listing?.price || "",
    address: project.listing?.address || project.address,
    headline: "", description: "",
    company: "", companyAddress: "", phone: "", license: "",
    transaction: project.listing?.transaction || "", issuedOn: jstDate(now), validUntil: "",
    rightsConfirmed: false, factsConfirmed: false,
  }
}

export function brochureErrors(d: BrochureDraft): string[] {
  const required: [keyof BrochureDraft, string][] = [
    ["title", "物件名"], ["price", "販売価格"], ["address", "所在地"], ["company", "会社名"],
    ["companyAddress", "会社所在地"], ["phone", "連絡先"], ["license", "免許番号"], ["transaction", "取引態様"],
  ]
  const errors = required.filter(([key]) => !String(d[key]).trim()).map(([, label]) => `${label}を入力してください`)
  const dateOk = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
  if (!dateOk(d.issuedOn)) errors.push("有効な発行日を入力してください")
  if (!dateOk(d.validUntil) || d.validUntil < d.issuedOn) errors.push("情報有効期限は発行日以降の日付にしてください")
  if (!d.rightsConfirmed) errors.push("掲載する画像・情報の利用権限を確認してください")
  if (!d.factsConfirmed) errors.push("物件情報・広告表示内容を確認してください")
  const limits: [keyof BrochureDraft, number, string][] = [
    ["title", 120, "物件名"], ["headline", 80, "見出し"], ["description", 1400, "紹介文"], ["price", 120, "価格"],
    ["address", 250, "所在地"], ["company", 150, "会社名"], ["companyAddress", 250, "会社所在地"],
    ["phone", 80, "連絡先"], ["license", 150, "免許番号"], ["transaction", 100, "取引態様"],
  ]
  for (const [key, n, label] of limits) if (String(d[key]).length > n) errors.push(`${label}は${n}文字以内にしてください`)
  return errors
}

const REQUIRED_FACTS = ["間取り", "建物面積", "土地面積", "構造", "築年月", "道路", "用途地域", "土地権利", "引渡時期"]

export function brochureFacts(project: Project): { label: string; value: string }[] {
  const facts = project.listing ? listingRows(project.listing).filter(r => !["物件名", "価格", "所在地", "取引態様"].includes(r.label)) : []
  for (const label of REQUIRED_FACTS) if (!facts.some(f => f.label === label)) facts.push({ label, value: "" })
  return facts
}

export function brochureFactErrors(facts: { label: string; value: string }[]): string[] {
  return REQUIRED_FACTS.filter(label => !facts.some(f => f.label === label && f.value.trim() && !/要確認|未登録/.test(f.value)))
    .map(label => `物件概要の「${label}」を確認・入力してください（対象外の場合も明記）`)
}

export function brochureInput(project: Project, draft: BrochureDraft, hero?: BrochureImage, factOverrides?: { label: string; value: string }[]): BrochureInput {
  const facts = factOverrides ?? brochureFacts(project)
  const errors = [...brochureErrors(draft), ...brochureFactErrors(facts)]
  if (errors.length) throw new Error(errors.join("\n"))
  const d = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v])) as BrochureDraft
  return {
    draft: d,
    facts: [{ label: "所在地", value: d.address }, { label: "販売価格", value: d.price }, ...facts, { label: "取引態様", value: d.transaction }],
    ...(hero ? { hero } : {}),
    floorplans: Object.entries(project.images.floorplans).sort(([a], [b]) => Number(a) - Number(b))
      .map(([key, dataUrl]) => ({ label: `${Number(key) + 1}F 間取り図（受領画像）`, dataUrl })),
    source: project.listing ? { url: project.listing.url, fetchedAt: project.listing.fetchedAt } : undefined,
    modelDisclaimer: "3D画像は間取り図等から再構成した参考イメージです。実際の建物・仕上げ・設備・寸法とは異なる場合があります。広告掲載前に現況・原図・権利・法令上の必須表示事項を担当者が確認してください。",
  }
}

export function brochureFileName(title: string): string {
  const safe = [...title].map(ch => ch.codePointAt(0)! < 32 ? "_" : ch).join("")
  const name = safe.replace(/[<>:"/\\|?*]/g, "_").trim().slice(0, 80) || "物件"
  return `${name}_販売用パンフレット.pdf`
}
