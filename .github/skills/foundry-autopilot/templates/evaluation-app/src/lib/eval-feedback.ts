import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, num } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

// このエージェントが Dataverse MCP の create_record で書き込む先。このエージェント自身が createdby になるため、
// 「誰からの要望か」は別途 requester Lookup（systemuser）と依頼者表示名/メールで持つ。
export const FEEDBACK_ENTITY_SET = `${p}_aiteammatefeedbacks`

export const FEEDBACK_KEY = ["ai-teammate-feedback"]

export const FF = {
  id: `${p}_aiteammatefeedbackid`,
  name: `${p}_name`,
  summary: `${p}_summary`,
  requirements: `${p}_requirements`,
  purpose: `${p}_purpose`,
  category: `${p}_category`,
  status: `${p}_status`,
  requestedByName: `${p}_requestedbyname`,
  requestedByEmail: `${p}_requestedbyemail`,
  requesterLookup: `_${p}_requester_value`,
  githubIssueUrl: `${p}_githubissueurl`,
  createdOn: "createdon",
} as const

const REQUESTER_FORMATTED = `${FF.requesterLookup}@OData.Community.Display.V1.FormattedValue`

export const PURPOSE_OPTIONS = [
  { value: 1, label: "改善要望" },
  { value: 2, label: "新機能提案" },
  { value: 3, label: "不具合報告" },
  { value: 4, label: "使い方の相談" },
  { value: 5, label: "その他" },
] as const

export const CATEGORY_OPTIONS = [
  { value: 1, label: "メール対応" },
  { value: 2, label: "予定調整" },
  { value: 3, label: "Teamsチャット" },
  { value: 4, label: "資料作成" },
  { value: 5, label: "Web検索" },
  { value: 6, label: "Dataverse照会" },
  { value: 7, label: "その他" },
] as const

export const STATUS_NEW = 1
export const STATUS_OPTIONS = [
  { value: STATUS_NEW, label: "新規受付" },
  { value: 2, label: "検討中" },
  { value: 3, label: "対応予定" },
  { value: 4, label: "対応中" },
  { value: 5, label: "対応済み" },
  { value: 6, label: "却下" },
] as const

export function purposeLabel(value: number | null): string {
  return PURPOSE_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export function categoryLabel(value: number | null): string {
  return CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export function statusLabel(value: number | null): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "不明"
}

export type Feedback = {
  id: string
  title: string
  summary: string
  requirements: string
  purpose: number | null
  category: number | null
  status: number | null
  requesterName: string
  requesterEmail: string
  githubIssueUrl: string
  createdOn: string
  purposeLabel: string
  categoryLabel: string
  statusLabel: string
}

function toFeedback(row: DataverseRow): Feedback {
  const purpose = num(row, FF.purpose)
  const category = num(row, FF.category)
  const status = num(row, FF.status)
  // Lookup が解決できていれば systemuser の表示名を優先し、なければ登録時に書いたテキストへ落とす。
  const requesterName = str(row, REQUESTER_FORMATTED) || str(row, FF.requestedByName)

  return {
    id: str(row, FF.id),
    title: str(row, FF.name),
    summary: str(row, FF.summary),
    requirements: str(row, FF.requirements),
    purpose,
    category,
    status,
    requesterName,
    requesterEmail: str(row, FF.requestedByEmail),
    githubIssueUrl: str(row, FF.githubIssueUrl),
    createdOn: str(row, FF.createdOn),
    purposeLabel: purposeLabel(purpose),
    categoryLabel: categoryLabel(category),
    statusLabel: statusLabel(status),
  }
}

export async function listFeedback(): Promise<Feedback[]> {
  const rows = await DataverseService.ListRecords(FEEDBACK_ENTITY_SET, {
    select: [
      FF.id,
      FF.name,
      FF.summary,
      FF.requirements,
      FF.purpose,
      FF.category,
      FF.status,
      FF.requestedByName,
      FF.requestedByEmail,
      FF.requesterLookup,
      FF.githubIssueUrl,
      FF.createdOn,
    ],
    orderBy: `${FF.createdOn} desc`,
    top: 500,
  })
  return rows.map(toFeedback)
}

export async function updateFeedbackStatus(id: string, status: number): Promise<void> {
  await DataverseService.UpdateRecord(FEEDBACK_ENTITY_SET, id, { [FF.status]: status })
}

export async function updateFeedbackGithubIssueUrl(id: string, githubIssueUrl: string): Promise<void> {
  await DataverseService.UpdateRecord(FEEDBACK_ENTITY_SET, id, { [FF.githubIssueUrl]: githubIssueUrl })
}
