# package-sample — 異常系・詰まりどころ

サンプル公開前のサニタイズ／再利用性チェックで判断を誤りやすいポイントをまとめる。
正常系の手順は [SKILL.md](../SKILL.md) を参照。

## 1. 動的化してはいけない例外: OData バインド文字列

テーブル名は原則 `${PUBLISHER_PREFIX}_xxx` で動的化するが、**OData バインド注釈はそのまま残す**。

```ts
// OK（変更不要）: Dataverse API のペイロード形式。型定義のフィールド名と連動するため、
//                動的化しても型安全性が失われるだけ。
"geek_customerid@odata.bind": `/geek_customers(${id})`
```

- プレフィックス変更時は、この `@odata.bind` / `@odata.type` 行も**手動で**置換する。
- `scan_sample.py` は `@odata.bind|type|id` を含む行をテーブル名直書き検出から除外している。

## 2. システムテーブル vs カスタムテーブルの取り違え

| 種別 | 例 | プレフィックス |
|---|---|---|
| システムテーブル | `bots` / `conversationtranscripts` / `systemusers` | **不要**（付けると 404） |
| カスタムテーブル | `{prefix}_customers` / `{prefix}_conversationsummaries` | **必須**（動的化対象） |

- **落とし穴**: Copilot Analytics 用の `{prefix}_conversationsummaries` はカスタムテーブルなので動的化が必要。システムテーブルと誤認してプレフィックスを外すと参照に失敗する。

## 3. VITE_ 変数への秘匿情報混入

`VITE_` 変数は**ビルド成果物に平文で含まれ、ブラウザから参照できる**。

- NG: `VITE_API_SECRET` / `VITE_TOKEN` / `VITE_CLIENT_SECRET`
- トークン・パスワード・クライアントシークレットは VITE_ 変数に置かない。
- 表示名・プレフィックス・feature flag 等の**非機密値のみ** VITE_ で扱う。
- `scan_sample.py` は `VITE_*SECRET/TOKEN/PASSWORD/KEY` 様の変数名を error として検出する。

## 4. .env / 生成物のコミット漏れ

- ルートの `.gitignore` に `.env` / `power.config.json` / `.power/` / `src/generated/` が含まれているか確認する。
- ルート `.gitignore` はリポジトリ全体に適用されるため、**サンプル個別の `.gitignore` は不要**。
- `scan_sample.py` が上位の `.gitignore` を辿って必須エントリの有無を warning で報告する。

## 5. プレースホルダー形式の不統一

サニタイズ後のプレースホルダーは視覚的に「要変更」と分かる `{説明}` 形式で統一する。

| 種別 | 置換後プレースホルダー |
|---|---|
| テナント ID | `{your-tenant-id}` |
| 環境 ID | `{your-environment-id}` |
| Dataverse URL | `https://{org}.crm.dynamics.com/` |
| Bot ID / Schema | `{your-bot-id}` / `{your-bot-schema}` |
| フロー Workflow ID | `{your-flow-workflow-id}` |
| 接続 ID / CONNREF | `{your-connection-id}` |
| メールアドレス | `admin@example.com` |
| PAC 認証プロファイル名 | `{YourProfileName}` |
