import { createRecord, deleteRecord, getRecord, listRecords, updateRecord, type DataverseRow } from "@/lib/dataverse-client"
import { col, ENTITIES, type EntityDef, type FieldDef } from "@/crm/schema"

export type FormValue = string | number | boolean | null
export type FormValues = Record<string, FormValue>

const FORMATTED = "@OData.Community.Display.V1.FormattedValue"

export const lookupKey = (field: string) => `_${field}_value`

const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined)
const num = (v: unknown) => (typeof v === "number" ? v : undefined)

export function formatted(row: DataverseRow, key: string): string | undefined {
  return str(row[`${key}${FORMATTED}`])
}

export function displayValue(row: DataverseRow, field: FieldDef): string {
  const key = field.type === "lookup" ? lookupKey(field.name) : field.name
  return formatted(row, key) ?? (row[key] == null ? "" : String(row[key]))
}

function selectFor(def: EntityDef): string[] {
  const fields = def.fields.map((f) => (f.type === "lookup" ? lookupKey(f.name) : f.name))
  return [def.idField, ...fields, ...(def.ownerScoped ? ["_ownerid_value"] : []), "createdon", "modifiedon"]
}

export const listEntity = (def: EntityDef) =>
  listRecords(def.entitySet, { select: selectFor(def), orderby: def.orderby })

export const getEntity = (def: EntityDef, id: string) => getRecord(def.entitySet, id, selectFor(def))

export const removeEntity = (def: EntityDef, id: string) => deleteRecord(def.entitySet, id)

export function toFormValues(def: EntityDef, row?: DataverseRow): FormValues {
  const values: FormValues = {}
  for (const field of def.fields) {
    const raw = row?.[field.type === "lookup" ? lookupKey(field.name) : field.name]
    if (raw == null) values[field.name] = field.type === "boolean" ? false : null
    else if (field.type === "date") values[field.name] = String(raw).slice(0, 10)
    else if (field.type === "datetime") values[field.name] = toLocalInput(String(raw))
    else values[field.name] = raw as FormValue
  }
  return values
}

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toBody(def: EntityDef, values: FormValues, isCreate: boolean): DataverseRow {
  const body: DataverseRow = {}
  for (const field of def.fields) {
    if (field.readOnly || !(field.name in values)) continue
    const value = values[field.name]
    const empty = value === null || value === ""
    if (field.type === "lookup") {
      // 既存の参照解除は $ref の DELETE が必要なため、空欄の更新は送らない
      if (!empty && field.nav && field.target) body[`${field.nav}@odata.bind`] = `/${ENTITIES[field.target].entitySet}(${value})`
      continue
    }
    if (empty) {
      if (!isCreate) body[field.name] = null
      continue
    }
    if (field.type === "money" || field.type === "number" || field.type === "picklist") body[field.name] = Number(value)
    else if (field.type === "datetime") body[field.name] = new Date(String(value)).toISOString()
    else body[field.name] = value
  }
  return body
}

export function missingRequired(def: EntityDef, values: FormValues): string[] {
  return def.fields.filter((f) => f.required && !f.readOnly && (values[f.name] === null || values[f.name] === "")).map((f) => f.label)
}

export async function saveEntity(def: EntityDef, values: FormValues, id?: string): Promise<void> {
  if (id) await updateRecord(def.entitySet, id, toBody(def, values, false))
  else await createRecord(def.entitySet, toBody(def, values, true))
}

// ── 集計用の型付きモデル ────────────────────────────────────

export interface Opportunity {
  id: string; name: string; accountId?: string; contactId?: string; stage?: number
  amount: number; probability: number; closeDate?: string; actualCloseDate?: string
  nextStep?: string; ownerId?: string; modifiedOn?: string
}
export interface Activity {
  id: string; name: string; type?: number; status?: number; dueDate?: string
  opportunityId?: string; accountId?: string; contactId?: string; ownerId?: string; createdOn?: string
}
export interface Target { id: string; name: string; amount: number; fiscalYear: number; quarter: number; type?: number; periodId?: string; ownerId?: string }
export interface Period { id: string; name: string; start: string; end: string; fiscalYear: number; quarter: number }
export interface User { id: string; name: string; email?: string; managerId?: string; entraId?: string }
export interface Party { id: string; name: string; email?: string; accountId?: string }

const toOpportunity = (r: DataverseRow): Opportunity => ({
  id: String(r[ENTITIES.opportunity.idField]), name: str(r[col("name")]) ?? "(無題)",
  accountId: str(r[lookupKey(col("accountid"))]), contactId: str(r[lookupKey(col("contactid"))]),
  stage: num(r[col("stage")]), amount: num(r[col("amount")]) ?? 0, probability: num(r[col("probability")]) ?? 0,
  closeDate: str(r[col("estimatedclosedate")]), actualCloseDate: str(r[col("actualclosedate")]),
  nextStep: str(r[col("nextstep")]), ownerId: str(r._ownerid_value), modifiedOn: str(r.modifiedon),
})

const toActivity = (r: DataverseRow): Activity => ({
  id: String(r[ENTITIES.activity.idField]), name: str(r[col("name")]) ?? "(無題)",
  type: num(r[col("type")]), status: num(r[col("status")]), dueDate: str(r[col("duedate")]),
  opportunityId: str(r[lookupKey(col("opportunityid"))]), accountId: str(r[lookupKey(col("accountid"))]),
  contactId: str(r[lookupKey(col("contactid"))]), ownerId: str(r._ownerid_value), createdOn: str(r.createdon),
})

export const loadOpportunities = async () => (await listEntity(ENTITIES.opportunity)).map(toOpportunity)
export const loadOpportunity = async (id: string) => toOpportunity(await getEntity(ENTITIES.opportunity, id))
export const loadActivities = async () => (await listEntity(ENTITIES.activity)).map(toActivity)

export async function loadTargets(): Promise<Target[]> {
  return (await listEntity(ENTITIES.target)).map((r) => ({
    id: String(r[ENTITIES.target.idField]), name: str(r[col("name")]) ?? "",
    amount: num(r[col("targetamount")]) ?? 0, fiscalYear: num(r[col("fiscalyear")]) ?? 0, quarter: num(r[col("quarter")]) ?? 0,
    type: num(r[col("targettype")]), periodId: str(r[lookupKey(col("fiscalperiodid"))]), ownerId: str(r._ownerid_value),
  }))
}

export async function loadPeriods(): Promise<Period[]> {
  return (await listEntity(ENTITIES.period)).map((r) => ({
    id: String(r[ENTITIES.period.idField]), name: str(r[col("name")]) ?? "",
    start: String(r[col("startdate")] ?? "").slice(0, 10), end: String(r[col("enddate")] ?? "").slice(0, 10),
    fiscalYear: num(r[col("fiscalyear")]) ?? 0, quarter: num(r[col("quarter")]) ?? 0,
  }))
}

export async function loadAccounts(): Promise<Party[]> {
  const rows = await listRecords("accounts", { select: ["accountid", "name", "emailaddress1"], orderby: "name asc" })
  return rows.map((r) => ({ id: String(r.accountid), name: str(r.name) ?? "", email: str(r.emailaddress1) }))
}

export async function loadContacts(): Promise<Party[]> {
  const rows = await listRecords("contacts", { select: ["contactid", "fullname", "emailaddress1", "_parentcustomerid_value"], orderby: "fullname asc" })
  return rows.map((r) => ({ id: String(r.contactid), name: str(r.fullname) ?? "", email: str(r.emailaddress1), accountId: str(r._parentcustomerid_value) }))
}

export async function loadUsers(): Promise<User[]> {
  const rows = await listRecords("systemusers", {
    select: ["systemuserid", "fullname", "internalemailaddress", "_parentsystemuserid_value", "azureactivedirectoryobjectid"],
  })
  return rows.map((r) => ({
    id: String(r.systemuserid), name: str(r.fullname) ?? "", email: str(r.internalemailaddress),
    managerId: str(r._parentsystemuserid_value), entraId: str(r.azureactivedirectoryobjectid),
  }))
}

export const updateOpportunity = (id: string, body: DataverseRow) => updateRecord(ENTITIES.opportunity.entitySet, id, body)
export const updateActivity = (id: string, body: DataverseRow) => updateRecord(ENTITIES.activity.entitySet, id, body)
