# Code Apps 汎用ベーステンプレート（generic-base）

Power Apps Code Apps の **scaffold 唯一の取得元**です。
`samples/geek-*` は業務ページ実装の参照専用であり、scaffold 元にはしません
（業務固有のページ・型・サービスが混入するため）。

## 取得

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills/code-apps/templates/generic-base .
```

## 含まれるもの

| 区分 | 内容 |
|---|---|
| ビルド構成 | `vite.config.ts` / `plugins/plugin-power-apps.ts` / `tsconfig*.json` / `eslint.config.js` |
| スタイル | `styles/index.pcss`（Ocean Blue 既定） / `src/index.css` / `components.json` |
| 検証 | `scripts/pre-deploy-check.mjs`（`npm run predeploy`） |
| 可観測性 | `src/lib/telemetry.ts`（`initializeLogger`、PII サニタイズ済み `code-apps:telemetry` イベント） |
| 共通 UI | `src/components/ui/**`（shadcn プリミティブ） |
| 汎用コンポーネント | `form-modal` / `list-table` / `loading-skeleton` / `mode-toggle` / `sidebar` / `sidebar-layout` / `stage-path` |
| レイアウト | `src/pages/_layout.tsx` / `src/pages/not-found.tsx` |
| プロバイダー | `power` / `query` / `sonner` / `theme` |

**含まれないもの**（業務ごとに実装する）

- 業務ページ（`src/pages/` はダッシュボードのプレースホルダーのみ）
- データアクセス層（`src/services/` / `src/hooks/use-dataverse.ts`）
  — `npx pa app add data-source` が生成する `src/generated/services/MicrosoftDataverseService.ts` を
  ラップする形で実装する（[build-reference.md](../../references/build-reference.md) Step 6）
- 業務の型・選択肢定義（`src/types/`）

## テレメトリの転送

起動性能とネットワーク要求は `window` の `code-apps:telemetry` イベントへ出力されます。
Application Insights 等へ転送するときは `initializeTelemetry(customSink)` に差し替え、
送信先を CSP の `connect-src` に追加してください。URL は sink 到達前にクエリ文字列、フラグメント、GUID を除去します。
詳細は [テレメトリ / 可観測性パターン](../../references/telemetry-pattern.md) を参照してください。

## 取得後の手順

1. `.env.example` を `.env` にコピーして値を入力
2. `npm install`
3. `npx pa auth status` で認証先を確認し、必要なら `pa auth switch --account {UPN}` で切り替える
4. `npx pa app init --environment-id {ENVIRONMENT_ID} --display-name "AppName"`
5. 初回は `npm run deploy -- --solution-id {SOLUTION_ID}`（GUID）でソリューションへ追加する
6. `npx pa app add data-source`（`src/generated/` が生成される）
7. 業務ページを追加したら `src/config.ts` と `src/router.tsx` に**同じ path** で登録し、`npm run predeploy` で整合を確認する
