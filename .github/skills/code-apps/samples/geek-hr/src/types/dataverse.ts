// ── Employee ──────────────────────────────────────────────────

export type EmployeeStatus = 100000000 | 100000001 | 100000002
export type EmploymentType = 100000000 | 100000001 | 100000002 | 100000003

export interface Employee {
  [key: string]: unknown // dynamic prefix fields
  createdon?: string
  _createdby_value?: string
}

export const EMPLOYEE_STATUS = {
  ACTIVE:     100000000 as EmployeeStatus,
  LEAVE:      100000001 as EmployeeStatus,
  RESIGNED:   100000002 as EmployeeStatus,
} as const

export const EMPLOYMENT_TYPE = {
  FULL_TIME:  100000000 as EmploymentType,
  CONTRACT:   100000001 as EmploymentType,
  PART_TIME:  100000002 as EmploymentType,
  TEMP:       100000003 as EmploymentType,
} as const

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  100000000: "在籍",
  100000001: "休職",
  100000002: "退職",
}

export const EMPLOYEE_STATUS_COLOR: Record<EmployeeStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-gray-100 text-gray-600",
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  100000000: "正社員",
  100000001: "契約社員",
  100000002: "パート/アルバイト",
  100000003: "派遣",
}

export const EMPLOYMENT_TYPE_COLOR: Record<EmploymentType, string> = {
  100000000: "bg-teal-100 text-teal-800",
  100000001: "bg-blue-100 text-blue-800",
  100000002: "bg-purple-100 text-purple-800",
  100000003: "bg-orange-100 text-orange-800",
}

export const EMPLOYEE_STATUS_OPTIONS = Object.entries(EMPLOYEE_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as EmployeeStatus,
  label,
}))

export const EMPLOYMENT_TYPE_OPTIONS = Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => ({
  value: Number(value) as EmploymentType,
  label,
}))

// ── Recruitment ───────────────────────────────────────────────

export type RecruitmentStatus = 100000000 | 100000001 | 100000002 | 100000003

export interface Recruitment {
  [key: string]: unknown
  createdon?: string
}

export const RECRUITMENT_STATUS = {
  OPEN:       100000000 as RecruitmentStatus,
  SCREENING:  100000001 as RecruitmentStatus,
  HIRED:      100000002 as RecruitmentStatus,
  CLOSED:     100000003 as RecruitmentStatus,
} as const

export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  100000000: "募集中",
  100000001: "選考中",
  100000002: "採用決定",
  100000003: "募集終了",
}

export const RECRUITMENT_STATUS_COLOR: Record<RecruitmentStatus, string> = {
  100000000: "bg-teal-100 text-teal-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-gray-100 text-gray-600",
}

export const RECRUITMENT_STATUS_OPTIONS = Object.entries(RECRUITMENT_STATUS_LABEL).map(([value, label]) => ({
  value: Number(value) as RecruitmentStatus,
  label,
}))

// ── Candidate ─────────────────────────────────────────────────

export type CandidateStage =
  | 100000000
  | 100000001
  | 100000002
  | 100000003
  | 100000004
  | 100000005

export interface Candidate {
  [key: string]: unknown
  createdon?: string
}

export const CANDIDATE_STAGE = {
  DOCUMENT:    100000000 as CandidateStage,
  INTERVIEW1:  100000001 as CandidateStage,
  INTERVIEW2:  100000002 as CandidateStage,
  FINAL:       100000003 as CandidateStage,
  OFFER:       100000004 as CandidateStage,
  REJECTED:    100000005 as CandidateStage,
} as const

export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  100000000: "書類審査",
  100000001: "一次面接",
  100000002: "二次面接",
  100000003: "最終面接",
  100000004: "内定",
  100000005: "不採用",
}

export const CANDIDATE_STAGE_COLOR: Record<CandidateStage, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-yellow-100 text-yellow-800",
  100000002: "bg-orange-100 text-orange-800",
  100000003: "bg-purple-100 text-purple-800",
  100000004: "bg-green-100 text-green-800",
  100000005: "bg-red-100 text-red-800",
}

export const CANDIDATE_STAGE_OPTIONS = Object.entries(CANDIDATE_STAGE_LABEL).map(([value, label]) => ({
  value: Number(value) as CandidateStage,
  label,
}))

// ── Evaluation ────────────────────────────────────────────────

export interface Evaluation {
  [key: string]: unknown
  createdon?: string
}
