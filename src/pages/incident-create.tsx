/**
 * インシデント新規作成ページ
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  useCreateIncident,
  useCategories,
  useLocations,
} from "@/hooks/use-incidents";
import {
  IncidentStatus,
  IncidentPriority,
  statusLabels,
  priorityLabels,
} from "@/lib/incident-types";
import type { CreateIncidentPayload } from "@/lib/incident-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

export default function IncidentCreatePage() {
  const navigate = useNavigate();
  const createMutation = useCreateIncident();
  const { data: categories } = useCategories();
  const { data: locations } = useLocations();

  const [form, setForm] = useState({
    name: "",
    description: "",
    status: String(IncidentStatus.NEW),
    priority: String(IncidentPriority.MEDIUM),
    categoryId: "",
    locationId: "",
    duedate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }

    const payload: CreateIncidentPayload = {
      geek_name: form.name.trim(),
      geek_description: form.description.trim() || undefined,
      geek_status: Number(form.status) as IncidentStatus,
      geek_priority: Number(form.priority) as IncidentPriority,
      geek_duedate: form.duedate || undefined,
    };

    if (form.categoryId) {
      payload["geek_incidentcategoryid@odata.bind"] =
        `/geek_incidentcategories(${form.categoryId})`;
    }
    if (form.locationId) {
      payload["geek_locationid@odata.bind"] =
        `/geek_locations(${form.locationId})`;
    }

    try {
      await createMutation.mutateAsync(payload);
      toast.success("インシデントを作成しました");
      navigate("/incidents");
    } catch {
      toast.error("作成に失敗しました");
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <Link to="/incidents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">新規インシデント</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>インシデント情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* タイトル */}
            <div className="space-y-2">
              <Label htmlFor="name">
                タイトル <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="例: 本社3Fネットワーク接続不可"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
            </div>

            {/* 説明 */}
            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                placeholder="インシデントの詳細を記入してください…"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={5}
              />
            </div>

            {/* ステータス・優先度 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>ステータス</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>優先度</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(priorityLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* カテゴリ・場所 */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>カテゴリ</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, categoryId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((cat) => (
                      <SelectItem
                        key={cat.geek_incidentcategoryid}
                        value={cat.geek_incidentcategoryid}
                      >
                        {cat.geek_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>場所</Label>
                <Select
                  value={form.locationId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, locationId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations?.map((loc) => (
                      <SelectItem
                        key={loc.geek_locationid}
                        value={loc.geek_locationid}
                      >
                        {loc.geek_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 期限 */}
            <div className="space-y-2">
              <Label htmlFor="duedate">期限</Label>
              <Input
                id="duedate"
                type="date"
                value={form.duedate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, duedate: e.target.value }))
                }
              />
            </div>

            {/* 送信 */}
            <div className="flex justify-end gap-3 pt-4">
              <Link to="/incidents">
                <Button type="button" variant="outline">
                  キャンセル
                </Button>
              </Link>
              <Button
                type="submit"
                className="gap-2"
                disabled={createMutation.isPending}
              >
                <Save className="h-4 w-4" />
                作成
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
