/**
 * インシデント一覧ページ
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useIncidents, useDeleteIncident } from "@/hooks/use-incidents";
import {
  IncidentStatus,
  IncidentPriority,
  statusLabels,
  priorityLabels,
  statusColors,
  priorityColors,
} from "@/lib/incident-types";
import type { Incident } from "@/lib/incident-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle,
  PauseCircle,
  XCircle,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const statusIcons: Record<IncidentStatus, React.ReactNode> = {
  [IncidentStatus.NEW]: <AlertTriangle className="h-4 w-4" />,
  [IncidentStatus.IN_PROGRESS]: <Clock className="h-4 w-4" />,
  [IncidentStatus.ON_HOLD]: <PauseCircle className="h-4 w-4" />,
  [IncidentStatus.RESOLVED]: <CheckCircle className="h-4 w-4" />,
  [IncidentStatus.CLOSED]: <XCircle className="h-4 w-4" />,
};

export default function IncidentListPage() {
  const { data: incidents, isLoading, error } = useIncidents();
  const deleteMutation = useDeleteIncident();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<Incident | null>(null);

  const filtered = (incidents ?? []).filter((inc) => {
    const matchSearch =
      !search ||
      inc.geek_name.toLowerCase().includes(search.toLowerCase()) ||
      (inc.geek_description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" || inc.geek_status === Number(statusFilter);
    const matchPriority =
      priorityFilter === "all" || inc.geek_priority === Number(priorityFilter);
    return matchSearch && matchStatus && matchPriority;
  });

  // 統計
  const stats = {
    total: incidents?.length ?? 0,
    open: incidents?.filter((i) => i.geek_status <= IncidentStatus.ON_HOLD).length ?? 0,
    critical: incidents?.filter((i) => i.geek_priority === IncidentPriority.CRITICAL).length ?? 0,
    resolved: incidents?.filter((i) => i.geek_status >= IncidentStatus.RESOLVED).length ?? 0,
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.geek_incidentid);
      toast.success("インシデントを削除しました");
    } catch {
      toast.error("削除に失敗しました");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            データの取得に失敗しました。Dataverse への接続を確認してください。
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">インシデント管理</h1>
          <p className="text-muted-foreground mt-1">
            社内のインシデントを一元管理します
          </p>
        </div>
        <Link to="/incidents/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            新規作成
          </Button>
        </Link>
      </div>

      {/* 統計カード */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              合計
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              対応中
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              緊急
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              解決済
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          </CardContent>
        </Card>
      </div>

      {/* フィルター */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="タイトル・説明で検索…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="ステータス" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(statusLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="優先度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {Object.entries(priorityLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">タイトル</TableHead>
                <TableHead>ステータス</TableHead>
                <TableHead>優先度</TableHead>
                <TableHead>カテゴリ</TableHead>
                <TableHead>場所</TableHead>
                <TableHead>担当者</TableHead>
                <TableHead>報告者</TableHead>
                <TableHead>作成日</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    読み込み中…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    インシデントが見つかりません
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inc) => (
                  <TableRow key={inc.geek_incidentid} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link
                        to={`/incidents/${inc.geek_incidentid}`}
                        className="font-medium hover:underline"
                      >
                        {inc.geek_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`gap-1 ${statusColors[inc.geek_status as IncidentStatus] ?? ""}`}
                      >
                        {statusIcons[inc.geek_status as IncidentStatus]}
                        {statusLabels[inc.geek_status as IncidentStatus] ?? "不明"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={priorityColors[inc.geek_priority as IncidentPriority] ?? ""}
                      >
                        {priorityLabels[inc.geek_priority as IncidentPriority] ?? "不明"}
                      </Badge>
                    </TableCell>
                    <TableCell>{inc.geek_incidentcategoryid?.geek_name ?? "—"}</TableCell>
                    <TableCell>{inc.geek_locationid?.geek_name ?? "—"}</TableCell>
                    <TableCell>{inc.geek_assignedtoid?.fullname ?? "—"}</TableCell>
                    <TableCell>{inc.createdby?.fullname ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(inc.createdon).toLocaleDateString("ja-JP")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.preventDefault();
                          setDeleteTarget(inc);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="インシデントを削除"
        description={`「${deleteTarget?.geek_name}」を削除しますか？ この操作は取り消せません。`}
        onConfirm={handleDelete}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}
