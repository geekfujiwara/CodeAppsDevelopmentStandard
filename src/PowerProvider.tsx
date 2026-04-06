import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Power Platform の初期化状態を管理する Context の型定義
 */
interface PowerContextType {
  /** SDK の初期化が完了したかどうか */
  isInitialized: boolean;
  /** 初期化中にエラーが発生した場合のエラーオブジェクト */
  error: Error | null;
  /** 初期化処理中かどうか */
  isLoading: boolean;
}

const PowerContext = createContext<PowerContextType>({
  isInitialized: false,
  error: null,
  isLoading: true,
});

interface PowerProviderProps {
  children: ReactNode;
}

/**
 * PowerProvider - Power Platform SDK の初期化を管理する React Provider コンポーネント
 *
 * アプリケーションのルートで使用し、Power Platform SDK の初期化を行います。
 * 初期化が完了するまでローディング状態を表示し、エラー発生時はエラーメッセージを表示します。
 *
 * @example
 * ```tsx
 * <PowerProvider>
 *   <App />
 * </PowerProvider>
 * ```
 */
export const PowerProvider: React.FC<PowerProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializePowerPlatform = async () => {
      try {
        // Power Apps SDK の動的インポートと初期化
        // pac code init 実行後に @microsoft/power-apps パッケージが利用可能になります
        const { PowerAppsSDK } = await import("@microsoft/power-apps");
        await PowerAppsSDK.init();
        setIsInitialized(true);
      } catch (err) {
        console.error("Power Platform SDK の初期化に失敗しました:", err);
        setError(
          err instanceof Error
            ? err
            : new Error("Power Platform SDK の初期化中に不明なエラーが発生しました")
        );
      } finally {
        setIsLoading(false);
      }
    };

    initializePowerPlatform();
  }, []);

  return (
    <PowerContext.Provider value={{ isInitialized, error, isLoading }}>
      {children}
    </PowerContext.Provider>
  );
};

/**
 * usePower - Power Platform SDK の初期化状態にアクセスするカスタムフック
 *
 * @returns PowerContextType - SDK の初期化状態
 * @throws PowerProvider の外部で使用された場合にエラーをスロー
 *
 * @example
 * ```tsx
 * const { isInitialized, isLoading, error } = usePower();
 * if (isLoading) return <Spinner />;
 * if (error) return <ErrorMessage error={error} />;
 * ```
 */
export const usePower = (): PowerContextType => {
  const context = useContext(PowerContext);
  if (context === undefined) {
    throw new Error("usePower は PowerProvider 内で使用してください");
  }
  return context;
};

export default PowerProvider;
