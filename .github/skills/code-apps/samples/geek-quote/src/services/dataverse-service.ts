import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


export async function getQuotes() { return DataverseService.ListRecords(`${P}_quotes`) }
export async function createQuote(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_quotes`, data) }
export async function updateQuote(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_quotes`, id, data) }
export async function deleteQuote(id: string) { return DataverseService.DeleteRecord(`${P}_quotes`, id) }

export async function getQuoteLines() { return DataverseService.ListRecords(`${P}_quote_lines`) }
export async function createQuoteLine(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_quote_lines`, data) }
export async function updateQuoteLine(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_quote_lines`, id, data) }
export async function deleteQuoteLine(id: string) { return DataverseService.DeleteRecord(`${P}_quote_lines`, id) }

export async function getInvoices() { return DataverseService.ListRecords(`${P}_invoices`) }
export async function createInvoice(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_invoices`, data) }
export async function updateInvoice(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_invoices`, id, data) }
export async function deleteInvoice(id: string) { return DataverseService.DeleteRecord(`${P}_invoices`, id) }

export async function getCurrentUserId() {
  const ctx = await getContext()
  const entraId = ctx.user?.objectId
  if (!entraId) return undefined
  const records = await DataverseService.ListRecords(
    "systemusers",
    ["systemuserid"],
    `azureactivedirectoryobjectid eq ${entraId}`,
  )
  return records[0]?.systemuserid as string | undefined
}
