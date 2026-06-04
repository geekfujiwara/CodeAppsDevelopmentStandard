import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  createIncident,
  priorityLabels,
  assetTypeLabels,
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
  const [assetType, setAssetType] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSaving(true);
    setError(null);

    const payload: IncidentCreate = {
      geek_title: title.trim(),
      geek_description: description.trim(),
      geek_status: 100000000, // 新規
      geek_priority: parseInt(priority),
      geek_assettype: assetType ? parseInt(assetType) : undefined,
      ...(user?.contactId
        ? { "geek_inquirerid@odata.bind": `/contacts(${user.contactId})` }
        : {}),
    };

    try {
      await createIncident(payload);
      navigate("/incidents");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
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
          新規サービスリクエスト
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
            placeholder="リクエストの概要を入力"
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
            placeholder="リクエストの詳細を記載してください"
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
              サービス種別
            </label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
            >
              <option value="">選択してください</option>
              {Object.entries(assetTypeLabels).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
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
            送信する
          </Button>
        </div>
      </form>
    </div>
  );
}
