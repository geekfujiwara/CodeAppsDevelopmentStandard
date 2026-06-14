import { getClient } from "@microsoft/power-apps"
import { dataSourcesInfo } from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX } from "@/config"
import type { Expense } from "@/types/dataverse"

// Table names — dynamic from publisher prefix, never hardcoded
const TABLE = () => `${PUBLISHER_PREFIX}_expenses`
const ID_FIELD = () => `${PUBLISHER_PREFIX}_expenseid`
const fields = () => ({
  title:       `${PUBLISHER_PREFIX}_title`,
  amount:      `${PUBLISHER_PREFIX}_amount`,
  category:    `${PUBLISHER_PREFIX}_category`,
  expensedate: `${PUBLISHER_PREFIX}_expensedate`,
  description: `${PUBLISHER_PREFIX}_description`,
  status:      `${PUBLISHER_PREFIX}_status`,
  department:  `${PUBLISHER_PREFIX}_department`,
  notes:       `${PUBLISHER_PREFIX}_notes`,
})

function client() {
  return getClient(dataSourcesInfo)
}

export async function getCurrentUserId(): Promise<string> {
  const result = await client().retrieveMultipleRecordsAsync(
    "systemusers",
    `?$filter=azureactivedirectoryobjectid eq (Microsoft.Dynamics.CRM.CurrentUserObjectId())&$select=systemuserid&$top=1`
  )
  if (!result.success || !result.value?.length) throw new Error("ユーザーIDの取得に失敗しました")
  return result.value[0].systemuserid as string
}

export async function getExpenses(): Promise<Expense[]> {
  const f = fields()
  const select = [ID_FIELD(), f.title, f.amount, f.category, f.expensedate, f.status, f.department, "createdon", "_createdby_value"].join(",")
  const result = await client().retrieveMultipleRecordsAsync(TABLE(), `?$select=${select}&$orderby=createdon desc`)
  if (!result.success) throw new Error("経費データの取得に失敗しました")
  return (result.value ?? []) as Expense[]
}

export async function getExpenseById(id: string): Promise<Expense> {
  const f = fields()
  const select = Object.values(f).concat([ID_FIELD(), "createdon", "_createdby_value"]).join(",")
  const result = await client().retrieveRecordAsync(TABLE(), id, `?$select=${select}`)
  if (!result.success) throw new Error("経費データの取得に失敗しました")
  return result.value as Expense
}

export async function createExpense(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(TABLE(), data)
  if (!result.success) throw new Error("経費の作成に失敗しました")
  return result.value?.id as string
}

export async function updateExpense(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(TABLE(), id, data)
  if (!result.success) throw new Error("経費の更新に失敗しました")
}

export async function deleteExpense(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(TABLE(), id)
  if (!result.success) throw new Error("経費の削除に失敗しました")
}

export async function submitExpense(id: string): Promise<void> {
  const f = fields()
  await updateExpense(id, { [f.status]: 100000001 }) // → 申請中
}

export async function approveExpense(id: string): Promise<void> {
  const f = fields()
  await updateExpense(id, { [f.status]: 100000002 }) // → 承認済み
}

export async function rejectExpense(id: string): Promise<void> {
  const f = fields()
  await updateExpense(id, { [f.status]: 100000003 }) // → 差戻し
}
