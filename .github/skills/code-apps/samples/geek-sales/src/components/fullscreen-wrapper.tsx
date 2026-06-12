import { useState } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { Button } from "@/components/ui/button"
import { Maximize2, Minimize2 } from "lucide-react"

interface FullscreenWrapperProps {
  children: (props: {
    isFullscreen: boolean
    toggleFullscreen: () => void
    FullscreenButton: () => React.JSX.Element
  }) => ReactNode
  title?: string
  description?: string
  showHeader?: boolean
  headerContent?: ReactNode
  className?: string
}

/**
 * 全画面表示機能を提供する再利用可能なラッパーコンポーネント
 * 
 * @example
 * ```tsx
 * <FullscreenWrapper
 *   title="マイコンポーネント"
 *   description="説明文"
 * >
 *   {({ isFullscreen, FullscreenButton }) => (
 *     <div>
 *       <FullscreenButton />
 *       {isFullscreen ? "全画面モード" : "通常モード"}
 *     </div>
 *   )}
 * </FullscreenWrapper>
 * ```
 */
export function FullscreenWrapper({
  children,
  title,
  description,
  showHeader = true,
  headerContent,
  className = "",
}: FullscreenWrapperProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

  const FullscreenButton = () => (
    <Button onClick={toggleFullscreen} size="sm" variant="outline">
      {isFullscreen ? (
        <>
          <Minimize2 className="h-4 w-4 mr-1" />
          最小化
        </>
      ) : (
        <>
          <Maximize2 className="h-4 w-4 mr-1" />
          最大化
        </>
      )}
    </Button>
  )

  const fullscreenContent = isFullscreen && (
    <>
      {/* オーバーレイ */}
      <div
        className="fixed inset-0 bg-black/50 z-[110]"
        onClick={() => setIsFullscreen(false)}
      />

      {/* 全画面コンテンツ */}
      <div className={`fixed top-4 left-4 right-4 bottom-4 z-[110] shadow-2xl border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900 flex flex-col ${className}`}>
        {showHeader && (
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              {title && <h3 className="text-lg font-semibold dark:text-white">{title}</h3>}
              {description && <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>}
            </div>
            <div className="flex items-center gap-2">
              {headerContent}
              <Button onClick={() => setIsFullscreen(false)} size="sm" variant="outline">
                <Minimize2 className="h-4 w-4 mr-1" />
                最小化
              </Button>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-auto">
          {children({ isFullscreen, toggleFullscreen, FullscreenButton })}
        </div>
      </div>
    </>
  )

  return (
    <>
      {isFullscreen && typeof document !== "undefined" && createPortal(fullscreenContent, document.body)}
      
      {!isFullscreen && (
        <div className={`w-full border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-900 relative ${className}`}>
          {showHeader && (
            <div className="flex items-center justify-between mb-4">
              <div>
                {title && <h3 className="text-lg font-semibold dark:text-white">{title}</h3>}
                {description && <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {headerContent}
                <FullscreenButton />
              </div>
            </div>
          )}
          
          {children({ isFullscreen, toggleFullscreen, FullscreenButton })}
        </div>
      )}
    </>
  )
}
