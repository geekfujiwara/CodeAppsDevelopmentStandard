# ${AGENT_DISPLAY_NAME} — Foundry Autopilot 版 AI チームメイト

Azure AI Foundry が**ホスティングまで面倒を見る** AI チームメイトです。App Service も Bot 登録も
自分で用意しません。Foundry のエージェント定義を M365 に publish すると、Agent 365 側で
agentUser（自分のメールアドレスと予定表を持つ ID）が払い出され、Teams / M365 Copilot から
同僚として呼べるようになります。

頭脳は **GitHub Copilot SDK**（`runtime=copilot-sdk` に固定）で、モデルは**このテナント自身の
Foundry デプロイ**を BYOK で使います。追加のモデル クォータも API キーも登場しません。

## このディレクトリの構成

| 出所 | 内容 |
| --- | --- |
| Microsoft 公式クイックスタート（`fetch_autopilot_quickstart.py` が取得） | `host_agent_server.py` / `agent_interface.py` / `infra/` / `scripts/` |
| このスキルのオーバーレイ | `teammate_agent.py` / `copilot_brain.py` / `skill_sync.py` / `test_worker.py` / `image_tools.py` / `file_delivery.py` / `incoming_files.py` / `untrusted_content.py` / `dataverse.py` / `usage.py` / `schedules.py` / `schedule_host.py` / `main.py` / `ToolingManifest.json` |

公式サンプルは**フォークせずそのまま**置いてあります。差分はオーバーレイ側だけにあるので、
上流の修正を取り込みたくなったら `fetch_autopilot_quickstart.py --force` を流し直せます。
置き換えている上流ファイルは `main.py`（`create_and_run_host()` に渡すクラスを差し替えるだけ）、
`host_agent_server.py` は次の 4 点だけを書き換えています。

- 英語固定の `"Working on your request..."` → 相手の言語で具体的な 1 文
- 添付だけの発言を通し、例外の中身をチャットに出さない
- 定期実行（B11）の `/invocations` 受け口と `schedule_run` イベント
- メールへの返信が空のときは送らない（メールを無効にした場合）

> **自己ホスト版（`digital-colleague/`）との機能差**: B6 メール巡回・Teams プレゼンスは入っていません。
> hosted agent のコンテナーは最後のターンから約 15 分で停止するため、常駐ワーカー型の機能は
> そのままでは動きません。定期実行（B11）は Logic App が起こす形で入っています（troubleshooting.md #88）。

## 動かすまで

```powershell
# 1. Azure 側（Foundry アカウント / プロジェクト / ACR / Toolbox）を作る（既存を使うなら不要）
azd up

# 2. 初回: ビルド → version 作成 → Autopilot として発行
./deploy.ps1 -Publish

# 3. 定期実行のタイマー（SCHEDULE_ENABLED=true のとき）
python <skill>/scripts/provision_schedule_trigger.py --execute --env .env

# 4. コードを直したとき: 新しい version を作り、古い version に固定されたチャットを作り直す
./deploy.ps1
```

> **publish をやり直すときは `--bump-version` を付けてください。** 同じ `appVersion` の再送は
> `UserError: version already exists` で落ちます。また `accessBoundaries` を変更した場合は、
> 再承認したうえで**インスタンスを作り直さないと**古い境界のまま動きます。
>
> **コードだけ直したときは `--container-only --recycle-sessions`。** イメージのタグはビルドごとに
> 一意にし（`AGENT_IMAGE_TAG`）、既存チャットのセッションを作り直さないと古いコードのまま動きます
> （セッションは作成時の version に固定されるため。troubleshooting.md #83）。

## 設定（環境変数）

| 変数 | 役割 |
| --- | --- |
| `FOUNDRY_PROJECT_ENDPOINT` | Foundry プロジェクトのエンドポイント（`AZURE_AI_PROJECT_ENDPOINT` でも可） |
| `ModelDeployment` | 頭脳に使うモデル デプロイ名 |
| `TOOLBOX_ENDPOINT` | Foundry Toolbox（Web 検索・コード実行）の MCP エンドポイント |
| `DATAVERSE_URL` | 評価ハブと Dataverse MCP の接続先。未設定ならどちらも自動で無効 |
| `PUBLISHER_PREFIX` | 評価ハブのテーブル接頭辞 |
| `EVAL_AGENT_KEY` | 評価ハブ上でこのチームメイトを識別するキー。`AGENT_*` は予約済みで渡せないのでこの名前にする（troubleshooting.md #86） |
| `IMAGE_MODEL_DEPLOYMENT` | 画像生成（B17）を有効にする。未設定なら `generate_image` ツールは登録されない。既定クォータは 1 リクエスト/分 |
| `AZURE_DEVOPS_ORGANIZATION` | Azure DevOps MCP を有効にする |
| `SKILLS_SYNC_MINUTES` | スキルを評価ハブへ同期する間隔（既定 30 分） |
| `DEFAULT_TIMEZONE` | Activity が `localTimezone` を送ってこないときに使う IANA 名（例 `Asia/Tokyo`）。未設定だと UTC のまま答えてしまう |
| `USAGE_WORKSPACE_ID` / `USAGE_PRICE_*_PER_1M` / `USAGE_ALL_VISIBLE` / `USAGE_ADMIN_IDS` | 利用実績（B15）。記録は常に App Insights へ。集計ツールは workspace id を設定したときだけ（troubleshooting.md #87） |
| `SCHEDULE_ENABLED` / `SCHEDULE_TICK_MINUTES` | 定期実行（B11）。`true` でツールと Invocations 受け口が有効になる。tick 間隔は Logic App 側（既定 15 分）（troubleshooting.md #88） |
| `EMAIL_CHANNEL_ENABLED` | 自分のアドレス宛てのメールに応答するか。`true` 以外は返信しない（scaffold の質問で決める） |

添付の受け取り（B16）には、インスタンスへの Graph 委任が要ります。貼り付け画像は `Chat.Read`、
クリップで添付したファイルは `Files.Read.All` です（troubleshooting.md #84）。

```powershell
python ../../.github/skills/ai-teammate/scripts/grant_agent_graph_scopes.py --instance-id <instance appId> `
  --scopes "User.Read Chat.Read Files.Read.All Files.ReadWrite"
```

社内データの検索（Dataverse MCP）は `DATAVERSE_URL` を渡したうえで、エージェント自身を環境につなぎます。
読めるのは**エージェントに付けたロールの範囲**で、話しかけた人の権限ではありません（troubleshooting.md #85）。

```powershell
python ../../.github/skills/ai-teammate/scripts/grant_agent_graph_scopes.py --instance-id <instance appId> `
  --resource-app-id 00000007-0000-0000-c000-000000000000 --scopes "mcp.tools user_impersonation"
python ../../.github/skills/ai-teammate/scripts/connect_agent_dataverse.py --env-id <environment id> `
  --agent-user-id <agentUser oid> --instance-app-id <instance appId> `
  --role-name "${AGENT_DISPLAY_NAME} Reader" --client-unique-name <prefix>_<agent> --read-prefix <table prefix>
```

`python:3.12-slim` には `/usr/share/zoneinfo` が入っていないので、scaffold が `requirements.txt` に
`tzdata` を足します。無いと `ZoneInfo("Asia/Tokyo")` が失敗して UTC に落ちます。

`AGENT_*` / `FOUNDRY_*` および `APPLICATIONINSIGHTS_CONNECTION_STRING` は**プラットフォーム予約**で、
コンテナ環境変数として渡すと `invalid_payload` で publish が失敗します。App Insights の接続文字列は
Foundry 側が自動で注入します。

## スキル

`skills/` 以下の `*/SKILL.md` が Copilot SDK に読み込まれます（`enable_skills=True`）。
ホスト側のスキル探索は**無効**のままにしてあります。エージェントが、たまたま同居していた
SKILL.md を勝手に取り込むべきではないからです。

スキルの取得と更新は `install_agent_skills.py` が行い、`skill_sync.py` が
`<prefix>_skill` テーブルへ書き出すので、評価アプリの「スキル」ページから
どのチームメイトが何を知っているか見えます。
