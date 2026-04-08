import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Copy, CheckCircle, Github, ExternalLink, Lightbulb, List, X } from "lucide-react"
import { toast } from "sonner"
import { LinkConfirmModal, useLinkModal } from "@/components/link-confirm-modal"
import { CodeBlock } from "@/components/code-block"

export default function GuidePage() {
  const [copied, setCopied] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(true)
  const { modalData, openModal, closeModal } = useLinkModal()
  const developmentStandardUrl = "https://github.com/geekfujiwara/CodeAppsDevelopmentStandard"
  const copilotMessageTemplate = `${developmentStandardUrl} に基づいて、<アイディア>を実現してください`

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(copilotMessageTemplate)
      setCopied(true)
      toast.success("メッセージテンプレートをコピーしました！")
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error(error)
      toast.error("クリップボードへのコピーに失敗しました")
    }
  }

  return (
    <div className="w-full max-w-full px-4 pb-8 pt-6">
      {/* ヘッダーセクション - グリッドレイアウト */}
      <div className={`grid grid-cols-1 gap-8 mb-8 w-full max-w-full ${isTocOpen ? 'lg:grid-cols-[280px_1fr]' : 'lg:grid-cols-[32px_1fr]'}`}>
        {/* 左側空白（目次用スペース確保） */}
        <div className="hidden lg:block"></div>
        
        {/* タイトルコンテンツ */}
        <div className="text-center lg:text-left min-w-0 w-full">
          <div className="flex justify-center lg:justify-start mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <img src="./geekkumanomi.svg" className="h-8 w-8" alt="Geek" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-4">このテンプレートの使い方</h1>
          <p className="text-xl text-muted-foreground">
            GitHub Copilot を使用して効率的な Power Apps コードアプリ開発を始めよう
          </p>
        </div>
      </div>

      {/* メインコンテンツ - グリッドレイアウト */}
      <div className={`grid grid-cols-1 gap-8 w-full max-w-full ${isTocOpen ? 'lg:grid-cols-[280px_1fr]' : 'lg:grid-cols-[32px_1fr]'}`}>
        {/* 目次サイドバー */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <button
              onClick={() => setIsTocOpen(!isTocOpen)}
              className={`flex items-center gap-2 font-semibold hover:text-primary transition-colors ${isTocOpen ? 'text-lg mb-4' : 'p-1 mb-2'}`}
              title={isTocOpen ? '目次を閉じる' : '目次を開く'}
            >
              {isTocOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
              {isTocOpen && '目次'}
            </button>
            {isTocOpen && (
              <nav className="space-y-2">
                <a href="#setup" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  1. 開発環境のセットアップ
                </a>
                <a href="#deploy" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  2. Power Apps へのデプロイ準備
                </a>
                <a href="#standards" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  3. 開発標準の活用方法
                </a>
                <a href="#references" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  参考リンク
                </a>
              </nav>
            )}
          </div>
        </aside>

        {/* メインコンテンツ */}
        <main className="min-w-0 w-full">
      {/* 開始手順 */}
      <Card className="mb-8" id="setup">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
            開発環境のセットアップ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">必要なツール</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• <a href="https://code.visualstudio.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">VS Code</a></li>
                <li>• <a href="https://marketplace.visualstudio.com/items?itemName=GitHub.copilot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub Copilot 拡張機能</a></li>
                <li>• <a href="https://nodejs.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Node.js (最新LTS版)</a></li>
                <li>• <a href="https://git-scm.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Git</a></li>
                <li>• <a href="https://www.npmjs.com/package/@microsoft/power-apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@microsoft/power-apps (npm CLI)</a></li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">推奨ツール</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>
                  • <a href="https://github.com/features/copilot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-semibold">GitHub Copilot Pro / Enterprise</a>
                  <p className="text-xs text-muted-foreground ml-4 mt-1">
                    Claude Sonnet 4.5 以上の利用を品質の観点で推奨するため
                  </p>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">セットアップ手順</h4>
              
              {/* ステップ1: リポジトリのクローン */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">1</Badge>
                  <h5 className="font-semibold text-sm">リポジトリのクローン</h5>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  GitHub からテンプレートリポジトリをローカル環境にコピーします
                </p>
                <div className="ml-8">
                  <CodeBlock code="git clone https://github.com/geekfujiwara/CodeAppsStarter.git" />
                </div>
              </div>

              {/* ステップ2: ディレクトリ移動 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">2</Badge>
                  <h5 className="font-semibold text-sm">プロジェクトディレクトリへ移動</h5>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  クローンしたプロジェクトのディレクトリに移動します
                </p>
                <div className="ml-8">
                  <CodeBlock code="cd CodeAppsStarter" />
                </div>
              </div>

              {/* ステップ3: 依存パッケージのインストール */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">3</Badge>
                  <h5 className="font-semibold text-sm">依存パッケージのインストール</h5>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  プロジェクトに必要な Node.js パッケージをインストールします
                </p>
                <div className="ml-8">
                  <CodeBlock code="npm install" />
                </div>
              </div>

              {/* ステップ4: 開発サーバーの起動 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">4</Badge>
                  <h5 className="font-semibold text-sm">開発サーバーの起動</h5>
                </div>
                <p className="text-sm text-muted-foreground ml-8">
                  ローカル開発サーバーを起動し、ブラウザでアプリを確認します
                </p>
                <div className="ml-8">
                  <CodeBlock code="npm run dev" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Power Apps へのデプロイ準備 */}
      <Card className="mb-8" id="deploy">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</span>
            Power Apps へのデプロイ準備
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Power Apps コードアプリとして展開する準備を行います。認証情報を作成し、ローカル環境で動作確認を行った後、Power Apps にデプロイします。
            </p>

            {/* ステップ1: Power Apps 認証情報の作成 */}
            <div className="space-y-3">
              <h4 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-muted text-muted-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">1</span>
                Power Apps 認証情報の作成
              </h4>
              <p className="text-sm text-muted-foreground">
                最初に、Power Apps 環境への接続情報を設定します。この手順は初回のみ実行します。
              </p>
              <CodeBlock code={`npx power-apps init --displayName "<アプリ名>" --environmentId <環境ID>`} />
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold mb-1">パラメータ説明:</p>
                  <ul className="text-xs text-muted-foreground space-y-2 ml-4">
                    <li>
                      <strong>--displayName</strong>: Power Appsに表示されるアプリケーション名
                      <div className="mt-1 pl-4 text-xs">
                        <span className="text-primary">💡 ヒント:</span> 新しくアプリにつける名前を入力します。日本語でも問題ありません(例: 「営業管理アプリ」「顧客データベース」)
                      </div>
                    </li>
                    <li>
                      <strong>--environmentId</strong>: デプロイ先のPower Apps環境の識別子
                      <div className="mt-1 pl-4 text-xs">
                        <span className="text-primary">📍 取得方法:</span> <a href="https://make.powerapps.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">make.powerapps.com</a> にアクセスし、右上の環境メニューから対象の環境を選択。設定(⚙️)アイコン &gt; セッション詳細 &gt; インスタンス URLから環境IDを確認できます
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* ステップ2: ローカル環境での実行 */}
            <div className="space-y-3">
              <h4 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-muted text-muted-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">2</span>
                ローカル環境での実行
              </h4>
              <p className="text-sm text-muted-foreground">
                開発サーバーを起動してローカル環境で動作確認を行います。
              </p>
              <CodeBlock code={`npm run dev`} />
              <div className="space-y-2">
                <h5 className="font-semibold text-sm">動作確認</h5>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• <code className="bg-muted px-1.5 py-0.5 rounded text-xs">npm run dev</code> で開発サーバーを起動</li>
                  <li>• ブラウザで自動的に開かれるアプリの動作を確認</li>
                  <li>• すべての機能が正常に動作することを確認</li>
                </ul>
              </div>
            </div>

            {/* ステップ3: Power Apps 環境へのデプロイ */}
            <div className="space-y-3">
              <h4 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-muted text-muted-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">3</span>
                Power Apps 環境へのデプロイ
              </h4>
              <p className="text-sm text-muted-foreground">
                ローカルでの動作確認が完了したら、アプリをビルドして Power Apps 環境にデプロイします。
              </p>
              
              {/* デプロイの実行 */}
              <CodeBlock code={`npm run build\nnpx power-apps push`} />

              <div className="space-y-2">
                <h5 className="font-semibold text-sm">デプロイ後の確認</h5>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• Power Apps ポータルでアプリが正常にデプロイされたことを確認</li>
                  <li>• デプロイされたアプリを起動して動作を確認</li>
                  <li>• 必要に応じて、アプリの共有設定を行う</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 開発標準の活用 */}
      <Card className="mb-8" id="standards">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
            開発標準の活用方法
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* GitHub Copilot への指示カード */}
          <Card className="mb-6 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-6 w-6 text-primary" />
                <CardTitle className="text-xl">GitHub Copilot へのメッセージ例</CardTitle>
              </div>
              <CardDescription className="text-base">
                以下のようなメッセージで GitHub Copilot に指示を出すことで、開発標準に基づいた効率的な開発ができます
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* コピー用のコードブロック */}
              <div className="bg-muted p-4 rounded-md space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-sm">メッセージテンプレート</h5>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyToClipboard}
                    className="shrink-0 h-8 px-2"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        コピー済み
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        コピー
                      </>
                    )}
                  </Button>
                </div>
                <div className="font-mono text-sm bg-background p-3 rounded border overflow-x-auto">
                  <div className="whitespace-nowrap">{developmentStandardUrl} に基づいて、&lt;アイディア&gt;を実現してください</div>
                </div>
                <p className="text-xs text-muted-foreground">
                  💡 &lt;アイディア&gt; の部分に具体的な機能や画面の説明を入れてください
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 開発フロー */}
          <Card className="mb-6 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg">開発からデプロイまでの流れ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">GitHub Copilot でアイディアを実現</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      上記のメッセージテンプレートを使って、GitHub Copilot に実装を依頼します
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">2</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">ローカル実行で確認</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      開発したコードをローカル環境で動作確認を行います
                    </p>
                    <CodeBlock code={`npm run dev`} />
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">3</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">改善を繰り返す</h4>
                    <p className="text-sm text-muted-foreground">
                      気に入るまで開発と改善を続けます。GitHub Copilot に修正を依頼し、再度ビルド・実行を繰り返します
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">4</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">Power Apps にデプロイ</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      完成したアプリをビルドして Power Apps 環境にデプロイします
                    </p>
                    <CodeBlock code={`npm run build\nnpx power-apps push`} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 開発標準を活用するメリット */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">開発標準を活用するメリット</h3>
            
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xl">🎯</span>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">一貫性のあるコード</h4>
                      <p className="text-sm text-muted-foreground">
                        コーディング規約に基づいた統一されたコードスタイルで、保守性が向上します
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xl">⚡</span>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">開発スピードの向上</h4>
                      <p className="text-sm text-muted-foreground">
                        ベストプラクティスに基づいた実装で、試行錯誤の時間を大幅に削減できます
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xl">🛡️</span>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">品質の担保</h4>
                      <p className="text-sm text-muted-foreground">
                        設計パターンとアーキテクチャガイドラインにより、堅牢なアプリを構築できます
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xl">📚</span>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">学習効果</h4>
                      <p className="text-sm text-muted-foreground">
                        Copilotが生成するコードから、ベストプラクティスを学ぶことができます
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lightbulb className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">活用のポイント</h4>
                    <ul className="text-sm text-muted-foreground space-y-2">
                      <li>• できるだけ具体的に要件を伝えることで、より精度の高いコードが生成されます</li>
                      <li>• 生成されたコードを確認し、必要に応じて調整することで理解が深まります</li>
                      <li>• データ構造やUI要件も明確に説明すると、より適切な実装が得られます</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

  {/* 参考リンク */}
  <Card id="references">
        <CardHeader>
          <CardTitle>参考リンク</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <button 
            onClick={() => openModal(
              developmentStandardUrl,
              "Geek開発標準",
              "Power Appsコードアプリ開発のためのコーディング規約とベストプラクティス集"
            )}
            className="w-full flex items-center gap-2 p-3 rounded-lg border hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Github className="h-5 w-5" />
            <div className="flex-1 text-left">
              <div className="font-medium">Geek開発標準</div>
              <div className="text-sm text-muted-foreground">コーディング規約とベストプラクティス</div>
            </div>
            <ExternalLink className="h-4 w-4" />
          </button>
          
          <button 
            onClick={() => openModal(
              "https://github.com/microsoft/PowerAppsCodeApps",
              "Power Apps Code Apps",
              "Microsoft公式のPower Appsコードアプリ開発ドキュメントとリソース"
            )}
            className="w-full flex items-center gap-2 p-3 rounded-lg border hover:bg-[var(--accent-hover)] transition-colors"
          >
            <ExternalLink className="h-5 w-5" />
            <div className="flex-1 text-left">
              <div className="font-medium">Power Apps Code Apps</div>
              <div className="text-sm text-muted-foreground">Microsoft公式ドキュメント</div>
            </div>
            <ExternalLink className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>

      {/* リンク確認モーダル */}
      <LinkConfirmModal
        isOpen={modalData.isOpen}
        onClose={closeModal}
        url={modalData.url}
        title={modalData.title}
        description={modalData.description}
      />
        </main>
      </div>
    </div>
  )
}