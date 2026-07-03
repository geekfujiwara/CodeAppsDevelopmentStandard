import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

export async function getQuotes() { return client().getRecords(`${P}_quotes`) }
export async function createQuote(data: Record<string, unknown>) { return client().createRecord(`${P}_quotes`, data) }
export async function updateQuote(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_quotes`, id, data) }
export async function deleteQuote(id: string) { return client().deleteRecord(`${P}_quotes`, id) }

export async function getQuoteLines() { return client().getRecords(`${P}_quote_lines`) }
export async function createQuoteLine(data: Record<string, unknown>) { return client().createRecord(`${P}_quote_lines`, data) }
export async function updateQuoteLine(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_quote_lines`, id, data) }
export async function deleteQuoteLine(id: string) { return client().deleteRecord(`${P}_quote_lines`, id) }

export async function getInvoices() { return client().getRecords(`${P}_invoices`) }
export async function createInvoice(data: Record<string, unknown>) { return client().createRecord(`${P}_invoices`, data) }
export async function updateInvoice(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_invoices`, id, data) }
export async function deleteInvoice(id: string) { return client().deleteRecord(`${P}_invoices`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
