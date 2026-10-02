import type { LucideIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PreparationPageProps = {
  title: string
  description: string
  icon: LucideIcon
}

export function PreparationPage({ title, description, icon: Icon }: PreparationPageProps) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="min-w-0">
        <p className="text-sm font-semibold text-primary">現場コックピット</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        <p className="mt-2 text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
      </header>
      <Card className="min-w-0">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>準備中</CardTitle>
          <CardDescription>画面の土台ができました。Dataverse 接続後に業務データを表示します。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">
            データソースへの接続は次の開発ステップで行います。
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
