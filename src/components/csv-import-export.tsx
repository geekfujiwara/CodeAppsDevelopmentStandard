import { useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Download, FileText, CheckCircle2, AlertCircle, X, Trash2, Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type CsvColumn<T> = {
  key: keyof T
  label: string
  /** CSV出力時の英語カラム名 */
  csvLabel?: string
  required?: boolean
  validate?: (value: string) => boolean | string
  transform?: (value: string) => unknown
  /** CSV出力時のフォーマット関数 */
  format?: (value: unknown) => string
}

export type CsvValidationError = {
  row: number
  column: string
  columnKey: string
  value: string
  error: string
}

export type CsvOperationType = "CREATE" | "UPDATE" | "DELETE"

export type CsvRowData<T> = {
  rowIndex: number
  data: Partial<T>
  errors: CsvValidationError[]
  isValid: boolean
  operationType: CsvOperationType
}

export type CsvImportExportProps<T> = {
  columns: CsvColumn<T>[]
  data?: T[]
  onImport?: (data: T[], operations: Map<T, CsvOperationType>) => void
  fileName?: string
  className?: string
  /** 既存データと照合するための一意キー (例: "id") */
  uniqueKey?: keyof T
  /** CSV内の操作タイプを指定するカラム名 (例: "操作", "Operation") */
  operationColumnName?: string
}

export function CsvImportExport<T extends Record<string, unknown>>({
  columns,
  data = [],
  onImport,
  fileName = "data",
  className,
  uniqueKey,
  operationColumnName = "操作",
}: CsvImportExportProps<T>) {
  const [open, setOpen] = useState(false)
  const [importStep, setImportStep] = useState<"upload" | "validate" | "complete">("upload")
  const [isDragging, setIsDragging] = useState(false)
  const [csvRows, setCsvRows] = useState<CsvRowData<T>[]>([])
  const [isTableMaximized, setIsTableMaximized] = useState(false)

  // CSV出力
  const exportCsv = useCallback((includeData: boolean) => {
    // ヘッダー行を構築: OperationType + columns + UniqueKey(存在する場合)
    const columnHeaders = columns.map((col) => col.csvLabel || col.label)
    const allHeaders = ["OperationType", ...columnHeaders]
    
    // テンプレートの場合、uniqueKeyがあればそのカラムも追加
    if (!includeData && uniqueKey) {
      const uniqueKeyCol = columns.find(col => col.key === uniqueKey)
      if (uniqueKeyCol && !columnHeaders.includes(uniqueKeyCol.csvLabel || uniqueKeyCol.label)) {
        allHeaders.push(uniqueKeyCol.csvLabel || uniqueKeyCol.label)
      }
    }
    
    let csvContent = allHeaders.join(",") + "\n"

    if (includeData && data.length > 0) {
      const rows = data.map((item) => {
        // OperationType列（エクスポートデータの場合は空白）
        const operationType = ""
        
        // データ列
        const dataColumns = columns.map((col) => {
          const value = item[col.key]
          // valueがundefinedでないことを確認
          if (value === undefined || value === null) {
            return ""
          }
          // format関数があれば使用、なければ文字列化
          const stringValue = col.format ? col.format(value) : String(value)
          // カンマや改行、ダブルクォートを含む場合はエスケープ
          if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
            return `"${stringValue.replace(/"/g, '""')}"`
          }
          return stringValue
        })
        
        return [operationType, ...dataColumns].join(",")
      })
      csvContent += rows.join("\n")
    }

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${fileName}${includeData ? "" : "_template"}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [columns, data, fileName, uniqueKey])

  // CSVパース
  const parseCsv = useCallback((text: string): string[][] => {
    const rows: string[][] = []
    let currentRow: string[] = []
    let currentCell = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentCell += '"'
            i++
          } else {
            inQuotes = false
          }
        } else {
          currentCell += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === ",") {
          currentRow.push(currentCell)
          currentCell = ""
        } else if (char === "\n" || char === "\r") {
          if (currentCell || currentRow.length > 0) {
            currentRow.push(currentCell)
            rows.push(currentRow)
            currentRow = []
            currentCell = ""
          }
          if (char === "\r" && nextChar === "\n") {
            i++
          }
        } else {
          currentCell += char
        }
      }
    }

    if (currentCell || currentRow.length > 0) {
      currentRow.push(currentCell)
      rows.push(currentRow)
    }

    return rows
  }, [])

  // 操作タイプを判定
  const determineOperationType = useCallback((
    rowData: Partial<T>,
    operationValue: string | undefined
  ): CsvOperationType => {
    // 1. CSVに操作カラムがあればそれを優先
    if (operationValue) {
      const normalized = operationValue.trim().toUpperCase()
      if (normalized === "CREATE" || normalized === "新規" || normalized === "作成") return "CREATE"
      if (normalized === "UPDATE" || normalized === "更新" || normalized === "編集") return "UPDATE"
      if (normalized === "DELETE" || normalized === "削除") return "DELETE"
    }
    
    // 2. uniqueKeyが指定されている場合、既存データと照合
    if (uniqueKey && rowData[uniqueKey] !== undefined && rowData[uniqueKey] !== "") {
      const existingItem = data.find(item => item[uniqueKey] === rowData[uniqueKey])
      return existingItem ? "UPDATE" : "CREATE"
    }
    
    // 3. デフォルトは新規作成
    return "CREATE"
  }, [uniqueKey, data])

  // ファイル選択
  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCsv(text)
      
      // ヘッダー行を取得してカラムインデックスのマップを作成
      const headers = rows[0] || []
      const columnIndexMap = new Map<keyof T, number>()
      
      columns.forEach((col) => {
        // 日本語ラベルまたは英語csvLabelのいずれかとマッチング
        const headerIndex = headers.findIndex((header) => {
          const normalizedHeader = header.trim().toLowerCase()
          const normalizedLabel = col.label.trim().toLowerCase()
          const normalizedCsvLabel = col.csvLabel?.trim().toLowerCase()
          
          return normalizedHeader === normalizedLabel || 
                 (normalizedCsvLabel && normalizedHeader === normalizedCsvLabel)
        })
        if (headerIndex !== -1) {
          columnIndexMap.set(col.key, headerIndex)
        }
      })
      
      // 操作カラムのインデックスを取得
      const operationColIndex = headers.findIndex((header) => 
        header.trim().toLowerCase() === operationColumnName.trim().toLowerCase()
      )
      
      // 行ごとのデータとエラーを構築
      const rowsData: CsvRowData<T>[] = []
      const dataRows = rows.slice(1)
      
      dataRows.forEach((row, rowIndex) => {
        const item: Partial<T> = {}
        const rowErrors: CsvValidationError[] = []
        
        columns.forEach((col) => {
          const colIndex = columnIndexMap.get(col.key)
          const value = colIndex !== undefined ? (row[colIndex] || "") : ""
          
          // 必須チェック
          if (col.required && !value.trim()) {
            rowErrors.push({
              row: rowIndex + 2,
              column: col.label,
              columnKey: String(col.key),
              value: value,
              error: "必須項目です",
            })
          }
          
          // カスタムバリデーション
          if (col.validate && value.trim()) {
            const validationResult = col.validate(value)
            if (validationResult !== true) {
              rowErrors.push({
                row: rowIndex + 2,
                column: col.label,
                columnKey: String(col.key),
                value: value,
                error: typeof validationResult === "string" ? validationResult : "無効な値です",
              })
            }
          }
          
          // データ変換
          if (col.transform) {
            item[col.key] = col.transform(value) as T[keyof T]
          } else {
            item[col.key] = value as T[keyof T]
          }
        })
        
        // 操作タイプを判定
        const operationValue = operationColIndex !== -1 ? row[operationColIndex] : undefined
        const operationType = determineOperationType(item, operationValue)
        
        rowsData.push({
          rowIndex: rowIndex + 2,
          data: item,
          errors: rowErrors,
          isValid: rowErrors.length === 0,
          operationType,
        })
      })
      
      setCsvRows(rowsData)
      setImportStep("validate")
    }
    reader.readAsText(file, "UTF-8")
  }, [parseCsv, columns, operationColumnName, determineOperationType])

  // ドラッグ&ドロップ
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file && file.type === "text/csv") {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  // セル編集
  const handleCellEdit = useCallback((rowIndex: number, columnKey: keyof T, value: unknown) => {
    // 行データを直接更新
    setCsvRows((prev) => 
      prev.map((row) => {
        if (row.rowIndex === rowIndex) {
          const updatedData = { ...row.data, [columnKey]: value }
          
          // バリデーションを再実行
          const newErrors: CsvValidationError[] = []
          const col = columns.find((c) => c.key === columnKey)
          
          if (col) {
            const stringValue = String(value ?? "")
            
            // 必須チェック
            if (col.required && !stringValue.trim()) {
              newErrors.push({
                row: rowIndex,
                column: col.label,
                columnKey: String(col.key),
                value: stringValue,
                error: "必須項目です",
              })
            }
            
            // カスタムバリデーション
            if (col.validate && stringValue.trim()) {
              const validationResult = col.validate(stringValue)
              if (validationResult !== true) {
                newErrors.push({
                  row: rowIndex,
                  column: col.label,
                  columnKey: String(col.key),
                  value: stringValue,
                  error: typeof validationResult === "string" ? validationResult : "無効な値です",
                })
              }
            }
          }
          
          // この列のエラーを削除して新しいエラーを追加
          const otherErrors = row.errors.filter((e) => e.columnKey !== String(columnKey))
          const allErrors = [...otherErrors, ...newErrors]
          
          return {
            ...row,
            data: updatedData,
            errors: allErrors,
            isValid: allErrors.length === 0,
          }
        }
        return row
      })
    )
  }, [columns])
  
  // 操作種別を変更
  const handleOperationTypeChange = useCallback((rowIndex: number, newOperationType: CsvOperationType) => {
    setCsvRows((prev) =>
      prev.map((row) => {
        if (row.rowIndex === rowIndex) {
          return {
            ...row,
            operationType: newOperationType,
          }
        }
        return row
      })
    )
  }, [])
  
  // 行を削除
  const handleDeleteRow = useCallback((rowIndex: number) => {
    setCsvRows((prev) => prev.filter((row) => row.rowIndex !== rowIndex))
  }, [])
  
  // インポート実行
  const handleImport = useCallback(() => {
    // 有効な行のみをインポート
    const validRows = csvRows.filter((row) => row.isValid)
    const validData = validRows.map((row) => row.data as T)
    
    // 操作タイプのマップを作成
    const operationsMap = new Map<T, CsvOperationType>()
    validRows.forEach((row, index) => {
      operationsMap.set(validData[index], row.operationType)
      console.log(`[CSV Import] Row ${index}: OperationType=${row.operationType}, Data=`, validData[index])
    })
    
    console.log(`[CSV Import] Total valid rows: ${validData.length}`)
    console.log(`[CSV Import] Operations breakdown:`, {
      CREATE: validRows.filter(r => r.operationType === 'CREATE').length,
      UPDATE: validRows.filter(r => r.operationType === 'UPDATE').length,
      DELETE: validRows.filter(r => r.operationType === 'DELETE').length,
    })
    
    if (onImport && validData.length > 0) {
      onImport(validData, operationsMap)
      setImportStep("complete")
    }
  }, [onImport, csvRows])

  // ダイアログクローズ時のリセット
  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setTimeout(() => {
        setImportStep("upload")
        setCsvRows([])
        setIsTableMaximized(false)
      }, 200)
    }
  }, [])

  return (
    <>
    <Dialog open={open && !isTableMaximized} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Upload className="h-4 w-4 mr-2" />
          CSV入出力
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>CSV入出力</DialogTitle>
          <DialogDescription>
            データのエクスポートまたはCSVファイルからのインポート
          </DialogDescription>
        </DialogHeader>

        {importStep === "upload" && (
          <div className="space-y-4 flex-1 overflow-auto">
            {/* エクスポートセクション */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  データのエクスポート
                </CardTitle>
                <CardDescription>現在のデータをCSV形式でダウンロード</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  onClick={() => exportCsv(true)}
                  variant="outline"
                  className="w-full justify-start"
                  disabled={data.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  データを出力 ({data.length}件)
                </Button>
                <Button
                  onClick={() => exportCsv(false)}
                  variant="outline"
                  className="w-full justify-start"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  テンプレートを出力
                </Button>
              </CardContent>
            </Card>

            {/* インポートセクション */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  CSVインポート
                </CardTitle>
                <CardDescription>CSVファイルからデータをインポート</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                    isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                  )}
                >
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    CSVファイルをドラッグ&ドロップ
                    <br />
                    または
                  </p>
                  <Button
                    onClick={() => {
                      const input = document.createElement("input")
                      input.type = "file"
                      input.accept = ".csv"
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0]
                        if (file) {
                          handleFileSelect(file)
                        }
                      }
                      input.click()
                    }}
                    variant="outline"
                  >
                    ファイルを選択
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {importStep === "validate" && (
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* バリデーション結果サマリー */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className={cn(
                "border-2",
                csvRows.filter(r => r.isValid).length > 0 ? "border-green-200 bg-green-50 dark:bg-green-950/20" : ""
              )}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    有効なデータ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{csvRows.filter(r => r.isValid).length}</div>
                  <p className="text-xs text-muted-foreground mt-1">件のデータがインポート可能</p>
                </CardContent>
              </Card>

              <Card className={cn(
                "border-2",
                csvRows.filter(r => !r.isValid).length > 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""
              )}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    エラー
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">{csvRows.filter(r => !r.isValid).length}</div>
                  <p className="text-xs text-muted-foreground mt-1">件の行にバリデーションエラー</p>
                </CardContent>
              </Card>
            </div>

            {/* インライン編集テーブル */}
            <Card className="flex-1 overflow-hidden flex flex-col min-h-0">
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <CardTitle className="text-sm font-medium">データプレビューと編集</CardTitle>
                    <CardDescription>
                      エラーのあるセルは赤色で表示されます。直接編集して修正できます。
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsTableMaximized(true)}
                    className="h-8 w-8 p-0 flex-shrink-0"
                    title="最大化"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto min-h-0">
                  <table className="w-full text-sm border-collapse">
                    <thead className="bg-muted sticky top-0 z-20 shadow-sm">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium w-16 border-b bg-muted">行</th>
                        <th className="px-3 py-2 text-left font-medium w-16 border-b bg-muted">状態</th>
                        <th className="px-3 py-2 text-left font-medium w-24 border-b bg-muted">操作種別</th>
                        {columns.map((col) => (
                          <th key={String(col.key)} className="px-3 py-2 text-left font-medium min-w-[150px] border-b bg-muted">
                            {col.label}
                            {col.required && <span className="text-red-500 ml-1">*</span>}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-center font-medium w-20 border-b bg-muted">削除</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((row) => {
                        
                        return (
                          <tr
                            key={row.rowIndex}
                            className={cn(
                              "border-b hover:bg-accent/50 transition-colors",
                              !row.isValid && "bg-red-50/50 dark:bg-red-950/10"
                            )}
                          >
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.rowIndex}</td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-red-600" />
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={row.operationType}
                                onValueChange={(value: CsvOperationType) => handleOperationTypeChange(row.rowIndex, value)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CREATE">新規</SelectItem>
                                  <SelectItem value="UPDATE">更新</SelectItem>
                                  <SelectItem value="DELETE">削除</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            {columns.map((col) => {
                              const value = row.data[col.key]
                              const hasError = row.errors.some((e) => e.columnKey === String(col.key))
                              const error = row.errors.find((e) => e.columnKey === String(col.key))
                              
                              return (
                                <td key={String(col.key)} className="px-3 py-2">
                                  <div className="space-y-1">
                                    <Input
                                      value={String(value ?? "")}
                                      onChange={(e) => handleCellEdit(row.rowIndex, col.key, e.target.value)}
                                      className={cn(
                                        "h-8 text-sm",
                                        hasError && "border-red-500 bg-red-50 dark:bg-red-950/20"
                                      )}
                                    />
                                    {error && (
                                      <p className="text-xs text-red-600">{error.error}</p>
                                    )}
                                  </div>
                                </td>
                              )
                            })}
                            <td className="px-3 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRow(row.rowIndex)}
                                className="h-7 w-7 p-0"
                                title="行を削除"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
              </CardContent>
            </Card>

            {/* アクションボタン */}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setImportStep("upload")}>
                <X className="h-4 w-4 mr-2" />
                キャンセル
              </Button>
              <Button
                onClick={handleImport}
                disabled={csvRows.filter(r => r.isValid).length === 0}
              >
                <Upload className="h-4 w-4 mr-2" />
                インポート ({csvRows.filter(r => r.isValid).length}件)
              </Button>
            </div>
          </div>
        )}

        {importStep === "complete" && (
          <div className="space-y-4 flex-1 flex flex-col items-center justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-600" />
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">インポート完了</h3>
              <p className="text-sm text-muted-foreground">
                {csvRows.filter(r => r.isValid).length}件のデータをインポートしました
              </p>
            </div>
            <Button onClick={() => handleOpenChange(false)}>閉じる</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* 最大化モード */}
    {isTableMaximized && createPortal(
      <div className="fixed inset-0 z-[120] bg-background flex flex-col">
        <div className="border-b p-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">CSV入出力 - データプレビューと編集</h2>
            <p className="text-sm text-muted-foreground">
              エラーのあるセルは赤色で表示されます。直接編集して修正できます。
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTableMaximized(false)}
            className="h-8 w-8 p-0"
            title="元のサイズに戻す"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-4">
            <table className="w-full text-sm border-collapse border">
              <thead className="bg-muted sticky top-0 z-20 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-16 border-b bg-muted">行</th>
                <th className="px-3 py-2 text-left font-medium w-16 border-b bg-muted">状態</th>
                <th className="px-3 py-2 text-left font-medium w-24 border-b bg-muted">操作種別</th>
                {columns.map((col) => (
                  <th key={String(col.key)} className="px-3 py-2 text-left font-medium min-w-[150px] border-b bg-muted">
                    {col.label}
                    {col.required && <span className="text-red-500 ml-1">*</span>}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium w-20 border-b bg-muted">削除</th>
              </tr>
            </thead>
            <tbody>
              {csvRows.map((row) => {
                
                return (
                  <tr
                    key={row.rowIndex}
                    className={cn(
                      "border-b hover:bg-accent/50 transition-colors",
                      !row.isValid && "bg-red-50/50 dark:bg-red-950/10"
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.rowIndex}</td>
                    <td className="px-3 py-2">
                      {row.isValid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={row.operationType}
                        onValueChange={(value: CsvOperationType) => handleOperationTypeChange(row.rowIndex, value)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CREATE">新規</SelectItem>
                          <SelectItem value="UPDATE">更新</SelectItem>
                          <SelectItem value="DELETE">削除</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {columns.map((col) => {
                      const value = row.data[col.key]
                      const hasError = row.errors.some((e) => e.columnKey === String(col.key))
                      const error = row.errors.find((e) => e.columnKey === String(col.key))
                      
                      return (
                        <td key={String(col.key)} className="px-3 py-2">
                          <div className="space-y-1">
                            <Input
                              value={String(value ?? "")}
                              onChange={(e) => handleCellEdit(row.rowIndex, col.key, e.target.value)}
                              className={cn(
                                "h-8 text-sm",
                                hasError && "border-red-500 bg-red-50 dark:bg-red-950/20"
                              )}
                            />
                            {error && (
                              <p className="text-xs text-red-600">{error.error}</p>
                            )}
                          </div>
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRow(row.rowIndex)}
                        className="h-7 w-7 p-0"
                        title="行を削除"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="border-t p-4 flex gap-2 justify-end">
          <Button variant="outline" onClick={() => { setIsTableMaximized(false); setImportStep("upload"); }}>
            <X className="h-4 w-4 mr-2" />
            キャンセル
          </Button>
          <Button
            onClick={() => { handleImport(); setIsTableMaximized(false); }}
            disabled={csvRows.filter(r => r.isValid).length === 0}
          >
            <Upload className="h-4 w-4 mr-2" />
            インポート ({csvRows.filter(r => r.isValid).length}件)
          </Button>
        </div>
      </div>
    , document.body)}
    </>
  )
}
