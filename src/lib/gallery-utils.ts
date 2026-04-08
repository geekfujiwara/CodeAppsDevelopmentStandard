/**
 * バッジの色を決定するヘルパー関数
 * テキストの内容に基づいて適切なバッジスタイルを返す
 */
export function getBadgeColorClass(text: string): string {
  const lowerText = text.toLowerCase()
  
  // レベルに基づく色分け
  if (lowerText.includes('beginner') || lowerText.includes('初級')) {
    return 'bg-[var(--badge-beginner)] text-[var(--badge-beginner-foreground)] hover:bg-[var(--badge-beginner)]/80'
  }
  if (lowerText.includes('intermediate') || lowerText.includes('中級')) {
    return 'bg-[var(--badge-intermediate)] text-[var(--badge-intermediate-foreground)] hover:bg-[var(--badge-intermediate)]/80'
  }
  if (lowerText.includes('advanced') || lowerText.includes('上級') || lowerText.includes('expert')) {
    return 'bg-[var(--badge-advanced)] text-[var(--badge-advanced-foreground)] hover:bg-[var(--badge-advanced)]/80'
  }
  
  // ロールに基づく色分け
  if (lowerText.includes('administrator') || lowerText.includes('管理者')) {
    return 'bg-[var(--badge-administrator)] text-[var(--badge-administrator-foreground)] hover:bg-[var(--badge-administrator)]/80'
  }
  if (lowerText.includes('developer') || lowerText.includes('開発者')) {
    return 'bg-[var(--badge-developer)] text-[var(--badge-developer-foreground)] hover:bg-[var(--badge-developer)]/80'
  }
  
  // カテゴリに基づく色分け
  if (lowerText.includes('development') || lowerText.includes('開発')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
  }
  if (lowerText.includes('design') || lowerText.includes('デザイン')) {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300'
  }
  if (lowerText.includes('testing') || lowerText.includes('テスト')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  }
  if (lowerText.includes('documentation') || lowerText.includes('ドキュメント')) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
  
  // 優先度に基づく色分け
  if (lowerText.includes('high') || lowerText.includes('高')) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  if (lowerText.includes('medium') || lowerText.includes('中')) {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
  }
  if (lowerText.includes('low') || lowerText.includes('低')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }
  
  // ステータスに基づく色分け
  if (lowerText.includes('completed') || lowerText.includes('完了') || lowerText.includes('done')) {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  }
  if (lowerText.includes('in-progress') || lowerText.includes('進行中')) {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }
  if (lowerText.includes('todo') || lowerText.includes('未着手')) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
  }
  if (lowerText.includes('blocked') || lowerText.includes('保留')) {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
  }
  
  // デフォルト
  return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300'
}

/**
 * 階層構造のデータをフラットな配列に変換
 */
export function flattenItems<T extends { children?: T[] }>(items: T[]): T[] {
  const result: T[] = []

  const traverse = (nodeList: T[]) => {
    for (const node of nodeList) {
      const { children, ...rest } = node
      result.push(rest as T)
      if (children?.length) {
        traverse(children)
      }
    }
  }

  traverse(items)
  return result
}

/**
 * 数値をフォーマットして表示用文字列に変換
 */
export function formatNumber(num: number, options?: {
  decimals?: number
  locale?: string
  style?: 'decimal' | 'currency' | 'percent'
  currency?: string
}): string {
  const {
    decimals = 0,
    locale = 'ja-JP',
    style = 'decimal',
    currency = 'JPY'
  } = options || {}

  return new Intl.NumberFormat(locale, {
    style,
    currency: style === 'currency' ? currency : undefined,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

/**
 * 時間（分）を読みやすい形式に変換
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}分`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (remainingMinutes === 0) {
    return `${hours}時間`
  }
  
  return `${hours}時間${remainingMinutes}分`
}

/**
 * 日付を相対的な形式でフォーマット（例: "2日前"）
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date()
  const target = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - target.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  if (diffHour < 24) return `${diffHour}時間前`
  if (diffDay < 7) return `${diffDay}日前`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}週間前`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}ヶ月前`
  return `${Math.floor(diffDay / 365)}年前`
}

/**
 * テキストを指定文字数で切り詰め、末尾に省略記号を追加
 */
export function truncateText(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - suffix.length) + suffix
}
