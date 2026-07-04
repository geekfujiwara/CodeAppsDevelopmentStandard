export type CourseStatus = 100000000 | 100000001 | 100000002
export const COURSE_STATUS_LABEL: Record<CourseStatus, string> = {
  100000000: "募集中",
  100000001: "満席",
  100000002: "終了",
}
export const COURSE_STATUS_COLOR: Record<CourseStatus, string> = {
  100000000: "bg-green-100 text-green-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-gray-100 text-gray-600",
}
export const COURSE_STATUS_OPTIONS = [
  { value: 100000000, label: "募集中" },
  { value: 100000001, label: "満席" },
  { value: 100000002, label: "終了" },
]
/** 矢羽（StagePath）表示用 */
export const COURSE_STAGE_PATH_ITEMS = [
  { value: 100000000, label: "募集中" },
  { value: 100000001, label: "満席" },
  { value: 100000002, label: "終了" },
]
export const COURSE_STATUS_OPEN = 100000000

export type CourseFormat = 100000000 | 100000001 | 100000002
export const COURSE_FORMAT_LABEL: Record<CourseFormat, string> = {
  100000000: "集合研修",
  100000001: "オンライン",
  100000002: "eラーニング",
}
export const COURSE_FORMAT_COLOR: Record<CourseFormat, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-purple-100 text-purple-800",
  100000002: "bg-teal-100 text-teal-800",
}
export const COURSE_FORMAT_OPTIONS = [
  { value: 100000000, label: "集合研修" },
  { value: 100000001, label: "オンライン" },
  { value: 100000002, label: "eラーニング" },
]

export type EnrollmentStatus = 100000000 | 100000001 | 100000002 | 100000003
export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  100000000: "申込",
  100000001: "受講中",
  100000002: "修了",
  100000003: "キャンセル",
}
export const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  100000000: "bg-blue-100 text-blue-800",
  100000001: "bg-orange-100 text-orange-700",
  100000002: "bg-green-100 text-green-800",
  100000003: "bg-gray-100 text-gray-600",
}
export const ENROLLMENT_STATUS_OPTIONS = [
  { value: 100000000, label: "申込" },
  { value: 100000001, label: "受講中" },
  { value: 100000002, label: "修了" },
  { value: 100000003, label: "キャンセル" },
]
export const ENROLLMENT_COMPLETED = 100000002
export const ENROLLMENT_CANCELLED = 100000003
/** 定員カウント対象（キャンセル以外） */
export const ENROLLMENT_ACTIVE_STATUSES = [100000000, 100000001, 100000002]

export type Rating = 100000000 | 100000001 | 100000002 | 100000003 | 100000004
export const RATING_LABEL: Record<Rating, string> = {
  100000000: "★1", 100000001: "★2", 100000002: "★3", 100000003: "★4", 100000004: "★5",
}
export const RATING_OPTIONS = [
  { value: 100000000, label: "★1" },
  { value: 100000001, label: "★2" },
  { value: 100000002, label: "★3" },
  { value: 100000003, label: "★4" },
  { value: 100000004, label: "★5" },
]

export type Course = Record<string, unknown>
export type Enrollment = Record<string, unknown>
