import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MicrosoftDataverseService } from "@/integrations/connectors"
import { label, listAll, num, str } from "@/data/dataverse-client"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`
const ORGANIZATION = import.meta.env.VITE_DATAVERSE_URL?.trim() ?? ""

const f = (name: string) => `${P}_${name}`
const ENTITY_SET = `${TP}plantsites`

export const OPERATION_STATUS_VALUE = {
  稼働中: 100000000,
  一部停止: 100000001,
  定期点検: 100000002,
  停止中: 100000003,
} as const

export type OperationStatus = keyof typeof OPERATION_STATUS_VALUE

export const OPERATION_STATUSES = Object.keys(OPERATION_STATUS_VALUE) as OperationStatus[]

/** 地図のピンや凡例で使う稼働状況の色 */
export const STATUS_COLOR: Record<OperationStatus, string> = {
  稼働中: "#16a34a",
  一部停止: "#f59e0b",
  定期点検: "#2563eb",
  停止中: "#dc2626",
}

export type PlantSite = {
  id: string
  name: string
  code: string
  modelId: string
  postalCode: string
  address: string
  latitude: number
  longitude: number
  status: OperationStatus
  utilization: number
  manager: string
  note: string
}

export type PlantSiteInput = Omit<PlantSite, "id"> & { id?: string }

export const PLANT_SITE_QUERY_KEY = ["kb-plant-sites"] as const

function asStatus(value: string): OperationStatus {
  return value in OPERATION_STATUS_VALUE ? (value as OperationStatus) : "稼働中"
}

async function fetchPlantSites(): Promise<PlantSite[]> {
  const rows = await listAll(ENTITY_SET, {
    select: [
      `${TP}plantsiteid`,
      f("name"),
      f("code"),
      f("modelid"),
      f("postalcode"),
      f("address"),
      f("latitude"),
      f("longitude"),
      f("operationstatus"),
      f("utilization"),
      f("manager"),
      f("note"),
    ],
    orderBy: `${f("code")} asc`,
  })

  return rows.map((row) => ({
    id: String(row[`${TP}plantsiteid`] ?? ""),
    name: str(row, f("name")) ?? "(無題)",
    code: str(row, f("code")) ?? "",
    modelId: str(row, f("modelid")) ?? "",
    postalCode: str(row, f("postalcode")) ?? "",
    address: str(row, f("address")) ?? "",
    latitude: num(row, f("latitude")),
    longitude: num(row, f("longitude")),
    status: asStatus(label(row, f("operationstatus"))),
    utilization: num(row, f("utilization")),
    manager: str(row, f("manager")) ?? "",
    note: str(row, f("note")) ?? "",
  }))
}

function toItem(input: PlantSiteInput): Record<string, unknown> {
  return {
    [f("name")]: input.name,
    [f("code")]: input.code,
    [f("modelid")]: input.modelId,
    [f("postalcode")]: input.postalCode,
    [f("address")]: input.address,
    [f("latitude")]: input.latitude,
    [f("longitude")]: input.longitude,
    [f("operationstatus")]: OPERATION_STATUS_VALUE[input.status],
    [f("utilization")]: input.utilization,
    [f("manager")]: input.manager,
    [f("note")]: input.note,
  }
}

export function usePlantSites() {
  return useQuery({ queryKey: PLANT_SITE_QUERY_KEY, queryFn: fetchPlantSites, staleTime: 60_000 })
}

export function useSavePlantSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: PlantSiteInput) => {
      if (!ORGANIZATION) throw new Error("VITE_DATAVERSE_URL が未設定です。")
      const item = toItem(input)
      const result = input.id
        ? await MicrosoftDataverseService.UpdateRecordWithOrganization(
            "return=representation",
            "application/json",
            ORGANIZATION,
            ENTITY_SET,
            input.id,
            item,
          )
        : await MicrosoftDataverseService.CreateRecordWithOrganization(
            "return=representation",
            "application/json",
            ORGANIZATION,
            ENTITY_SET,
            item,
          )
      if (!result.success) {
        throw new Error(`プラント拠点の保存に失敗しました: ${result.error ?? "unknown error"}`)
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLANT_SITE_QUERY_KEY }),
  })
}

export function useDeletePlantSite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (!ORGANIZATION) throw new Error("VITE_DATAVERSE_URL が未設定です。")
      const result = await MicrosoftDataverseService.DeleteRecordWithOrganization(ORGANIZATION, ENTITY_SET, id)
      if (!result.success) {
        throw new Error(`プラント拠点の削除に失敗しました: ${result.error ?? "unknown error"}`)
      }
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: PLANT_SITE_QUERY_KEY }),
  })
}
