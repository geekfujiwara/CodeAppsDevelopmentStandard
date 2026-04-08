import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CsvImportExport, type CsvColumn, type CsvOperationType } from "@/components/csv-import-export"
import { Check, X, Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type ComboboxOption = {
  value: string
  label: string
}

export type EditableColumn<T> = {
  key: keyof T
  label: string
  editable?: boolean
  type?: "text" | "textarea" | "number" | "lookup" | "select"
  width?: string
  align?: "left" | "center" | "right"
  options?: ComboboxOption[] // lookupやselectタイプで使用
  searchPlaceholder?: string // lookupタイプで使用
  placeholder?: string // selectタイプで使用
  render?: (value: unknown, isEditing: boolean) => React.ReactNode
  validate?: (value: unknown) => boolean | string
}

export type InlineEditTableProps<T extends { id: string | number }> = {
  data: T[]
  columns: EditableColumn<T>[]
  title?: string
  description?: string
  onUpdate?: (id: string | number, key: keyof T, value: unknown) => void
  onSave?: (id: string | number, updatedItem: Partial<T>) => void
  onDelete?: (id: string | number) => void
  onAdd?: (newItem: Omit<T, "id">) => void
  addButtonLabel?: string
  emptyMessage?: string
  className?: string
  enableCsv?: boolean
  csvColumns?: CsvColumn<T>[]
  csvFileName?: string
  csvUniqueKey?: keyof T
  onCsvImport?: (data: T[], operationsMap: Map<T, CsvOperationType>) => void
}

export function InlineEditTable<T extends { id: string | number }>({
  data: initialData,
  columns,
  title,
  description,
  onUpdate,
  onSave,
  onDelete,
  onAdd,
  addButtonLabel = "新規追加",
  emptyMessage = "データがありません",
  className,
  enableCsv = false,
  csvColumns,
  csvFileName = "data",
  csvUniqueKey,
  onCsvImport,
}: InlineEditTableProps<T>) {
  const [data, setData] = useState<T[]>(initialData)
  const [originalData] = useState<T[]>(initialData) // 元のデータを保持
  const [changedIds, setChangedIds] = useState<Set<string | number>>(new Set()) // 変更された行ID
  const [isAdding, setIsAdding] = useState(false)
  const [newItemData, setNewItemData] = useState<Partial<T>>({})
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | number | null>(null)

  const handleSave = (id: string | number) => {
    const item = data.find((d) => d.id === id)
    if (item && onSave) {
      onSave(id, item)
    }
    // 保存後、変更フラグをクリア
    setChangedIds((prev) => {
      const newSet = new Set(prev)
      newSet.delete(id)
      return newSet
    })
  }

  const handleDeleteClick = (id: string | number) => {
    setDeleteConfirmId(id)
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirmId !== null) {
      if (onDelete) {
        onDelete(deleteConfirmId)
      }
      setData((prev) => prev.filter((item) => item.id !== deleteConfirmId))
      setDeleteConfirmId(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteConfirmId(null)
  }

  const handleCellChange = (id: string | number, key: keyof T, value: unknown) => {
    setData((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [key]: value } : item
      )
    )
    
    // 元のデータと比較して変更があればフラグを立てる
    const originalItem = originalData.find((item) => item.id === id)
    const currentItem = data.find((item) => item.id === id)
    
    if (originalItem && currentItem) {
      const updatedItem = { ...currentItem, [key]: value }
      const hasChanges = Object.keys(updatedItem).some(
        (k) => updatedItem[k as keyof T] !== originalItem[k as keyof T]
      )
      
      setChangedIds((prev) => {
        const newSet = new Set(prev)
        if (hasChanges) {
          newSet.add(id)
        } else {
          newSet.delete(id)
        }
        return newSet
      })
    }
    
    if (onUpdate) {
      onUpdate(id, key, value)
    }
  }

  const handleAddNew = () => {
    setIsAdding(true)
    setNewItemData({})
  }

  const handleCancelAdd = () => {
    setIsAdding(false)
    setNewItemData({})
  }

  const handleSaveNew = () => {
    if (onAdd) {
      onAdd(newItemData as Omit<T, "id">)
    }
    
    const newId = Math.max(...data.map((d) => Number(d.id)), 0) + 1
    setData((prev) => [...prev, { ...newItemData, id: newId } as T])
    
    setIsAdding(false)
    setNewItemData({})
  }

  const handleNewItemChange = (key: keyof T, value: unknown) => {
    setNewItemData((prev) => ({ ...prev, [key]: value }))
  }

  const renderEditableCell = (
    column: EditableColumn<T>,
    value: unknown,
    onChange: (value: unknown) => void
  ) => {
    if (!column.editable) {
      if (column.render) {
        return column.render(value, false)
      }
      return <span>{String(value ?? "")}</span>
    }

    const inputClassName = "h-8 px-2 py-1 text-sm"

    switch (column.type) {
      case "lookup":
        return (
          <Combobox
            value={String(value ?? "")}
            onValueChange={(newValue) => onChange(newValue)}
            options={column.options ?? []}
            placeholder={column.placeholder ?? "選択..."}
            searchPlaceholder={column.searchPlaceholder ?? "検索..."}
            emptyMessage="見つかりません"
            className="h-8"
          />
        )
      case "select":
        return (
          <Select value={String(value ?? "")} onValueChange={(newValue) => onChange(newValue)}>
            <SelectTrigger className={inputClassName}>
              <SelectValue placeholder={column.placeholder ?? "選択..."} />
            </SelectTrigger>
            <SelectContent>
              {column.options?.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      case "textarea":
        return (
          <Textarea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[60px] text-sm"
          />
        )
      case "number":
        return (
          <Input
            type="number"
            value={String(value ?? "")}
            onChange={(e) => onChange(Number(e.target.value))}
            className={inputClassName}
          />
        )
      case "text":
      default:
        return (
          <Input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={inputClassName}
          />
        )
    }
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
        {/* 追加ボタン */}
        {onAdd && !isAdding && (
          <div className="mb-4">
            <Button onClick={handleAddNew} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {addButtonLabel}
            </Button>
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
                    {column.label}
                  </TableHead>
                ))}
                <TableHead className="w-[120px] text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* 新規追加行 */}
              {isAdding && (
                <TableRow className="bg-accent/50">
                  {columns.map((column) => (
                    <TableCell
                      key={String(column.key)}
                      className={cn(
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right"
                      )}
                    >
                      {column.editable ? (
                        renderEditableCell(
                          column,
                          newItemData[column.key],
                          (value) => handleNewItemChange(column.key, value)
                        )
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSaveNew}
                        className="h-8 w-8 p-0"
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelAdd}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {/* データ行 */}
              {data.length === 0 && !isAdding ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item) => {
                  const hasChanges = changedIds.has(item.id)
                  return (
                    <TableRow key={item.id}>
                      {columns.map((column) => (
                        <TableCell
                          key={String(column.key)}
                          className={cn(
                            column.align === "center" && "text-center",
                            column.align === "right" && "text-right"
                          )}
                        >
                          {renderEditableCell(
                            column,
                            item[column.key],
                            (value) => handleCellChange(item.id, column.key, value)
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {onSave && hasChanges && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSave(item.id)}
                              className="h-8 w-8 p-0"
                              title="保存"
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(item.id)}
                              className="h-8 w-8 p-0"
                              title="削除"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && handleDeleteCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>削除の確認</DialogTitle>
            <DialogDescription>
              この項目を削除してもよろしいですか？この操作は取り消せません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              削除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
