/**
 * インシデント詳細ページ
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  useIncident,
  useUpdateIncident,
  useDeleteIncident,
  useComments,
  useCreateComment,
} from "@/hooks/use-incidents";
import {
  IncidentStatus,
  IncidentPriority,
  statusLabels,
  priorityLabels,
  statusColors,
  priorityColors,
} from "@/lib/incident-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Tag,
  User,
  UserCircle,
  MessageSquare,
  Trash2,
  Send,
} from "lucide-react";
import { toast } from "sonner";

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading } = useIncident(id);
  const { data: comments } = useComments(id);
  const updateMutation = useUpdateIncident();
  const deleteMutation = useDeleteIncident();
  const commentMutation = useCreateComment();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentName, setCommentName] = useState("");
  const [commentContent, setCommentContent] = useState("");

  const handleStatusChange = async (value: string) => {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({
        id,
        payload: { geek_status: Number(value) as IncidentStatus },
      });
      toast.success("ステータスを更新しました");
    } catch {
      toast.error("更新に失敗しました");
    }
  };

  const handlePriorityChange = async (value: string) => {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({
        id,
        payload: { geek_priority: Number(value) as IncidentPriority },
      });
      toast.success("優先度を更新しました");
    } catch {
      toast.error("更新に失敗しました");
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("インシデントを削除しました");
      navigate("/incidents");
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  const handleAddComment = async () => {
    if (!id || !commentName.trim() || !commentContent.trim()) return;
    try {
      await commentMutation.mutateAsync({
        incidentId: id,
        name: commentName.trim(),
        content: commentContent.trim(),
      });
      setCommentName("");
      setCommentContent("");
      toast.success("コメントを追加しました");
    } catch {
      toast.error("コメントの追加に失敗しました");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            インシデントが見つかりません
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link to="/incidents">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {incident.geek_name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              作成日: {new Date(incident.createdon).toLocaleString("ja-JP")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          削除
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* メインコンテンツ */}
        <div className="md:col-span-2 space-y-6">
          {/* 説明 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">説明</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {incident.geek_description || "説明はありません"}
              </p>
            </CardContent>
          </Card>

          {/* コメント */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                コメント ({comments?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* コメント入力 */}
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <Input
                  placeholder="件名"
                  value={commentName}
                  onChange={(e) => setCommentName(e.target.value)}
                />
                <Textarea
                  placeholder="コメントを入力…"
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={
                    !commentName.trim() ||
                    !commentContent.trim() ||
                    commentMutation.isPending
                  }
                  onClick={handleAddComment}
                >
                  <Send className="h-3 w-3" />
                  送信
                </Button>
              </div>

              <Separator />

              {/* コメント一覧 */}
              {comments && comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((c) => (
                    <div
                      key={c.geek_incidentcommentid}
                      className="border rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm">
                          <UserCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {c.createdby?.fullname ?? "不明"}
                          </span>
                        </div>
                        <time className="text-xs text-muted-foreground">
                          {new Date(c.createdon).toLocaleString("ja-JP")}
                        </time>
                      </div>
                      <p className="text-sm font-medium mb-1">{c.geek_name}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {c.geek_content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  コメントはまだありません
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* サイドバー */}
        <div className="space-y-4">
          {/* ステータス */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  ステータス
                </label>
                <Select
                  value={String(incident.geek_status)}
                  onValueChange={handleStatusChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        <Badge
                          variant="secondary"
                          className={
                            statusColors[Number(val) as IncidentStatus] ?? ""
                          }
                        >
                          {label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  優先度
                </label>
                <Select
                  value={String(incident.geek_priority)}
                  onValueChange={handlePriorityChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        <Badge
                          variant="secondary"
                          className={
                            priorityColors[Number(val) as IncidentPriority] ??
                            ""
                          }
                        >
                          {label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 詳細情報 */}
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">カテゴリ:</span>
                <span>
                  {incident.geek_incidentcategoryid?.geek_name ?? "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">場所:</span>
                <span>{incident.geek_locationid?.geek_name ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">担当者:</span>
                <span>{incident.geek_assignedtoid?.fullname ?? "未割当"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">報告者:</span>
                <span>{incident.createdby?.fullname ?? "—"}</span>
              </div>
              {incident.geek_duedate && (
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">期限:</span>
                  <span>
                    {new Date(incident.geek_duedate).toLocaleDateString(
                      "ja-JP",
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 削除確認 */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="インシデントを削除"
        description={`「${incident.geek_name}」を削除しますか？ この操作は取り消せません。`}
        onConfirm={handleDelete}
        confirmLabel="削除"
        variant="destructive"
      />
    </div>
  );
}
