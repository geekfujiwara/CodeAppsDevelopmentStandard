import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"

export const LINK_REQUEST_ENTITY = `${P}_accountlinkrequests`

export const LinkRequestStatus = {
  Open: 100000000,
  Done: 100000001,
  Rejected: 100000002,
} as const

export interface LinkRequest {
  id: string
  name: string
  contactId: string | null
  contactName: string | null
  requestedCompany: string | null
  status: number
  createdOn: string
}

export interface ContactSummary {
  contactid: string
  fullname: string | null
  emailaddress1: string | null
  accountId: string | null
  accountName: string | null
}

export interface AccountSummary {
  accountid: string
  name: string | null
}

export async function getLinkRequests(onlyOpen = true): Promise<LinkRequest[]> {
  const rows = await DataverseService.ListRecords(
    LINK_REQUEST_ENTITY,
    [
      `${P}_accountlinkrequestid`,
      `${P}_name`,
      `_${P}_contactid_value`,
      `${P}_requestedcompany`,
      `${P}_status`,
      "createdon",
    ],
    onlyOpen ? `${P}_status eq ${LinkRequestStatus.Open}` : undefined,
  )
  return rows.map((r) => ({
    id: r[`${P}_accountlinkrequestid`] as string,
    name: (r[`${P}_name`] as string) ?? "",
    contactId: (r[`_${P}_contactid_value`] as string) ?? null,
    // Lookup 名はサービスが返さないため、注釈から解決する
    contactName: (r[`_${P}_contactid_value@OData.Community.Display.V1.FormattedValue`] as string) ?? null,
    requestedCompany: (r[`${P}_requestedcompany`] as string) ?? null,
    status: (r[`${P}_status`] as number) ?? LinkRequestStatus.Open,
    createdOn: (r.createdon as string) ?? "",
  }))
}

export async function getContact(contactId: string): Promise<ContactSummary> {
  const row = await DataverseService.GetItem("contacts", contactId, [
    "contactid",
    "fullname",
    "emailaddress1",
    "_parentcustomerid_value",
  ])
  return {
    contactid: row.contactid as string,
    fullname: (row.fullname as string) ?? null,
    emailaddress1: (row.emailaddress1 as string) ?? null,
    accountId: (row._parentcustomerid_value as string) ?? null,
    accountName: (row["_parentcustomerid_value@OData.Community.Display.V1.FormattedValue"] as string) ?? null,
  }
}

export async function searchAccounts(keyword: string): Promise<AccountSummary[]> {
  const escaped = keyword.replace(/'/g, "''")
  const filter = escaped ? `contains(name,'${escaped}')` : undefined
  const rows = await DataverseService.ListRecords("accounts", ["accountid", "name"], filter)
  return rows.map((r) => ({ accountid: r.accountid as string, name: (r.name as string) ?? null }))
}

/** contact に取引先企業を設定してから、依頼を対応済みにする（順序を入れ替えない）。 */
export async function linkContactToAccount(
  requestId: string,
  contactId: string,
  accountId: string,
  note?: string,
) {
  await DataverseService.UpdateRecord("contacts", contactId, {
    // 顧客型 Lookup のため、アカウント側のナビゲーションプロパティを指定する
    "parentcustomerid_account@odata.bind": `/accounts(${accountId})`,
  })
  await DataverseService.UpdateRecord(LINK_REQUEST_ENTITY, requestId, {
    [`${P}_status`]: LinkRequestStatus.Done,
    [`${P}_note`]: note ?? "",
  })
}

export async function rejectLinkRequest(requestId: string, reason: string) {
  await DataverseService.UpdateRecord(LINK_REQUEST_ENTITY, requestId, {
    [`${P}_status`]: LinkRequestStatus.Rejected,
    [`${P}_note`]: reason,
  })
}
