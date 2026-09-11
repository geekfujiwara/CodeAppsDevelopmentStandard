import { DataverseService, type DataverseRow } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX } from "@/config"
import { str, bool } from "@/lib/dataverse-fields"

const p = PUBLISHER_PREFIX || "geek"

export const SKILL_ENTITY_SET = `${p}_skills`

export const SKILLS_KEY = ["skills"]

export const SF = {
  id: `${p}_skillid`,
  name: `${p}_name`,
  title: `${p}_title`,
  summary: `${p}_summary`,
  body: `${p}_body`,
  builtIn: `${p}_builtin`,
  syncedOn: `${p}_syncedon`,
} as const

export type Skill = {
  id: string
  name: string
  title: string
  summary: string
  body: string
  builtIn: boolean
  syncedOn: string
}

function toSkill(row: DataverseRow): Skill {
  return {
    id: str(row, SF.id),
    name: str(row, SF.name),
    title: str(row, SF.title),
    summary: str(row, SF.summary),
    body: str(row, SF.body),
    builtIn: bool(row, SF.builtIn),
    syncedOn: str(row, SF.syncedOn),
  }
}

export async function listSkills(): Promise<Skill[]> {
  const rows = await DataverseService.ListRecords(SKILL_ENTITY_SET, {
    select: Object.values(SF),
    orderBy: `${SF.name} asc`,
    top: 200,
  })
  return rows.map(toSkill)
}
