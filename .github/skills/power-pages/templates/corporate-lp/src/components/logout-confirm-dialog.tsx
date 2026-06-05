import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, X } from "lucide-react";

/**
 * ログアウト確認モーダル（デフォルト実装）
 *
 * 「ログアウトしますか？」を確認してから logout() を実行する。
 * 確認後は use-auth.ts の logout() が LP（ルート "/"）へリダイレクトする。
 *
 * site-layout.tsx でヘッダー／モバイルメニューのログアウト導線から開く。
 */
export function LogoutConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Esc キーで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-dialog-title"
    >
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />

      {/* ダイアログ本体 */}
      <div className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-premium p-6 animate-fade-in">
        <button
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          onClick={onCancel}
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <LogOut className="h-6 w-6 text-destructive" />
          </div>
          <h2
            id="logout-dialog-title"
            className="text-lg font-bold text-foreground"
          >
            ログアウトしますか？
          </h2>
          <p className="text-sm text-muted-foreground">
            ログアウトするとトップページに戻ります。
          </p>
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            className="flex-1 gap-1.5"
            onClick={onConfirm}
          >
            <LogOut className="h-4 w-4" />
            ログアウト
          </Button>
        </div>
      </div>
    </div>
  );
}
