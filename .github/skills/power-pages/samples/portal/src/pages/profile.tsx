import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Save, Loader2, User } from "lucide-react";
import { apiGet, apiPatch, ApiAuthError } from "@/lib/api";

interface ContactProfile {
  firstname: string;
  lastname: string;
  emailaddress1: string;
  telephone1: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ContactProfile>({
    firstname: "",
    lastname: "",
    emailaddress1: "",
    telephone1: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!user?.contactId) return;
    fetchProfile();
  }, [user?.contactId]);

  async function fetchProfile() {
    const path = `contacts(${user!.contactId})?$select=firstname,lastname,emailaddress1,telephone1`;
    try {
      const data = await apiGet<ContactProfile>(path);
      setProfile({
        firstname: data.firstname || "",
        lastname: data.lastname || "",
        emailaddress1: data.emailaddress1 || "",
        telephone1: data.telephone1 || "",
      });
    } catch (e) {
      console.error("[Profile] fetch failed:", e);
      if (e instanceof ApiAuthError) {
        setMessage({
          type: "error",
          text: `プロフィール取得に失敗しました（認証エラー ${e.status}）。再ログインしてください。\nGET /_api/${path}`,
        });
      } else {
        setMessage({
          type: "error",
          text: `プロフィール取得に失敗しました。\nGET /_api/${path}\n${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const path = `contacts(${user!.contactId})`;
    try {
      await apiPatch(path, {
        firstname: profile.firstname,
        lastname: profile.lastname,
        telephone1: profile.telephone1,
      });
      setMessage({ type: "success", text: "プロフィールを更新しました" });
    } catch (e) {
      console.error("[Profile] save failed:", e);
      if (e instanceof ApiAuthError) {
        setMessage({
          type: "error",
          text: `更新に失敗しました（認証エラー ${e.status}）。再ログインしてください。\nPATCH /_api/${path}`,
        });
      } else {
        setMessage({
          type: "error",
          text: `更新に失敗しました。\nPATCH /_api/${path}\n${e instanceof Error ? e.message : String(e)}`,
        });
      }
    } finally {
      setSaving(false);
    }
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
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            プロフィール編集
          </h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm whitespace-pre-line break-words ${
            message.type === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
              : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            姓
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={profile.lastname}
            onChange={(e) =>
              setProfile({ ...profile, lastname: e.target.value })
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            名
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={profile.firstname}
            onChange={(e) =>
              setProfile({ ...profile, firstname: e.target.value })
            }
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            メールアドレス
          </label>
          <input
            type="email"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-not-allowed opacity-60"
            value={profile.emailaddress1}
            disabled
          />
          <p className="mt-1 text-xs text-muted-foreground">
            メールアドレスは変更できません
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            電話番号
          </label>
          <input
            type="tel"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            value={profile.telephone1}
            onChange={(e) =>
              setProfile({ ...profile, telephone1: e.target.value })
            }
            placeholder="090-1234-5678"
          />
        </div>

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
