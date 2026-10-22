# キャッシュ優先の認証運用

## Step 1: 初回設定を確認して保存する

本人にアカウントUPN、Edgeプロファイル、サイレント更新が追加認証を要求した際のブラウザー再起動を
許可するか確認する。Edgeの表示名ではなく `edge://version` のプロファイルパス末尾
（`Default` / `Profile N`）を使う。不明な値を推測しない。
アプリのルートで、Git除外済みの既存 `.env` に共通の環境設定を用意してから実行する。

```powershell
python .github/skills/code-apps/scripts/setup_code_app_auth.py `
  --account <approved-upn> --edge-profile "Profile N" --approve-interactive
```

承認は `PP_AUTH_ALLOW_INTERACTIVE=true`、方式は `PP_AUTH_MODE=browser`、
アカウントとプロファイルは `PP_AUTH_ACCOUNT` / `PP_AUTH_EDGE_PROFILE` として保存する。
設定だけ保存する場合は `--save-only`。許可を取り消す場合は `false` に変更する。
アプリがサブディレクトリの場合はスキルへの相対パスを読み替える。
ポータルの自動操作は引き続きVS Code統合ブラウザーのみを使う。

## Step 2: 独立した両キャッシュを準備する

スクリプトはPython共有キャッシュを優先し、必要時のみブラウザー認証する。
PythonはWindowsに実在する指定Edgeプロファイルを起動する。存在しなければ代替を使わず停止する。
既存AuthenticationRecordのテナント・client IDに加えてアカウントも照合する。
アカウントが異なる場合はキャッシュを削除せず、承認済みの別レコードパスを
`PP_AUTH_RECORD_PATH` で選択してから再実行する。
`PP_AUTH_ACCOUNT` を固定した場合は、アカウントを照合できる共通Pythonキャッシュを使用し、
別のPACプロファイルのトークンを優先しない。未設定の既存PAC利用は従来どおり。

npm CLIは別のクライアントIDと暗号化キャッシュを使う。Pythonのトークンをコピー・注入しない。
指定アカウントがCLIキャッシュにあれば明示的に選択し、なければ `auth login --account` を
対話コンソールで実行する。CLIはOS既定ブラウザーを開き、プロファイル指定は公開していない。
保存したプロファイルを本人が選択する。設定保存はCLIへのプロファイル強制適用を意味しない。

app init 前はアカウントのみ確認し、init 後に同じセットアップを再実行する。
実際の `connection list` を呼び、追加のresource認証が必要ならその実コマンドで一度だけ認証する。
その後に非対話で再取得できることを確認する。`auth status` の成功だけで完了としない。

## Step 3: 更新・デプロイをキャッシュで実行する

```powershell
python .github/skills/code-apps/scripts/deploy_code_app.py --check-auth
npm run predeploy
npm run deploy -- --solution-id <solution-id>
```

テンプレートのdeployはビルドと既存predeployを保持し、`scripts/deploy.mjs` から共通Pythonラッパーを呼ぶ。
ラッパー自身もpredeployを必須実行し、失敗したらpushしない。
CLIの保存済みアカウントを照合し、通常は `--non-interactive` で実行する。
追加認証要求だけ、保存済み継続許可に従って実コマンドを対話コンソールへ切り替える。
書き込みコマンドは認証後のキャッシュ確認のために再実行しない。
既存アプリにはgeneric-baseの `scripts/deploy.mjs` とpackage.jsonのdeploy変更を反映する。
既存独自のテスト・ビルド・検査は削除しない。

CLIのpush正常終了、配信後の接続同意、UI CRUDは別々に記録する。
CIは対話を禁止し、CI専用認証を構成する。ローカルの対話許可をCIに持ち込まない。

## Step 4: 追加認証を通常運用として扱う

アクセストークン・更新トークンの寿命とサインイン頻度はEntraが決定する。
約9時間後の実測ではPythonはキャッシュで成功し、CLIは追加認証後に非対話処理へ復帰した。
原因を条件付きアクセスと断定せず、再認証不要や無期限キャッシュを保証しない。
403・429・通信障害・不明なタイムアウトは認証復旧の対象ではない。
キャッシュを削除せず、実行結果が不明な書き込みは状態を確認するまで再試行しない。

## 公式仕様の確認

[InteractiveBrowserCredential](https://learn.microsoft.com/en-us/python/api/azure-identity/azure.identity.interactivebrowsercredential?view=azure-python)
の `login_hint` / `cache_persistence_options` / `disable_automatic_authentication` /
`AuthenticationRequiredError` を確認した。追加認証とサイレント取得は区別する。
npm CLIのブラウザー制限は、検証時にインストール済みの公式CLI 1.3.0が
`open(url, {wait: false})` を呼ぶ実装であることを確認した結果。
非公開のフックや依存パッケージの書き換えでプロファイルを強制しない。
