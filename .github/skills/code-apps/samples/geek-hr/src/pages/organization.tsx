import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { useEmployees } from "@/hooks/use-dataverse"
import { PUBLISHER_PREFIX } from "@/config"
import { EMPLOYMENT_TYPE_LABEL, type EmploymentType } from "@/types/dataverse"
import { Users } from "lucide-react"

export default function Organization() {
  const { data: employees = [], isLoading } = useEmployees()

  const P = PUBLISHER_PREFIX
  const f = {
    name:            `${P}_name`,
    department:      `${P}_department`,
    position:        `${P}_position`,
    employment_type: `${P}_employment_type`,
    status:          `${P}_status`,
  }

  const deptGroups = useMemo(() => {
    const active = employees.filter((e) => (e[f.status] as number) === 100000000)
    const groups: Record<string, { name: string; position: string; type: EmploymentType | null }[]> = {}
    active.forEach((e) => {
      const dept = (e[f.department] as string) || "未設定"
      if (!groups[dept]) groups[dept] = []
      groups[dept].push({
        name:     (e[f.name] as string) ?? "—",
        position: (e[f.position] as string) ?? "",
        type:     e[f.employment_type] as EmploymentType | null,
      })
    })
    return Object.entries(groups)
      .map(([dept, members]) => ({ dept, members }))
      .sort((a, b) => b.members.length - a.members.length)
  }, [employees, f])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">組織図</h1>
        <LoadingSkeletonGrid columns={3} count={6} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">組織図</h1>
        <p className="text-sm text-muted-foreground">在籍中の社員を部門別に表示しています</p>
      </div>

      {deptGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            在籍中の社員データがありません
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {deptGroups.map(({ dept, members }) => (
            <Card key={dept}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" />
                  {dept}
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    {members.length}名
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {members.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{m.name}</p>
                        {m.position && (
                          <p className="text-xs text-muted-foreground truncate">{m.position}</p>
                        )}
                      </div>
                      {m.type != null && (
                        <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                          {EMPLOYMENT_TYPE_LABEL[m.type]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
