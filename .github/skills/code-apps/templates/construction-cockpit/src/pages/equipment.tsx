import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ConstructionService } from "@/services/construction-service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"

export default function Equipment() {
  const equipment = useQuery({ queryKey: ["equipment"], queryFn: ConstructionService.equipment })
  const usage = useQuery({ queryKey: ["equipmentUsage"], queryFn: ConstructionService.equipmentUsage })
  const data = useMemo(() => equipment.data?.map((item) => ({
    name: item.name,
    hours: usage.data?.filter((row) => row.equipmentId === item.id).reduce((sum, row) => sum + row.hours, 0) ?? 0,
  })) ?? [], [equipment.data, usage.data])
  if (equipment.isLoading || usage.isLoading) return <LoadingSkeletonGrid count={2} columns={2} />
  return <div className="space-y-6">
    <header><p className="text-sm font-semibold text-primary">稼働状況</p><h1 className="text-3xl font-bold">重機稼働</h1><p className="text-muted-foreground">直近の日報に登録された重機別の稼働時間です。</p></header>
    <Card><CardHeader><CardTitle>重機別稼働時間</CardTitle></CardHeader><CardContent className="h-[28rem] min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis unit="h" /><Tooltip /><Bar dataKey="hours" name="稼働時間" fill="#ea580c" /></BarChart></ResponsiveContainer></CardContent></Card>
  </div>
}
