# Power Pages ビルドリファレンス

## ビルド構成の基本

Power Pages コードサイトは **静的 SPA** のみ対応。ビルド出力は `index.html` + バンドル済み JS/CSS + 静的アセットで構成する。

## フレームワーク別設定

### React (Vite)

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // 相対パス必須
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})
```

### Vue (Vite)

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'dist',
  },
})
```

### Angular

```json
// angular.json (抜粋)
{
  "projects": {
    "my-app": {
      "architect": {
        "build": {
          "options": {
            "baseHref": "./",
            "outputPath": "dist/my-app"
          }
        }
      }
    }
  }
}
```

ビルドコマンド:

```bash
ng build --base-href ./
```

### Astro

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',  // SSR 不可、必ず static
  base: './',
})
```

## 出力ディレクトリ構成

```text
dist/
├── index.html            # エントリーポイント
├── assets/
│   ├── index-[hash].js   # バンドル済み JS
│   └── index-[hash].css  # バンドル済み CSS
└── favicon.ico           # 静的アセット
```

## ビルド時の注意事項

| 項目 | 説明 |
|------|------|
| `base` は相対パス (`'./'`) | Power Pages のホスティングパスに依存しないため |
| 環境変数は `.env.production` で管理 | ビルド時に埋め込まれるため、機密情報を含めない |
| アセットのハッシュ付きファイル名 | キャッシュバスティング対応（デフォルト有効） |
| ソースマップは本番では無効化 | `build.sourcemap: false` |
| チャンク分割は適切に設定 | 初回ロード時間の最適化 |

## SPA ルーティング

Power Pages コードサイトではサーバーサイドリライトが不可のため:

- **Hash モード推奨**: `/#/about` 形式
- History API モード利用時は `404.html` → `index.html` のフォールバックが必要（Power Pages の設定で対応可能か事前確認）

### React Router (Hash モード)

```tsx
import { HashRouter } from 'react-router-dom'

function App() {
  return (
    <HashRouter>
      {/* routes */}
    </HashRouter>
  )
}
```

### Vue Router (Hash モード)

```ts
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [/* ... */],
})
```
