import { assertPlantDesign, type PlantDesign } from "./plant-design.ts"

export type DesignRevision = { id: string; designId: string; revision: number; hash: string; json: string; proposalId?: string }
export type DesignProposal = { id: string; designId: string; baseRevision: number; baseHash: string; json: string; reason: string; rejected: boolean }
export type DesignStorage = {
  latest: (designId: string) => Promise<DesignRevision | null>;
  append: (revision: DesignRevision) => Promise<void>;
}
export async function designHash(json: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)))).map((value) => value.toString(16).padStart(2, "0")).join("")
}

export async function saveDesignRevision(storage: DesignStorage, designId: string, candidate: PlantDesign, base: DesignRevision | null, proposal?: DesignProposal): Promise<DesignRevision> {
  assertPlantDesign(JSON.stringify(candidate))
  if (base && base.designId !== designId) throw new Error("保存先の設計が一致しません。")
  const current = await storage.latest(designId)
  if ((current?.id ?? null) !== (base?.id ?? null) || (current?.hash ?? null) !== (base?.hash ?? null)) throw new Error("他の改訂が保存されています。最新の設計を読み直してください。")
  if (base) {
    if (await designHash(base.json) !== base.hash) throw new Error("保存済み JSON のハッシュが一致しません。")
    if (candidate.id !== assertPlantDesign(base.json).id) throw new Error("設計 ID を変更する場合は新しい設計として保存してください。")
  }
  if (proposal && (proposal.rejected || !base || proposal.designId !== designId || proposal.baseRevision !== base.revision || proposal.baseHash !== base.hash || JSON.stringify(assertPlantDesign(proposal.json)) !== JSON.stringify(candidate))) throw new Error("提案の基準改訂・保存先・内容が一致しません。再提案が必要です。")
  const revision = (current?.revision ?? 0) + 1
  const json = JSON.stringify({ ...candidate, revision })
  const saved = { id: crypto.randomUUID(), designId, revision, json, hash: await designHash(json), ...(proposal ? { proposalId: proposal.id } : {}) }
  await storage.append(saved)
  return saved
}