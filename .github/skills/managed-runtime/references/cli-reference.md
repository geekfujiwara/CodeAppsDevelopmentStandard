# ms CLI 早見表

`@microsoft/managed-apps-cli`（コマンド名 `ms`）の主要コマンド。スクリプトや CI では
`--non-interactive` と `--json` を付ける。`npx ms` は別パッケージなので使わない。

| 目的 | コマンド |
|---|---|
| サインイン / 状態 / 切替 | `ms auth login` / `ms auth status` / `ms auth switch --account <email>` |
| GitHub との対応付けを更新 | `ms git auth refresh --repo <url>` |
| 新規作成 | `ms app create <dir> --display-name <name> [--repo <url>\|none]` |
| 既存 Web プロジェクトを登録 | `ms app init --display-name <name> [--repo native\|none\|<url>]` |
| platform-managed Git を clone | `ms app clone --app <app-id> [dir]` |
| 編集できるアプリ一覧 | `ms app list --permission edit` |
| コネクタを探す（DLP / ACP 状態付き） | `ms connector list --search <語>` |
| 操作ごとの可否 | `ms connector list-actions --connector <id>` |
| データソース追加 / 再生成 / 削除 | `ms app add data-source --connector <id> --as table\|action` / `ms app refresh data-source` / `ms app remove data-source --name <name>` |
| ローカル開発 | `ms app dev [--port <n>]` |
| ローカル ビルド確認 | `ms app pack` |
| プラットフォーム ビルド | `ms app build [--commit <sha>]` |
| ビルド結果 | `ms app build-status [--commit <sha>] [--show-log]` |
| preview / live を開く | `ms app play --mode preview\|live [--commit <sha>] [--no-browser]` |
| live へ昇格 / 巻き戻し | `ms app deploy` / `ms app deploy --commit <sha>` |
| 外部成果物のデプロイ | `ms app deploy --artifact <zip>`（`repoType: none` のみ） |
| 共有 | `ms app share <emails> --access play\|edit` / `ms app unshare ...` / `ms app share list --access play` |
| 組織内リンク | `ms app share link create` / `list` / `revoke --link-id <id>` |
| サーバー側の状態 | `ms app info`（リポジトリ URL・環境 ID・最終デプロイ commit・live / preview URL） |
| 設定 | `ms app get-settings` / `ms app set-setting --show-header <bool>` |
| 削除 | `ms app delete` |

## preview の見え方

| ビルド状態 | preview に表示されるもの |
|---|---|
| 最新 commit のビルド成功 | そのビルド |
| 最新 commit をビルド中 | 直前の成功ビルド＋「ビルド中」バナー |
| 最新 commit のビルド失敗 | 直前の成功ビルド＋「失敗」バナー（`ms app build-status` で原因確認） |
| 成功ビルドが無い | 未デプロイの画面 |

- push だけではビルドされない。preview を開く・`ms app build`・`ms app deploy` のいずれかでビルドされる。
- preview を見られるのは、バインドされたリポジトリへの書き込み権限を持つ開発者だけ。
- live は `ms app deploy` した時点のスナップショット。次の deploy まで更新されない。

## 出典

- [CLI command reference](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/ms-cli-command-reference?view=o365-worldwide)
- [Build, preview, and deploy](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/dev-inner-loop?view=o365-worldwide)
