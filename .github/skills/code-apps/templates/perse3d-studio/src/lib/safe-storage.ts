/**
 * Power Apps は iframe 内で動くため、ブラウザ設定によっては localStorage へのアクセスが例外になる。
 * 例外時はメモリ上の Map にフォールバックして、アプリ全体が白画面になるのを防ぐ。
 */
const memory = new Map<string, string>()

export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? memory.get(key) ?? null
    } catch {
      return memory.get(key) ?? null
    }
  },
  set(key: string, value: string): void {
    memory.set(key, value)
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      // 容量超過は呼び出し側に伝える（それ以外のアクセス拒否はメモリ保持で継続）
      if (e instanceof DOMException && e.name === "QuotaExceededError") throw e
    }
  },
}
