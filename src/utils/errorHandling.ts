/**
 * コネクタ操作のエラーハンドリングユーティリティ
 */

/**
 * コネクタエラーからユーザーフレンドリーなメッセージを生成する
 *
 * @param error - 捕捉されたエラーオブジェクト
 * @param context - エラーが発生した操作のコンテキスト
 * @returns ユーザー向けのエラーメッセージ
 */
export function getConnectorErrorMessage(
  error: unknown,
  context: string = "操作"
): string {
  if (error instanceof Error) {
    // よくあるエラーパターンのマッピング
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
      return `${context}: 認証エラーが発生しました。サインインし直してください。`;
    }
    if (error.message.includes("403") || error.message.includes("Forbidden")) {
      return `${context}: アクセス権限がありません。管理者に連絡してください。`;
    }
    if (error.message.includes("404") || error.message.includes("Not Found")) {
      return `${context}: 対象のリソースが見つかりませんでした。`;
    }
    if (error.message.includes("429") || error.message.includes("Too Many")) {
      return `${context}: リクエストが多すぎます。しばらく待ってから再試行してください。`;
    }
    if (error.message.includes("500") || error.message.includes("Internal Server")) {
      return `${context}: サーバーエラーが発生しました。しばらく待ってから再試行してください。`;
    }
    return `${context}: ${error.message}`;
  }
  return `${context}: 不明なエラーが発生しました。`;
}

/**
 * リトライ付きでコネクタ操作を実行する
 *
 * @template T - レスポンスデータの型
 * @param operation - 実行するコネクタ操作
 * @param maxRetries - 最大リトライ回数（デフォルト: 3）
 * @param delayMs - リトライ間隔のミリ秒（デフォルト: 1000）
 * @returns 操作の結果
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // 認証エラーや権限エラーはリトライしない
      if (
        lastError.message.includes("401") ||
        lastError.message.includes("403")
      ) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs * Math.pow(2, attempt))
        );
      }
    }
  }

  throw lastError ?? new Error("操作に失敗しました");
}
