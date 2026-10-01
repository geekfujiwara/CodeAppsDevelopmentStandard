# 接続作成 API の観測 contract（2026-10-01）

カスタム コネクタの接続作成には公開 API が無い（`pac connection create` は OAuth の接続に対応していない）。
Power Automate の接続画面（`make.powerautomate.com`）が送る要求を観測し、
[private API 自動化標準](../../update-skills/references/private-api-automation.md) に従って `create_connection.py` にした。
製品の更新で変わり得るため、`CONTRACT_VERSION` と一致しない plan は拒否する。

## 根拠

| 要求 | 根拠 |
|---|---|
| 接続の作成（PUT）と削除（DELETE） | 画面操作時の要求を捕捉（write 要求だけ、authorization は記録しない） |
| `getConsentLink` / `confirmConsentCode` | 画面のポップアップが統合ブラウザでブロックされ要求が出なかったため、画面の JavaScript の要求組み立てコードを読んで確認 |
| ホスト、`api-version`、同意の 2 つの戻り方 | 上記の contract で実際に要求し、応答と状態を読み戻して確認 |

## ホストと認証

| 項目 | 値 |
|---|---|
| ホスト | `https://<環境 ID のハイフンを除き、末尾 2 文字の前に . を入れた値>.environment.api.powerplatform.com`（例: `…65dd25.02.environment…`） |
| トークン | `https://api.powerplatform.com/.default`。**Power Platform CLI のパブリック クライアント**（`9cee029c-6210-4654-90bb-17e6e9d36617`）で取る |
| 既定クライアントの場合 | Azure CLI 互換クライアントは `403 InsufficientDelegatedPermissions`（`Connectivity.Connections.*` が無い） |
| テナント スコープの経路 | `/connectivity/tenants/{tenant}/environments/{env}/…` は環境スコープのホストでは `404 RouteNotFound`。環境スコープの経路を使う |

## 要求

すべて `{host}/connectivity/connectors/{connector}/connections` 配下。`{connector}` は `shared_…`、`{name}` は 32 桁の小文字 16 進数（クライアントが生成）。

| 操作 | 要求 | 本文 | 応答 |
|---|---|---|---|
| 一覧 | `GET ?api-version=1&$filter=environment eq '{env}'` | — | `value[].properties.statuses[0].status`（`Connected` / `Error`） |
| 作成 | `PUT /{name}?api-version=1` | `{"properties":{"environment":{"name":"{env}"},"connectionParameters":{},"displayName":"…"}}` | 201。OAuth 未完了のため `statuses: [{status: "Error", target: "token"}]` |
| 同意リンク | `POST /{name}/getConsentLink?api-version=1&$filter=environment eq '{env}'` | `{"redirectUrl":"…"}` | `{consentLink, principalType, redirectUrl}`。`consentLink` は地域の同意サーバー（`https://<region>.consent.azure-apihub.net/login?…`） |
| 確定 | `POST /{name}/confirmConsentCode?api-version=1&$filter=environment eq '{env}'` | `{"code":"…"}` | 戻り先にコードが付いた場合だけ呼ぶ |
| 削除 | `DELETE /{name}?api-version=1` | — | 200 |

画面の UI は表示名を空にすると本文に `displayName` を入れない。入れた場合はその表示名で作成された。

## 同意の 2 つの戻り方

| `redirectUrl` | 流れ | 確定 |
|---|---|---|
| ポータル（画面の既定: `https://make.powerautomate.com/<route>?<popup param>=<id>`） | Entra サインイン → 同意サーバー → ポータルへ `code` 付きで戻る → 画面が `confirmConsentCode` | 呼び出し側 |
| ポータル以外（`http://localhost:<port>/callback`） | Entra サインイン → 同意サーバーの **確認画面**（「Confirmation required」: 作成者の表示、チェック、Allow access）→ クエリ無しで戻る | **同意サーバーが確定済み**（すぐ `Connected`） |

- 失敗時は `?error=<Base64>` で戻る（例: AADSTS90008 の全文）
- `localhost` を `redirectUrl` に指定すると、ブラウザは 127.0.0.1 で待ち受ける中継へ戻れる。中継が `/start` で同意リンクへ転送するため、
  同意リンクも認可コードもスクリプトの外へ出さずに済む

## 画面（UI）の挙動

- 「新しい接続」→「作成」で `PUT` → ポップアップで同意 → 完了を待つ
- ポップアップが開けないと「接続同意のポップアップ ウィンドウがブラウザーによりブロックされています」と表示し、**作成した接続を `DELETE` する**
  （VS Code の統合ブラウザはこれに当たる。利用者に作成してもらう場合は Edge を使う）
- 画面のポータル URL: `https://make.powerautomate.com/environments/{env}/connections/available/{connector}`

## Code Apps から使うまで

| 段階 | 実測 |
|---|---|
| 接続参照 | 接続を作った後で `connectionreferences.connectionid` に接続名をバインドする（`create_connection.py --connection-reference`） |
| データソース追加 | `pa app add data-source --connector <shared_…> --connection-ref <logical> --solution-id <id>` が `src/generated/services/<Title>Service.ts` を生成 |
| 初回起動 | プレイヤーが「Allow &lt;アプリ&gt; to access your data?」を出し、接続が「Connection Complete」と表示される。利用者が Allow する（利用者・アプリごとに 1 回） |
