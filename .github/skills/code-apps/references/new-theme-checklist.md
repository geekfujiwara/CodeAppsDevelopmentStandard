# 新規テーマ開始チェックリスト

新しい開発テーマを始めるとき、**前テーマのデザイン・データソース接続の残骸がないクリーンな状態**であることを
実装開始前に確認する。残骸の典型例: 過去テーマ（Geek Sales 等）の画面・テーブル参照が残ったままデータソース接続がエラーになる。

## 前提: 正しい開始方法

```
✅ CodeAppsStarter テンプレートから生成 → npm run setup で標準を同期
❌ CodeAppsDevelopmentStandard を clone してテーマ開発を始める（廃止された方式）
```

```bash
gh repo create <account>/<theme-repo> --template geekfujiwara/CodeAppsStarter --private --clone
npm install && npm run setup
```

## チェックリスト（実装開始前）

### 1. SDK 生成物が存在しないこと（あれば前テーマの残骸）

- [ ] `.power/` が存在しない — **`pac code init` で Power Apps SDK が生成する。手で作成・コピー・コミットしない**
- [ ] `src/generated/` が存在しない — `pac code add-data-source` が生成する
- [ ] `power.config.json` が存在しない — `pac code init` が生成する

> これらが**ある**状態で始まっている場合、前テーマからの持ち込み。削除して必ず自分の環境で SDK に再生成させる。

### 2. ソースがスターター雛形のままであること

- [ ] `src/pages/` が雛形ページのみ（home / guide / design-examples / feedback）— 業務画面が既にあるのは残骸
- [ ] `src/services/` / `src/types/` にドメイン固有のサービス・型がない
- [ ] `src/lib/dataSourcesInfo.ts` 相当のファイルがない、または `.power/schemas` への import が残っていない
- [ ] `styles/index.pcss` がデフォルト（Ocean Blue）か、意図して選んだテンプレートになっている

### 3. 環境設定が自分のテーマを指していること

- [ ] `.env` が存在しない（これから作る）か、`DATAVERSE_URL` / `SOLUTION_NAME` / `PUBLISHER_PREFIX` が**新テーマの値**
- [ ] 前テーマのソリューション名・プレフィックスが残っていない

## 初期化の正しい順序

```
1. .env 設定（.env.example をコピーして新テーマの値を入れる）
2. デザインテンプレート選択（design-templates.md → apply_design_template.py）
3. pac code init                  ← .power/ は SDK が生成（手で作らない）
4. pac code add-data-source ...   ← src/generated/ が生成される
5. 設計フェーズ（design-system.md）→ ユーザー承認 → 実装
```

## 残骸を見つけたときの対処

| 見つけたもの | 対処 |
|---|---|
| `.power/` / `src/generated/` / `power.config.json` | 削除 → 手順 3〜4 で SDK に再生成させる |
| 前テーマの業務画面（`src/pages/*.tsx`） | 削除し、CodeAppsStarter の雛形ページ構成に戻す |
| 前テーマのテーブル参照（dataSourcesInfo / services / types） | 削除。**コメントアウトで残さない**（ビルドエラー・接続エラーの温床） |
| 前テーマの配色 | `apply_design_template.py 1 --project .` で Ocean Blue に戻すか、新テーマのテンプレートを適用 |
