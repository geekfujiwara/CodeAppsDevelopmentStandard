import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogIn, Loader2 } from "lucide-react";

/**
 * 認証ガードコンポーネント（デフォルト実装）
 *
 * 未認証ユーザーにはログイン導線を表示し、認証済みなら children を描画する。
 * App.tsx で機能ページを <RequireAuth> でラップして使う。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <LogIn className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            ログインが必要です
          </h2>
          <p className="text-muted-foreground max-w-sm">
            この機能を利用するにはログインしてください。
          </p>
        </div>
        <Button size="lg" onClick={login} className="gap-2">
          <LogIn className="h-4 w-4" />
          ログイン
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
