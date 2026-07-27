# リポジトリ scaffold

Step 1 で配置するファイル一式。テーマ固有の値はすべて `.env` から解決する。

## requirements.txt

```
azure-ai-projects>=2.2.0
azure-identity>=1.19.0
PyYAML>=6.0
Pillow>=10.0
```

## .gitignore

```gitignore
# Environment / secrets
.env
*.env
!.env.example

# Rendered manifests (contain resolved secrets — never commit)
agents/**/agent.yaml

# Built Teams app packages (contain resolved identifiers — never commit)
teams/*.zip

# Agent 365 CLI (a365) — token caches, credentials and generated config
.a365/
a365.config.json
a365.generated.config.json
auth-token.json
*token-cache*
*.token.json
a365*.log

# Python
.venv/
__pycache__/
*.pyc

# OS
.DS_Store
Thumbs.db
```

## .githooks/pre-commit

`git config core.hooksPath .githooks` で有効化する。

```sh
#!/bin/sh
set -e

# 1. 実値入り manifest を汎用化し、GitHub Secrets へ同期してテンプレートをステージ
python scripts/sanitize.py --env .env --set-secrets --stage

# 2. ステージ済み差分に実値が残っていないか検査（残っていればコミット中止）
python scripts/check_secrets.py --env .env
```

## .github/workflows/review.yml

```yaml
name: review

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  sanitization-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Sanitization / generalization gate
        run: python scripts/review_sanitization.py
```

このジョブを**必須ステータスチェック**に設定して merge をブロックする。

## .github/workflows/deploy.yml

```yaml
name: deploy

on:
  push:
    branches: [main]
    paths:
      - 'agents/**'
      - 'scripts/render.py'
      - 'scripts/deploy.py'
      - 'requirements.txt'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy-agent
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production   # 承認ゲート
    env:
      AGENT_NAME: ${{ secrets.AGENT_NAME }}
      AZURE_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      AZURE_RESOURCE_GROUP: ${{ secrets.AZURE_RESOURCE_GROUP }}
      AZURE_AI_ACCOUNT: ${{ secrets.AZURE_AI_ACCOUNT }}
      AZURE_AI_PROJECT: ${{ secrets.AZURE_AI_PROJECT }}
      INSTANCE_IDENTITY_PRINCIPAL_ID: ${{ secrets.INSTANCE_IDENTITY_PRINCIPAL_ID }}
      INSTANCE_IDENTITY_CLIENT_ID: ${{ secrets.INSTANCE_IDENTITY_CLIENT_ID }}
      BLUEPRINT_PRINCIPAL_ID: ${{ secrets.BLUEPRINT_PRINCIPAL_ID }}
      BLUEPRINT_CLIENT_ID: ${{ secrets.BLUEPRINT_CLIENT_ID }}
      AGENT_GUID: ${{ secrets.AGENT_GUID }}
      FOUNDRY_PROJECT_ENDPOINT: ${{ secrets.FOUNDRY_PROJECT_ENDPOINT }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - name: Render agent manifest
        run: python scripts/render.py --agent "$AGENT_NAME"
      - uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
      - name: Create new agent version
        run: python scripts/deploy.py --agent "$AGENT_NAME"
```

`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` は OIDC 用アプリ登録（フェデレーション資格情報）。
そのアプリ登録に Foundry プロジェクトへのロール（Azure AI Developer / Cognitive Services User 等）を付与する。

## .github/copilot-instructions.md（レビュー観点）

PR で Copilot コードレビューに秘匿化・汎用化を確認させる。決定論チェック
`sanitization-review` の Pass を承認の前提にする。

```markdown
プルリクエストでは **秘匿化** と **汎用化** を最優先でレビューする。

1. 実値の非混入: 追跡ファイルにサブスクリプション ID / テナント ID / principal_id /
   client_id などの実 GUID、`/subscriptions/<guid>/...` の ARM パス、接続文字列、
   API キー、シークレットが含まれないこと。
2. 汎用化: `agents/**/agent.template.yaml` と `teams/*.template.json` は
   環境依存値をすべて `${VAR}` プレースホルダー化していること。
3. 未コミット確認: `.env`、`agents/**/agent.yaml`、`teams/*.zip`、
   `a365.generated.config.json` がコミットされていないこと。
4. Secrets 整合: 新しい秘匿値には `.env.example` のプレースホルダーと
   GitHub Secrets 名が対応していること。
5. 公開メタデータ: Teams / M365 に公開される名前・説明・URL に秘密情報が無いこと。
```
