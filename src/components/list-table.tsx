import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import type { ComboboxOption } from "@/components/ui/combobox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CsvImportExport, type CsvColumn, type CsvOperationType } from "@/components/csv-import-export"
import { FormModal } from "@/components/form-modal"
import { Search, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type TableColumn<T> = {
  key: keyof T | string
  label: string
  sortable?: boolean
  render?: (item: T) => React.ReactNode
  width?: string
  align?: "left" | "center" | "right"
}

export type FilterConfig<T> = {
  key: keyof T
  label: string
  placeholder?: string
  searchPlaceholder?: string
  options: ComboboxOption[]
}

export type ListTableProps<T> = {
  data: T[]
  columns: TableColumn<T>[]
  title?: string
  description?: string
  searchable?: boolean
  searchPlaceholder?: string
  searchKeys?: (keyof T)[]
  filters?: FilterConfig<T>[]
  itemsPerPage?: number
  emptyMessage?: string
  className?: string
  enableCsv?: boolean
  csvColumns?: CsvColumn<T>[]
  csvFileName?: string
  csvUniqueKey?: keyof T
  onCsvImport?: (data: T[], operationsMap: Map<T, CsvOperationType>) => void
  onRowClick?: (item: T) => void
  renderForm?: (item: T | null, onClose: () => void) => React.ReactNode
  formTitle?: string
  formDescription?: string
}

export function ListTable<T extends Record<string, unknown>>({
  data,
  columns,
  title,
  description,
  searchable = true,
  searchPlaceholder = "検索...",
  searchKeys = [],
  filters = [],
  itemsPerPage = 10,
  emptyMessage = "データがありません",
  className,
  enableCsv = false,
  csvColumns,
  csvFileName = "data",
  csvUniqueKey,
  onCsvImport,
  onRowClick,
  renderForm,
  formTitle = "詳細",
  formDescription,
}: ListTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<keyof T | string | null>(null)
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedItem, setSelectedItem] = useState<T | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  // 検索フィルター
  const filteredBySearch = data.filter((item) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    
    if (searchKeys.length > 0) {
      return searchKeys.some((key) => {
        const value = item[key]
        return String(value).toLowerCase().includes(query)
      })
    }
    
    return Object.values(item).some((value) =>
      String(value).toLowerCase().includes(query)
    )
  })

  // 複数フィルター
  const filteredData = filteredBySearch.filter((item) => {
    if (filters.length === 0) return true
    
    return filters.every((filter) => {
      const filterValue = filterValues[String(filter.key)]
      if (!filterValue || filterValue === "all") return true
      return item[filter.key] === filterValue
    })
  })

  // ソート
  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0
    
    const aValue = a[sortKey as keyof T]
    const bValue = b[sortKey as keyof T]
    
    if (aValue === bValue) return 0
    
    const comparison = aValue > bValue ? 1 : -1
    return sortOrder === "asc" ? comparison : -comparison
  })

  // ページネーション
  const totalPages = Math.ceil(sortedData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = sortedData.slice(startIndex, endIndex)

  const handleSort = (key: keyof T | string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortOrder("asc")
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleRowClick = (item: T) => {
    if (onRowClick) {
      onRowClick(item)
    }
    if (renderForm) {
      setSelectedItem(item)
      setIsFormOpen(true)
    }
  }

  const handleCloseForm = () => {
    setIsFormOpen(false)
    setSelectedItem(null)
  }

  return (
    <Card className={cn("w-full", className)}>
      {(title || description) && (
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              {title && <CardTitle>{title}</CardTitle>}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {enableCsv && csvColumns && (
              <CsvImportExport
                columns={csvColumns}
                data={data}
                onImport={onCsvImport}
                fileName={csvFileName}
                uniqueKey={csvUniqueKey}
              />
            )}
          </div>
        </CardHeader>
      )}
      <CardContent>
        {/* 検索とフィルター */}
        {(searchable || filters.length > 0) && (
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            {searchable && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="pl-9"
                />
              </div>
            )}
            {filters.map((filter) => (
              <div key={String(filter.key)} className="w-full sm:w-[200px]">
                <Combobox
                  options={[
                    { value: "all", label: "すべて" },
                    ...filter.options,
                  ]}
                  value={filterValues[String(filter.key)] || "all"}
                  onValueChange={(value) => {
                    setFilterValues((prev) => ({
                      ...prev,
                      [String(filter.key)]: value,
                    }))
                    setCurrentPage(1)
                  }}
                  placeholder={filter.placeholder || filter.label}
                  searchPlaceholder={filter.searchPlaceholder || "検索..."}
                />
              </div>
            ))}
          </div>
        )}

        {/* テーブル */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={String(column.key)}
                    style={{ width: column.width }}
                    className={cn(
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right"
                    )}
                  >
                    {column.sortable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3 h-8 data-[state=open]:bg-accent"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item, index) => (
                  <TableRow 
                    key={index}
                    onClick={() => handleRowClick(item)}
                    className={cn(
                      (onRowClick || renderForm) && "cursor-pointer hover:bg-muted/50 transition-colors"
                    )}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={String(column.key)}
                        className={cn(
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right"
                        )}
                      >
                        {column.render
                          ? column.render(item)
                          : (() => {
                              const value = item[column.key as keyof T]
                              if (column.key === 'id') {
                                console.log('ID column:', { key: column.key, value, item })
                              }
                              return String(value ?? "")
                            })()}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              {sortedData.length}件中 {startIndex + 1}-{Math.min(endIndex, sortedData.length)}件を表示
            </div>
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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(page)}
                    className="w-8 h-8 p-0"
                  >
                    {page}
                  </Button>
                ))}
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
      </CardContent>

      {/* フォームモーダル */}
      {renderForm && (
        <FormModal
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          title={formTitle}
          description={formDescription}
          onCancel={handleCloseForm}
          maxWidth="2xl"
        >
          {renderForm(selectedItem, handleCloseForm)}
        </FormModal>
      )}
    </Card>
  )
}
