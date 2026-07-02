# 高度な実装パターン

Power Apps Code Apps で活用できる高度な実装パターンを紹介します。

---

## 目次

- [マルチ環境設定](#マルチ環境設定)
- [オフラインファースト](#オフラインファースト)
- [国際化（i18n）](#国際化i18n)
- [テーマシステム](#テーマシステム)
- [アニメーション](#アニメーション)
- [パフォーマンス最適化](#パフォーマンス最適化)
- [カスタムフックパターン](#カスタムフックパターン)

---

## マルチ環境設定

開発・テスト・本番環境で異なる設定を管理するパターンです。

### 環境変数の活用

```typescript
// src/utils/config.ts

interface AppConfig {
  environment: "development" | "staging" | "production";
  apiTimeout: number;
  maxRetries: number;
  enableDebugLogging: boolean;
}

const configs: Record<string, AppConfig> = {
  development: {
    environment: "development",
    apiTimeout: 30000,
    maxRetries: 1,
    enableDebugLogging: true,
  },
  staging: {
    environment: "staging",
    apiTimeout: 15000,
    maxRetries: 2,
    enableDebugLogging: true,
  },
  production: {
    environment: "production",
    apiTimeout: 10000,
    maxRetries: 3,
    enableDebugLogging: false,
  },
};

export const appConfig: AppConfig =
  configs[import.meta.env.MODE] ?? configs["production"]!;
```

> ⚠️ **注意**: 機密データは環境変数やアプリコードに保存せず、必ずデータソース（Dataverse など）に保存してください。

---

## オフラインファースト

ネットワーク接続が不安定な環境での利用を想定したパターンです。

### ローカルストレージキャッシュ

```typescript
// src/utils/cache.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class LocalCache {
  static set<T>(key: string, data: T, ttlMs: number = 300000): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
  }

  static get<T>(key: string): T | null {
    const raw = localStorage.getItem(`cache_${key}`);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }
    return entry.data;
  }

  static clear(prefix?: string): void {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith(`cache_${prefix ?? ""}`)) {
        localStorage.removeItem(key);
      }
    }
  }
}
```

### キャッシュ付きコネクタフック

```typescript
// src/hooks/useCachedConnector.ts
import { useState, useCallback } from "react";
import { LocalCache } from "../utils/cache";

export function useCachedConnector<T>(cacheKey: string, ttlMs: number = 300000) {
  const [data, setData] = useState<T | null>(() => LocalCache.get<T>(cacheKey));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (operation: () => Promise<T>, forceRefresh: boolean = false) => {
      if (!forceRefresh) {
        const cached = LocalCache.get<T>(cacheKey);
        if (cached) {
          setData(cached);
          return cached;
        }
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await operation();
        LocalCache.set(cacheKey, result, ttlMs);
        setData(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // オフライン時はキャッシュからフォールバック
        const fallback = LocalCache.get<T>(cacheKey);
        if (fallback) {
          setData(fallback);
          return fallback;
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [cacheKey, ttlMs]
  );

  return { data, isLoading, error, execute };
}
```

---

## 国際化（i18n）

多言語対応の基本構造です。

### メッセージファイル

```typescript
// src/i18n/messages.ts

export type Locale = "ja" | "en";

const messages: Record<Locale, Record<string, string>> = {
  ja: {
    "app.title": "Power Apps Code App",
    "common.loading": "読み込み中...",
    "common.error": "エラーが発生しました",
    "common.retry": "再試行",
    "common.save": "保存",
    "common.cancel": "キャンセル",
    "common.delete": "削除",
    "profile.title": "ユーザープロフィール",
    "profile.noPhoto": "写真未設定",
  },
  en: {
    "app.title": "Power Apps Code App",
    "common.loading": "Loading...",
    "common.error": "An error occurred",
    "common.retry": "Retry",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "profile.title": "User Profile",
    "profile.noPhoto": "No photo set",
  },
};

export function t(key: string, locale: Locale = "ja"): string {
  return messages[locale]?.[key] ?? key;
}
```

---

## テーマシステム

ライト/ダークモード切り替えの実装パターンです。

```tsx
// src/hooks/useTheme.ts
import { useState, useCallback } from "react";
import { webLightTheme, webDarkTheme } from "@fluentui/react-components";
import type { Theme } from "@fluentui/react-components";

type ThemeMode = "light" | "dark" | "system";

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem("theme-mode") as ThemeMode) ?? "system";
  });

  const theme: Theme = (() => {
    if (mode === "dark") return webDarkTheme;
    if (mode === "light") return webLightTheme;
    // system
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? webDarkTheme
      : webLightTheme;
  })();

  const setThemeMode = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
    localStorage.setItem("theme-mode", newMode);
  }, []);

  return { theme, mode, setThemeMode };
}
```

使用例:

```tsx
const App = () => {
  const { theme, mode, setThemeMode } = useTheme();

  return (
    <FluentProvider theme={theme}>
      <Switch
        label="ダークモード"
        checked={mode === "dark"}
        onChange={(_, data) => setThemeMode(data.checked ? "dark" : "light")}
      />
      {/* コンテンツ */}
    </FluentProvider>
  );
};
```

---

## アニメーション

`framer-motion` を使用したアニメーションパターンです。

> **注意**: `framer-motion` はオプションの依存関係です。使用する場合は `npm install framer-motion` でインストールしてください。

```tsx
import { motion, AnimatePresence } from "framer-motion";

// フェードイン
const FadeIn = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    {children}
  </motion.div>
);

// リスト項目のアニメーション
const AnimatedList = ({ items }) => (
  <AnimatePresence>
    {items.map((item, index) => (
      <motion.div
        key={item.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ delay: index * 0.05 }}
      >
        {item.content}
      </motion.div>
    ))}
  </AnimatePresence>
);
```

---

## パフォーマンス最適化

### React.memo によるコンポーネントの最適化

```tsx
import React, { memo } from "react";

interface UserCardProps {
  name: string;
  email: string;
}

export const UserCard = memo<UserCardProps>(({ name, email }) => (
  <Card>
    <CardHeader header={<Text>{name}</Text>} description={<Text>{email}</Text>} />
  </Card>
));

UserCard.displayName = "UserCard";
```

### コネクタ呼び出しのデバウンス

```typescript
// src/utils/debounce.ts

export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}
```

---

## カスタムフックパターン

### ページネーション対応フック

```typescript
// src/hooks/usePagination.ts
import { useState, useCallback } from "react";

interface PaginationState<T> {
  items: T[];
  currentPage: number;
  hasMore: boolean;
  isLoading: boolean;
  error: Error | null;
}

export function usePagination<T>(pageSize: number = 50) {
  const [state, setState] = useState<PaginationState<T>>({
    items: [],
    currentPage: 0,
    hasMore: true,
    isLoading: false,
    error: null,
  });

  const loadPage = useCallback(
    async (fetcher: (skip: number, top: number) => Promise<T[]>) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const skip = state.currentPage * pageSize;
        const newItems = await fetcher(skip, pageSize);
        setState((prev) => ({
          items: [...prev.items, ...newItems],
          currentPage: prev.currentPage + 1,
          hasMore: newItems.length === pageSize,
          isLoading: false,
          error: null,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      }
    },
    [state.currentPage, pageSize]
  );

  const reset = useCallback(() => {
    setState({
      items: [],
      currentPage: 0,
      hasMore: true,
      isLoading: false,
      error: null,
    });
  }, []);

  return { ...state, loadPage, reset };
}
```
