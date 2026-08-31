# ライト実装（PoC）クイックスタート（参考）

> **このルートは正常系ではない。** Foundry ホスト方式を使う共有エージェント（bot への直接チャット）
> 専用で、**agentUser（同僚アイデンティティ）チャットは動かない**
> （→ [foundry-hosted-bot.md](foundry-hosted-bot.md)）。デジタルな同僚を作るなら
> [SKILL.md](../SKILL.md) の自己ホストフローを使う。

「まず Teams で動かして価値を検証する」ための最短ルート。
CI/CD・インスタンス化・シークレットストア連携を**あえて作らない**ことで、構成要素を最小に保つ。

## 前提

| 項目 | 値 |
|---|---|
| 公開形態 | 共有エージェント（`agenticUserTemplates` なし。全ユーザーが同じ 1 体を使う） |
| リポジトリ | 任意（ローカルのみでも可。private/public いずれでもよい） |
| シークレット | ローカル `.env` のみ（`SECRET_BACKEND=none`） |
| デプロイ | ローカルから手動実行 |
| 追加ツール | `a365` CLI は不要（Agent 365 ブループリントを作らないため） |

`.env` に最低限これだけを設定する。

```dotenv
IMPLEMENTATION_MODE=poc
SECRET_BACKEND=none
AGENT_NAME=your-agent
BLUEPRINT_ID=your-agent
AZURE_SUBSCRIPTION_ID=...
AZURE_RESOURCE_GROUP=...
AZURE_TENANT_ID=...
FOUNDRY_PROJECT_ENDPOINT=https://<account>.services.ai.azure.com/api/projects/<project>
```

> `A365_AGENT_BLUEPRINT_ID` は**設定しない**。未設定なら `build_teams_package.py` が
> 自動的に GA スキーマの共有エージェント用パッケージを生成する。

## 手順（Agent 365 ブループリントとインスタンス同意を省略）

> 事前確認の質問 1 で「テンプレート公開のみ」を選んだ場合はエージェント作成までで止め、
> 以下の Bot Service 作成（課金あり）を行わない。

```powershell
# Step 2: 最小 scaffold（.githooks/ と CI 定義は作らない）
Copy-Item .github/skills/ai-teammate/scripts -Destination scripts -Recurse
New-Item -ItemType Directory -Force agents/$env:AGENT_NAME, teams, assets | Out-Null
Copy-Item .github/skills/ai-teammate/references/templates/agent.template.yaml agents/$env:AGENT_NAME/
Copy-Item .github/skills/ai-teammate/references/templates/manifest.template.json teams/
Copy-Item .github/skills/ai-teammate/references/.env.example .env.example
pip install -r requirements.txt

# Step 3: .env を用意する（認証は standard の auth_helper キャッシュを利用）
Copy-Item .env.example .env    # 実値を記入

# Step 4: Foundry のマネージド ID ブループリント
python scripts/create_blueprint.py --name $env:BLUEPRINT_ID
python scripts/create_blueprint.py --name $env:BLUEPRINT_ID --show   # 出力値を .env へ

# Step 5: エージェントを作成 / 更新
python scripts/render.py --agent $env:AGENT_NAME
python scripts/create_instance.py --name $env:AGENT_NAME --mode blueprint --blueprint-id $env:BLUEPRINT_ID
python scripts/deploy.py --agent $env:AGENT_NAME   # 2 回目以降

# Step 7: Bot Service + Teams チャネル（Foundry ホスト）
az bot create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME `
  --app-type SingleTenant --appid $env:INSTANCE_IDENTITY_CLIENT_ID --tenant-id $env:AZURE_TENANT_ID `
  --endpoint "$env:FOUNDRY_PROJECT_ENDPOINT/agents/$env:AGENT_NAME/endpoint/protocols/activityprotocol?api-version=2025-11-15-preview" `
  --sku S1
az bot msteams create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME
# ※ この後 foundry-hosted-bot.md の BotServiceRbac PATCH が必須

# Step 10: Teams パッケージ（共有エージェント）
python scripts/build_teams_package.py

# Step 11: Graph API で公開（管理センターへの手動アップロード不要）
python scripts/publish_teams_app.py
```

## PoC でも省略しないこと

`.gitignore` だけは必ず配置する。CI が無くても**実値の混入は起きる**ため、
最低限これらを追跡対象から外す。

```gitignore
.env
agents/**/agent.yaml
teams/*.zip
a365.generated.config.json
.a365-auth.json
auth-token.json
*token-cache*
```

コミット前に一度だけ手で確認する（フックが無いので自動実行されない）。

```powershell
git status --short                      # .env / agent.yaml / *.zip が未追跡であること
python scripts/check_secrets.py --env .env
```

## 本格実装への昇格

PoC の成果物はそのまま流用できる。追加するのは**次の 3 つだけ**で、
エージェント定義・Teams パッケージ・スクリプトの作り直しは発生しない。

| 追加するもの | やること |
|---|---|
| ブループリント（SKILL.md Step 4） | `a365 setup blueprint` で Agent 365 ブループリントを作成し、`A365_AGENT_BLUEPRINT_ID` を `.env` へ。<br>`teams/agenticUser.template.json` を追加して再ビルド（`TEAMS_APP_VERSION` を上げる） |
| 自己ホスト（SKILL.md Step 5〜6） | agentUser チャットを動かすには自己ホストへ切り替える（Foundry ホストのままでは動かない） → [self-hosted-agent.md](self-hosted-agent.md) |
| CI/CD | private リポジトリへ移し、**`alm` スキル**の手順で `.githooks/pre-commit`・`alm.config.json`・CI 定義を配置する。<br>`SECRET_BACKEND` を `github` / `azure-devops` / `keyvault` に変更して `sanitize.py --set-secrets` を実行 → [`alm`](../../alm/SKILL.md) |

> 昇格時は共有エージェント → インスタンス化エージェントへ公開形態が変わるため、
> Teams 側で**アプリを入れ直す**必要がある（manifest の `manifestVersion` が GA → devPreview に変わる）。
