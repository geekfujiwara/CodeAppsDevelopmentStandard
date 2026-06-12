# Geek Sales — Code Apps リファレンス実装

営業支援（顧客・商談・パイプライン・テリトリー・Copilot 分析）を題材にした Code Apps の完全実装サンプル。
code-apps スキルの各パターン（Lookup 名前解決・フロー連携・Copilot Studio コネクタ・デザインシステム等）の実例として参照する。

> **これはリファレンスであり、新規テーマの雛形ではない。**
> 新しいテーマは [CodeAppsStarter](https://github.com/geekfujiwara/CodeAppsStarter) テンプレートから生成すること
> （ルート README の「クイックスタート」参照）。このサンプルをコピーして書き換える方式は、
> デザイン・データソース接続の残骸が新テーマに混入する原因になるため廃止した。

## このサンプルに含まれないもの

| 含まれない | 理由 |
|---|---|
| `.power/` | **`pac code init` 実行時に Power Apps SDK が生成する**。手で作成・コピーしない |
| `src/generated/` / `power.config.json` | `pac code add-data-source` / SDK が生成する |
| `.env` | 環境固有。ルートの `.env.example` を参照 |
| `node_modules/` / `package-lock.json` | `npm install` で復元 |

`src/lib/dataSourcesInfo.ts` は `.power/schemas/appschemas/dataSourcesInfo` を import しているため、
**このサンプルは `pac code init` + データソース追加を行った環境でのみビルドできる**。
コードリーディング用のリファレンスとして扱うこと。

## 動かす場合

1. このディレクトリを作業用フォルダにコピー（標準リポジトリ内では実行しない）
2. `.env` を設定（`DATAVERSE_URL` / `SOLUTION_NAME` / `PUBLISHER_PREFIX` 等）
3. `npm install` → `pac code init` → 必要なテーブルを `pac code add-data-source`
4. `npm run dev`

## 構成

- `src/pages/` — dashboard / customers / opportunities / pipeline / territory / copilot-dashboard 等
- `src/services/` — dataverse-service / ai-flow-service / copilot-analytics-service
- `src/lib/dataSourcesInfo.ts` — SDK 生成の dataSourcesInfo に systemusers / bots 等を手動マージするパターン
- `scripts/` — このテーマ専用の運用スクリプト（toggle_table_lang のカスタマイズ例・探索スクリプト等）
