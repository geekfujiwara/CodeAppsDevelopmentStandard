import { useState, useCallback } from "react";

/**
 * コネクタ操作の状態管理（データ・ローディング・エラー）を提供するカスタムフック
 *
 * Power Apps コネクタを通じたデータ取得や操作のライフサイクルを管理します。
 *
 * @template T - レスポンスデータの型
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, execute } = useConnector<UserProfileData>();
 *
 * useEffect(() => {
 *   execute(async () => {
 *     const response = await Office365UsersService.MyProfile_V2("id,displayName");
 *     return response.data;
 *   });
 * }, [execute]);
 * ```
 */
export function useConnector<T>() {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (operation: () => Promise<T>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await operation();
      setData(result);
      return result;
    } catch (err) {
      const wrappedError =
        err instanceof Error
          ? err
          : new Error("コネクタ操作中にエラーが発生しました");
      setError(wrappedError);
      throw wrappedError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { data, isLoading, error, execute, reset };
}
