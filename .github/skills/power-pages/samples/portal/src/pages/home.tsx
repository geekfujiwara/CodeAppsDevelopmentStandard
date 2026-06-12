import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  ArrowRight,
  Zap,
  Shield,
  Clock,
  LogIn,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const features = [
  {
    group: "インシデント管理",
    description: "障害・問題をすばやく報告・追跡",
    items: [
      {
        icon: AlertTriangle,
        title: "インシデント一覧",
        description: "報告済みインシデントのステータスをリアルタイムで追跡。",
        path: "/incidents",
        color: "from-blue-500 to-indigo-600",
      },
      {
        icon: Zap,
        title: "新規報告",
        description:
          "フォーム入力で即座にインシデントを登録。担当者へ自動通知。",
        path: "/incidents/new",
        color: "from-orange-500 to-amber-600",
      },
    ],
  },
];

const highlights = [
  {
    icon: Zap,
    title: "簡単報告",
    description:
      "シンプルなフォームで即座にインシデントを登録。複雑な操作は不要です。",
  },
  {
    icon: Clock,
    title: "リアルタイム追跡",
    description:
      "報告したインシデントの進捗をいつでも確認。ステータス変更を把握できます。",
  },
  {
    icon: Shield,
    title: "迅速対応",
    description:
      "報告と同時に担当チームへ通知。優先度に応じた対応フローで迅速に解決。",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, login } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleNavigate = (path: string) => {
    if (isAuthenticated) {
      navigate(path);
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <div className="space-y-16 lg:space-y-24">
      {/* ログインモーダル */}
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
          <AlertTriangle className="h-3 w-3" />
          インシデント管理ポータル
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight">
          インシデントを
          <span className="gradient-text">迅速</span>に
          <br className="hidden sm:block" />
          報告・追跡
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          障害やトラブルを簡単に報告し、
          <br className="hidden sm:block" />
          対応状況をリアルタイムで確認できます。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => handleNavigate("/incidents/new")}
            className="gap-2"
          >
            インシデントを報告
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleNavigate("/incidents")}
          >
            一覧を見る
          </Button>
        </div>
      </section>

      {/* ハイライト */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {highlights.map((h) => (
          <div
            key={h.title}
            className="p-6 rounded-xl border border-border/60 bg-card shadow-premium card-hover"
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <h.icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">{h.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {h.description}
            </p>
          </div>
        ))}
      </section>

      {/* 機能セクション */}
      <section id="features" className="space-y-12">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="gradient-text">シンプル</span>な操作で
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            インシデントの報告から解決まで、一画面で管理できます。
          </p>
        </div>

        {features.map((group) => (
          <div key={group.group} className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {group.group}
              </h3>
              <p className="text-sm text-muted-foreground">
                {group.description}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map((item) => (
                <div
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className="group p-5 rounded-xl border border-border/60 bg-card shadow-premium card-hover cursor-pointer"
                >
                  <div
                    className={`h-10 w-10 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}
                  >
                    <item.icon className="h-5 w-5 text-white" />
                  </div>
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
