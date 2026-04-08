import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FullscreenWrapper } from "./fullscreen-wrapper"
import { ExternalLink, ChevronLeft, ChevronRight, Search, Plus } from "lucide-react"
import type { GalleryItem } from "./gallery-grid"

export type { GalleryItem } from "./gallery-grid"

export interface FilterConfig {
  key: string
  label: string
  placeholder?: string
  options: Array<{
    value: string
    label: string
  }>
}

interface SearchFilterGalleryProps {
  items: GalleryItem[]
  filters?: FilterConfig[]
  searchPlaceholder?: string
  onFilterItem?: (item: GalleryItem, searchQuery: string, filters: Record<string, string>) => boolean
  itemsPerPage?: number
  columns?: 2 | 3 | 4
  emptyMessage?: string
  filterCardTitle?: string
  filterCardDescription?: string
  showAddButton?: boolean
  addButtonLabel?: string
  onAddItem?: () => void
}

/**
 * 検索・フィルター・ギャラリー統合コンポーネント
 * 
 * 検索バー、複数のドロップダウンフィルター、カード形式のギャラリー表示、
 * ページネーション機能を一つのコンポーネントに統合
 * 
 * @example
 * ```tsx
 * const items = [
 *   {
 *     id: "1",
 *     title: "Item 1",
 *     description: "Description 1",
 *     badges: [{ label: "New", className: "bg-blue-500" }],
 *     metadata: [{ label: "Date", value: "2024-01-01" }],
 *     actionLabel: "View",
 *     onAction: () => console.log("clicked"),
 *     _raw: { category: "tech", level: "beginner" }
 *   }
 * ]
 * 
 * const filters = [
 *   {
 *     key: "category",
 *     label: "カテゴリ",
 *     placeholder: "カテゴリを選択",
 *     options: [
 *       { value: "all", label: "すべて" },
 *       { value: "tech", label: "技術" }
 *     ]
 *   }
 * ]
 * 
 * <SearchFilterGallery
 *   items={items}
 *   filters={filters}
 *   searchPlaceholder="検索..."
 *   onFilterItem={(item, search, filters) => {
 *     // Custom filter logic
 *     return true
 *   }}
 * />
 * ```
 */
export function SearchFilterGallery({
  items,
  filters = [],
  searchPlaceholder = "検索...",
  onFilterItem,
  itemsPerPage = 9,
  columns = 3,
  emptyMessage = "アイテムが見つかりませんでした",
  filterCardTitle = "検索とフィルター",
  filterCardDescription = "条件を指定してアイテムを絞り込みます",
  showAddButton = false,
  addButtonLabel = "新規アイテム",
  onAddItem,
}: SearchFilterGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    filters.forEach((filter) => {
      initial[filter.key] = "all"
    })
    return initial
  })
  const [currentPage, setCurrentPage] = useState(1)

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (onFilterItem) {
        return onFilterItem(item, searchQuery, activeFilters)
      }

      // Default filter logic
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesTitle = item.title.toLowerCase().includes(query)
        const matchesDescription = item.description?.toLowerCase().includes(query)
        if (!matchesTitle && !matchesDescription) return false
      }

      return true
    })
  }, [items, searchQuery, activeFilters, onFilterItem])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage)

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, activeFilters])

  // Generate pagination numbers with ellipsis
  const getPaginationNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= maxVisible; i++) {
          pages.push(i)
        }
        pages.push("...")
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push("...")
        for (let i = totalPages - maxVisible + 1; i <= totalPages; i++) {
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }))
  }

  const columnClasses = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }

  return (
    <FullscreenWrapper showHeader={false}>
      {({ isFullscreen: _isFullscreen, FullscreenButton }) => (
    <div className="space-y-6">
      {/* Filters Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold">{filterCardTitle}</CardTitle>
              <CardDescription>{filterCardDescription}</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <FullscreenButton />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter Dropdowns */}
            {filters.map((filter) => (
              <Combobox
                key={filter.key}
                value={activeFilters[filter.key] || "all"}
                onValueChange={(value) => handleFilterChange(filter.key, value)}
                options={filter.options}
                searchPlaceholder={`${filter.label}を検索...`}
                placeholder={filter.placeholder || `${filter.label}を選択`}
                emptyMessage={`${filter.label}が見つかりません`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add Item Button */}
      {showAddButton && onAddItem && (
        <div className="flex justify-end">
          <Button onClick={onAddItem} size="sm" variant="default" className="gap-2 h-9">
            <Plus className="h-4 w-4" />
            {addButtonLabel}
          </Button>
        </div>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {searchQuery ? (
            <>
              「<span className="font-medium">{searchQuery}</span>」の検索結果: {filteredItems.length}件
            </>
          ) : (
            `${filteredItems.length}件のアイテム`
          )}
        </p>
        {filteredItems.length > 0 && totalPages > 1 && (
          <p className="text-xs text-muted-foreground">
            {startIndex + 1}〜{Math.min(startIndex + itemsPerPage, filteredItems.length)}件を表示
          </p>
        )}
      </div>

      {/* Gallery Grid */}
      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${columnClasses[columns]}`}>
          {paginatedItems.map((item) => (
            <Card key={item.id} className="flex h-full flex-col justify-between transition-shadow hover:shadow-lg">
              <CardHeader className="space-y-3">
                <CardTitle className="line-clamp-2 text-xl leading-7">
                  {item.title}
                </CardTitle>
                {item.description && (
                  <CardDescription className="line-clamp-3 text-sm leading-6">
                    {item.description}
                  </CardDescription>
                )}
                {item.badges && item.badges.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {item.badges.map((badge, index) => (
                      <Badge
                        key={`${item.id}-badge-${index}`}
                        variant={badge.variant}
                        className={badge.className}
                      >
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {item.metadata && item.metadata.length > 0 && (
                  <div className="space-y-2">
                    {item.metadata.map((meta, index) => (
                      <div key={`${item.id}-meta-${index}`} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{meta.label}:</span>
                        <span className="font-medium">{meta.value}</span>
                      </div>
                    ))}
                  </div>
                )}
                {item.actionLabel && item.onAction && (
                  <Button onClick={item.onAction} className="w-full gap-2">
                    <ExternalLink className="h-4 w-4" />
                    {item.actionLabel}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {filteredItems.length > itemsPerPage && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            前へ
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {getPaginationNumbers().map((pageNum, index) => {
              if (pageNum === "...") {
                return (
                  <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                    ...
                  </span>
                )
              }
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => handlePageChange(pageNum as number)}
                  className="h-9 w-9"
                >
                  {pageNum}
                </Button>
              )
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="gap-2"
          >
            次へ
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
      )}
    </FullscreenWrapper>
  )
}
