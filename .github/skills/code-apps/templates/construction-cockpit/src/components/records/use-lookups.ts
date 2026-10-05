import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { ConstructionService } from "@/services/construction-service"

/** 一覧・詳細で ID から名前を引くための参照データ（工事・作業・工種）。他画面と同じキャッシュを使う */
export function useLookups() {
  const projects = useQuery({ queryKey: ["projects"], queryFn: ConstructionService.projects })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: ConstructionService.tasks })
  const workTypes = useQuery({ queryKey: ["workTypes"], queryFn: ConstructionService.workTypes })
  const maps = useMemo(() => ({
    project: new Map((projects.data ?? []).map((item) => [item.id, item])),
    task: new Map((tasks.data ?? []).map((item) => [item.id, item])),
    workType: new Map((workTypes.data ?? []).map((item) => [item.id, item])),
  }), [projects.data, tasks.data, workTypes.data])
  const queries = [projects, tasks, workTypes]
  return {
    ...maps,
    projects: projects.data ?? [],
    workTypes: workTypes.data ?? [],
    isLoading: queries.some((query) => query.isLoading),
    error: queries.find((query) => query.error)?.error ?? null,
    projectName: (id: string) => maps.project.get(id)?.name ?? "（工事未設定）",
    taskName: (id: string) => maps.task.get(id)?.name ?? "",
    workTypeName: (id: string) => maps.workType.get(id)?.name ?? "",
    projectOptions: (projects.data ?? []).map((item) => ({ value: item.id, label: item.name })),
    workTypeOptions: (workTypes.data ?? []).map((item) => ({ value: item.id, label: item.name })),
  }
}

export const optionsOf = (labels: Record<number, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }))
export const formatDate = (value: string) => (value ? value.slice(0, 10) : "")
export const formatDateTime = (value: string) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" }) : ""
}
