import { MicrosoftDataverseService } from "@/integrations/connectors"

const ORGANIZATION = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""

// Choice 列を文字列ラベルで受け取る（整数コードをフロントに持ち込まないため）。
const PREFER_FORMATTED = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
export const FORMATTED = "@OData.Community.Display.V1.FormattedValue"

const MAX_PAGES = 20

export type DataverseRow = Record<string, unknown>

export type ListOptions = {
  select?: string[]
  filter?: string
  orderBy?: string
  top?: number
}

function assertOrganization() {
  if (!ORGANIZATION) {
    throw new Error(
      "VITE_DATAVERSE_URL が未設定です。.env に Dataverse の環境 URL を設定してください。",
    )
  }
}

/**
 * ページングを辿って全件取得する。Dataverse は既定 5000 件で切られるため
 * ページを追跡しないと KPI の分母が静かに欠ける。
 *
 * power-apps-cli v1.x の生成サービスには GetNextPage 系が含まれないため、
 * @odata.nextLink から $skiptoken を取り出して ListRecords に渡し直す。
 */
export async function listAll(entitySetName: string, options: ListOptions = {}): Promise<DataverseRow[]> {
  assertOrganization()

  const rows: DataverseRow[] = []
  let skipToken: string | undefined
  // 想定外の nextLink ループでブラウザを固めないための保険
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await MicrosoftDataverseService.ListRecordsWithOrganization(
      ORGANIZATION,
      entitySetName,
      PREFER_FORMATTED,
      undefined,
      undefined,
      undefined,
      options.select?.join(","),
      options.filter,
      options.orderBy,
      undefined,
      undefined,
      options.top,
      skipToken,
    )

    if (!result.success) {
      throw new Error(`${entitySetName} の取得に失敗しました: ${result.error ?? "unknown error"}`)
    }

    const data = result.data as { value?: DataverseRow[]; "@odata.nextLink"?: string } | undefined
    rows.push(...(data?.value ?? []))

    const nextLink = data?.["@odata.nextLink"]
    if (!nextLink) break

    const nextToken = readSkipToken(nextLink)
    if (!nextToken || nextToken === skipToken) break
    skipToken = nextToken
  }

  return rows
}

function readSkipToken(nextLink: string): string | null {
  try {
    return new URL(nextLink, ORGANIZATION).searchParams.get("$skiptoken")
  } catch {
    return null
  }
}

export function str(row: DataverseRow, field: string): string | null {
  const value = row[field]
  return typeof value === "string" && value.length > 0 ? value : null
}

/** Choice / Lookup は FormattedValue 注釈側にラベルが入る */
export function label(row: DataverseRow, field: string): string {
  return str(row, `${field}${FORMATTED}`) ?? ""
}

export function bool(row: DataverseRow, field: string): boolean {
  return row[field] === true
}

export function num(row: DataverseRow, field: string): number {
  const value = row[field]
  return typeof value === "number" ? value : 0
}
