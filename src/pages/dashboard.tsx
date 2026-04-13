import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListTable } from "@/components/list-table";
import type { TableColumn } from "@/components/list-table";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  UserX,
  ArrowRight,
} from "lucide-react";
import {
  useIncidents,
  useCategories,
  usePriorities,
  useSystemUsers,
} from "@/hooks/use-incidents";
import type { Geek_incidents } from "@/generated/models/Geek_incidentsModel";
import { statusLabels, statusColors, IncidentStatus } from "@/types/incident";
import { LoadingSkeletonGrid } from "@/components/loading-skeleton";

type IncidentRow = Geek_incidents & Record<string, unknown>;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: incidents = [], isLoading } = useIncidents();
  const { data: categories = [] } = useCategories();
  const { data: priorities = [] } = usePriorities();
  const { data: users = [] } = useSystemUsers();

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) =>
      m.set(u.systemuserid, u.fullname || u.internalemailaddress || ""),
    );
    return m;
  }, [users]);
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.geek_incidentcategoryid, c.geek_name));
    return m;
  }, [categories]);
  const priorityMap = useMemo(() => {
    const m = new Map<string, string>();
    priorities.forEach((p) => m.set(p.geek_priorityid, p.geek_name));
    return m;
  }, [priorities]);

  const newCount = incidents.filter(
    (i) => i.geek_status === IncidentStatus.NEW,
  ).length;
  const inProgressCount = incidents.filter(
    (i) => i.geek_status === IncidentStatus.IN_PROGRESS,
  ).length;
  const resolvedCount = incidents.filter(
    (i) => i.geek_status === IncidentStatus.RESOLVED,
  ).length;
  const closedCount = incidents.filter(
    (i) => i.geek_status === IncidentStatus.CLOSED,
  ).length;

  const unassigned = incidents.filter(
    (i) =>
      !i._geek_assigneeid_value &&
      i.geek_status !== IncidentStatus.CLOSED &&
      i.geek_status !== IncidentStatus.RESOLVED,
  );

  const recentIncidents = incidents.slice(0, 5);

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    incidents.forEach((i) => {
      const catId = i._geek_categoryid_value as string | undefined;
      const name = catId ? categoryMap.get(catId) || "未分類" : "未分類";
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [incidents, categoryMap]);

  const statusChartData = [
    { name: "新規", value: newCount, color: "#3b82f6" },
    { name: "対応中", value: inProgressCount, color: "#eab308" },
    { name: "解決済", value: resolvedCount, color: "#22c55e" },
    { name: "クローズ", value: closedCount, color: "#6b7280" },
  ].filter((d) => d.value > 0);

  const categoryChartData = useMemo(() => {
    return categoryStats.map(([name, count]) => ({ name, count }));
  }, [categoryStats]);

  const stats = [
    {
      title: "合計",
      value: String(incidents.length),
      description: "全インシデント",
      icon: BarChart3,
      className: "text-primary",
    },
    {
      title: "新規",
      value: String(newCount),
      description: "未対応",
      icon: AlertCircle,
      className: "text-blue-600",
    },
    {
      title: "対応中",
      value: String(inProgressCount),
      description: "作業中",
      icon: Clock,
      className: "text-yellow-600",
    },
    {
      title: "解決済",
      value: String(resolvedCount),
      description: "解決済み",
      icon: CheckCircle2,
      className: "text-green-600",
    },
    {
      title: "クローズ",
      value: String(closedCount),
      description: "完了",
      icon: XCircle,
      className: "text-gray-600",
    },
  ];

  const recentColumns: TableColumn<IncidentRow>[] = [
    { key: "geek_name", label: "タイトル", sortable: false },
    {
      key: "geek_status",
      label: "ステータス",
      sortable: false,
      render: (item) => {
        const s = item.geek_status as number | undefined;
        return s != null ? (
          <Badge variant="outline" className={statusColors[s]}>
            {statusLabels[s]}
          </Badge>
        ) : null;
      },
    },
    {
      key: "_geek_priorityid_value",
      label: "優先度",
      sortable: false,
      render: (item) => {
        const v = item._geek_priorityid_value as string | undefined;
        return v ? priorityMap.get(v) || "" : "";
      },
    },
    {
      key: "_geek_assigneeid_value",
      label: "担当者",
      sortable: false,
      render: (item) => {
        const v = item._geek_assigneeid_value as string | undefined;
        return v ? (
          userMap.get(v) || ""
        ) : (
          <span className="text-muted-foreground">未割当</span>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <LoadingSkeletonGrid columns={4} count={4} variant="compact" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LoadingSkeletonGrid columns={1} count={1} variant="detailed" />
          <LoadingSkeletonGrid columns={1} count={1} variant="detailed" />
        </div>
        <LoadingSkeletonGrid columns={1} count={1} variant="detailed" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 統計カード */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((s) => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
              <s.icon className={`h-4 w-4 ${s.className}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 中段: ステータス分布 (円グラフ) + カテゴリ分布 (棒グラフ) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステータス分布</CardTitle>
          </CardHeader>
          <CardContent>
            {statusChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                データがありません
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({
                      name,
                      percent,
                    }: {
                      name?: string;
                      percent?: number;
                    }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {statusChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} 件`, "件数"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別 Top 5</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                データがありません
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={categoryChartData}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip formatter={(value) => [`${value} 件`, "件数"]} />
                  <Bar
                    dataKey="count"
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 未割当アラート */}
      {unassigned.length > 0 && (
        <Card className="border-orange-200 dark:border-orange-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <UserX className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-base">
                未割当インシデント ({unassigned.length}件)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unassigned.slice(0, 3).map((inc) => (
                <div
                  key={inc.geek_incidentid}
                  className="flex items-center justify-between text-sm cursor-pointer hover:bg-muted/50 rounded p-2"
                  onClick={() => navigate(`/incidents/${inc.geek_incidentid}`)}
                >
                  <span className="truncate">{inc.geek_name}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 直近インシデント */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">直近のインシデント</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/incidents")}
          >
            すべて表示 <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <ListTable
            data={recentIncidents as IncidentRow[]}
            columns={recentColumns}
            searchKeys={["geek_name"]}
            onRowClick={(row) => navigate(`/incidents/${row.geek_incidentid}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
