import { getClient } from "@microsoft/power-apps"
import { dataSourcesInfo } from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX } from "@/config"
import type { Employee, Recruitment, Candidate, Evaluation } from "@/types/dataverse"

// Table names — dynamic from publisher prefix, never hardcoded
const P = PUBLISHER_PREFIX
const EMPLOYEE_TABLE    = () => `${P}_employees`
const EMPLOYEE_ID       = () => `${P}_employeeid`
const RECRUITMENT_TABLE = () => `${P}_recruitments`
const RECRUITMENT_ID    = () => `${P}_recruitmentid`
const CANDIDATE_TABLE   = () => `${P}_candidates`
const CANDIDATE_ID      = () => `${P}_candidateid`
const EVALUATION_TABLE  = () => `${P}_evaluations`
const EVALUATION_ID     = () => `${P}_evaluationid`

function client() {
  return getClient(dataSourcesInfo)
}

// ── System ────────────────────────────────────────────────────

export async function getCurrentUserId(): Promise<string> {
  const result = await client().retrieveMultipleRecordsAsync(
    "systemusers",
    `?$filter=azureactivedirectoryobjectid eq (Microsoft.Dynamics.CRM.CurrentUserObjectId())&$select=systemuserid&$top=1`
  )
  if (!result.success || !result.value?.length) throw new Error("ユーザーIDの取得に失敗しました")
  return result.value[0].systemuserid as string
}

// ── Employee ──────────────────────────────────────────────────

const employeeFields = () => ({
  name:            `${P}_name`,
  department:      `${P}_department`,
  position:        `${P}_position`,
  employment_type: `${P}_employment_type`,
  hire_date:       `${P}_hire_date`,
  status:          `${P}_status`,
  email:           `${P}_email`,
  phone:           `${P}_phone`,
  notes:           `${P}_notes`,
})

export async function getEmployees(): Promise<Employee[]> {
  const f = employeeFields()
  const select = [
    EMPLOYEE_ID(),
    f.name, f.department, f.position, f.employment_type,
    f.hire_date, f.status, f.email, f.phone,
    "createdon", "_createdby_value",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(
    EMPLOYEE_TABLE(),
    `?$select=${select}&$orderby=createdon desc`
  )
  if (!result.success) throw new Error("社員データの取得に失敗しました")
  return (result.value ?? []) as Employee[]
}

export async function createEmployee(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(EMPLOYEE_TABLE(), data)
  if (!result.success) throw new Error("社員の作成に失敗しました")
  return result.value?.id as string
}

export async function updateEmployee(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(EMPLOYEE_TABLE(), id, data)
  if (!result.success) throw new Error("社員の更新に失敗しました")
}

export async function deleteEmployee(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(EMPLOYEE_TABLE(), id)
  if (!result.success) throw new Error("社員の削除に失敗しました")
}

export { employeeFields }

// ── Recruitment ───────────────────────────────────────────────

const recruitmentFields = () => ({
  title:          `${P}_title`,
  department:     `${P}_department`,
  required_count: `${P}_required_count`,
  status:         `${P}_status`,
  deadline:       `${P}_deadline`,
  description:    `${P}_description`,
})

export async function getRecruitments(): Promise<Recruitment[]> {
  const f = recruitmentFields()
  const select = [
    RECRUITMENT_ID(),
    f.title, f.department, f.required_count, f.status, f.deadline, f.description,
    "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(
    RECRUITMENT_TABLE(),
    `?$select=${select}&$orderby=createdon desc`
  )
  if (!result.success) throw new Error("採用ポジションデータの取得に失敗しました")
  return (result.value ?? []) as Recruitment[]
}

export async function createRecruitment(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(RECRUITMENT_TABLE(), data)
  if (!result.success) throw new Error("採用ポジションの作成に失敗しました")
  return result.value?.id as string
}

export async function updateRecruitment(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(RECRUITMENT_TABLE(), id, data)
  if (!result.success) throw new Error("採用ポジションの更新に失敗しました")
}

export async function deleteRecruitment(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(RECRUITMENT_TABLE(), id)
  if (!result.success) throw new Error("採用ポジションの削除に失敗しました")
}

export { recruitmentFields }

// ── Candidate ─────────────────────────────────────────────────

const candidateFields = () => ({
  full_name:       `${P}_full_name`,
  recruitment_id:  `_${P}_recruitment_id_value`,
  stage:           `${P}_stage`,
  score:           `${P}_score`,
  interview_date:  `${P}_interview_date`,
  notes:           `${P}_notes`,
})

export async function getCandidates(recruitmentId?: string): Promise<Candidate[]> {
  const f = candidateFields()
  const select = [
    CANDIDATE_ID(),
    f.full_name, f.stage, f.score, f.interview_date, f.notes,
    `_${P}_recruitment_id_value`,
    "createdon",
  ].join(",")
  const filter = recruitmentId
    ? `?$select=${select}&$filter=_${P}_recruitment_id_value eq '${recruitmentId}'&$orderby=createdon desc`
    : `?$select=${select}&$orderby=createdon desc`
  const result = await client().retrieveMultipleRecordsAsync(CANDIDATE_TABLE(), filter)
  if (!result.success) throw new Error("候補者データの取得に失敗しました")
  return (result.value ?? []) as Candidate[]
}

export async function createCandidate(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(CANDIDATE_TABLE(), data)
  if (!result.success) throw new Error("候補者の作成に失敗しました")
  return result.value?.id as string
}

export async function updateCandidate(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(CANDIDATE_TABLE(), id, data)
  if (!result.success) throw new Error("候補者の更新に失敗しました")
}

export async function deleteCandidate(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(CANDIDATE_TABLE(), id)
  if (!result.success) throw new Error("候補者の削除に失敗しました")
}

export { candidateFields }

// ── Evaluation ────────────────────────────────────────────────

const evaluationFields = () => ({
  employee_id:      `_${P}_employee_id_value`,
  period:           `${P}_period`,
  score:            `${P}_score`,
  comment:          `${P}_comment`,
  evaluation_date:  `${P}_evaluation_date`,
})

export async function getEvaluations(): Promise<Evaluation[]> {
  const f = evaluationFields()
  const select = [
    EVALUATION_ID(),
    f.period, f.score, f.comment, f.evaluation_date,
    `_${P}_employee_id_value`,
    "createdon",
  ].join(",")
  const result = await client().retrieveMultipleRecordsAsync(
    EVALUATION_TABLE(),
    `?$select=${select}&$orderby=createdon desc`
  )
  if (!result.success) throw new Error("評価データの取得に失敗しました")
  return (result.value ?? []) as Evaluation[]
}

export async function createEvaluation(data: Partial<Record<string, unknown>>): Promise<string> {
  const result = await client().createRecordAsync(EVALUATION_TABLE(), data)
  if (!result.success) throw new Error("評価の作成に失敗しました")
  return result.value?.id as string
}

export async function updateEvaluation(id: string, data: Partial<Record<string, unknown>>): Promise<void> {
  const result = await client().updateRecordAsync(EVALUATION_TABLE(), id, data)
  if (!result.success) throw new Error("評価の更新に失敗しました")
}

export async function deleteEvaluation(id: string): Promise<void> {
  const result = await client().deleteRecordAsync(EVALUATION_TABLE(), id)
  if (!result.success) throw new Error("評価の削除に失敗しました")
}

export { evaluationFields }
