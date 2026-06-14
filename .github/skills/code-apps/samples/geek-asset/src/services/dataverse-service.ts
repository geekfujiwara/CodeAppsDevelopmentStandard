import { getClient } from "@microsoft/power-apps"
import { dataSourcesInfo } from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX } from "@/config"
import type { Asset, Loan, Disposal, InventoryCheck } from "@/types/dataverse"

const P = PUBLISHER_PREFIX

// ── Asset ─────────────────────────────────────────────────────
const ASSET_TABLE = () => `${P}_assets`
const ASSET_ID    = () => `${P}_assetid`
const assetFields = () => ({
  asset_name:     `${P}_asset_name`,
  asset_number:   `${P}_asset_number`,
  category:       `${P}_category`,
  serial_number:  `${P}_serial_number`,
  purchase_date:  `${P}_purchase_date`,
  purchase_price: `${P}_purchase_price`,
  status:         `${P}_status`,
  location:       `${P}_location`,
  department:     `${P}_department`,
  notes:          `${P}_notes`,
})

// ── Loan ──────────────────────────────────────────────────────
const LOAN_TABLE  = () => `${P}_loans`
const LOAN_ID     = () => `${P}_loanid`
const loanFields  = () => ({
  asset_name:      `${P}_asset_name`,
  borrower_name:   `${P}_borrower_name`,
  loan_date:       `${P}_loan_date`,
  return_due_date: `${P}_return_due_date`,
  return_date:     `${P}_return_date`,
  status:          `${P}_status`,
  notes:           `${P}_notes`,
})

// ── Disposal ──────────────────────────────────────────────────
const DISPOSAL_TABLE = () => `${P}_disposals`
const DISPOSAL_ID    = () => `${P}_disposalid`
const disposalFields = () => ({
  asset_name:    `${P}_asset_name`,
  disposal_date: `${P}_disposal_date`,
  reason:        `${P}_reason`,
  status:        `${P}_status`,
  notes:         `${P}_notes`,
})

// ── InventoryCheck ────────────────────────────────────────────
const INVENTORY_TABLE = () => `${P}_inventory_checks`
const INVENTORY_ID    = () => `${P}_inventory_checkid`
const inventoryFields = () => ({
  asset_name: `${P}_asset_name`,
  check_date: `${P}_check_date`,
  result:     `${P}_result`,
  checker:    `${P}_checker`,
  notes:      `${P}_notes`,
})

function client() {
  return getClient(dataSourcesInfo)
}

// ══════════════════════════════════════════════════════════════
// System
// ══════════════════════════════════════════════════════════════
export async function getCurrentUserId(): Promise<string> {
  const result = await client().retrieveMultipleRecordsAsync(
    "systemusers",
    `?$filter=azureactivedirectoryobjectid eq (Microsoft.Dynamics.CRM.CurrentUserObjectId())&$select=systemuserid&$top=1`
  )
  if (!result.success || !result.value?.length) throw new Error("ユーザーIDの取得に失敗しました")
  return result.value[0].systemuserid as string
}

// ══════════════════════════════════════════════════════════════
// Asset CRUD
// ══════════════════════════════════════════════════════════════
export async function getAssets(): Promise<Asset[]> {
  const f = assetFields()
  const select = [
    ASSET_ID(), f.asset_name, f.asset_number, f.category, f.status,
    f.location, f.department, f.purchase_date, "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(ASSET_TABLE(), `?$select=${select}&$orderby=createdon desc`)
  if (!result.success) throw new Error("資産データの取得に失敗しました")
  return (result.value ?? []) as Asset[]
}

export async function getAssetById(id: string): Promise<Asset> {
  const f = assetFields()
  const select = Object.values(f).concat([ASSET_ID(), "createdon"]).join(",")
  const result = await client().retrieveRecordAsync(ASSET_TABLE(), id, `?$select=${select}`)
  if (!result.success) throw new Error("資産データの取得に失敗しました")
  return result.value as Asset
}

export async function createAsset(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(ASSET_TABLE(), data)
  if (!result.success) throw new Error("資産の作成に失敗しました")
  return result.value?.id as string
}

export async function updateAsset(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(ASSET_TABLE(), id, data)
  if (!result.success) throw new Error("資産の更新に失敗しました")
}

export async function deleteAsset(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(ASSET_TABLE(), id)
  if (!result.success) throw new Error("資産の削除に失敗しました")
}

// ══════════════════════════════════════════════════════════════
// Loan CRUD
// ══════════════════════════════════════════════════════════════
export async function getLoans(): Promise<Loan[]> {
  const f = loanFields()
  const select = [
    LOAN_ID(), f.asset_name, f.borrower_name, f.loan_date,
    f.return_due_date, f.return_date, f.status, "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(LOAN_TABLE(), `?$select=${select}&$orderby=createdon desc`)
  if (!result.success) throw new Error("貸出データの取得に失敗しました")
  return (result.value ?? []) as Loan[]
}

export async function createLoan(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(LOAN_TABLE(), data)
  if (!result.success) throw new Error("貸出の作成に失敗しました")
  return result.value?.id as string
}

export async function updateLoan(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(LOAN_TABLE(), id, data)
  if (!result.success) throw new Error("貸出の更新に失敗しました")
}

export async function deleteLoan(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(LOAN_TABLE(), id)
  if (!result.success) throw new Error("貸出の削除に失敗しました")
}

export async function returnLoan(id: string): Promise<void> {
  const f = loanFields()
  const today = new Date().toISOString().slice(0, 10)
  await updateLoan(id, {
    [f.return_date]: today,
    [f.status]:      100000001, // 返却済み
  })
}

// ══════════════════════════════════════════════════════════════
// Disposal CRUD
// ══════════════════════════════════════════════════════════════
export async function getDisposals(): Promise<Disposal[]> {
  const f = disposalFields()
  const select = [
    DISPOSAL_ID(), f.asset_name, f.disposal_date, f.reason, f.status, "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(DISPOSAL_TABLE(), `?$select=${select}&$orderby=createdon desc`)
  if (!result.success) throw new Error("廃棄データの取得に失敗しました")
  return (result.value ?? []) as Disposal[]
}

export async function createDisposal(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(DISPOSAL_TABLE(), data)
  if (!result.success) throw new Error("廃棄申請の作成に失敗しました")
  return result.value?.id as string
}

export async function updateDisposal(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(DISPOSAL_TABLE(), id, data)
  if (!result.success) throw new Error("廃棄申請の更新に失敗しました")
}

export async function deleteDisposal(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(DISPOSAL_TABLE(), id)
  if (!result.success) throw new Error("廃棄申請の削除に失敗しました")
}

export async function approveDisposal(id: string): Promise<void> {
  const f = disposalFields()
  await updateDisposal(id, { [f.status]: 100000001 }) // → 承認済み
}

export async function completeDisposal(id: string): Promise<void> {
  const f = disposalFields()
  await updateDisposal(id, { [f.status]: 100000002 }) // → 廃棄完了
}

// ══════════════════════════════════════════════════════════════
// InventoryCheck CRUD
// ══════════════════════════════════════════════════════════════
export async function getInventoryChecks(): Promise<InventoryCheck[]> {
  const f = inventoryFields()
  const select = [
    INVENTORY_ID(), f.asset_name, f.check_date, f.result, f.checker, "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(INVENTORY_TABLE(), `?$select=${select}&$orderby=createdon desc`)
  if (!result.success) throw new Error("棚卸データの取得に失敗しました")
  return (result.value ?? []) as InventoryCheck[]
}

export async function createInventoryCheck(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(INVENTORY_TABLE(), data)
  if (!result.success) throw new Error("棚卸の作成に失敗しました")
  return result.value?.id as string
}

export async function updateInventoryCheck(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(INVENTORY_TABLE(), id, data)
  if (!result.success) throw new Error("棚卸の更新に失敗しました")
}

export async function deleteInventoryCheck(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(INVENTORY_TABLE(), id)
  if (!result.success) throw new Error("棚卸の削除に失敗しました")
}

// Re-export field name helpers for use in pages/hooks
export { ASSET_ID, LOAN_ID, DISPOSAL_ID, INVENTORY_ID, assetFields, loanFields, disposalFields, inventoryFields }
