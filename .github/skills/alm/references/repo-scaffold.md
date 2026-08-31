# リポジトリ scaffold

ALM を有効にするために配置するファイル一式。プロダクト固有の値はすべて `.env` から解決し、
パス構成は `alm.config.json` で宣言する。

| ファイル | ライト実装（PoC） | 本格実装 |
|---|---|---|
| `.gitignore` | 必須 | 必須 |
| `alm.config.json` | 任意（既定値で動く） | 推奨 |
| `.githooks/pre-commit` | 不要 | 必須 |
| CI 定義（GitHub Actions / Azure Pipelines / その他） | 不要 | 必須（→ [ci-providers.md](ci-providers.md)） |
| 自律レビューゲート（`gate_rules.py` + `.github/prompts/`） | 不要 | 推奨（→ [review-gates.md](review-gates.md)） |
| `.github/copilot-instructions.md`（レビュー観点） | 任意 | 推奨 |

## scripts/ の配置

```powershell
Copy-Item .github/skills/alm/scripts/*.py scripts/
Copy-Item .github/skills/alm/alm.config.example.json alm.config.json
```

プロダクトスキル側のスクリプト（`ai-teammate` の `deploy.py` など）も同じ `scripts/` に置く。

## requirements.txt

ALM スクリプトの依存は 1 つだけ。プロダクト固有の依存は各スキルが追加する。

```
PyYAML>=6.0
```

> バージョン制約を必ず書く（品質ゲート `Q5`）。

## .gitignore

```gitignore
# Environment / secrets
.env
*.env
!.env.example

# Rendered output (contains resolved secrets — never commit)
# alm.config.json の rendered と一致させる
agents/**/agent.yaml

# Build artifacts (contain resolved identifiers — never commit)
# alm.config.json の artifacts と一致させる
teams/*.zip
dist/

# Gate verdicts
.gate/

# Tool caches / tokens
.a365/
a365.config.json
a365.generated.config.json
auth-token.json
*token-cache*
*.token.json

# Python
.venv/
__pycache__/
*.pyc

# Node
node_modules/

# OS
.DS_Store
Thumbs.db
```

## .githooks/pre-commit

本格実装のみ。`git config core.hooksPath .githooks` で有効化する。
Git ホスティングには依存せず、送信先は `.env` の `SECRET_BACKEND` で切り替わる。

```sh
#!/bin/sh
set -e

# 1. 実値入りファイルを汎用化し、SECRET_BACKEND のストアへ同期してテンプレートをステージ
python scripts/sanitize.py --env .env --set-secrets --stage

# 2. ステージ済み差分に実値が残っていないか検査（残っていればコミット中止）
python scripts/check_secrets.py --env .env
```

## .github/workflows/review.yml（最小構成）

> Azure DevOps Repos / その他 Git ホスティングの定義は [ci-providers.md](ci-providers.md)。
> 自律レビューゲート連鎖を使う場合は [review-gates.md](review-gates.md) の構成に置き換える。

```yaml
# 秘匿化・汎用化の決定論ゲート。必須ステータスチェックに設定して merge をブロックする。
name: review

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  sanitization-review:
    name: Sanitization / generalization gate
    runs-on: ubuntu-latest
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Run the sanitization gate
        run: python scripts/review_sanitization.py
```

このジョブを**必須ステータスチェック**に設定する
（Settings > Branches > Branch protection rules）。

## .github/workflows/deploy.yml

デプロイ本体は [review-gates.md](review-gates.md) のゲート連鎖付き定義をベースにし、
`deploy` ジョブのステップだけをプロダクトスキルの手順へ差し替える。

- 認証は OIDC（`azure/login@v2` + フェデレーション資格情報）。クライアントシークレットを保管しない。
- `permissions:` を明示し、`contents: write` は `release` ジョブだけに与える。
- デプロイ後は GitHub Release にレビュー結果を記録する。

## .github/copilot-instructions.md（レビュー観点）

PR で Copilot コードレビューに秘匿化・汎用化を確認させる。決定論チェックの Pass を承認の前提にする。

```markdown
プルリクエストでは **秘匿化** と **汎用化** を最優先でレビューする。

1. 実値の非混入: 追跡ファイルにサブスクリプション ID / テナント ID / principal_id /
   client_id などの実 GUID、`/subscriptions/<guid>/...` の ARM パス、接続文字列、
   API キー、シークレットが含まれないこと。
2. 汎用化: `alm.config.json` の `templates` に該当するファイルは、
   環境依存値をすべて `${VAR}` プレースホルダー化していること。
3. 未コミット確認: `.env`、`rendered`・`artifacts` に該当する生成物が
   コミットされていないこと。
4. Secrets 整合: 新しい秘匿値には `.env.example` のプレースホルダーと
   シークレットストアの名前が対応していること。
5. 公開メタデータ: 外部に公開される名前・説明・URL に秘密情報が無いこと。
```
