import { useQuery } from "@tanstack/react-query"
import { label, listAll, str } from "@/data/dataverse-client"
import { bindingFilter, selectionKey, validSourceIndex, type PlantAgentSelection } from "@/lib/plant-agent-contract"

const P = import.meta.env.VITE_PUBLISHER_PREFIX?.trim() || ""
const TP = import.meta.env.VITE_TABLE_PREFIX?.trim() || `${P}_kb`
const f = (name: string) => `${P}_${name}`

const PLANT_BINDING_ENTITY_SET = `${TP}plantbindings`

export type PlantBindingStatus =
  | { kind: "unbound" }
  | { kind: "bound"; bindingIds: string[]; tagIds: string[]; tagLabels: string[] }
  | { kind: "ambiguous"; count: number }

export async function resolvePlantBindings(selection: PlantAgentSelection): Promise<PlantBindingStatus> {
  if (!selection.modelId || !Number.isInteger(selection.modelRevision) || selection.modelRevision! < 1) {
    throw new Error("モデル改訂が未確定です。")
  }
  const literal = (value: string) => `'${value.replace(/'/g, "''")}'`
  const filter = selection.nodeId ? bindingFilter(selection, P) : [
    `${f("modelid")} eq ${literal(selection.modelId)}`,
    `${f("modelrevision")} eq ${selection.modelRevision}`,
    `(${f("partid")} eq null or ${f("partid")} eq '')`,
    `${f("active")} eq true`,
    "statecode eq 0",
  ].join(" and ")
  const rows = await listAll(PLANT_BINDING_ENTITY_SET, {
    select: [`${TP}plantbindingid`, f("nodeid"), f("partid"), `_${f("tagid")}_value`],
    filter,
    top: selection.nodeId ? 2 : 5000,
  })
  if (!rows.length) return { kind: "unbound" }
  const keys = rows.map((row) => JSON.stringify([str(row, f("nodeid")), str(row, f("partid")) ?? ""]))
  if (new Set(keys).size !== rows.length) return { kind: "ambiguous", count: rows.length }
  const bindingIds = rows.map((row) => str(row, `${TP}plantbindingid`)).filter((value): value is string => !!value)
  const tagIds = [...new Set(rows.map((row) => str(row, `_${f("tagid")}_value`)).filter((value): value is string => !!value))]
  const tagLabels = [...new Set(rows.map((row) => label(row, `_${f("tagid")}_value`)).filter(Boolean))]
  if (bindingIds.length !== rows.length || !tagIds.length) return { kind: "unbound" }
  return { kind: "bound", bindingIds, tagIds, tagLabels }
}

export function usePlantBinding(selection: PlantAgentSelection, principalKey: string) {
  return useQuery({
    queryKey: ["kb-plant-binding", principalKey, selectionKey(selection)],
    enabled: !!selection.modelId && !!selection.modelRevision && !!principalKey,
    queryFn: () => resolvePlantBindings(selection),
    retry: false,
    gcTime: 0,
    staleTime: 0,
  })
}

export function usePlantSourceIndexes(tagIds: string[] | undefined, principalKey: string) {
  return useQuery({
    queryKey: ["kb-plant-source-indexes", principalKey, ...(tagIds ?? [])],
    enabled: !!tagIds?.length && !!principalKey,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    queryFn: async () => {
      if (!tagIds?.length || tagIds.some((tagId) => !/^[0-9a-f-]{36}$/i.test(tagId))) throw new Error("タグ参照が不正です。")
      const rows = await listAll(`${TP}sourceindexes`, {
        select: [`${TP}sourceindexid`, f("name"), f("sourcekind"), f("verified"), f("pagenumber"), f("partcode"), `_${f("tagid")}_value`, `_${f("drawingrevisionid")}_value`, `_${f("documentid")}_value`, "statecode"],
        filter: `(${tagIds.map((tagId) => `_${f("tagid")}_value eq ${tagId}`).join(" or ")}) and statecode eq 0 and ${f("verified")} eq true`,
      })
      return { eligible: rows.filter((row) => validSourceIndex(row, P, TP)), invalidCount: rows.filter((row) => !validSourceIndex(row, P, TP)).length }
    },
  })
}
