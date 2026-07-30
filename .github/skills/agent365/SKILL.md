---
name: agent365
description: "Microsoft Foundry のエージェントを SDK/REST ベースで作成・バージョン管理し、Agent 365 のエージェント ID ブループリントと Teams アプリパッケージを介して Teams / Microsoft 365 Copilot に公開する。ライト実装（PoC）と本格実装（CI/CD + Agent Evals）の 2 ルートを選択でき、本格実装は GitHub / Azure DevOps Repos / その他 Git の private リポジトリに対応する。秘匿値は .env と CI のシークレットストアに隔離し、テンプレートの汎用化を CI で機械検証する。"
category: automation
triggers:
  - "Agent 365"
  - "a365"
  - "Foundry エージェント"
  - "Microsoft Foundry"
  - "エージェントを Teams に公開"
  - "custom engine agent"
  - "agentic user"
  - "Agent Identity Blueprint"
  - "エージェントテンプレート"
  - "AI 秘書エージェント"
  - "エージェントの PoC"
  - "ライト実装"
  - "本格実装"
  - "Azure DevOps Repos でエージェント"
---

# Foundry エージェント × Agent 365 公開スキル

Microsoft Foundry 上のエージェントを**コードファースト**（SDK / REST のみ、ポータル自動操作なし）で
定義・デプロイし、**Agent 365 のエージェント ID ブループリント**と Teams アプリパッケージを通じて
Teams / Microsoft 365 Copilot に公開するまでを一貫して行う。

| 原則 | 内容 |
|---|---|
| SDK / REST のみ | すべて `azure-ai-projects` SDK と Agent 365 CLI（`a365`）で完結。ポータルのブラウザ自動操作は行わない |
| ルート選択 | **ライト実装（PoC）**と**本格実装（本番運用）**を最初に選ぶ。PoC に CI/CD 一式を強制しない |
| テンプレート駆動 | コミットするのは `${VAR}` 入りテンプレートだけ。実値は `.env` / CI のシークレットストアのみ |
| Git ホスティング非依存 | 本格実装は GitHub / Azure DevOps Repos / その他 Git の **private リポジトリ**に対応（`GIT_PROVIDER` / `SECRET_BACKEND` で切り替え） |
| 機械検証 | 秘匿化・汎用化は `review_sanitization.py` が CI で Pass/Fail 判定。人手のレビューに依存しない |
| インスタンス化 | インストールごとに専用の Entra Agent ID を持たせるには Agent 365 ブループリント + `agenticUserTemplates` が必須 |
| 自動配信 | Foundry の「常に最新を使用」により、新バージョンは Teams / M365 Copilot へ自動配信される |

> 前提ツール: Python 3.10+、Azure CLI（`az`、ログイン済み）、Agent 365 CLI（`a365`）、Git。
> 本格実装では Git ホスティングに応じて GitHub CLI（`gh`）または Azure CLI の `azure-devops` 拡張を追加で使う。
> 参考: [アーキテクチャ（2 種類のブループリント）](references/architecture.md) /
> [ライト実装（PoC）クイックスタート](references/poc-quickstart.md) /
> [CI / Git ホスティング別の構成](references/ci-providers.md) /
> [Agent 365 CLI 運用](references/a365-cli.md) /
> [リポジトリ scaffold](references/repo-scaffold.md) /
> [異常系・トラブルシュート](references/troubleshooting.md)

## 実装ルートの選択（ライト / 本格）

`architecture` スキルの AskUserQuestion で選択済みならその結果に従う。未選択なら Step 0 で確認する。

| 観点 | ライト実装（PoC） | 本格実装（本番運用） |
|---|---|---|
| 目的 | まず Teams で動かして価値を検証する | 継続的に運用・改善する |
| 公開形態 | 共有エージェント（`agenticUserTemplates` なし） | インスタンス化（Agent 365 ブループリント + `agenticUserTemplates`） |
| リポジトリ | 任意（ローカルのみでも可） | **private リポジトリ必須**（GitHub / Azure DevOps Repos / その他 Git） |
| 秘匿値 | ローカル `.env` のみ（`SECRET_BACKEND=none`） | `.env` + CI のシークレットストア（`SECRET_BACKEND`） |
| デプロイ | ローカルから `deploy.py` を手動実行 | CI/CD（秘匿化ゲート + Agent Evals + 承認ゲート） |
| 実施する Step | 0 → 1 → 2 → 3 → 4 → 5 → 7 → 8 → 9 | Step 0 〜 11 のすべて |

> ライト実装は **Step 6（Agent 365 ブループリント）と Step 10（CI/CD）を省略**する最短ルート。
> 検証が済んだら**その 2 Step を後から追加するだけ**で本格実装へ昇格できる（作り直し不要）。
> 省略ルートの要約は [references/poc-quickstart.md](references/poc-quickstart.md)。

## スキル同梱スクリプト（再利用）

すべて汎用化済み。値は引数または `.env`（[references/.env.example](references/.env.example)）から取得する。

| スクリプト | 用途 | Step |
|---|---|---|
| [scripts/render.py](scripts/render.py) | テンプレートの `${VAR}` を環境変数で解決して実ファイルを生成 | 5 |
| [scripts/create_blueprint.py](scripts/create_blueprint.py) | Foundry のマネージド ID ブループリントを作成／一覧／表示（REST 直呼び） | 4 |
| [scripts/create_instance.py](scripts/create_instance.py) | manifest / definition / blueprint の 3 モードでエージェントを作成 | 5 |
| [scripts/deploy.py](scripts/deploy.py) | レンダリング済み manifest から新しいバージョンを `create_version` | 5, 10 |
| [scripts/build_teams_package.py](scripts/build_teams_package.py) | Teams manifest + アイコン + agenticUser を ZIP 化 | 8 |
| [scripts/sanitize.py](scripts/sanitize.py) | 実値入り manifest を `${VAR}` 化し CI のシークレットストア（GitHub / Azure DevOps / Key Vault）へ同期 | 10 |
| [scripts/check_secrets.py](scripts/check_secrets.py) | ステージ済み差分への実値混入を検査（pre-commit、Git ホスティング非依存） | 10 |
| [scripts/review_sanitization.py](scripts/review_sanitization.py) | 秘匿化・汎用化の決定論レビューゲート（CI 必須チェック、Git ホスティング非依存） | 10, 11 |

## 標準フォルダ構成（生成されるテーマ側）

```
<repo-root>/
├── .env                          # 実値（.gitignore 済み）
├── .env.example                  # プレースホルダーのみ（コミット対象）
├── .githooks/pre-commit          # 汎用化 → Secrets 同期 → 漏洩検査（本格実装）
├── <CI 定義>                     # 本格実装のみ。Git ホスティングに応じて選択（Step 0）
│   ├── .github/workflows/        #   GitHub  : review.yml / deploy.yml
│   └── .azuredevops/             #   Azure DevOps: azure-pipelines.yml / templates/
├── agents/<agent-name>/
│   ├── agent.template.yaml       # コミット対象（${VAR} 入り）
│   └── agent.yaml                # レンダリング結果（.gitignore 済み）
├── teams/
│   ├── manifest.template.json    # コミット対象
│   ├── agenticUser.template.json # コミット対象（インスタンス化時）
│   └── <agent-name>-teams-app.zip# ビルド結果（.gitignore 済み）
├── assets/agent-icon.png         # アイコン元画像（正方形・背景透過）
└── scripts/                      # 本スキルの scripts/ をコピー
```

> ライト実装では `.githooks/` と CI 定義を作らない（`.env` を `.gitignore` するだけでよい）。

## ワークフロー（正常系）

### Step 0: 実装レベルとリポジトリ形態を決める

1. **ライト実装（PoC）か本格実装か**を AskUserQuestion で確認する
   （`architecture` スキルで選択済みならその結果を使い、重複して聞かない）。
2. 本格実装なら **Git ホスティング**を確認し、CI とシークレット保管先を決める。
   エージェント定義は業務知識を含むため、**private リポジトリを前提**とする。

| Git ホスティング | CI | シークレット保管先 | `GIT_PROVIDER` | `SECRET_BACKEND` |
|---|---|---|---|---|
| GitHub（private） | GitHub Actions | GitHub Actions Secrets | `github` | `github` |
| Azure DevOps Repos（private） | Azure Pipelines | 変数グループ（Key Vault 連携可） | `azure-devops` | `azure-devops` |
| その他 Git（GitLab / Bitbucket / 自己ホスト） | 各 CI | Azure Key Vault | `other` | `keyvault` |
| ライト実装 | なし | ローカル `.env` のみ | （任意） | `none` |

3. 決めた値を `.env` の `IMPLEMENTATION_MODE` / `GIT_PROVIDER` / `SECRET_BACKEND` に設定する。
   → CI 定義の雛形と認証の差異は [references/ci-providers.md](references/ci-providers.md)。

### Step 1: 公開形態を決める

1. **共有エージェント**（全ユーザーが同じ 1 体を使う）か、
   **インスタンス化エージェント**（インストールごとに専用の Entra Agent ID を持つ）かを確認する。
   **ライト実装では常に共有エージェント**とし、Step 6 を省略する。
2. インスタンス化する場合のみ Agent 365 ブループリント（Step 6）と `agenticUserTemplates` が必要になる。
   → 詳細は [references/architecture.md](references/architecture.md)。
3. エージェント名（kebab-case、Teams 表示名とは別）を決める。
   エージェント名を3件 AskUserQuestion にて提案する。ここでのエージェント名は独自性のあるものとし、**商標・著作権に触れる名称やキャラクターを使用してはならない**。

### Step 2: リポジトリを scaffold する

[references/repo-scaffold.md](references/repo-scaffold.md) の内容をそのまま配置する。

```powershell
# 本スキルの scripts/ とテンプレートをテーマリポジトリへコピー
Copy-Item .github/skills/agent365/scripts -Destination scripts -Recurse
Copy-Item .github/skills/agent365/references/templates/agent.template.yaml agents/<agent-name>/
Copy-Item .github/skills/agent365/references/templates/manifest.template.json teams/
Copy-Item .github/skills/agent365/references/templates/agenticUser.template.json teams/
Copy-Item .github/skills/agent365/references/.env.example .env.example
git config core.hooksPath .githooks   # 本格実装のみ
pip install -r requirements.txt   # azure-ai-projects / azure-identity / PyYAML / Pillow
```

`.gitignore` には最低限 `.env` / `agents/**/agent.yaml` / `teams/*.zip` / `a365.generated.config.json`
/ `*token-cache*` を追加する（[references/repo-scaffold.md](references/repo-scaffold.md) に完全版）。
本格実装では Step 0 で選んだ Git ホスティングの CI 定義も配置する
（[references/ci-providers.md](references/ci-providers.md)）。**ライト実装では `.githooks/` と CI 定義を作らない**。

### Step 3: Foundry プロジェクトと `.env` を用意する

1. Foundry プロジェクトのエンドポイント（`https://<account>.services.ai.azure.com/api/projects/<project>`）を
   プロジェクト概要から取得する。
2. `.env.example` を `.env` にコピーし、実値を設定する。**`.env` は絶対にコミットしない**。
3. `az login` 済みであることを確認する（`DefaultAzureCredential` が使用する）。

```powershell
Copy-Item .env.example .env
az account set --subscription $env:AZURE_SUBSCRIPTION_ID
```

### Step 4: Foundry のマネージド ID ブループリントを作成する

エージェントのマネージド ID の設計図。**`lifecycle=Manual` で作れば複数エージェントから共有できる**
（エージェントが暗黙に作る `Auto` は所有者専用で共有不可）。

```powershell
python scripts/create_blueprint.py --name <blueprint-name>          # lifecycle=Manual
python scripts/create_blueprint.py --list
python scripts/create_blueprint.py --name <blueprint-name> --show
```

出力された `blueprintId` / `principalId` / `clientId` を `.env` の
`BLUEPRINT_ID` / `BLUEPRINT_PRINCIPAL_ID` / `BLUEPRINT_CLIENT_ID` に設定する。

### Step 5: エージェントを定義してデプロイする

1. `agents/<agent-name>/agent.template.yaml` の `definition`（`model` / `instructions` / `tools`）を編集する。
   ARM リソース参照は必ず `${AZURE_SUBSCRIPTION_ID}` 等のプレースホルダーで書く。
2. レンダリングしてデプロイする。

```powershell
python scripts/render.py --agent <agent-name>
python scripts/create_instance.py --name <agent-name> --mode blueprint --blueprint-id <blueprint-name>
# 2 回目以降のバージョン更新
python scripts/deploy.py --agent <agent-name>
```

| モード | SDK API | 用途 |
|---|---|---|
| `manifest` | `agents.create_version_from_manifest` | 公開済みテンプレート ID + パラメーター値で作成 |
| `definition` | `agents.create_version` | テンプレート定義を複製して独立エージェント化 |
| `blueprint` | `agents.create_version(blueprint_reference=...)` | ブループリント共有（`lifecycle=Manual` 必須） |

作成後、`INSTANCE_IDENTITY_PRINCIPAL_ID` / `INSTANCE_IDENTITY_CLIENT_ID` / `AGENT_GUID` を `.env` へ反映する。

### Step 6: Agent 365 のエージェント ID ブループリントを作成する

インストールごとの専用 Entra Agent ID が必要な場合のみ実施する（Step 1 の判断）。
**ライト実装ではこの Step を飛ばす**（共有エージェントとして公開する）。
**Foundry のブループリントとは別物**なので混同しない。

```powershell
a365 setup blueprint -n <agent-name> --no-endpoint
```

- 生成された `a365.generated.config.json` の `agentBlueprintId` を `.env` の
  `A365_AGENT_BLUEPRINT_ID` に設定する（このファイル自体は `.gitignore` 済み）。
- 実行のたびに**クライアントシークレットが平文で標準出力される**。ログに残さない。
- 初回はディレクトリ伝播の遅延で失敗することがあるが、**同じコマンドを再実行すれば冪等に修復される**。
- Windows での認証（WAM）まわりのハマりどころは [references/a365-cli.md](references/a365-cli.md)。

### Step 7: Azure Bot Service と Teams チャネルを作成する

Bot の `msaAppId` には**エージェントのインスタンス ID の client id** を使う。

```powershell
az bot create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME `
  --app-type SingleTenant --appid $env:INSTANCE_IDENTITY_CLIENT_ID --tenant-id $env:AZURE_TENANT_ID `
  --endpoint "$env:FOUNDRY_PROJECT_ENDPOINT/agents/$env:AGENT_NAME/endpoint/protocols/activityprotocol?api-version=2025-11-15-preview" `
  --sku S1
az bot msteams create --resource-group $env:AZURE_RESOURCE_GROUP --name $env:AZURE_BOT_NAME
```

### Step 8: Teams アプリパッケージをビルドする

```powershell
python scripts/build_teams_package.py
```

- `assets/agent-icon.png` から `color.png`（192x192）と `outline.png`（32x32・白シルエット）を自動生成する。
  元画像は**アルファチャンネル付きの正方形 PNG**にする（背景が不透明だと outline が塗り潰しになる）。
- `A365_AGENT_BLUEPRINT_ID` が設定されていれば `agenticUser.json` を同梱し、
  `manifestVersion: devPreview` のインスタンス化パッケージを生成する。
  未設定なら GA スキーマ（1.22）の**共有エージェント**パッケージに自動ダウングレードして警告を出す。
- **再アップロードのたびに `.env` の `TEAMS_APP_VERSION` を上げる**（同一バージョンはアップロード時に拒否される）。

### Step 9: アップロードして公開する

1. Microsoft 365 管理センター（Agent 365 の Agents 画面）または Teams 管理センター >
   アプリを管理 > アップロード で、生成された ZIP を登録する。
2. 組織向けのアクセス許可・公開範囲を設定する。
3. Teams でエージェントを開き、利用者ごとのセッション（インスタンス）が開始されることを確認する。

> **ライト実装はここで完了**。以降の Step 10 は本格実装のみ実施する。
> ライト実装のまま運用する場合も、`.env` をコミットしていないことを Step 11 で必ず確認する。

### Step 10: CI/CD と秘匿化ゲートを有効化する（本格実装のみ）

Git ホスティングに依存しない共通部分と、ホスティング別の定義を分けて考える。

1. **pre-commit（共通）**: `sanitize.py`（実値 → `${VAR}` 化 + シークレット同期 + ステージ）→
   `check_secrets.py`（ステージ差分の漏洩検査）を実行する。どちらも Git ホスティングに依存しない。
2. **秘匿化ゲート（共通）**: PR と既定ブランチで `review_sanitization.py` を実行し、**必須チェック**にする
   （GitHub: 必須ステータスチェック / Azure DevOps: ブランチポリシーのビルド検証）。
3. **品質ゲート（共通）**: Agent Evals を実行し、合格した場合のみデプロイに進む。
4. **デプロイ（ホスティング別）**: 既定ブランチへのマージで `render.py` → Azure へ OIDC / ワークロード ID ログイン
   → `deploy.py`。承認ゲート（GitHub: `environment` / Azure DevOps: Environment の承認）を付ける。
5. **シークレット同期**: `SECRET_BACKEND` に応じて `sanitize.py --set-secrets` の送信先が切り替わる。

```powershell
# GitHub Actions Secrets へ同期
python scripts/sanitize.py --env .env --set-secrets --secret-backend github --stage
# Azure DevOps の変数グループへ同期
python scripts/sanitize.py --env .env --set-secrets --secret-backend azure-devops --stage
# Azure Key Vault へ同期（その他 Git ホスティング）
python scripts/sanitize.py --env .env --set-secrets --secret-backend keyvault --stage
```

CI 定義の雛形と認証・必須チェック設定の差異は [references/ci-providers.md](references/ci-providers.md) を参照する。

```mermaid
flowchart TD
    A[ローカル編集] --> B[git commit]
    B -->|pre-commit| C[汎用化 + シークレット同期 + 漏洩検査]
    C --> D[PR]
    D --> E[sanitization-review]
    E --> F[Agent Evals]
    F -->|Pass| G[既定ブランチへマージ]
    G --> H[CI: 承認後に create_version]
    H --> I[常に最新を使用 → Teams / M365 Copilot へ自動配信]
```

### Step 11: 検証する

```powershell
python scripts/review_sanitization.py       # Pass であること
python scripts/create_blueprint.py --list   # ブループリントの存在確認
git status --short                          # .env / agent.yaml / *.zip が未追跡であること
```

[検証チェックリスト](#検証チェックリスト) を上から確認する。

## 検証チェックリスト

### 共通（ライト実装も必須）

- [ ] Step 0 で**ライト実装 / 本格実装**を確定し、`.env` の `IMPLEMENTATION_MODE` に反映した
- [ ] `.env` / `agents/**/agent.yaml` / `teams/*.zip` / `a365.generated.config.json` が追跡されていない
- [ ] `agent.template.yaml` / `*.template.json` に実 GUID・ARM パス・接続文字列が無い（`${VAR}` 化済み）
- [ ] `.env.example` にすべての変数がプレースホルダー付きで定義されている
- [ ] `AGENT_NAME` / `BLUEPRINT_ID` 等の公開識別子が `NON_SECRET_VARS` に入っている
- [ ] Foundry ブループリントと Agent 365 ブループリントを取り違えていない
- [ ] Teams 再アップロード前に `TEAMS_APP_VERSION` を上げた
- [ ] アイコン元画像がアルファチャンネル付きの正方形 PNG
- [ ] Teams / M365 Copilot での動作確認が済んでいる

### 本格実装のみ

- [ ] private リポジトリで運用している（GitHub / Azure DevOps Repos / その他 Git）
- [ ] `GIT_PROVIDER` / `SECRET_BACKEND` が Step 0 の選択と一致している
- [ ] インスタンス化する場合、manifest に `agenticUserTemplates` と `functionsAs: agenticUserOnly` がある
- [ ] `review_sanitization.py` が Pass、必須チェックに登録されている
- [ ] Agent Evals が CI に組み込まれ、合格時のみデプロイされる
- [ ] デプロイに承認ゲートがある

## 参考リンク

- [ライト実装（PoC）クイックスタート](references/poc-quickstart.md)
- [CI / Git ホスティング別の構成（GitHub / Azure DevOps / その他）](references/ci-providers.md)
- [アーキテクチャ（2 種類のブループリント・スキーマ選択）](references/architecture.md)
- [Agent 365 CLI 運用（Windows / WAM / 権限）](references/a365-cli.md)
- [リポジトリ scaffold（.gitignore / hook / CI）](references/repo-scaffold.md)
- [異常系・トラブルシュート](references/troubleshooting.md)
- [環境変数サンプル](references/.env.example)
