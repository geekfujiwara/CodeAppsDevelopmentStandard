export const DATAVERSE_URL = (import.meta.env.VITE_DATAVERSE_URL ?? "").trim()
export const PREFIX = (import.meta.env.VITE_PUBLISHER_PREFIX ?? "").trim()
export const SP_SITE_URL = (import.meta.env.VITE_AGM_SP_SITE_URL ?? "").trim()
export const SP_LIBRARY = (import.meta.env.VITE_AGM_SP_LIBRARY ?? "").trim()
export const MEETING_TITLE = (import.meta.env.VITE_AGM_MEETING_TITLE ?? "").trim() || "株主総会"
export const MEETING_DATE = (import.meta.env.VITE_AGM_MEETING_DATE ?? "").trim()

export const ENTITY = {
  qa: `${PREFIX}_agmqas`,
  ir: `${PREFIX}_agmirexcerpts`,
  meeting: `${PREFIX}_agmmeetings`,
  turn: `${PREFIX}_agmturns`,
  question: `${PREFIX}_agmquestions`,
  shareholder: `${PREFIX}_agmshareholders`,
  live: `${PREFIX}_agmlives`,
  script: `${PREFIX}_agmscripts`,
  setting: `${PREFIX}_agmsettings`,
}

export const col = (name: string) => `${PREFIX}_${name}`

export function missingConfig(): string[] {
  const missing: string[] = []
  if (!DATAVERSE_URL) missing.push("VITE_DATAVERSE_URL")
  if (!PREFIX) missing.push("VITE_PUBLISHER_PREFIX")
  if (!SP_SITE_URL) missing.push("VITE_AGM_SP_SITE_URL")
  if (!SP_LIBRARY) missing.push("VITE_AGM_SP_LIBRARY")
  return missing
}
