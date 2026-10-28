# Azure Web / SPA の Microsoft Entra ID ログイン標準

## 適用範囲

Azure Container Apps / App Service / 静的ホスト上の **トップレベル SPA が自前で MSAL Browser を使う場合**の既定。
対話認証は同一タブの authorization code + PKCE redirect とする。popup を標準実装にしない。
これは本開発標準の選択であり、Microsoft がすべての popup を禁止しているという意味ではない。

- Code Apps / Managed Runtime などホストが認証を提供する場合はホスト SDK を使う。独自 MSAL を重ねない。
- Easy Auth / BFF のサーバーセッションを選んだ場合は、その認証契約を維持する。SPA 方式への置換を強制しない。
- iframe 内では Entra の対話画面を開かない。通常のブラウザタブで開くか、ホスト対応の認証方法を設計する。
- テンプレートは **MSAL Browser 4.30.x** の検証済み経路。将来のメジャー更新では redirect bridge 等の仕様差を公式資料と実機で再検証し、静的 callback を無条件に流用しない。

## Step 1: 設定と登録を確定する

パラメータは [.env.example](.env.example) の `BROWSER_AUTH_*` に定義。実値は無視対象の `.env` / 環境設定へ置く。
テナント ID、SPA client ID、API の delegated scope、公開 URL を確定する。ブラウザには client secret を置かない。

Entra の対象アプリの **SPA** redirect URI に以下を追加し、読み戻す。

| 用途 | URI | 実行内容 |
|---|---|---|
| 対話ログイン | 公開オリジンの `/` | MSAL 初期化と `handleRedirectPromise` を実行する SPA |
| サイレント更新 | 公開オリジンの `/auth-callback.html` | スクリプト / ルーター / API 呼出のない静的 HTML |
| ローカル開発 | 使用する localhost / loopback の同じ 2 パス | 実際に使うポートだけ登録 |

変更前の `spa.redirectUris` を取得し、追加分との和集合を作る。**既存 URI / web redirect / 他クライアントの設定を削除・上書きしない**。
対象アプリと追加 URI の計画を提示し、承認後に適用、Graph / CLI で読み戻す。登録を変えるだけで API 権限や管理者権限を増やさない。
API は署名、issuer、audience、tenant、有効期限、delegated scope、アプリの利用者 / 役割を検証する。
個人 Microsoft アカウント対応やマルチテナント化をログイン修正の名目で暗黙に有効化しない。

## Step 2: テンプレートを生成・統合する

リポジトリルートで実行する。空の別ディレクトリへ生成し、既存アプリを上書きしない。

```powershell
python .github\skills\update-skills\scripts\scaffold_from_template.py `
  --template .github\skills\azure-infra\templates\entra-browser-auth `
  --target <AUTH_SAMPLE_DIR> --dry-run
python .github\skills\update-skills\scripts\scaffold_from_template.py `
  --template .github\skills\azure-infra\templates\entra-browser-auth `
  --target <AUTH_SAMPLE_DIR>
```

生成物の README に従い、認証モジュールを一度だけ作成する。

1. `await auth.initialize()` が `initialize` → `handleRedirectPromise` の完了を保証する。完了前にルーターや保護 API を動かさない。
2. ログイン操作は `await auth.signIn()` の直後に return する。開始した同じ文脈で `/api/me` を呼ばない。
3. 復帰時は account を設定し、API スコープの **access token** を `Authorization: Bearer ...` に付ける。ID token を送らない。
4. `navigateToLoginRequestUrl: false` とし、復元は自前の同一オリジン・許可済み pathname と query だけ。hash は保存しない。hash router は別設計にする。
5. cookie / 招待 / 期限付きデモがあるアプリはモードを明示して分離する。古い demo marker を成功した Entra 復帰時に消す等はアプリ側で行い、固定期限・失効・管理者の判定を変更しない。
6. silent token 取得が失敗したら、エラーを画面へ通知し、利用者の再認証操作へつなぐ。cookie への自動降格や API への空 token 送信をしない。再認証では未保存の入力が失われることを案内する。

`Cross-Origin-Opener-Policy: same-origin` を維持する。popup の `window.closed` 監視に依存しない。
callback は SPA fallback より先に静的配信し、`Cache-Control: no-store` / `Referrer-Policy: no-referrer` を付ける。
callback を認証必須・リダイレクト・スクリプト注入の対象にしない。通常の CSP 等は緩和しない。

## Step 3: 毎回のデプロイ前ゲートを実行する

アプリの TypeScript 依存を使う AST ベースのチェック。既存アプリの認証入口を明示する。

```powershell
node .github\skills\azure-infra\scripts\check_browser_auth.mjs `
  --project <APP_DIR> --auth-file src\auth.ts --callback-file public\auth-callback.html
```

popup 呼出、redirect / 復帰処理の欠落、未 await の復帰処理、`navigateToLoginRequestUrl`、静的 callback のアプリ起動を検出したら終了コード 1。
読取・依存のエラーも非 0。モジュール別名や他ファイルの制御フロー、Entra 登録、実際の API 認可までは証明しない。
別アダプター / msal-react を採用するときは契約を確認して対応テストを追加し、チェックを通すためのダミー呼出を入れない。
初期化後の API 呼出順、モード分離、再認証失敗、外部 URL / 未許可パス拒否はテンプレートの回帰テストも実行する。

生成したサンプルのディレクトリで `npm run check` / `npm test` を実行する。
プリフライト自身の正例・異常系・CLI 終了コードは、同じディレクトリをカレントにして
`node --test <STANDARD_REPO>\.github\skills\azure-infra\scripts\test_browser_auth.mjs` で検証する。

## Step 4: デプロイ後に対話ログインまで確認する

- 実際のデプロイ済み JS と新 revision の配信を確認する。ARM 更新完了だけで新コードが届いたと見なさない。
- 未認証 API `401`、静的 callback `200` / 非 SPA / ヘッダー、登録済み SPA URI を確認する。
- [ブラウザ方針](../../standard/references/browser-automation.md)に従い、起動前にプロファイルを確認する。パスワード・MFA は本人が操作する。
- 同一タブでサインイン → アプリへ復帰 → 保護 API `200` → 期待した役割の画面を確認。未許可ユーザーには管理者を表示しない。
- 自動テスト / CLI の token を使った API 成功と、本人の対話認証成功は別々に記録する。未実施なら未検証と明示する。
- token / 認可コード / hash 付き復帰 URL / MSAL storage をログ・スクリーンショット・チャットへ出さない。

## 公式資料

Learn MCP が提供されない環境では公式ページを取得して確認する。本更新では以下を取得して照合した。

- [初期化と redirect lifecycle](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- [エラー、handleRedirectPromise の待機、silent callback](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/errors)

異常系は [troubleshooting.md](troubleshooting.md) を参照。
