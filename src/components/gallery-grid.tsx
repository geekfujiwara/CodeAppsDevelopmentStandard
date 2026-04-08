import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"

export interface GalleryItem {
  id: string
  title: string
  description: string
  badges?: Array<{
    label: string
    variant?: "default" | "secondary" | "outline" | "destructive"
    className?: string
  }>
  metadata?: Array<{
    label: string
    value: string
  }>
  actionLabel?: string
  onAction?: () => void
  _raw?: unknown // For storing additional data for custom filtering
}

interface GalleryGridProps {
  items: GalleryItem[]
  columns?: 2 | 3 | 4
  emptyMessage?: string
}

/**
 * ギャラリーグリッドコンポーネント
 * カード形式でアイテムを表示するギャラリービュー
 * 
 * @example
 * ```tsx
 * const items: GalleryItem[] = [
 *   {
 *     id: "1",
 *     title: "React入門",
 *     description: "Reactの基礎から学ぶチュートリアル",
 *     badges: [
 *       { label: "初級", className: "bg-blue-100 text-blue-800" },
 *       { label: "フロントエンド", className: "bg-green-100 text-green-800" }
 *     ],
 *     metadata: [
 *       { label: "所要時間", value: "2時間" },
 *       { label: "レベル", value: "初級" }
 *     ],
 *     actionLabel: "詳細を見る",
 *     onAction: () => console.log("clicked")
 *   }
 * ]
 * 
 * <GalleryGrid items={items} columns={3} />
 * ```
 */
export function GalleryGrid({ items, columns = 3, emptyMessage = "アイテムがありません" }: GalleryGridProps) {
  const gridCols = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`grid grid-cols-1 gap-6 ${gridCols[columns]}`}>
      {items.map((item) => (
        <Card key={item.id} className="flex flex-col hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="text-lg line-clamp-2">{item.title}</CardTitle>
            <CardDescription className="line-clamp-3">{item.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            {/* バッジ */}
            {item.badges && item.badges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.badges.map((badge, index) => (
                  <Badge
                    key={index}
                    variant={badge.variant}
                    className={badge.className}
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* メタデータ */}
            {item.metadata && item.metadata.length > 0 && (
              <div className="space-y-1 text-sm text-muted-foreground">
                {item.metadata.map((meta, index) => (
                  <div key={index} className="flex justify-between">
                    <span>{meta.label}:</span>
                    <span className="font-medium text-foreground">{meta.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* アクションボタン */}
            {item.actionLabel && item.onAction && (
              <Button
                onClick={item.onAction}
                variant="outline"
                className="w-full mt-auto gap-2"
              >
                {item.actionLabel}
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
