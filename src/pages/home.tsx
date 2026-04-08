import powerAppsLogo from "/power-apps.svg"
import reactLogo from "@/assets/react.svg"
import { Button } from "@/components/ui/button"
import { LinkConfirmModal, useLinkModal } from "@/components/link-confirm-modal"
import { GraduationCap, MessageSquare, LayoutGrid } from "lucide-react"
import { Link } from "react-router-dom"

export default function HomePage() {
  const { modalData, openModal, closeModal } = useLinkModal()

  const handleLogoClick = (url: string, title: string, description: string) => {
    openModal(url, title, description)
  }

  return (
    <div className="h-full py-8">
      <div className="w-full max-w-7xl mx-auto flex flex-col items-center space-y-8 px-6 text-center">
        <div className="flex items-center justify-center gap-10">
          <button
            onClick={() => handleLogoClick(
              "https://github.com/microsoft/PowerAppsCodeApps",
              "Power Apps Code Apps",
              "Microsoft公式のPower Appsコードアプリ開発ドキュメントとリソース"
            )}
            className="transition-transform hover:scale-105"
          >
            <img src={powerAppsLogo} className="h-24 w-24" alt="Power Apps logo" />
          </button>

          <button
            onClick={() => handleLogoClick(
              "https://react.dev",
              "React",
              "React公式サイト - モダンなユーザーインターフェースを構築するためのライブラリ"
            )}
            className="transition-transform hover:scale-105"
          >
            <img
              src={reactLogo}
              className="h-24 w-24 motion-safe:animate-[spin_20s_linear_infinite]"
              alt="React logo"
            />
          </button>

          <button
            onClick={() => handleLogoClick(
              "https://github.com/geekfujiwara/CodeAppsDevelopmentStandard",
              "Geek開発標準",
              "Power Appsコードアプリ開発のためのコーディング規約とベストプラクティス集"
            )}
            className="transition-transform hover:scale-105"
          >
            <img src="./geekkumanomi.svg" className="h-32 w-32" alt="Geek開発標準" />
          </button>
        </div>

        <div className="space-y-4">
          <h1 className="text-5xl leading-tight tracking-tight">Power + Code + Geek</h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            この開発テンプレートは、Microsoft Learn データをサンプルとして活用し、ダッシュボード、フォーム、ギャラリー、フィルター、カード表示などの実装パターンを紹介します。
            Vite / TypeScript / React をベースに、API 連携やモダン UI の実装例を提供します。
          </p>
          <div className="flex justify-center gap-3">
            <Link to="/design-examples">
              <Button className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                サンプル実装を見る
              </Button>
            </Link>
            <Link to="/guide">
              <Button variant="outline" className="gap-2">
                <GraduationCap className="h-4 w-4" />
                このテンプレートの使い方
              </Button>
            </Link>
            <Link to="/feedback">
              <Button variant="outline" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                フィードバック
              </Button>
            </Link>
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          このテンプレートを git clone して、独自の開発にご活用ください。
        </p>

        <LinkConfirmModal
          isOpen={modalData.isOpen}
          onClose={closeModal}
          url={modalData.url}
          title={modalData.title}
          description={modalData.description}
        />
      </div>
    </div>
  )
}
