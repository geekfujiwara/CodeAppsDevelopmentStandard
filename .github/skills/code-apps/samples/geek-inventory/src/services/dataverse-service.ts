import { getContext } from "@microsoft/power-apps/app"
import { DataverseService } from "@/lib/dataverse-client"
import { PUBLISHER_PREFIX as P } from "@/config"


// Products
export async function getProducts() { return DataverseService.ListRecords(`${P}_products`) }
export async function createProduct(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_products`, data) }
export async function updateProduct(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_products`, id, data) }
export async function deleteProduct(id: string) { return DataverseService.DeleteRecord(`${P}_products`, id) }

// StockMovements
export async function getStockMovements() { return DataverseService.ListRecords(`${P}_stock_movements`) }
export async function createStockMovement(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_stock_movements`, data) }
export async function updateStockMovement(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_stock_movements`, id, data) }
export async function deleteStockMovement(id: string) { return DataverseService.DeleteRecord(`${P}_stock_movements`, id) }

// Orders
export async function getOrders() { return DataverseService.ListRecords(`${P}_orders`) }
export async function createOrder(data: Record<string, unknown>) { return DataverseService.CreateRecord(`${P}_orders`, data) }
export async function updateOrder(id: string, data: Record<string, unknown>) { return DataverseService.UpdateRecord(`${P}_orders`, id, data) }
export async function deleteOrder(id: string) { return DataverseService.DeleteRecord(`${P}_orders`, id) }

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
