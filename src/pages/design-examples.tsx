import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CodeBlock } from "@/components/code-block"
import { useLearnCatalog } from "@/hooks/use-learn-catalog"
import { LinkConfirmModal, useLinkModal } from "@/components/link-confirm-modal"
import { LoadingSkeletonGrid } from "@/components/loading-skeleton"
import { TaskPriorityList } from "@/components/task-priority-list"
import { GanttChart } from "@/components/gantt-chart"
import { KanbanBoard } from "@/components/kanban-board"
import { ChartDashboard } from "@/components/chart-dashboard"
import { TreeStructure } from "@/components/tree-structure"
import { StatsCards, SearchFilterGallery } from "@/components/gallery-components"
import type { GalleryItem, FilterConfig } from "@/components/search-filter-gallery"
import { ListTable } from "@/components/list-table"
import type { TableColumn } from "@/components/list-table"
import { InlineEditTable } from "@/components/inline-edit-table"
import type { EditableColumn } from "@/components/inline-edit-table"
import { FormSection, FormColumns } from "@/components/form-modal"
import { renderPriorityBadge, renderStatusBadge } from "@/lib/table-utils"
import { getBadgeColorClass, flattenItems } from "@/lib/gallery-utils"
import { AlertCircle, BookOpen, Clock, Layers, RefreshCw, Target, List, X } from "lucide-react"

const ITEMS_PER_PAGE = 9

export default function DesignShowcasePage() {
  const queryOptions = useMemo(() => ({ top: 300 }), [])
  const { data, isLoading, isError, error, refetch, summary } = useLearnCatalog(queryOptions)
  const { modalData, openModal, closeModal } = useLinkModal()

  const [isTocOpen, setIsTocOpen] = useState(true)

  // サンプルタスクデータ
  const [sampleTasks, setSampleTasks] = useState([
    { id: 1, title: "ユーザー認証機能の実装", description: "OAuth2.0を使用した認証システムの構築", priority: "high", status: "進行中", category: "開発", assignee: "田中太郎", dueDate: "2025-12-01" },
    { id: 2, title: "APIドキュメントの作成", description: "RESTful APIの仕様書を作成", priority: "medium", status: "未着手", category: "ドキュメント", assignee: "佐藤花子", dueDate: "2025-12-15" },
    { id: 3, title: "UIデザインのレビュー", description: "新しいダッシュボードデザインの確認", priority: "high", status: "完了", category: "デザイン", assignee: "鈴木一郎", dueDate: "2025-11-20" },
    { id: 4, title: "単体テストの作成", description: "認証機能の単体テストを実装", priority: "medium", status: "進行中", category: "テスト", assignee: "田中太郎", dueDate: "2025-12-05" },
    { id: 5, title: "パフォーマンス改善", description: "データベースクエリの最適化", priority: "low", status: "未着手", category: "開発", assignee: "佐藤花子", dueDate: "2025-12-20" },
    { id: 6, title: "セキュリティ監査", description: "脆弱性スキャンと修正", priority: "high", status: "進行中", category: "開発", assignee: "鈴木一郎", dueDate: "2025-11-30" },
    { id: 7, title: "ユーザーマニュアル更新", description: "新機能の使い方を追記", priority: "low", status: "完了", category: "ドキュメント", assignee: "田中太郎", dueDate: "2025-11-25" },
    { id: 8, title: "結合テスト実施", description: "全モジュールの統合テスト", priority: "medium", status: "未着手", category: "テスト", assignee: "佐藤花子", dueDate: "2025-12-10" },
  ])

  // Inline Edit Table のサンプルデータ
  const [employees, setEmployees] = useState([
    { id: 1, name: "田中太郎", email: "tanaka@example.com", department: "開発", role: "エンジニア" },
    { id: 2, name: "佐藤花子", email: "sato@example.com", department: "デザイン", role: "デザイナー" },
    { id: 3, name: "鈴木一郎", email: "suzuki@example.com", department: "テスト", role: "QAエンジニア" },
    { id: 4, name: "高橋美咲", email: "takahashi@example.com", department: "開発", role: "シニアエンジニア" },
    { id: 5, name: "山田次郎", email: "yamada@example.com", department: "マーケティング", role: "マネージャー" },
  ])

  const employeeColumns = useMemo<EditableColumn<typeof employees[0]>[]>(() => [
    { key: "id", label: "ID", editable: false, type: "text", width: "w-20" },
    { key: "name", label: "名前", editable: true, type: "text", width: "w-32" },
    { key: "email", label: "メール", editable: true, type: "text", width: "w-48" },
    { 
      key: "department", 
      label: "部署", 
      editable: true, 
      type: "lookup", 
      width: "w-40",
      options: [
        { value: "開発", label: "開発部" },
        { value: "デザイン", label: "デザイン部" },
        { value: "テスト", label: "テスト部" },
        { value: "マーケティング", label: "マーケティング部" },
        { value: "営業", label: "営業部" },
        { value: "人事", label: "人事部" },
      ],
      placeholder: "部署を選択",
      searchPlaceholder: "部署を検索...",
    },
    { 
      key: "role", 
      label: "役職", 
      editable: true, 
      type: "select", 
      width: "w-40",
      options: [
        { value: "エンジニア", label: "エンジニア" },
        { value: "シニアエンジニア", label: "シニアエンジニア" },
        { value: "デザイナー", label: "デザイナー" },
        { value: "QAエンジニア", label: "QAエンジニア" },
        { value: "マネージャー", label: "マネージャー" },
        { value: "ディレクター", label: "ディレクター" },
      ],
      placeholder: "役職を選択",
    },
  ], [])

  const handleEmployeeUpdate = (id: string | number, key: keyof typeof employees[0], value: unknown) => {
    console.log(`[Update] ID: ${id}, Key: ${key}, Value:`, value)
  }

  const handleEmployeeSave = (id: string | number, updatedItem: Partial<typeof employees[0]>) => {
    console.log(`[Save] ID: ${id}, Data:`, updatedItem)
    setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...updatedItem } : emp))
  }

  const handleEmployeeDelete = (id: string | number) => {
    console.log(`[Delete] ID: ${id}`)
    setEmployees(prev => prev.filter(emp => emp.id !== id))
  }

  const handleEmployeeAdd = (newItem: Omit<typeof employees[0], "id">) => {
    const newId = Math.max(...employees.map(e => e.id), 0) + 1
    const data = { ...newItem, id: newId }
    console.log(`[Add] Data:`, data)
    setEmployees(prev => [...prev, data])
  }

  const handleEmployeeCsvImport = (data: typeof employees, operationsMap: Map<typeof employees[0], "CREATE" | "UPDATE" | "DELETE">) => {
    console.log(`[Employee CSV Import]`, data, operationsMap)
    
    setEmployees(prev => {
      let updated = [...prev]
      
      data.forEach((item) => {
        const operation = operationsMap.get(item)
        
        if (operation === "CREATE") {
          // 新規作成: IDがないか、既存IDと重複しない場合
          const newId = item.id && !updated.find(e => e.id === item.id) 
            ? item.id 
            : Math.max(...updated.map(e => e.id), 0) + 1
          updated.push({ ...item, id: newId })
        } else if (operation === "UPDATE") {
          // 更新: 既存アイテムを置き換え
          const index = updated.findIndex(e => e.id === item.id)
          if (index !== -1) {
            updated[index] = item
          }
        } else if (operation === "DELETE") {
          // 削除: 該当IDを除外
          console.log(`[Employee DELETE] Removing ID: ${item.id}, Before count: ${updated.length}`)
          updated = updated.filter(e => e.id !== item.id)
          console.log(`[Employee DELETE] After count: ${updated.length}`)
        }
      })
      
      console.log(`[Employee CSV Import Complete] Final count: ${updated.length}`)
      return updated
    })
  }

  // 従業員用CSV列定義
  const employeeCsvColumns = useMemo(() => [
    {
      key: "id" as keyof typeof employees[0],
      label: "ID",
      csvLabel: "ID",
      required: false,
      transform: (value: string) => value ? Number(value) : undefined
    },
    { 
      key: "name" as keyof typeof employees[0], 
      label: "名前",
      csvLabel: "Name",
      required: true,
      validate: (value: string) => value.trim().length > 0 || "名前は必須です"
    },
    { 
      key: "email" as keyof typeof employees[0], 
      label: "メール",
      csvLabel: "Email",
      required: true,
      validate: (value: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(value) || "有効なメールアドレスを入力してください"
      }
    },
    { 
      key: "department" as keyof typeof employees[0], 
      label: "部署",
      csvLabel: "Department",
      required: true 
    },
    { 
      key: "role" as keyof typeof employees[0], 
      label: "役職",
      csvLabel: "Role",
      required: true 
    },
  ], [])

  const handleTaskCsvImport = (data: typeof sampleTasks, operationsMap: Map<typeof sampleTasks[0], "CREATE" | "UPDATE" | "DELETE">) => {
    console.log(`[Task CSV Import]`, data, operationsMap)
    
    setSampleTasks(prev => {
      let updated = [...prev]
      
      data.forEach((item) => {
        const operation = operationsMap.get(item)
        
        if (operation === "CREATE") {
          // 新規作成: IDがないか、既存IDと重複しない場合
          const newId = item.id && !updated.find(t => t.id === item.id) 
            ? item.id 
            : Math.max(...updated.map(t => t.id), 0) + 1
          updated.push({ ...item, id: newId })
        } else if (operation === "UPDATE") {
          // 更新: 既存アイテムを置き換え
          const index = updated.findIndex(t => t.id === item.id)
          if (index !== -1) {
            updated[index] = item
          }
        } else if (operation === "DELETE") {
          // 削除: 該当IDを除外
          console.log(`[Task DELETE] Removing ID: ${item.id}, Before count: ${updated.length}`)
          updated = updated.filter(t => t.id !== item.id)
          console.log(`[Task DELETE] After count: ${updated.length}`)
        }
      })
      
      console.log(`[Task CSV Import Complete] Final count: ${updated.length}`)
      return updated
    })
  }

  // タスク用CSV列定義
  const taskCsvColumns = useMemo(() => [
    {
      key: "id" as keyof typeof sampleTasks[0],
      label: "ID",
      csvLabel: "ID",
      required: false,
      transform: (value: string) => value ? Number(value) : undefined
    },
    {
      key: "title" as keyof typeof sampleTasks[0],
      label: "タスク名",
      csvLabel: "Title",
      required: true,
      validate: (value: string) => value.trim().length > 0 || "タスク名は必須です"
    },
    {
      key: "priority" as keyof typeof sampleTasks[0],
      label: "優先度",
      csvLabel: "Priority",
      required: true,
      validate: (value: string) => {
        const validPriorities = ["高", "中", "低"]
        return validPriorities.includes(value) || `優先度は ${validPriorities.join(", ")} のいずれかである必要があります`
      }
    },
    {
      key: "category" as keyof typeof sampleTasks[0],
      label: "カテゴリ",
      csvLabel: "Category",
      required: true,
      validate: (value: string) => {
        const validCategories = ["開発", "デザイン", "テスト", "ドキュメント"]
        return validCategories.includes(value) || `カテゴリは ${validCategories.join(", ")} のいずれかである必要があります`
      }
    },
    {
      key: "status" as keyof typeof sampleTasks[0],
      label: "ステータス",
      csvLabel: "Status",
      required: true,
      validate: (value: string) => {
        const validStatuses = ["未着手", "進行中", "完了"]
        return validStatuses.includes(value) || `ステータスは ${validStatuses.join(", ")} のいずれかである必要があります`
      }
    },
    {
      key: "assignee" as keyof typeof sampleTasks[0],
      label: "担当者",
      csvLabel: "Assignee",
      required: true
    },
    {
      key: "progress" as keyof typeof sampleTasks[0],
      label: "進捗",
      csvLabel: "Progress",
      required: true,
      validate: (value: string) => {
        const num = Number(value)
        return (!isNaN(num) && num >= 0 && num <= 100) || "進捗は0から100の数値である必要があります"
      },
      transform: (value: string) => Number(value)
    },
    {
      key: "dueDate" as keyof typeof sampleTasks[0],
      label: "期日",
      csvLabel: "DueDate",
      required: true,
      validate: (value: string) => {
        // yyyyMMdd形式の検証
        if (!/^\d{8}$/.test(value)) {
          return "期日はyyyyMMdd形式（例: 20250119）で入力してください"
        }
        const year = parseInt(value.substring(0, 4))
        const month = parseInt(value.substring(4, 6))
        const day = parseInt(value.substring(6, 8))
        const date = new Date(year, month - 1, day)
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
          return "有効な日付を入力してください"
        }
        return true
      },
      transform: (value: string) => {
        // yyyyMMdd → yyyy-MM-dd
        if (/^\d{8}$/.test(value)) {
          return `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}`
        }
        return value
      },
      format: (value: unknown) => {
        // yyyy-MM-dd → yyyyMMdd
        const str = String(value ?? "")
        return str.replace(/-/g, "")
      }
    },
  ], [])

  const taskColumns = useMemo<TableColumn<typeof sampleTasks[0]>[]>(() => [
    {
      key: "id",
      label: "ID",
      sortable: true,
      width: "80px",
      align: "center",
    },
    {
      key: "title",
      label: "タイトル",
      sortable: true,
      width: "250px",
    },
    {
      key: "priority",
      label: "優先度",
      sortable: true,
      width: "100px",
      align: "center",
      render: (task) => renderPriorityBadge(task.priority),
    },
    {
      key: "status",
      label: "ステータス",
      sortable: true,
      width: "120px",
      align: "center",
      render: (task) => renderStatusBadge(task.status),
    },
    {
      key: "category",
      label: "カテゴリ",
      sortable: true,
      width: "120px",
    },
    {
      key: "assignee",
      label: "担当者",
      sortable: true,
      width: "120px",
    },
    {
      key: "dueDate",
      label: "期日",
      sortable: true,
      width: "120px",
    },
  ], [])

  // タスクテーブルのフィルター定義
  const taskFilters = useMemo(() => [
    {
      key: "category" as keyof typeof sampleTasks[0],
      label: "カテゴリで絞り込み",
      placeholder: "カテゴリを選択",
      searchPlaceholder: "カテゴリを検索...",
      options: [
        { value: "開発", label: "開発" },
        { value: "デザイン", label: "デザイン" },
        { value: "テスト", label: "テスト" },
        { value: "ドキュメント", label: "ドキュメント" },
      ],
    },
    {
      key: "assignee" as keyof typeof sampleTasks[0],
      label: "担当者で絞り込み",
      placeholder: "担当者を選択",
      searchPlaceholder: "担当者を検索...",
      options: [
        { value: "田中太郎", label: "田中太郎" },
        { value: "佐藤花子", label: "佐藤花子" },
        { value: "鈴木一郎", label: "鈴木一郎" },
      ],
    },
  ], [])

  const modules = useMemo(() => data?.modules ?? [], [data?.modules])
  const certifications = useMemo(() => data?.certifications ?? [], [data?.certifications])

  const flattenedProducts = useMemo(() => flattenItems(data?.products ?? []), [data?.products])
  const flattenedRoles = useMemo(() => flattenItems(data?.roles ?? []), [data?.roles])

  const productNameMap = useMemo(() => {
    return new Map(flattenedProducts.map((item) => [item.id, item.name]))
  }, [flattenedProducts])

  const roleNameMap = useMemo(() => {
    return new Map(flattenedRoles.map((item) => [item.id, item.name]))
  }, [flattenedRoles])

  const levelOptions = useMemo(() => {
    if (!data?.levels) return []
    const levels = data.levels.map((level) =>
      typeof level === "string" ? level : (level as { id?: string; name?: string }).id ?? (level as { id?: string; name?: string }).name ?? String(level)
    )
    return Array.from(new Set(levels))
  }, [data?.levels])

  const roleOptions = useMemo(() => {
    const fromModules = modules.flatMap((module) => module.roles)
    const ids = fromModules.map((r) =>
      typeof r === "string" ? r : (r as { id?: string }).id ?? String(r)
    )
    return Array.from(new Set(ids))
  }, [modules])

  const productOptions = useMemo(() => {
    const fromModules = modules.flatMap((module) => module.products)
    const ids = fromModules.map((p) =>
      typeof p === "string" ? p : (p as { id?: string }).id ?? String(p)
    )
    return Array.from(new Set(ids))
  }, [modules])

  // Convert modules to GalleryItem format
  const galleryItems = useMemo<GalleryItem[]>(() => {
    return modules.map((module) => ({
      id: module.uid,
      title: module.title,
      description: module.summary,
      badges: [
        ...module.levels.map((level) => ({
          label: level,
          className: getBadgeColorClass(level),
        })),
        ...module.roles.slice(0, 3).map((role) => ({
          label: roleNameMap.get(role) ?? role,
          className: getBadgeColorClass(roleNameMap.get(role) ?? role),
        })),
      ],
      metadata: [
        { label: "製品", value: module.products.map((p) => productNameMap.get(p) ?? p).join(", ") },
        { label: "学習時間", value: `約 ${module.durationInMinutes} 分` },
        ...(module.lastModified ? [{ label: "更新日", value: module.lastModified.substring(0, 10) }] : []),
      ],
      actionLabel: "Learn で開く",
      onAction: () => openModal(module.url, module.title, module.summary),
      // Store raw data for filtering
      _raw: {
        roles: module.roles,
        products: module.products,
        levels: module.levels,
      },
    }))
  }, [modules, productNameMap, roleNameMap, openModal])

  // Filter configuration for FilterableGallery
  const filterConfig = useMemo<FilterConfig[]>(() => [
    {
      key: "role",
      label: "ロール",
      placeholder: "ロールを選択",
      options: [
        { value: "all", label: "すべてのロール" },
        ...roleOptions.map((role) => ({
          value: role,
          label: roleNameMap.get(role) ?? role,
        })),
      ],
    },
    {
      key: "level",
      label: "レベル",
      placeholder: "レベルを選択",
      options: [
        { value: "all", label: "すべてのレベル" },
        ...levelOptions.map((level) => ({
          value: level,
          label: level,
        })),
      ],
    },
    {
      key: "product",
      label: "製品",
      placeholder: "製品を選択",
      options: [
        { value: "all", label: "すべての製品" },
        ...productOptions.map((product) => ({
          value: product,
          label: productNameMap.get(product) ?? product,
        })),
      ],
    },
  ], [roleOptions, roleNameMap, levelOptions, productOptions, productNameMap])

  // Custom filter function for module-specific filtering
  const handleFilterItem = (item: GalleryItem, searchQuery: string, filters: Record<string, string>) => {
    const raw = item._raw as { roles: string[]; products: string[]; levels: string[] }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesTitle = item.title.toLowerCase().includes(query)
      const matchesDescription = item.description?.toLowerCase().includes(query)
      if (!matchesTitle && !matchesDescription) return false
    }

    // Role filter
    if (filters.role && filters.role !== "all") {
      if (!raw.roles.includes(filters.role)) return false
    }

    // Level filter
    if (filters.level && filters.level !== "all") {
      if (!raw.levels.includes(filters.level)) return false
    }

    // Product filter
    if (filters.product && filters.product !== "all") {
      if (!raw.products.includes(filters.product)) return false
    }

    return true
  }

  const featuredCertifications = useMemo(() => certifications.slice(0, 6), [certifications])

  const handleOpenCertification = (url: string, title: string, summary: string) => {
    openModal(url, title, summary)
  }

  return (
    <div className="w-full max-w-full px-4 pb-8 pt-6">
      {/* ヘッダーセクション - グリッドレイアウト */}
      <div className={`grid grid-cols-1 gap-8 mb-8 w-full max-w-full ${isTocOpen ? 'lg:grid-cols-[280px_1fr]' : 'lg:grid-cols-[32px_1fr]'}`}>
        {/* 左側空白（目次用スペース確保） */}
        <div className="hidden lg:block"></div>
        
        {/* ヘッダーコンテンツ */}
        <header className="min-w-0 w-full">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">実装サンプル</h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              デザインテンプレート集です。ギャラリー表示、検索、フィルタリング、ページネーションやカンバンビュー、ガントチャート、フォームの実装例です。開発のテンプレートとしてご利用いただけます。
            </p>
          </div>
        </header>
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
                <a href="#dashboard" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  データ可視化ダッシュボード
                </a>
                <a href="#stats" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  統計カード
                </a>
                <a href="#table" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  リストテーブル
                </a>
                <a href="#inline-edit" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  インライン編集テーブル
                </a>
                <a href="#gallery" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  検索・フィルター & ギャラリー
                </a>
                <a href="#priority" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  優先順位管理
                </a>
                <a href="#kanban" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  カンバンボード
                </a>
                <a href="#gantt" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  ガントチャート
                </a>
                <a href="#tree" className="block text-sm text-muted-foreground hover:text-white hover:bg-accent rounded-md px-3 py-2 transition-colors">
                  ツリー構造
                </a>
              </nav>
            )}
          </div>
        </aside>

        {/* メインコンテンツ */}
        <main className="space-y-8 min-w-0">
      {/* デザインテンプレート: グラフダッシュボード */}
      <div className="space-y-3" id="dashboard">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">📈 データ可視化ダッシュボード</h2>
          <p className="text-sm text-muted-foreground">
            複数のグラフを組み合わせたデータ分析ダッシュボード
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="ChartDashboard コンポーネントを使って、[あなたのデータ]を可視化するダッシュボードを作成して"
                language="text"
                description="複数のグラフでデータを多角的に分析できます"
              />
            </div>
          </details>
        </div>
      </div>

      <ChartDashboard />

      {/* デザインテンプレート: 統計カード */}
      <div className="space-y-3" id="stats">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">📊 統計カード</h2>
          <p className="text-sm text-muted-foreground">
            アイコン付きのサマリーカードで重要な指標を表示
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="StatsCards コンポーネントを使って、[あなたのデータ]の統計情報を表示して"
                language="text"
                description="重要な指標を視覚的に表示できます"
              />
            </div>
          </details>
        </div>
      </div>

      {/* Summary cards with new component */}
      <StatsCards
        stats={[
          {
            title: "モジュール",
            value: summary?.moduleCount ?? "--",
            description: "サンプルとして取得したモジュール数",
            icon: BookOpen,
          },
          {
            title: "ラーニング パス",
            value: summary?.learningPathCount ?? "--",
            description: "分析対象のラーニング パス数",
            icon: Layers,
          },
          {
            title: "認定資格",
            value: summary?.certificationCount ?? "--",
            description: "取得対象の認定資格数",
            icon: Target,
          },
          {
            title: "平均学習時間",
            value: `${summary?.averageDuration ?? "--"}分`,
            description: "モジュール単位の平均所要時間",
            icon: Clock,
          },
        ]}
        columns={4}
      />

      {/* デザインテンプレート: リストテーブル */}
      <div className="space-y-3" id="table">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">📋 リストテーブル</h2>
          <p className="text-sm text-muted-foreground">
            検索、フィルター、ソート、ページネーション機能を備えたデータテーブル
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="ListTable コンポーネントを使って、[あなたのデータ]を表示するテーブルを作成して"
                language="text"
                description="検索、フィルター、ソート、ページネーション、CSV入出力機能を備えたテーブルです"
              />
            </div>
          </details>
        </div>
      </div>

      <ListTable
        data={sampleTasks}
        columns={taskColumns}
        title="タスク管理テーブル"
        description="プロジェクトのタスクを一覧表示し、検索・フィルター・ソート機能で効率的に管理（行クリックで詳細表示）"
        searchable={true}
        searchPlaceholder="タスクを検索..."
        searchKeys={["title", "description", "assignee"]}
        filters={taskFilters}
        itemsPerPage={5}
        emptyMessage="タスクが見つかりませんでした"
        enableCsv={true}
        csvColumns={taskCsvColumns}
        csvFileName="tasks"
        csvUniqueKey="id"
        onCsvImport={handleTaskCsvImport}
        formTitle="タスク詳細"
        formDescription="タスクの詳細情報を確認できます"
        renderForm={(task) => {
          if (!task) return null
          return (
            <div className="space-y-6">
              <FormSection title="基本情報">
                <FormColumns columns={2}>
                  <div className="space-y-2">
                    <Label>タスク名</Label>
                    <Input value={task.title} readOnly autoFocus={false} />
                  </div>
                  <div className="space-y-2">
                    <Label>担当者</Label>
                    <Input value={task.assignee} readOnly autoFocus={false} />
                  </div>
                </FormColumns>
                <div className="space-y-2">
                  <Label>説明</Label>
                  <Textarea value={task.description} readOnly rows={3} />
                </div>
              </FormSection>

              <FormSection title="ステータス">
                <FormColumns columns={3}>
                  <div className="space-y-2">
                    <Label>優先度</Label>
                    <div className="pt-2">
                      {renderPriorityBadge(task.priority)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>ステータス</Label>
                    <div className="pt-2">
                      {renderStatusBadge(task.status)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>カテゴリ</Label>
                    <div className="pt-2">
                      <Badge variant="outline">{task.category}</Badge>
                    </div>
                  </div>
                </FormColumns>
              </FormSection>

              <FormSection title="スケジュール">
                <div className="space-y-2">
                  <Label>期日</Label>
                  <Input value={task.dueDate} readOnly autoFocus={false} />
                </div>
              </FormSection>
            </div>
          )
        }}
      />

      {/* デザインテンプレート: インライン編集テーブル */}
      <div className="space-y-3" id="inline-edit">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">✏️ インライン編集テーブル</h2>
          <p className="text-sm text-muted-foreground">
            行単位で直接編集、追加、削除ができるインタラクティブなテーブル
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="InlineEditTable コンポーネントを使って、[あなたのデータ]の編集可能なテーブルを作成して"
                language="text"
                description="直接編集、追加、削除、CSV入出力ができるテーブルです"
              />
            </div>
          </details>
        </div>
      </div>

      <InlineEditTable
        data={employees}
        columns={employeeColumns}
        title="従業員一覧"
        description="クリックで直接編集、新規追加、削除ができるテーブル"
        onUpdate={handleEmployeeUpdate}
        onSave={handleEmployeeSave}
        onDelete={handleEmployeeDelete}
        onAdd={handleEmployeeAdd}
        addButtonLabel="新しい従業員を追加"
        emptyMessage="従業員データがありません"
        enableCsv={true}
        csvColumns={employeeCsvColumns}
        csvFileName="employees"
        csvUniqueKey="id"
        onCsvImport={handleEmployeeCsvImport}
      />

      {/* デザインテンプレート: カード */}
      {!isLoading && featuredCertifications.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">🎓 カード</h2>
            <p className="text-sm text-muted-foreground">
              情報をカード形式で表示し、詳細ページへのリンクを提供
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-primary hover:underline">
                GitHub Copilot への指示例
              </summary>
              <div className="mt-2">
                <CodeBlock
                  code="Card コンポーネントを使って、[あなたのデータ]をカード形式で表示して"
                  language="text"
                  description="タイトル、説明、バッジ、アクションボタンを含むカードレイアウトです"
                />
              </div>
            </details>
          </div>
        </div>
      )}

      {!isLoading && featuredCertifications.length > 0 && (
        <section id="certifications" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredCertifications.map((certification) => (
            <Card key={certification.uid} className="border-secondary/30">
              <CardHeader className="space-y-2">
                <CardTitle className="text-base font-semibold text-foreground">
                  {certification.title}
                </CardTitle>
                <CardDescription className="text-sm leading-6 text-muted-foreground line-clamp-3">
                  {certification.summary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {certification.products.slice(0, 3).map((product) => (
                    <Badge key={`${certification.uid}-product-${product}`} className={getBadgeColorClass(productNameMap.get(product) ?? product)}>
                      {productNameMap.get(product) ?? product}
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => handleOpenCertification(certification.url, certification.title, certification.summary)}
                >
                  <Target className="h-4 w-4" />
                  Learn 認定資格を見る
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {/* デザインテンプレート: 検索・フィルター & ギャラリー */}
      <div className="space-y-3" id="gallery">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">🔍 検索・フィルター & ギャラリー</h2>
          <p className="text-sm text-muted-foreground">
            検索バー、複数のドロップダウンフィルター、カード形式のギャラリー表示、ページネーション機能を統合
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="SearchFilterGallery コンポーネントを使って、[あなたのデータ]を検索・フィルター可能なギャラリーで表示して"
                language="text"
                description="検索バー、複数のフィルター、カードギャラリー、ページネーション機能を備えています"
              />
            </div>
          </details>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && <LoadingSkeletonGrid columns={3} count={ITEMS_PER_PAGE} variant="detailed" />}

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardHeader className="flex flex-row items-start gap-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div className="space-y-1">
              <CardTitle className="text-lg">データの読み込みに失敗しました</CardTitle>
              <CardDescription>{error?.message}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              リトライ
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search Filter Gallery Component */}
      {!isLoading && !isError && (
        <SearchFilterGallery
          items={galleryItems}
          filters={filterConfig}
          searchPlaceholder="モジュール名・概要を検索"
          onFilterItem={handleFilterItem}
          itemsPerPage={ITEMS_PER_PAGE}
          columns={3}
          filterCardTitle="検索とフィルター"
          filterCardDescription="要件に合わせてモジュールを絞り込みます"
        />
      )}

      {/* デザインテンプレート: ドラッグ&ドロップ タスク管理 */}
      <div className="space-y-3" id="priority">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">🎯 優先順位管理</h2>
          <p className="text-sm text-muted-foreground">
            ドラッグ&ドロップでタスクの並び順を変更できるインタラクティブなリスト
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="TaskPriorityList コンポーネントを使って、[あなたのタスク]をドラッグ&ドロップで並び替えられるリストを作成して"
                language="text"
                description="タスクやアイテムの優先順位を直感的に変更できます"
              />
            </div>
          </details>
        </div>
      </div>

      <TaskPriorityList />

      {/* デザインテンプレート: カンバンボード */}
      <div className="space-y-3" id="kanban">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">📋 カンバンボード</h2>
          <p className="text-sm text-muted-foreground">
            タスクをドラッグ&ドロップでステータス間を移動できるカンバンビュー
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="KanbanBoard コンポーネントを使って、[あなたのタスク]をカンバンボードで表示して"
                language="text"
                description="タスクをドラッグ&ドロップでステータス間を移動できます"
              />
            </div>
          </details>
        </div>
      </div>

      <KanbanBoard />

      {/* デザインテンプレート: ガントチャート */}
      <div className="space-y-3" id="gantt">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">📅 ガントチャート</h2>
          <p className="text-sm text-muted-foreground">
            タスクをドラッグで移動、ハンドルで期間変更できるインタラクティブなガントチャート
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="GanttChart コンポーネントを使って、[あなたのタスク]をガントチャートで表示して"
                language="text"
                description="タスクをドラッグで移動、ハンドルで期間変更できます"
              />
            </div>
          </details>
        </div>
      </div>

      <GanttChart />

      {/* デザインテンプレート: ツリー構造 */}
      <div className="space-y-3" id="tree">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">🌳 ツリー構造（BOM例）</h2>
          <p className="text-sm text-muted-foreground">
            ドラッグで階層を調整できるツリービュー。右にドラッグして階層を下げ、左にドラッグして階層を上げます
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary hover:underline">
              GitHub Copilot への指示例
            </summary>
            <div className="mt-2">
              <CodeBlock
                code="TreeStructure コンポーネントを使って、[あなたのデータ]を階層構造で表示して"
                language="text"
                description="アイテムを横方向にドラッグして階層レベルを調整できます"
              />
            </div>
          </details>
        </div>
      </div>

      <TreeStructure />

      </main>
      </div>

      <LinkConfirmModal
        isOpen={modalData.isOpen}
        onClose={closeModal}
        url={modalData.url}
        title={modalData.title}
        description={modalData.description}
      />
    </div>
  )
}
