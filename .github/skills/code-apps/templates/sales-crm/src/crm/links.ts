// Outlook / Teams のディープリンク。送信・予定作成は利用者が開いた画面で確認して行う（自動送信しない）。
const q = (params: Record<string, string | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&")

const list = (emails: (string | undefined)[]) => emails.filter((e): e is string => !!e).join(",")

export interface Draft {
  to: (string | undefined)[]
  subject: string
  body?: string
}

export interface MeetingDraft extends Draft {
  start?: Date
  minutes?: number
}

function window30(start?: Date, minutes = 30) {
  if (!start) return {}
  return { startdt: start.toISOString(), enddt: new Date(start.getTime() + minutes * 60_000).toISOString() }
}

export function outlookMailUrl(d: Draft): string {
  return `https://outlook.office.com/mail/deeplink/compose?${q({ to: list(d.to), subject: d.subject, body: d.body })}`
}

export function outlookMeetingUrl(d: MeetingDraft): string {
  return `https://outlook.office.com/calendar/deeplink/compose?${q({ to: list(d.to), subject: d.subject, body: d.body, ...window30(d.start, d.minutes) })}`
}

export function teamsChatUrl(emails: (string | undefined)[], message?: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?${q({ users: list(emails), message })}`
}

export function teamsMeetingUrl(d: MeetingDraft): string {
  const range = window30(d.start, d.minutes)
  return `https://teams.microsoft.com/l/meeting/new?${q({ subject: d.subject, attendees: list(d.to), content: d.body, startTime: range.startdt, endTime: range.enddt })}`
}

export function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer")
}

export function nextBusinessSlot(now = new Date(), hour = 10): Date {
  const d = new Date(now)
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}
