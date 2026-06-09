import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  LogIn,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  SITE_NAME,
  SITE_FEATURE_GROUPS,
  SITE_HERO,
  SITE_HIGHLIGHTS,
} from "@/config";
import {
  Globe,
  LayoutDashboard,
  FileText,
  Settings,
  Shield,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * ★ 機能カード定義 ★
 * 業務シナリオに合わせてここを編集する。
 * - group: セクション見出し
 * - items[].icon: lucide-react アイコン
 * - items[].path: HashRouter のパス
 * - items[].color: グラデーション (Tailwind bg-linear-to-br)
 */
const iconMap: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  content: FileText,
  users: Users,
  settings: Settings,
  zap: Zap,
  shield: Shield,
  globe: Globe,
};

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  /** 未認証→モーダル表示、認証済み→直接遷移 */
  const handleNavigate = (path: string) => {
    if (isAuthenticated) {
      navigate(path);
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <div className="space-y-16 lg:space-y-24">
      {/* ★ ログインモーダル — 未認証時に機能クリックで表示 */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowLoginModal(false)}
          />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl p-8 max-w-sm w-full mx-4 space-y-4">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="text-center space-y-2">
              <LogIn className="h-10 w-10 text-primary mx-auto" />
              <h2 className="text-xl font-bold text-foreground">
                ログインしますか？
              </h2>
              <p className="text-sm text-muted-foreground">
                この機能を利用するにはログインが必要です。
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowLoginModal(false)}
              >
                キャンセル
              </Button>
              <Button className="flex-1 gap-2" onClick={() => login()}>
                <LogIn className="h-4 w-4" />
                ログイン
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ヒーローセクション */}
      <section className="text-center pt-8 lg:pt-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <Zap className="h-3 w-3" />
          {SITE_HERO.badge || SITE_NAME}
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
          {SITE_HERO.titlePrefix}
          <span className="gradient-text">{SITE_HERO.titleHighlight}</span>
          {SITE_HERO.titleSuffix}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          {SITE_HERO.description.split("\n").map((line, index, lines) => (
            <span key={`${line}-${index}`}>
              {line}
              {index < lines.length - 1 && <br className="hidden sm:block" />}
            </span>
          ))}
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => handleNavigate(SITE_HERO.primaryActionPath)}
            className="gap-2"
          >
            {SITE_HERO.primaryActionLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              document
                .getElementById("features")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {SITE_HERO.secondaryActionLabel}
          </Button>
        </div>
      </section>

      {/* ハイライト */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {SITE_HIGHLIGHTS.map((h) => {
          const Icon = iconMap[h.iconKey ?? "zap"] ?? Zap;

          return (
            <div
              key={h.title}
              className="p-6 rounded-xl border border-border/60 bg-card shadow-premium card-hover"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{h.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {h.description}
              </p>
            </div>
          );
        })}
      </section>

      {/* 機能セクション */}
      <section id="features" className="space-y-12">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            すべての業務を
            <span className="gradient-text">ひとつに</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            直感的な UI で業務効率を最大化します。
          </p>
        </div>

        {SITE_FEATURE_GROUPS.map((group) => (
          <div key={group.group} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {group.group}
              </h3>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((item) => (
                <div
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="group p-5 rounded-xl border border-border/60 bg-card shadow-premium card-hover cursor-pointer"
                >
                  {(() => {
                   const Icon =
                     iconMap[item.iconKey ?? "dashboard"] ?? LayoutDashboard;

                   return (
                     <div
                       className={`h-10 w-10 rounded-lg bg-linear-to-br ${item.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}
                     >
                       <Icon className="h-5 w-5 text-white" />
                     </div>
                   );
                  })()}
                  <h4 className="font-semibold text-foreground mb-1.5 group-hover:text-primary transition-colors">
                   {item.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
