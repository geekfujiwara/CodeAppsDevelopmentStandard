import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { powerPagesFetch, buildODataUrl } from "@/lib/dataverse";
import { Button } from "@/components/ui/button";
import { Save, Loader2, User, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * プロフィール編集ページ（デフォルト実装）
 *
 * ログイン中ユーザー（取引先担当者 = contact）のプロフィールを
 * `/_api/contacts({contactId})` 経由で取得・更新する。
 *
 * 前提:
 * - contact テーブルの Web API 有効化 + テーブル権限（Self スコープ）
 *   → scripts/setup_permissions.py で設定（references/dataverse-connection-reference.md）
 * - contactId は use-auth が注入する window のユーザーコンテキストから取得
 */

interface ContactProfile {
  firstname: string;
  lastname: string;
  emailaddress1: string;
  telephone1: string;
}

const EMPTY: ContactProfile = {
  firstname: "",
  lastname: "",
  emailaddress1: "",
  telephone1: "",
};

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ContactProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchProfile = useCallback(async (contactId: string) => {
    setLoading(true);
    try {
      const data = await powerPagesFetch<ContactProfile>(
        buildODataUrl(`contacts(${contactId})`, {
          $select: "firstname,lastname,emailaddress1,telephone1",
        }),
      );

      if (!data) {
        throw new Error("Profile response is empty");
      }

      setProfile({
        firstname: data.firstname || "",
        lastname: data.lastname || "",
        emailaddress1: data.emailaddress1 || "",
        telephone1: data.telephone1 || "",
      });
    } catch (e) {
      console.error("[Profile] fetch failed:", e);
      setMessage({
        type: "error",
        text: "プロフィールの取得に失敗しました。",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.contactId) fetchProfile(user.contactId);
  }, [user?.contactId, fetchProfile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.contactId) return;
    setSaving(true);
    setMessage(null);
    try {
      await powerPagesFetch(`/_api/contacts(${user.contactId})`, {
        method: "PATCH",
        body: JSON.stringify({
          firstname: profile.firstname,
          lastname: profile.lastname,
          telephone1: profile.telephone1,
        }),
      });
      setMessage({ type: "success", text: "プロフィールを更新しました。" });
    } catch (e) {
      console.error("[Profile] save failed:", e);
      setMessage({
        type: "error",
        text: "更新に失敗しました。もう一度お試しください。",
      });
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof ContactProfile>(
    key: K,
    value: ContactProfile[K],
  ) {
    setProfile((p) => ({ ...p, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">プロフィール編集</h1>
          <p className="text-sm text-muted-foreground">
            登録情報を更新できます
          </p>
        </div>
      </div>

      {message && (
        <div
          className={
            "flex items-center gap-2 rounded-lg px-4 py-3 mb-4 text-sm " +
            (message.type === "success"
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-red-500/10 text-red-600")
          }
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          {message.text}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-2xl border border-border/60 bg-card p-6 shadow-premium"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="姓"
            value={profile.lastname}
            onChange={(v) => update("lastname", v)}
          />
          <Field
            label="名"
            value={profile.firstname}
            onChange={(v) => update("firstname", v)}
          />
        </div>
        <Field
          label="メールアドレス"
          value={profile.emailaddress1}
          disabled
          hint="メールアドレスは変更できません"
        />
        <Field
          label="電話番号"
          value={profile.telephone1}
          onChange={(v) => update("telephone1", v)}
        />
        <Button type="submit" disabled={saving} className="w-full gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          保存
        </Button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
