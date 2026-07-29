# CI / Git ホスティング別の構成

本格実装（本番運用）で使う。**資産の定義とスクリプトは Git ホスティングに依存しない**ため、
差し替えるのは「CI 定義」と「シークレット保管先」の 2 つだけ。
デプロイの実処理（`deploy.py` / `npm run deploy` など）は各プロダクトスキルが定義する。

| Git ホスティング | CI 定義の置き場 | シークレット保管先 | `SECRET_BACKEND` | 追加ツール |
|---|---|---|---|---|
| GitHub（private） | `.github/workflows/` | GitHub Actions Secrets | `github` | GitHub CLI（`gh`） |
| Azure DevOps Repos（private） | `.azuredevops/` | 変数グループ（Key Vault 連携可） | `azure-devops` | `az extension add --name azure-devops` |
| その他 Git（GitLab / Bitbucket / 自己ホスト） | 各 CI の規約に従う | Azure Key Vault | `keyvault` | Azure CLI のみ |

ホスティングに依存しない共通部品:

- `.githooks/pre-commit`（`sanitize.py` → `check_secrets.py`）
- `scripts/review_sanitization.py`（Git の追跡状態とテンプレートのみを見る）
- `scripts/gate_rules.py` / `scripts/review_report.py`（リポジトリ内のファイルのみを見る）
- `scripts/render.py`（環境変数だけを見る）

## 0. Code Apps 向けモジュール選択（Power Platform 単体 / Azure 連携）

Code Apps を `alm` に載せるときは、次の **モジュール（運用パターン）** から選ぶ。
どれを選んでも、秘匿化・汎用化・レビューゲートは共通で `alm` が提供する。

| モジュール | 想定パターン | デプロイ実処理 | 主なシークレット保管先 | 向いているケース |
|---|---|---|---|---|
| `pp-only` | Power Platform 単体（Azure リソース追加なし） | `npm run deploy`（PAC CLI） | GitHub Secrets / Azure DevOps 変数グループ | 最短で Code Apps ALM を開始したい |
| `pp-azure-gha` | Power Platform + Azure（GitHub Actions） | `npm run deploy` + `azure/login@v2`（OIDC） | GitHub Secrets + Key Vault（任意） | GitHub 中心で Azure 連携も必要 |
| `pp-azure-ado` | Power Platform + Azure（Azure DevOps） | `npm run deploy` + `AzureCLI@2`（WIF） | 変数グループ（Key Vault 連携可） | Azure DevOps の承認・監査を使いたい |

比較観点（Web 調査での採用指針）:

- シンプル運用重視なら Power Platform 単体パターン（`pp-only`）から開始し、後で Azure 連携を足す。
- 開発フローを GitHub に寄せるなら `pp-azure-gha`、Azure ガバナンスを強く使うなら `pp-azure-ado`。
- いずれも秘匿値の平文保管を避け、OIDC / WIF を優先する。

---

## 1. GitHub（private リポジトリ）

`.github/workflows/review.yml` は [repo-scaffold.md](repo-scaffold.md)、
ゲート連鎖付きの `deploy.yml` は [review-gates.md](review-gates.md) の内容をそのまま使う。
設定のポイントは 3 点。

1. `review.yml` の `sanitization-review` ジョブを**必須ステータスチェック**にする
   （Settings > Branches > Branch protection rules）。
2. `deploy.yml` に `environment: production` を付ける。
   有人運用なら Environment に**必須レビュアー**を設定し、自律運用なら設定しない。
3. Azure へのログインは OIDC（`azure/login@v2` + フェデレーション資格情報）を使い、
   クライアントシークレットを保管しない。

```powershell
python scripts/sanitize.py --env .env --set-secrets --secret-backend github --stage
# 別リポジトリへ送る場合
python scripts/sanitize.py --env .env --set-secrets --secret-backend github --repo <owner>/<repo>
```

---

## 2. Azure DevOps Repos（private リポジトリ）

### 2.1 事前準備

```powershell
az extension add --name azure-devops
az devops configure --defaults organization=$env:AZDO_ORG_URL project=$env:AZDO_PROJECT
az devops login   # または AZURE_DEVOPS_EXT_PAT 環境変数に PAT を設定

# シークレット同期先の変数グループを 1 度だけ作る（--authorize true でパイプラインから参照可能に）
az pipelines variable-group create --name alm-secrets --variables PLACEHOLDER=init --authorize true
```

出力された変数グループ ID を `.env` の `AZDO_VARIABLE_GROUP_ID` に設定する。

- **サービス接続**: Azure Resource Manager のサービス接続を
  **ワークロード ID フェデレーション**で作成する（シークレット不要）。名前を `AZDO_SERVICE_CONNECTION` に設定する。
  そのサービスプリンシパルにデプロイ先リソースへのロールを付与する（必要なロールはプロダクトスキルを参照）。
- **必須チェック**: リポジトリ > ブランチ > 既定ブランチ > ブランチ ポリシー >
  **ビルド検証**に review パイプラインを追加する（GitHub の必須ステータスチェックに相当）。
- **承認ゲート**: Pipelines > Environments > `production` > 承認とチェック に承認者を追加する。

### 2.2 `.azuredevops/azure-pipelines.yml`

```yaml
trigger:
  branches:
    include: [ main ]
  paths:
    include:
        - agents/*
        - scripts/*
        - requirements.txt
pr:
  branches:
    include: [ main ]

variables:
  - group: alm-secrets      # 変数グループ（秘匿値。Key Vault 連携も可）

pool:
  vmImage: ubuntu-latest

stages:
  - stage: review
    displayName: Sanitization / quality gate
    jobs:
      - job: gate
        steps:
          - task: UsePythonVersion@0
            inputs:
              versionSpec: '3.12'
          - script: python scripts/review_sanitization.py
            displayName: Sanitization / generalization gate
          - script: |
              pip install -r requirements.txt
              python scripts/gate_rules.py --gate quality --out .gate/quality.json
            displayName: Quality gate
            condition: succeeded()

  - stage: deploy
    displayName: Deploy a new version
    dependsOn: review
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/main'))
    jobs:
      - deployment: deploy
        environment: production      # 承認ゲート
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: UsePythonVersion@0
                  inputs:
                    versionSpec: '3.12'
                - script: pip install -r requirements.txt
                  displayName: Install dependencies
                - script: python scripts/render.py --template <template> --output <output>
                  displayName: Render the manifest
                - task: AzureCLI@2
                  displayName: Deploy
                  inputs:
                    azureSubscription: $(AZDO_SERVICE_CONNECTION)   # ワークロード ID フェデレーション
                    scriptType: bash
                    scriptLocation: inlineScript
                    # ↓ ここだけプロダクト固有。各プロダクトスキルの手順に差し替える。
                    inlineScript: python scripts/deploy.py
```

> レビューステージには自律レビューゲート連鎖を並べてもよい
> （[review-gates.md](review-gates.md) のルールを `gate_rules.py` で順に実行する）。
> 秘匿化ゲートはどの構成でも削除しない。

### 2.3 シークレット同期

```powershell
python scripts/sanitize.py --env .env --set-secrets --secret-backend azure-devops --stage
```

`.env` の `AZDO_ORG_URL` / `AZDO_PROJECT` / `AZDO_VARIABLE_GROUP_ID` を使って
変数グループの各変数を `--secret true` で更新する（存在しない変数は追加される）。

---

## 3. その他の Git ホスティング（GitLab / Bitbucket / 自己ホスト）

CI 定義は各サービスの規約に従い、**シークレットは Azure Key Vault に一元化**する。
CI ランナーはワークロード ID フェデレーション（または管理 ID）で Key Vault からのみ値を取得する。

```powershell
python scripts/sanitize.py --env .env --set-secrets --secret-backend keyvault --stage
```

- Key Vault のシークレット名は英数字とハイフンのみ。`sanitize.py` が
  `AZURE_TENANT_ID` → `AZURE-TENANT-ID` のように自動変換する。
- CI 側では取得した値を環境変数へ戻してから `render.py` / `deploy.py` を実行する。

```bash
# 例: 実行前に Key Vault から .env 相当を復元する
for name in AGENT-NAME AZURE-SUBSCRIPTION-ID FOUNDRY-PROJECT-ENDPOINT; do
  value=$(az keyvault secret show --vault-name "$AZURE_KEYVAULT_NAME" --name "$name" --query value -o tsv)
  export "${name//-/_}=$value"
done
python scripts/render.py --agent "$AGENT_NAME"
python scripts/deploy.py --agent "$AGENT_NAME"
```

パイプラインの最低条件は次の 3 つ。これを満たせばホスティングは問わない。

1. PR で `python scripts/review_sanitization.py` が実行され、失敗でマージがブロックされる。
2. 既定ブランチへのマージ後に**承認**を挟んでから `deploy.py` が動く。
3. 秘匿値がリポジトリではなくシークレットストアにのみ存在する。

---

## 4. private リポジトリを前提にする理由

エージェント定義（`agent.template.yaml` の `instructions`）は**業務知識そのもの**であり、
テンプレート化しても秘匿性が残る。`${VAR}` 化は「認証情報の漏洩防止」であって
「業務ロジックの公開可否」とは別問題のため、本格実装では常に private リポジトリを使う。
