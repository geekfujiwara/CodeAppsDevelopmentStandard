// CRM テーブル定義。テーブル・列の論理名はここだけで組み立て、ページに直書きしない。
export const PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || "crm"
const p = (name: string) => `${PREFIX}_${name}`

export const CURRENCY = import.meta.env.VITE_CRM_CURRENCY?.trim() || "JPY"
export const LOCALE = import.meta.env.VITE_CRM_LOCALE?.trim() || "ja-JP"
export const STALL_DAYS = Number(import.meta.env.VITE_CRM_STALL_DAYS) || 14

export type FieldType = "text" | "memo" | "email" | "phone" | "number" | "money" | "date" | "datetime" | "picklist" | "boolean" | "lookup"

export interface Option { value: number; label: string }

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: Option[]
  /** lookup: 参照先エンティティのキー（ENTITIES のキー） */
  target?: EntityKey
  /** lookup: 書き込み時の @odata.bind ナビゲーション プロパティ名（大文字小文字は環境の SchemaName どおり） */
  nav?: string
  inList?: boolean
  readOnly?: boolean
}

export interface EntityDef {
  key: EntityKey
  label: string
  path: string
  entitySet: string
  idField: string
  nameField: string
  fields: FieldDef[]
  ownerScoped: boolean
  orderby?: string
}

export type EntityKey = "opportunity" | "lead" | "account" | "contact" | "activity" | "target" | "period"

export const OpportunityStage = { Prospect: 100000000, Proposal: 100000001, Negotiation: 100000002, Won: 100000003, Lost: 100000004 } as const
export const ActivityStatus = { NotStarted: 100000000, InProgress: 100000001, Completed: 100000002 } as const
export const ActivityType = { Task: 100000000, Phone: 100000001, Email: 100000002, Meeting: 100000003 } as const
export const TargetType = { Individual: 100000000, Team: 100000001, Department: 100000002 } as const

export const STAGE_OPTIONS: Option[] = [
  { value: OpportunityStage.Prospect, label: "見込み" },
  { value: OpportunityStage.Proposal, label: "提案" },
  { value: OpportunityStage.Negotiation, label: "交渉" },
  { value: OpportunityStage.Won, label: "受注" },
  { value: OpportunityStage.Lost, label: "失注" },
]
export const ACTIVITY_TYPE_OPTIONS: Option[] = [
  { value: ActivityType.Task, label: "タスク" },
  { value: ActivityType.Phone, label: "電話" },
  { value: ActivityType.Email, label: "メール" },
  { value: ActivityType.Meeting, label: "会議" },
]
export const ACTIVITY_STATUS_OPTIONS: Option[] = [
  { value: ActivityStatus.NotStarted, label: "未着手" },
  { value: ActivityStatus.InProgress, label: "進行中" },
  { value: ActivityStatus.Completed, label: "完了" },
]
const PRIORITY_OPTIONS: Option[] = [
  { value: 100000000, label: "高" },
  { value: 100000001, label: "中" },
  { value: 100000002, label: "低" },
]
const LEAD_STATUS_OPTIONS: Option[] = [
  { value: 100000000, label: "新規" },
  { value: 100000001, label: "連絡済" },
  { value: 100000002, label: "認定済" },
  { value: 100000003, label: "不認定" },
  { value: 100000004, label: "変換済" },
]
const LEAD_SOURCE_OPTIONS: Option[] = [
  { value: 100000000, label: "Web" },
  { value: 100000001, label: "紹介" },
  { value: 100000002, label: "イベント" },
  { value: 100000003, label: "広告" },
  { value: 100000004, label: "その他" },
]
const LEAD_RATING_OPTIONS: Option[] = [
  { value: 100000000, label: "ホット" },
  { value: 100000001, label: "ウォーム" },
  { value: 100000002, label: "コールド" },
]
const TARGET_TYPE_OPTIONS: Option[] = [
  { value: TargetType.Individual, label: "個人" },
  { value: TargetType.Team, label: "チーム" },
  { value: TargetType.Department, label: "部門" },
]

export const ENTITIES: Record<EntityKey, EntityDef> = {
  opportunity: {
    key: "opportunity", label: "商談", path: "/opportunities", entitySet: p("crmopportunities"),
    idField: p("crmopportunityid"), nameField: p("name"), ownerScoped: true, orderby: `${p("estimatedclosedate")} asc`,
    fields: [
      { name: p("name"), label: "商談名", type: "text", required: true, inList: true },
      { name: p("accountid"), label: "取引先企業", type: "lookup", target: "account", nav: p("accountid"), inList: true },
      { name: p("contactid"), label: "主担当者", type: "lookup", target: "contact", nav: p("contactid") },
      { name: p("stage"), label: "ステージ", type: "picklist", options: STAGE_OPTIONS, inList: true },
      { name: p("amount"), label: "金額", type: "money", inList: true },
      { name: p("probability"), label: "確度(%)", type: "number", inList: true },
      { name: p("estimatedclosedate"), label: "クローズ予定日", type: "date", inList: true },
      { name: p("actualclosedate"), label: "実クローズ日", type: "date" },
      { name: p("nextstep"), label: "次のアクション", type: "text" },
      { name: p("description"), label: "説明", type: "memo" },
    ],
  },
  lead: {
    key: "lead", label: "リード", path: "/leads", entitySet: p("crmleads"),
    idField: p("crmleadid"), nameField: p("name"), ownerScoped: true, orderby: "createdon desc",
    fields: [
      { name: p("name"), label: "氏名", type: "text", required: true, inList: true },
      { name: p("companyname"), label: "会社名", type: "text", inList: true },
      { name: p("email"), label: "メール", type: "email", inList: true },
      { name: p("phone"), label: "電話", type: "phone" },
      { name: p("jobtitle"), label: "役職", type: "text" },
      { name: p("status"), label: "ステータス", type: "picklist", options: LEAD_STATUS_OPTIONS, inList: true },
      { name: p("source"), label: "ソース", type: "picklist", options: LEAD_SOURCE_OPTIONS },
      { name: p("rating"), label: "評価", type: "picklist", options: LEAD_RATING_OPTIONS, inList: true },
      { name: p("estimatedvalue"), label: "想定金額", type: "money", inList: true },
      { name: p("description"), label: "説明", type: "memo" },
    ],
  },
  account: {
    key: "account", label: "取引先企業", path: "/accounts", entitySet: "accounts",
    idField: "accountid", nameField: "name", ownerScoped: true, orderby: "name asc",
    fields: [
      { name: "name", label: "企業名", type: "text", required: true, inList: true },
      { name: "telephone1", label: "電話", type: "phone", inList: true },
      { name: "emailaddress1", label: "メール", type: "email", inList: true },
      { name: "address1_city", label: "市区町村", type: "text", inList: true },
    ],
  },
  contact: {
    key: "contact", label: "取引先担当者", path: "/contacts", entitySet: "contacts",
    idField: "contactid", nameField: "fullname", ownerScoped: true, orderby: "fullname asc",
    fields: [
      { name: "lastname", label: "姓", type: "text", required: true },
      { name: "firstname", label: "名", type: "text" },
      { name: "fullname", label: "氏名", type: "text", inList: true, readOnly: true },
      { name: "parentcustomerid", label: "所属企業", type: "lookup", target: "account", nav: "parentcustomerid_account", inList: true },
      { name: "jobtitle", label: "役職", type: "text", inList: true },
      { name: "emailaddress1", label: "メール", type: "email", inList: true },
      { name: "telephone1", label: "電話", type: "phone" },
    ],
  },
  activity: {
    key: "activity", label: "営業活動", path: "/activities", entitySet: p("crmactivities"),
    idField: p("crmactivityid"), nameField: p("name"), ownerScoped: true, orderby: `${p("duedate")} desc`,
    fields: [
      { name: p("name"), label: "件名", type: "text", required: true, inList: true },
      { name: p("type"), label: "種別", type: "picklist", options: ACTIVITY_TYPE_OPTIONS, inList: true },
      { name: p("status"), label: "ステータス", type: "picklist", options: ACTIVITY_STATUS_OPTIONS, inList: true },
      { name: p("priority"), label: "優先度", type: "picklist", options: PRIORITY_OPTIONS },
      { name: p("duedate"), label: "期日", type: "datetime", inList: true },
      { name: p("opportunityid"), label: "商談", type: "lookup", target: "opportunity", nav: p("opportunityid"), inList: true },
      { name: p("accountid"), label: "取引先企業", type: "lookup", target: "account", nav: p("accountid") },
      { name: p("contactid"), label: "担当者", type: "lookup", target: "contact", nav: p("contactid") },
      { name: p("description"), label: "内容", type: "memo" },
    ],
  },
  target: {
    key: "target", label: "売上目標", path: "/targets", entitySet: p("crmsalestargets"),
    idField: p("crmsalestargetid"), nameField: p("name"), ownerScoped: true, orderby: `${p("fiscalyear")} desc`,
    fields: [
      { name: p("name"), label: "目標名", type: "text", required: true, inList: true },
      { name: p("targettype"), label: "種別", type: "picklist", options: TARGET_TYPE_OPTIONS, required: true, inList: true },
      { name: p("targetamount"), label: "目標金額", type: "money", required: true, inList: true },
      { name: p("fiscalyear"), label: "年度", type: "number", required: true, inList: true },
      { name: p("quarter"), label: "四半期", type: "number", required: true, inList: true },
      { name: p("fiscalperiodid"), label: "会計期間", type: "lookup", target: "period", nav: `${PREFIX}_FiscalPeriodId` },
      { name: p("department"), label: "部門", type: "text" },
    ],
  },
  period: {
    key: "period", label: "会計期間", path: "/periods", entitySet: p("crmfiscalperiods"),
    idField: p("crmfiscalperiodid"), nameField: p("name"), ownerScoped: false, orderby: `${p("startdate")} asc`,
    fields: [
      { name: p("name"), label: "期間名", type: "text", required: true, inList: true },
      { name: p("startdate"), label: "開始日", type: "date", required: true, inList: true },
      { name: p("enddate"), label: "終了日", type: "date", required: true, inList: true },
      { name: p("fiscalyear"), label: "年度", type: "number", inList: true },
      { name: p("quarter"), label: "四半期", type: "number", inList: true },
    ],
  },
}

export const col = p
