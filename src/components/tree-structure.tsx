import { useState, useEffect, useRef } from "react"
import mermaid from "mermaid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { FullscreenWrapper } from "@/components/fullscreen-wrapper"
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Package,
  Box,
  Layers,
  GripVertical,
  Network,
  List,
} from "lucide-react"

interface TreeNode {
  id: string
  name: string
  partNumber: string
  quantity: number
  unit: string
  type: "assembly" | "part" | "material"
  children: TreeNode[]
  collapsed: boolean
}

interface TreeItemProps {
  node: TreeNode
  depth: number
  onUpdate: (id: string, field: keyof TreeNode, value: string | number) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  onToggle: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, targetId: string) => void
  isDragTarget: boolean
}

function TreeItem({
  node,
  depth,
  onUpdate,
  onDelete,
  onAddChild,
  onToggle,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragTarget,
}: TreeItemProps) {
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")

  const startEdit = (field: string, currentValue: string | number) => {
    setIsEditing(field)
    setEditValue(String(currentValue))
  }

  const finishEdit = (field: keyof TreeNode) => {
    if (editValue.trim()) {
      if (field === "quantity") {
        onUpdate(node.id, field, parseFloat(editValue))
      } else {
        onUpdate(node.id, field, editValue)
      }
    }
    setIsEditing(null)
  }

  const getTypeIcon = () => {
    switch (node.type) {
      case "assembly":
        return <Layers className="h-4 w-4 text-blue-500" />
      case "part":
        return <Box className="h-4 w-4 text-green-500" />
      case "material":
        return <Package className="h-4 w-4 text-orange-500" />
    }
  }

  const getTypeBadge = () => {
    const variants = {
      assembly: "default" as const,
      part: "secondary" as const,
      material: "outline" as const,
    }
    const labels = {
      assembly: "アセンブリ",
      part: "部品",
      material: "材料",
    }
    return (
      <Badge variant={variants[node.type]} className="text-xs">
        {labels[node.type]}
      </Badge>
    )
  }

  return (
    <div style={{ paddingLeft: `${depth * 24}px` }}>
      <div
        draggable
        onDragStart={() => onDragStart(node.id)}
        onDragOver={(e) => onDragOver(e, node.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, node.id)}
        className={`flex items-center gap-2 py-2 px-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded group cursor-move ${
          isDragTarget ? "ring-2 ring-blue-400 ring-dashed bg-blue-50 dark:bg-blue-950" : ""
        }`}
      >
        {/* ドラッグハンドル */}
        <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </div>

        {/* 展開/折りたたみボタン */}
        <button
          onClick={() => onToggle(node.id)}
          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
          disabled={node.children.length === 0}
        >
          {node.children.length > 0 ? (
            node.collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )
          ) : (
            <div className="h-4 w-4" />
          )}
        </button>

        {/* タイプアイコン */}
        <div className="flex-shrink-0">{getTypeIcon()}</div>

        {/* 名前 */}
        <div className="flex-1 min-w-0">
          {isEditing === "name" ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => finishEdit("name")}
              onKeyDown={(e) => e.key === "Enter" && finishEdit("name")}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <div
              onClick={() => startEdit("name", node.name)}
              className="font-medium truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
            >
              {node.name}
            </div>
          )}
        </div>

        {/* 品番 */}
        <div className="w-20 sm:w-24 flex-shrink-0 hidden sm:block">
          {isEditing === "partNumber" ? (
            <Input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => finishEdit("partNumber")}
              onKeyDown={(e) => e.key === "Enter" && finishEdit("partNumber")}
              className="h-7 text-sm"
              autoFocus
            />
          ) : (
            <div
              onClick={() => startEdit("partNumber", node.partNumber)}
              className="text-sm text-gray-600 dark:text-gray-400 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
            >
              {node.partNumber}
            </div>
          )}
        </div>

        {/* 数量 */}
        <div className="w-16 sm:w-20 flex-shrink-0 hidden md:flex items-center gap-1">
          {isEditing === "quantity" ? (
            <Input
              type="number"
              step="0.1"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => finishEdit("quantity")}
              onKeyDown={(e) => e.key === "Enter" && finishEdit("quantity")}
              className="h-7 text-sm w-12 sm:w-16"
              autoFocus
            />
          ) : (
            <div
              onClick={() => startEdit("quantity", node.quantity)}
              className="text-sm text-right flex-1 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
            >
              {node.quantity}
            </div>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{node.unit}</span>
        </div>

        {/* タイプバッジ */}
        <div className="flex-shrink-0 hidden lg:block">{getTypeBadge()}</div>

        {/* アクションボタン */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onAddChild(node.id)}
            title="子要素を追加"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950"
            onClick={() => onDelete(node.id)}
            title="削除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 子ノードはTreeItemWrapperでレンダリングされる */}
    </div>
  )
}

// 組織図ビューコンポーネント（Mermaid使用）
function OrgChartView({
  data,
}: {
  data: TreeNode[]
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
}) {
  const mermaidRef = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // テーマ変更を監視
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark')
      setTheme(isDark ? 'dark' : 'light')
    }
    
    updateTheme()
    
    // MutationObserverでテーマ変更を監視
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    
    return () => observer.disconnect()
  }, [])

  // Mermaidの初期化
  useEffect(() => {
    const isDark = theme === 'dark'
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
      themeVariables: isDark ? {
        primaryColor: '#1e3a5f',
        primaryTextColor: '#93c5fd',
        primaryBorderColor: '#3b82f6',
        lineColor: '#60a5fa',
        secondaryColor: '#1a3d2e',
        tertiaryColor: '#4a2c1c',
      } : {
        primaryColor: '#dbeafe',
        primaryTextColor: '#1e40af',
        primaryBorderColor: '#93c5fd',
        lineColor: '#60a5fa',
        secondaryColor: '#dcfce7',
        tertiaryColor: '#fed7aa',
      },
    })
  }, [theme])

  // TreeNodeからMermaid記法への変換
  const convertToMermaid = (nodes: TreeNode[]): string => {
    let mermaidCode = 'graph TD\n'
    
    const processNode = (node: TreeNode) => {
      // ノードの定義（タイプに応じてスタイルを変更）
      const typeLabel = 
        node.type === 'assembly' ? 'アセンブリ' :
        node.type === 'part' ? '部品' :
        '材料'
      
      const nodeLabel = `${node.name}<br/>${typeLabel}`
      
      // スタイルクラスの定義
      const styleClass = 
        node.type === 'assembly' ? 'assemblyNode' :
        node.type === 'part' ? 'partNode' :
        'materialNode'
      
      mermaidCode += `  ${node.id}["${nodeLabel}"]:::${styleClass}\n`
      
      // 子ノードへの接続
      node.children.forEach(child => {
        mermaidCode += `  ${node.id} --> ${child.id}\n`
        processNode(child)
      })
    }
    
    nodes.forEach(node => processNode(node))
    
    // スタイル定義
    mermaidCode += '\n  classDef assemblyNode fill:#dbeafe,stroke:#93c5fd,stroke-width:2px,color:#1e40af\n'
    mermaidCode += '  classDef partNode fill:#dcfce7,stroke:#86efac,stroke-width:2px,color:#166534\n'
    mermaidCode += '  classDef materialNode fill:#fed7aa,stroke:#fdba74,stroke-width:2px,color:#9a3412\n'
    
    return mermaidCode
  }

  // Mermaidダイアグラムのレンダリング
  useEffect(() => {
    const renderDiagram = async () => {
      if (mermaidRef.current && data.length > 0) {
        const mermaidCode = convertToMermaid(data)
        
        try {
          mermaidRef.current.innerHTML = ''
          const uniqueId = `mermaid-${Date.now()}`
          const { svg } = await mermaid.render(uniqueId, mermaidCode)
          mermaidRef.current.innerHTML = svg
        } catch (error) {
          console.error('Mermaid rendering error:', error)
          mermaidRef.current.innerHTML = `<div class="text-red-600 dark:text-red-400 p-4">図の描画に失敗しました</div>`
        }
      }
    }
    
    renderDiagram()
  }, [data, theme])

  return (
    <div className="w-full bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-blue-950 rounded-lg p-8 overflow-auto">
      <div ref={mermaidRef} className="flex justify-center min-h-[400px]" />
    </div>
  )
}

// ラッパーコンポーネントで dragTargetId を受け取って isDragTarget を計算
function TreeItemWrapper({
  node,
  depth,
  dragTargetId,
  onUpdate,
  onDelete,
  onAddChild,
  onToggle,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  node: TreeNode
  depth: number
  dragTargetId: string | null
  onUpdate: (id: string, field: keyof TreeNode, value: string | number) => void
  onDelete: (id: string) => void
  onAddChild: (id: string) => void
  onToggle: (id: string) => void
  onDragStart: (id: string) => void
  onDragOver: (e: React.DragEvent, id: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, targetId: string) => void
}) {
  return (
    <>
      <TreeItem
        node={node}
        depth={depth}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onAddChild={onAddChild}
        onToggle={onToggle}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        isDragTarget={dragTargetId === node.id}
      />
      {!node.collapsed &&
        node.children.map((child) => (
          <TreeItemWrapper
            key={child.id}
            node={child}
            depth={depth + 1}
            dragTargetId={dragTargetId}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAddChild={onAddChild}
            onToggle={onToggle}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          />
        ))}
    </>
  )
}

export function TreeStructure() {
  const [viewMode, setViewMode] = useState<"tree" | "org">("tree")
  const [treeData, setTreeData] = useState<TreeNode[]>([
    {
      id: "1",
      name: "製品A",
      partNumber: "PROD-A",
      quantity: 1,
      unit: "個",
      type: "assembly",
      collapsed: false,
      children: [
        {
          id: "1-1",
          name: "サブアセンブリA-1",
          partNumber: "ASM-001",
          quantity: 2,
          unit: "個",
          type: "assembly",
          collapsed: false,
          children: [
            {
              id: "1-1-1",
              name: "部品A-1-1",
              partNumber: "PRT-001",
              quantity: 4,
              unit: "個",
              type: "part",
              collapsed: false,
              children: [],
            },
            {
              id: "1-1-2",
              name: "部品A-1-2",
              partNumber: "PRT-002",
              quantity: 2,
              unit: "個",
              type: "part",
              collapsed: false,
              children: [],
            },
          ],
        },
        {
          id: "1-2",
          name: "サブアセンブリA-2",
          partNumber: "ASM-002",
          quantity: 1,
          unit: "個",
          type: "assembly",
          collapsed: false,
          children: [
            {
              id: "1-2-1",
              name: "材料A-2-1",
              partNumber: "MAT-001",
              quantity: 0.5,
              unit: "kg",
              type: "material",
              collapsed: false,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: "2",
      name: "製品B",
      partNumber: "PROD-B",
      quantity: 1,
      unit: "個",
      type: "assembly",
      collapsed: false,
      children: [
        {
          id: "2-1",
          name: "部品B-1",
          partNumber: "PRT-003",
          quantity: 3,
          unit: "個",
          type: "part",
          collapsed: false,
          children: [],
        },
      ],
    },
  ])

  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  // ノードを検索
  const findNode = (
    nodes: TreeNode[],
    id: string
  ): { node: TreeNode; parent: TreeNode | null; siblings: TreeNode[] } | null => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        return { node: nodes[i], parent: null, siblings: nodes }
      }
      const result = findNodeInChildren(nodes[i], id)
      if (result) return result
    }
    return null
  }

  const findNodeInChildren = (
    currentNode: TreeNode,
    targetId: string
  ): { node: TreeNode; parent: TreeNode | null; siblings: TreeNode[] } | null => {
    for (let i = 0; i < currentNode.children.length; i++) {
      if (currentNode.children[i].id === targetId) {
        return {
          node: currentNode.children[i],
          parent: currentNode,
          siblings: currentNode.children,
        }
      }
      const result = findNodeInChildren(
        currentNode.children[i],
        targetId
      )
      if (result) return result
    }
    return null
  }

  // ノードを更新
  const updateNode = (id: string, field: keyof TreeNode, value: string | number) => {
    const updateInTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          return { ...node, [field]: value }
        }
        return { ...node, children: updateInTree(node.children) }
      })
    }
    setTreeData(updateInTree(treeData))
  }

  // ノードを削除
  const deleteNode = (id: string) => {
    const deleteFromTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter((node) => node.id !== id)
        .map((node) => ({ ...node, children: deleteFromTree(node.children) }))
    }
    setTreeData(deleteFromTree(treeData))
  }

  // 子ノードを追加
  const addChild = (parentId: string) => {
    const newNode: TreeNode = {
      id: `${Date.now()}`,
      name: "新規アイテム",
      partNumber: "NEW-001",
      quantity: 1,
      unit: "個",
      type: "part",
      collapsed: false,
      children: [],
    }

    const addToTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node) => {
        if (node.id === parentId) {
          return {
            ...node,
            children: [...node.children, newNode],
            collapsed: false,
          }
        }
        return { ...node, children: addToTree(node.children) }
      })
    }
    setTreeData(addToTree(treeData))
  }

  // 展開/折りたたみ
  const toggleNode = (id: string) => {
    const toggleInTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((node) => {
        if (node.id === id) {
          return { ...node, collapsed: !node.collapsed }
        }
        return { ...node, children: toggleInTree(node.children) }
      })
    }
    setTreeData(toggleInTree(treeData))
  }

  // ドラッグ開始
  const handleDragStart = (id: string) => {
    setDraggedNodeId(id)
  }

  // ドラッグオーバー
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (draggedNodeId && draggedNodeId !== targetId) {
      // 自分自身の子孫にはドロップできない
      const isDescendant = checkIsDescendant(treeData, draggedNodeId, targetId)
      if (!isDescendant) {
        setDragTargetId(targetId)
      }
    }
  }

  // ドラッグ離れる
  const handleDragLeave = () => {
    setDragTargetId(null)
  }

  // ドロップ
  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (!draggedNodeId || draggedNodeId === targetId) {
      setDraggedNodeId(null)
      setDragTargetId(null)
      return
    }

    // 自分自身の子孫にはドロップできない
    const isDescendant = checkIsDescendant(treeData, draggedNodeId, targetId)
    if (isDescendant) {
      setDraggedNodeId(null)
      setDragTargetId(null)
      return
    }

    const draggedNode = findNode(treeData, draggedNodeId)
    if (!draggedNode) {
      setDraggedNodeId(null)
      setDragTargetId(null)
      return
    }

    setIsProcessing(true)

    // まず削除
    const removeFromTree = (nodes: TreeNode[]): TreeNode[] => {
      return nodes
        .filter((n) => n.id !== draggedNodeId)
        .map((n) => ({ ...n, children: removeFromTree(n.children) }))
    }

    let newData = removeFromTree(treeData)

    // ターゲットの子として追加
    const addToTarget = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map((n) => {
        if (n.id === targetId) {
          return {
            ...n,
            children: [...n.children, draggedNode.node],
            collapsed: false,
          }
        }
        return { ...n, children: addToTarget(n.children) }
      })
    }

    newData = addToTarget(newData)
    
    // 少し遅延を入れてローディング表示を見せる
    await new Promise(resolve => setTimeout(resolve, 300))
    
    setTreeData(newData)
    setDraggedNodeId(null)
    setDragTargetId(null)
    setIsProcessing(false)
  }

  // 子孫かどうかをチェック
  const checkIsDescendant = (
    nodes: TreeNode[],
    ancestorId: string,
    descendantId: string
  ): boolean => {
    for (const node of nodes) {
      if (node.id === ancestorId) {
        return checkDescendantInNode(node, descendantId)
      }
      if (checkIsDescendant(node.children, ancestorId, descendantId)) {
        return true
      }
    }
    return false
  }

  const checkDescendantInNode = (node: TreeNode, descendantId: string): boolean => {
    if (node.id === descendantId) return true
    for (const child of node.children) {
      if (checkDescendantInNode(child, descendantId)) return true
    }
    return false
  }

  // ルートに追加
  const addRoot = () => {
    const newNode: TreeNode = {
      id: `${Date.now()}`,
      name: "新規製品",
      partNumber: "PROD-NEW",
      quantity: 1,
      unit: "個",
      type: "assembly",
      collapsed: false,
      children: [],
    }
    setTreeData([...treeData, newNode])
  }

  return (
    <FullscreenWrapper
      showHeader={false}
    >
      {({ isFullscreen, FullscreenButton }) => (
        <>
          {/* ローディングオーバーレイ */}
          {isProcessing && (
            <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="h-12 w-12 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">階層を変更中...</p>
              </div>
            </div>
          )}

          <div className="flex items-start justify-between mb-6 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">
                {viewMode === "tree" ? "BOM (部品表) - ツリー構造" : "階層ビュー"}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                クリックして編集 • アイテムをドラッグして階層変更 • 点線=ドロップ可能
              </p>
            </div>
            <div className="flex-shrink-0">
              <FullscreenButton />
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={viewMode === "tree" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("tree")}
                  className="rounded-none"
                >
                  <List className="h-4 w-4 mr-1" />
                  リスト
                </Button>
                <Button
                  variant={viewMode === "org" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("org")}
                  className="rounded-none"
                >
                  <Network className="h-4 w-4 mr-1" />
                  階層ビュー
                </Button>
              </div>
              <Button onClick={addRoot} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                ルート追加
              </Button>
            </div>
          </div>

          <div className={isFullscreen ? "max-h-[calc(100vh-12rem)]" : ""}>
            {viewMode === "tree" ? (
              <div className="space-y-1">
                {treeData.map((node) => (
                  <TreeItemWrapper
                    key={node.id}
                    node={node}
                    depth={0}
                    dragTargetId={dragTargetId}
                    onUpdate={updateNode}
                    onDelete={deleteNode}
                    onAddChild={addChild}
                    onToggle={toggleNode}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            ) : (
              <div className={`overflow-x-auto overflow-y-auto pb-8 ${isFullscreen ? "max-h-[calc(100vh-12rem)]" : ""}`}>
                <div className="min-w-max p-8">
                  <OrgChartView
                    data={treeData}
                    onDelete={deleteNode}
                    onAddChild={addChild}
                  />
                </div>
              </div>
            )}
          </div>

          {treeData.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              ツリーが空です。「ルート追加」ボタンでアイテムを追加してください。
            </div>
          )}
        </>
      )}
    </FullscreenWrapper>
  )
}