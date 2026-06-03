import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  createIncident,
  priorityLabels,
  categoryLabels,
  type IncidentCreate,
} from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function IncidentNewPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100000001");
  const [category, setCategory] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSaving(true);
    setError(null);

    const payload: IncidentCreate = {
      geek_name: title.trim(),
      geek_description: description.trim(),
      geek_status: 100000000, // 新規
      geek_priority: parseInt(priority),
    };
    if (category) {
      payload.geek_category = parseInt(category);
    }

    try {
      await createIncident(payload);
      navigate("/incidents");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/incidents")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h1 className="text-2xl font-bold text-foreground">
          新規インシデント報告
        </h1>
      </div>

      {/* フォーム */}
      <form
        onSubmit={handleSubmit}
        className="p-6 rounded-xl border border-border/60 bg-card shadow-premium space-y-5"
      >
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* タイトル */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            タイトル <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="障害の概要を入力"
            required
            className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
          />
        </div>

        {/* 説明 */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            説明 <span className="text-destructive">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="発生状況・影響範囲・再現手順などを詳しく記載"
            required
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-border/60 bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none"
          />
        </div>

        {/* 優先度 + 資産タイプ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              優先度 <span className="text-destructive">*</span>
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            >
              {Object.entries(priorityLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              資産タイプ
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            >
              <option value="">選択してください</option>
              {Object.entries(categoryLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 報告者（CreatedBy として自動記録。カスタム列は使用しない） */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">報告者</label>
          <input
            type="text"
            value={user?.fullName ?? ""}
            disabled
            className="w-full h-10 px-3 rounded-lg border border-border/60 bg-muted text-sm text-muted-foreground"
          />
        </div>

        {/* 送信ボタン */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="lg"
            disabled={saving || !title.trim() || !description.trim()}
            className={cn("gap-2", saving && "opacity-70")}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            報告する
          </Button>
        </div>
      </form>
    </div>
  );
}
