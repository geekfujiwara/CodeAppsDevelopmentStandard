import { getClient } from "@microsoft/power-apps"
import dataSourcesInfo from "@/lib/dataSourcesInfo"
import { PUBLISHER_PREFIX as P } from "@/config"

function client() { return getClient(dataSourcesInfo) }

// Products
export async function getProducts() { return client().getRecords(`${P}_products`) }
export async function createProduct(data: Record<string, unknown>) { return client().createRecord(`${P}_products`, data) }
export async function updateProduct(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_products`, id, data) }
export async function deleteProduct(id: string) { return client().deleteRecord(`${P}_products`, id) }

// StockMovements
export async function getStockMovements() { return client().getRecords(`${P}_stock_movements`) }
export async function createStockMovement(data: Record<string, unknown>) { return client().createRecord(`${P}_stock_movements`, data) }
export async function updateStockMovement(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_stock_movements`, id, data) }
export async function deleteStockMovement(id: string) { return client().deleteRecord(`${P}_stock_movements`, id) }

// Orders
export async function getOrders() { return client().getRecords(`${P}_orders`) }
export async function createOrder(data: Record<string, unknown>) { return client().createRecord(`${P}_orders`, data) }
export async function updateOrder(id: string, data: Record<string, unknown>) { return client().updateRecord(`${P}_orders`, id, data) }
export async function deleteOrder(id: string) { return client().deleteRecord(`${P}_orders`, id) }

export async function getCurrentUserId() {
  const records = await client().getRecords("systemusers", {
    filter: "Microsoft.Dynamics.CRM.CurrentUserSettings()",
    select: ["systemuserid"],
    top: 1,
  })
  return records[0]?.systemuserid as string | undefined
}
