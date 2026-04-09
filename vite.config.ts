import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { powerApps, POWER_APPS_CORS_ORIGINS } from "./plugins/plugin-power-apps";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    powerApps()
  ],
  base: "./",
  server: {
    cors: {
      origin: POWER_APPS_CORS_ORIGINS
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Mermaid関連 (大きいので分離)
            if (id.includes('mermaid')) return 'mermaid-vendor'
            // Cytoscape関連 (大きいので分離)
            if (id.includes('cytoscape')) return 'cytoscape-vendor'
            // KaTeX関連 (大きいので分離)
            if (id.includes('katex')) return 'katex-vendor'
            // チャート関連
            if (id.includes('recharts')) return 'chart-vendor'
            // DnD関連
            if (id.includes('@dnd-kit')) return 'dnd-vendor'
            // ユーティリティ（React 非依存）
            if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('date-fns') || id.includes('class-variance-authority')) {
              return 'utils-vendor'
            }
            // React + 全 React 依存ライブラリ（循環参照回避）
            return 'vendor'
          }
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
})
