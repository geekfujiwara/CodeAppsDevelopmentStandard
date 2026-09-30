# トラブルシュート（異常系）

## 1. 初回の `ms app create` で Git 認証に失敗する

**症状**

```
fatal: Authentication failed for 'https://<env-id>.d.environment.api.powerplatform.com/appframework/git/repositories/<repo-guid>/'
Could not commit and push the initial scaffold. Your app and local scaffold are ready.
```

**原因**: Git Credential Manager が、そのテナントの Git remote に対して一度もブラウザー認証をしていない。
アプリとローカルの scaffold は作成済み。

**対処**: アプリを削除したり、`ms app create` を再実行したりしない。作成先で次を実行し、ブラウザーで承認する。

```powershell
Set-Location <作成先>
git fetch origin
```

恒久対策済み: `create_app.py` の `check_target()` は、作成先に `ms.config.json` があると再作成を止めてこの手順を案内する。
`ms app create` が失敗した直後も同じ案内を表示する。

## 2. `ms app create --repo` が URL を拒否する

| 入力 | 原因 | 対処 |
|---|---|---|
| `contoso.ghe.com/team/app` | スキームなしは拒否される | `https://` から始める |
| `https://dev.azure.com/...` | CLI の `--repo` は Azure DevOps 非対応（Learn 記載） | GitHub.com / GHE.com を使うか、`platform` / `none` を選ぶ |
| GitHub Enterprise Server のホスト | 非対応 | 同上 |
| public リポジトリ | 既定で禁止 | private にする。必要なら管理者が *Allow public GitHub repository* を有効化 |
| コミット済みのリポジトリ | 空である必要がある | 新しい空のリポジトリを作る |

恒久対策済み: `create_app.py` の `validate_repo_url()` と `check_github_repo()` が CLI 実行前に検出する。

## 3. `Could not provision a Developer environment for your tenant (status 403)`

テナントのガバナンスで開発者環境の作成が止められている。スクリプトでは回避できない。
管理者に、M365 管理センター → Apps → Settings → Environment groups のルーティング規則と、
開発者環境の作成可否の確認を依頼する。

## 4. 作成先が空でない / アプリが入れ子になる

`ms app create` の作成先は空である必要がある。既存アプリ（`ms.config.json` がある）の中に作ると、
Git リポジトリが入れ子になる。兄弟フォルダーに作る。

恒久対策済み: `create_app.py` の `check_target()`。

## 5. `ms` を実行すると別のコマンドが動く

`npx ms` は公開レジストリの別パッケージ（日時パーサー）を解決する。
`npm install -g @microsoft/managed-apps-cli` で導入した `ms` を直接使う。
導入後に見つからない場合は、`npm config get prefix` のフォルダー（Windows では `%APPDATA%\npm`）が PATH にあるか確認する。

恒久対策済み: `check_prereqs.py` は `ms --version` の出力から版を取れないと NG にする。

## 6. `ms app dev` で接続の呼び出しが 401 / 403 になる

| 状況 | 対処 |
|---|---|
| 403 | DLP / ACP による拒否が多い。`ms connector list` / `ms connector list-actions` で許可状態を確認する |
| 401 | 接続の資格情報の期限切れ。`ms app add data-source` で新しい接続を作る |
| ポート使用中で即終了 | `ms app dev --port <別ポート>` |
| localhost への通信がブロックされる | ブラウザーの Local Network Access の許可を与える |

## 7. deploy で `Invalid ms.config.json for shared connection policy enforcement`

共有接続（`sharedConnectionId` あり）の `allowedActions` が不足している。
`ms app dev` では検証されず、`ms app pack` / `ms app deploy` で初めて失敗する。
[sdk-usage.md](sdk-usage.md#共有接続の-allowedactions唯一の手編集) の規則で宣言する。`sharedConnectionId` は消さない。

恒久対策済み: `validate_project.py` の `check_shared_connection_policies()`（push 前は WARN、deploy 前は NG）。

## 8. preview に古いビルドが表示される

- push しただけではビルドされない。preview を開き直すか `ms app build` を実行する。
- 最新 commit のビルドが失敗すると、直前の成功ビルドが表示される。`ms app build-status --show-log` で原因を見る。
- 未 push のコミットはビルドされない。

恒久対策済み: `validate_project.py --stage deploy` が未 commit・未 push を NG にする。

## 9. `ms app deploy --artifact` が拒否される

- Git 管理アプリ（`repoType` が none 以外）では `--artifact` は使えない。
- *Allow external artifact deployment* が無効だと CLI がエラーを返す。管理者に有効化を依頼する。

## 10. 外部の API・CDN が読み込めない

既定 CSP（`connect-src 'self'` など）が遮断している。データはコネクタ経由で取得し、
どうしても必要な外部リソースは管理者に該当ディレクティブの追加を依頼する。

恒久対策済み: `validate_project.py` の `check_external_calls()` が WARN で検出する。

## 11. Copilot Credits の不足でアプリが止まる

Power Apps Premium を持たない利用者は、Managed Application Copilot Credits を消費する
（起動ごと、API 呼び出しは 1 回 0.1 credit）。不足時は警告の後、20 操作または 5 分で利用が止まる。
ローカル実行（`ms app dev`）にもライセンスが適用される。
