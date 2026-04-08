import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, Heart, MessageSquare, Bug, Lightbulb, Sparkles, BookOpen, AlertTriangle, ThumbsUp, List, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export default function FeedbackPage() {
  const [isTocOpen, setIsTocOpen] = useState(true)
  
  const handleOpenIssue = () => {
    const url = "https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues/new"
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="w-full max-w-full px-4 pb-8 pt-6">
      {/* ヘッダーセクション - グリッドレイアウト */}
      <div className={`grid grid-cols-1 gap-8 mb-8 w-full max-w-full ${isTocOpen ? 'lg:grid-cols-[280px_1fr]' : 'lg:grid-cols-[32px_1fr]'}`}>
        {/* 左側空白（目次用スペース確保） */}
        <div className="hidden lg:block"></div>
        
        {/* タイトルコンテンツ */}
        <div className="space-y-4 text-center lg:text-left min-w-0 w-full">
          <div className="flex items-center justify-center lg:justify-start gap-2">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">フィードバック</h1>
          </div>
          <p className="text-lg text-muted-foreground">
            Geek は継続的にテンプレートと開発標準を改善しています。
            皆様からのフィードバックは、このテンプレートをより良いものにするために非常に価値があります。
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
                <a href="#importance" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  フィードバックの重要性
                </a>
                <a href="#types" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  フィードバックのタイプ
                </a>
                <a href="#submit" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  フィードバック送信方法
                </a>
              </nav>
            )}
          </div>
        </aside>

        {/* メインコンテンツ */}
        <main className="space-y-8 min-w-0 w-full">
      <Card className="border-primary/20" id="importance">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            フィードバックの重要性
          </CardTitle>
          <CardDescription>
            皆様のご意見やご要望が、開発テンプレートと開発標準の継続的な改善を支えています
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            このテンプレートは、実際の開発現場からのフィードバックをもとに進化しています。
            使いやすさの改善、新機能の追加、バグ修正、ドキュメントの充実など、
            すべての改善活動は皆様の声から始まります。
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            どんな小さなことでも構いません。気づいたこと、困ったこと、こうだったらいいなと思うことを
            ぜひお聞かせください。
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4" id="types">
        <h2 className="text-2xl font-bold">フィードバックのタイプ</h2>
        <p className="text-muted-foreground">
          以下のようなフィードバックをお待ちしています。該当するタイプを参考に、GitHub Issuesでお知らせください。
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card className="hover:shadow-lg transition-shadow border-red-200 dark:border-red-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bug className="h-6 w-6 text-red-500" />
              <CardTitle className="text-lg">バグ報告</CardTitle>
            </div>
            <CardDescription>
              動作がおかしい、エラーが出るなど、不具合を発見された場合
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">報告例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• ボタンをクリックしてもページが遷移しない</li>
                <li>• ダークモードで文字が見えにくい</li>
                <li>• ビルド時にエラーが発生する</li>
                <li>• モバイル表示でレイアウトが崩れる</li>
                <li>• 特定の操作でアプリがクラッシュする</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="font-semibold mb-1">記載していただきたい情報：</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 発生した問題の詳細</li>
                <li>• 再現手順</li>
                <li>• 期待される動作</li>
                <li>• 実際の動作</li>
                <li>• 環境（OS、ブラウザなど）</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-yellow-200 dark:border-yellow-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-yellow-500" />
              <CardTitle className="text-lg">機能要望・改善提案</CardTitle>
            </div>
            <CardDescription>
              こんな機能があったら便利、このデザインを追加してほしいなど
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">提案例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• 新しいUIコンポーネントの追加</li>
                <li>• データ可視化機能の実装</li>
                <li>• フォームバリデーションの強化</li>
                <li>• アクセシビリティの向上</li>
                <li>• パフォーマンスの最適化</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="font-semibold mb-1">記載していただきたい情報：</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 実現したい機能の説明</li>
                <li>• その機能が必要な理由</li>
                <li>• 想定される使用場面</li>
                <li>• 参考となる実装例（あれば）</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-blue-200 dark:border-blue-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-blue-500" />
              <CardTitle className="text-lg">ドキュメント改善</CardTitle>
            </div>
            <CardDescription>
              説明が分かりにくい、情報が不足しているなど
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">改善例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• セットアップ手順の追加説明</li>
                <li>• コード例の追加</li>
                <li>• よくある質問(FAQ)の追加</li>
                <li>• トラブルシューティングガイド</li>
                <li>• チュートリアルの充実</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="font-semibold mb-1">記載していただきたい情報：</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 分かりにくかった箇所</li>
                <li>• どのような説明があると良いか</li>
                <li>• つまずいたポイント</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-purple-200 dark:border-purple-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-purple-500" />
              <CardTitle className="text-lg">使用感・体験の共有</CardTitle>
            </div>
            <CardDescription>
              実際に使ってみた感想や成功事例など
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">共有例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• このテンプレートで作成したアプリの紹介</li>
                <li>• 開発効率が向上した事例</li>
                <li>• 特に便利だった機能</li>
                <li>• 学習過程での気づき</li>
                <li>• 他のツールとの比較</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="font-semibold mb-1">記載していただきたい情報：</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 使用したシーン・目的</li>
                <li>• 良かった点・改善点</li>
                <li>• 具体的な成果（あれば）</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-orange-200 dark:border-orange-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              <CardTitle className="text-lg">セキュリティ・互換性</CardTitle>
            </div>
            <CardDescription>
              セキュリティ上の懸念や、環境依存の問題など
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">報告例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• セキュリティ脆弱性の発見</li>
                <li>• 特定のブラウザで動作しない</li>
                <li>• 依存パッケージの脆弱性</li>
                <li>• 古いバージョンとの互換性</li>
                <li>• パフォーマンスの問題</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="font-semibold mb-1">記載していただきたい情報：</p>
              <ul className="space-y-0.5 text-muted-foreground">
                <li>• 問題の詳細と影響範囲</li>
                <li>• 発生環境（OS、バージョンなど）</li>
                <li>• 回避策（分かれば）</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow border-green-200 dark:border-green-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ThumbsUp className="h-6 w-6 text-green-500" />
              <CardTitle className="text-lg">その他のフィードバック</CardTitle>
            </div>
            <CardDescription>
              上記に当てはまらないご意見・ご質問など
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">内容例：</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• 使い方に関する質問</li>
                <li>• プロジェクトへの貢献方法</li>
                <li>• ライセンスに関する質問</li>
                <li>• 将来の方向性についての意見</li>
                <li>• コミュニティへの提案</li>
              </ul>
            </div>
            <div className="bg-muted/50 p-3 rounded-md text-xs">
              <p className="text-muted-foreground">
                どんなことでもお気軽にお寄せください。すべてのフィードバックに目を通し、可能な限り対応させていただきます。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-primary/5 border-primary/20" id="submit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            GitHub Issues でフィードバックを送信
          </CardTitle>
          <CardDescription>
            フィードバックは GitHub リポジトリの Issues で管理しています
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold">フィードバック送信の流れ</h4>
              <ol className="text-sm text-muted-foreground space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5">1</Badge>
                  <span>下の「フィードバックを送信」ボタンをクリック</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5">2</Badge>
                  <span>GitHub の New Issue ページが開きます</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5">3</Badge>
                  <span>GitHubアカウントでログイン（アカウントをお持ちでない場合は新規作成）</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="mt-0.5">4</Badge>
                  <span>タイトルと内容を記入して送信</span>
                </li>
              </ol>
            </div>

            <div className="bg-muted/50 p-4 rounded-md space-y-2">
              <h4 className="font-semibold text-sm">良いフィードバックのポイント</h4>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• <strong>具体的に：</strong> 「動かない」ではなく「◯◯の操作で△△のエラーが出る」</li>
                <li>• <strong>再現可能に：</strong> 同じ状況を再現できる手順を記載</li>
                <li>• <strong>スクリーンショット：</strong> 問題やアイデアを視覚的に示す</li>
                <li>• <strong>環境情報：</strong> OS、ブラウザ、バージョンなどを記載</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              className="gap-2"
              size="lg"
              onClick={handleOpenIssue}
            >
              <ExternalLink className="h-4 w-4" />
              フィードバックを送信
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => window.open("https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues", "_blank", "noopener,noreferrer")}
            >
              <MessageSquare className="h-4 w-4" />
              既存の Issues を見る
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-muted/40">
        <CardContent className="pt-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            ご協力いただき、ありがとうございます。
          </p>
          <p className="text-sm text-muted-foreground">
            皆様のフィードバックが、より良いテンプレートと開発標準を作り上げます。
          </p>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Heart className="h-5 w-5 fill-current" />
            <span className="font-semibold">あなたの声が未来を変えます</span>
          </div>
        </CardContent>
      </Card>
        </main>
      </div>
    </div>
  )
}
