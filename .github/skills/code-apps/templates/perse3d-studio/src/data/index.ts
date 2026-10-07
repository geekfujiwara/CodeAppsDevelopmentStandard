import { LocalProjectRepository, type ProjectRepository } from "@/data/repository"
import { DataverseProjectRepository } from "@/data/dataverse-repository"
import { isDataverseConfigured } from "@/data/dataverse-client"

let instance: ProjectRepository | null = null

function hostedInPowerApps() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * VITE_DATA_MODE=dataverse かつ Power Apps 上で実行中なら Dataverse、
 * それ以外（ローカル開発・Dataverse 未構成）は DEMO（ブラウザ保存）を使う。
 * DEMO のときはヘッダーに「DEMO（ブラウザ保存）」と表示して実データと誤認させない。
 */
export function getRepository(): ProjectRepository {
  if (!instance) {
    const wantDataverse = import.meta.env.VITE_DATA_MODE?.trim() === "dataverse"
    // データソース未追加（テンプレートから生成した直後）は DEMO で動かす
    instance = wantDataverse && isDataverseConfigured && hostedInPowerApps() ? new DataverseProjectRepository() : new LocalProjectRepository()
  }
  return instance
}
