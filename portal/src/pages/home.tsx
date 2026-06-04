import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Shield,
  Clock,
  LogIn,
  X,
  Send,
  Search,
  CheckCircle2,
  Monitor,
  Printer,
  Wifi,
  Smartphone,
  Package,
  HelpCircle,
  FileText,
  BarChart3,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { assetTypeLabels } from "@/lib/api";

/* ── サービスカタログ ── */
const serviceIcons: Record<number, React.ComponentType<{ className?: string }>> = {
  100000000: Monitor,
  100000001: Package,
  100000002: Printer,
  100000003: Wifi,
  100000004: Smartphone,
  100000005: BarChart3,
  100000006: HelpCircle,
};

const serviceColors: Record<number, string> = {
  100000000: "from-blue-500 to-blue-600",
  100000001: "from-slate-500 to-slate-600",
  100000002: "from-cyan-500 to-cyan-600",
  100000003: "from-green-500 to-green-600",
  100000004: "from-violet-500 to-violet-600",
  100000005: "from-orange-500 to-orange-600",
  100000006: "from-gray-500 to-gray-600",
};

/* ── ご利用の流れ ── */
const steps = [
  {
    num: "01",
    title: "サービスを選択",
    description: "サービスカタログから必要なカテゴリを選びます。",
    icon: Search,
  },
  {
    num: "02",
    title: "リクエストを送信",
    description: "フォームに必要事項を入力して送信します。",
    icon: Send,
  },
  {
    num: "03",
    title: "対応・解決",
    description: "専任チームが迅速に対応。進捗をリアルタイムで確認できます。",
    icon: CheckCircle2,
  },
];

/* ── ハイライト ── */
const highlights = [
  {
    icon: Send,
    title: "簡単リクエスト",
    description:
      "シンプルなフォームで即座にリクエストを登録。複雑な操作は不要です。",
  },
  {
    icon: Clock,
    title: "リアルタイム追跡",
    description:
      "送信したリクエストの進捗をいつでも確認。ステータス変更を把握できます。",
  },
  {
    icon: Shield,
    title: "迅速対応",
    description:
      "リクエストと同時に担当チームへ通知。優先度に応じた対応フローで迅速に解決。",
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

      {/* ── ヒーローセクション ── */}
      <section className="text-center pt-8 lg:pt-16 animate-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <FileText className="h-3 w-3" />
          サービスリクエストポータル
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight" style={{ color: "var(--secondary)" }}>
          サービスリクエストの送信・追跡が
          <br className="hidden sm:block" />
          <span className="gradient-text">すべてを一つのポータルで。</span>
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          サポート、施設管理、その他のサービスなど、
          <br className="hidden sm:block" />
          どのようなご要望にも、専任チームが迅速かつ効率的に対応いたします。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => handleNavigate("/incidents/new")}
            className="gap-2"
          >
            リクエストを送信
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => handleNavigate("/incidents")}
          >
            リクエストを追跡
          </Button>
        </div>
      </section>

      {/* ── ハイライト (3カラム) ── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in animate-in-1">
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

      {/* ── サービスカタログ ── */}
      <section className="space-y-6 animate-in animate-in-2">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="gradient-text">サービスカタログ</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            サービスの一覧をご覧ください。各サービスには推定対応時間が記載されています。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(assetTypeLabels).map(([key, label]) => {
            const k = Number(key);
            const Icon = serviceIcons[k] || HelpCircle;
            const color = serviceColors[k] || "from-gray-500 to-gray-600";
            return (
              <div
                key={key}
                onClick={() => handleNavigate("/incidents/new")}
                className="group p-5 rounded-xl border border-border/60 bg-card shadow-premium card-hover cursor-pointer"
              >
                <div
                  className={`h-10 w-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-md group-hover:scale-110 transition-transform`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {label}
                </h4>
                <p className="text-xs text-muted-foreground">
                  リクエストを送信 →
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── ご利用の流れ ── */}
      <section className="space-y-8 animate-in animate-in-3">
        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            <span className="gradient-text">ご利用の流れ</span>
          </h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            シンプルな手順で、必要なサポートをすぐに受けられます。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div
              key={step.num}
              className="relative p-6 rounded-xl border border-border/60 bg-card shadow-premium text-center"
            >
              <div className="text-3xl font-bold text-primary/20 mb-3">
                {step.num}
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <step.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Button
            size="lg"
            onClick={() => handleNavigate("/incidents/new")}
            className="gap-2"
          >
            さっそく始めましょう
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* ── CTAセクション ── */}
      <section className="animate-in animate-in-4">
        <div className="p-8 sm:p-12 rounded-2xl bg-gradient-to-r from-primary to-accent text-white text-center shadow-premium-lg">
          <Users className="h-10 w-10 mx-auto mb-4 opacity-80" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">
            お困りですか？
          </h2>
          <p className="text-sm sm:text-base opacity-90 max-w-lg mx-auto mb-6 leading-relaxed">
            お探しの情報が見つからない場合は、サポートチームに直接お問い合わせください。
          </p>
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleNavigate("/incidents/new")}
            className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
          >
            リクエストを送信
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </section>
    </div>
  );
}
