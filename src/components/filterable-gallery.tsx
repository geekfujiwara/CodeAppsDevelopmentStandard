import { useState, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { PaginatedGallery } from "./paginated-gallery"
import type { GalleryItem } from "./gallery-grid"
import { Search } from "lucide-react"

export interface FilterOption {
  label: string
  value: string
}

export interface FilterConfig {
  key: string
  label: string
  options: FilterOption[]
  placeholder?: string
}

interface FilterableGalleryProps {
  items: GalleryItem[]
  filters?: FilterConfig[]
  searchPlaceholder?: string
  itemsPerPage?: number
  columns?: 2 | 3 | 4
  emptyMessage?: string
  onFilterItem?: (item: GalleryItem, searchQuery: string, activeFilters: Record<string, string>) => boolean
}

/**
 * フィルター・検索機能付きギャラリーコンポーネント
 * 検索バーとフィルターでアイテムを絞り込み表示
 * 
 * @example
 * ```tsx
 * const filters: FilterConfig[] = [
 *   {
 *     key: "category",
 *     label: "カテゴリ",
 *     options: [
 *       { label: "すべて", value: "all" },
 *       { label: "開発", value: "dev" },
 *       { label: "デザイン", value: "design" }
 *     ],
 *     placeholder: "カテゴリを選択"
 *   },
 *   {
 *     key: "level",
 *     label: "レベル",
 *     options: [
 *       { label: "すべて", value: "all" },
 *       { label: "初級", value: "beginner" },
 *       { label: "中級", value: "intermediate" }
 *     ]
 *   }
 * ]
 * 
 * <FilterableGallery
 *   items={items}
 *   filters={filters}
 *   searchPlaceholder="タイトルで検索..."
 *   onFilterItem={(item, query, filters) => {
 *     // カスタムフィルターロジック
 *     const matchesSearch = item.title.toLowerCase().includes(query.toLowerCase())
 *     const matchesCategory = filters.category === "all" || item.category === filters.category
 *     return matchesSearch && matchesCategory
 *   }}
 * />
 * ```
 */
export function FilterableGallery({
  items,
  filters = [],
  searchPlaceholder = "検索...",
  itemsPerPage = 9,
  columns = 3,
  emptyMessage = "条件に一致するアイテムがありません",
  onFilterItem,
}: FilterableGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    filters.forEach((filter) => {
      initial[filter.key] = "all"
    })
    return initial
  })

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }))
  }

  const filteredItems = useMemo(() => {
    if (!onFilterItem) {
      // デフォルトのフィルターロジック: タイトルと説明で検索
      return items.filter((item) => {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          searchQuery === "" ||
          item.title.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query)
        return matchesSearch
      })
    }

    return items.filter((item) => onFilterItem(item, searchQuery, activeFilters))
  }, [items, searchQuery, activeFilters, onFilterItem])

  return (
    <div className="space-y-6">
      {/* 検索・フィルターセクション */}
      <div className="space-y-4">
        {/* 検索バー */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* フィルター */}
        {filters.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filters.map((filter) => (
              <div key={filter.key} className="space-y-2">
                <label className="text-sm font-medium">{filter.label}</label>
                <Combobox
                  options={filter.options}
                  value={activeFilters[filter.key]}
                  onValueChange={(value) => handleFilterChange(filter.key, value)}
                  placeholder={filter.placeholder || `${filter.label}を選択`}
                  searchPlaceholder={`${filter.label}を検索...`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 結果表示 */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {filteredItems.length}件の結果
          {searchQuery && ` (「${searchQuery}」で検索)`}
        </p>

        <PaginatedGallery
          items={filteredItems}
          itemsPerPage={itemsPerPage}
          columns={columns}
          emptyMessage={emptyMessage}
        />
      </div>
    </div>
  )
}
