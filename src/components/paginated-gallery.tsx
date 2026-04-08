import { useState } from "react"
import { Button } from "@/components/ui/button"
import { GalleryGrid, type GalleryItem } from "./gallery-grid"
import { ChevronLeft, ChevronRight } from "lucide-react"

interface PaginatedGalleryProps {
  items: GalleryItem[]
  itemsPerPage?: number
  columns?: 2 | 3 | 4
  emptyMessage?: string
}

/**
 * ページネーション付きギャラリーコンポーネント
 * 大量のアイテムをページ分割して表示
 * 
 * @example
 * ```tsx
 * const items: GalleryItem[] = [
 *   // ... 多数のアイテム
 * ]
 * 
 * <PaginatedGallery
 *   items={items}
 *   itemsPerPage={9}
 *   columns={3}
 * />
 * ```
 */
export function PaginatedGallery({
  items,
  itemsPerPage = 9,
  columns = 3,
  emptyMessage = "アイテムがありません",
}: PaginatedGalleryProps) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentItems = items.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    // スクロールをトップに移動
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const getPaginationNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i)
        }
        pages.push("...")
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push("...")
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i)
        }
      } else {
        pages.push(1)
        pages.push("...")
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i)
        }
        pages.push("...")
        pages.push(totalPages)
      }
    }

    return pages
  }

  return (
    <div className="space-y-6">
      {/* ギャラリー */}
      <GalleryGrid items={currentItems} columns={columns} emptyMessage={emptyMessage} />

      {/* ページネーション */}
      {items.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {items.length}件中 {startIndex + 1}〜{Math.min(endIndex, items.length)}件を表示
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              前へ
            </Button>

            <div className="flex items-center gap-1">
              {getPaginationNumbers().map((page, index) =>
                typeof page === "number" ? (
                  <Button
                    key={index}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(page)}
                    className="min-w-[2.5rem]"
                  >
                    {page}
                  </Button>
                ) : (
                  <span key={index} className="px-2 text-muted-foreground">
                    {page}
                  </span>
                )
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              次へ
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
