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
| 共通 UI | `src/components/ui/**`（shadcn プリミティブ） |
| 汎用コンポーネント | `form-modal` / `list-table` / `loading-skeleton` / `mode-toggle` / `sidebar` / `sidebar-layout` / `stage-path` |
| レイアウト | `src/pages/_layout.tsx` / `src/pages/not-found.tsx` |
| プロバイダー | `power` / `query` / `sonner` / `theme` |

**含まれないもの**（業務ごとに実装する）

- 業務ページ（`src/pages/` はダッシュボードのプレースホルダーのみ）
- データアクセス層（`src/services/` / `src/hooks/use-dataverse.ts`）
  — `npx power-apps add-data-source` が生成する `src/generated/services/MicrosoftDataverseService.ts` を
  ラップする形で実装する（[build-reference.md](../../references/build-reference.md) Step 6）
- 業務の型・選択肢定義（`src/types/`）

## 取得後の手順

1. `.env.example` を `.env` にコピーして値を入力
2. `npm install`
3. `npx power-apps auth-status` で認証先を確認し、必要なら `auth-switch --account {UPN}` で切り替える
4. `npx power-apps init --environment-id {ENVIRONMENT_ID} --display-name "AppName"`
5. 初回は `npm run deploy -- --solution-id {SOLUTION_ID}`（GUID）でソリューションへ追加する
6. `npx power-apps add-data-source`（`src/generated/` が生成される）
7. 業務ページを追加したら `src/config.ts` と `src/router.tsx` に**同じ path** で登録し、`npm run predeploy` で整合を確認する
