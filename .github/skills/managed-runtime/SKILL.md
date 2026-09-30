---
name: managed-runtime
description: "Microsoft Copilot Managed Runtime（Public Preview）のアプリを ms CLI と @microsoft/managed-apps SDK で作成する。リポジトリ方式（platform-managed Git / 自社 GitHub / 外部ビルド）を作成前に確定し、ローカル開発、コネクタ接続、preview、live デプロイ、共有、GitHub Actions による CI までを Microsoft Learn の手順どおりに進める。"
category: ui
triggers:
  - "Managed Runtime"
  - "Copilot Managed Runtime"
  - "マネージドランタイム"
  - "managed-apps"
  - "@microsoft/managed-apps"
  - "managed-apps-cli"
  - "ms app create"
  - "ms app dev"
  - "ms app deploy"
  - "ms app clone"
  - "ms.config.json"
  - "managedapps.cloud.microsoft"
  - "Copilot Code で作ったアプリ"
  - "Cowork で作ったアプリを引き継ぐ"
---

# Copilot Managed Runtime アプリ開発スキル

Microsoft Copilot Managed Runtime のアプリを、CLI（`@microsoft/managed-apps-cli`、コマンド `ms`）と
SDK（`@microsoft/managed-apps`）で最初から作る。手順は Microsoft Learn の
[CLI クイックスタート](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/quickstart-managed-apps-cli?view=o365-worldwide)
に沿う。

> [!CAUTION]
> **Public Preview。** API・テンプレート・ツールは GA までに変わる可能性がある。
> 本番利用はユーザーの明示承認がある場合に限り、SDK / CLI / Vite plugin の版を固定する。

## Code Apps との境界

| 要件 | 選ぶもの |
|---|---|
| GA 必須、Azure B2B ゲスト、Dataverse ソリューション / Power Platform Pipelines 中心、使う人のほとんどが Power Apps Premium を持つ | [`code-apps`](../code-apps/SKILL.md) |
| Microsoft 365 の社内業務アプリ、Git のコミット単位で preview / live / rollback、M365 管理センターで一元管理 | 本スキル |
| Power Apps Premium を持たない人が中心で利用が不定期。Copilot Credits の従量課金で払いたい | 本スキル |

`@microsoft/power-apps` を `@microsoft/managed-apps` に置き換えるだけの移行はしない。
判断材料は [比較リファレンス](../architecture/references/managed-runtime-vs-code-apps.md)。

## スクリプト

| スクリプト | 用途 |
|---|---|
| [scripts/check_prereqs.py](scripts/check_prereqs.py) | Node / Git / Git Credential Manager / Git identity / `ms` CLI / サインインの確認（Step 1） |
| [scripts/create_app.py](scripts/create_app.py) | リポジトリ方式を明示して `ms app create`。URL・作成先・GitHub リポジトリを事前検証（Step 4） |
| [scripts/validate_project.py](scripts/validate_project.py) | push / deploy 前ゲート。Code Apps 混在、SDK の版、`.env` 追跡、外部通信、共有接続の `allowedActions`、未 push を検出（Step 7・8） |

パラメータは [references/.env.example](references/.env.example) を参照し、実値は `.env` に置く。

## ワークフロー

### Step 0: Preview 利用とライセンスを確認する

AskUserQuestion で次を確認し、承認がなければ `code-apps` を提案して止まる。

1. Public Preview であること。
2. 使う人ごとの支払い方法。Power Apps Premium を持つ人はクレジットを消費しない。持たない人は
   Managed Application Copilot Credits で払う（起動ごとと API 呼び出しごと。API 呼び出しは 1 回 0.1 クレジット）。
   ローカル実行する開発者にも同じ要件がかかる。
3. クレジットで払う人がいる場合は、管理者が M365 管理センター → Copilot → Cost management で従量課金を有効にし、
   **使う人**を実行用の支出ポリシーに入れる。作るときの課金設定とは別。見積もり方は
   [比較リファレンスのライセンス節](../architecture/references/managed-runtime-vs-code-apps.md#6-ライセンスで使い分ける)。
4. アプリは組織内向け。組織内共有リンクはゲストに使えない。
5. 既定 CSP は外部通信を遮断する。外部 API はコネクタ経由で呼ぶ。

### Step 1: 開発前提を確認する

```powershell
python .github/skills/managed-runtime/scripts/check_prereqs.py --install-cli
```

`MANAGED_APPS_CLI_VERSION` の版を導入し、Node.js >= 24.11.0、Git >= 2.27.0、Git Credential Manager、
Git の `user.name` / `user.email` を確認する。NG が 1 つでもあれば解消してから進む。

### Step 2: サインインする

```powershell
ms auth login
python .github/skills/managed-runtime/scripts/check_prereqs.py --check-auth
```

`ms auth status` のアカウントが対象テナントであることを確認する。

### Step 3: リポジトリ方式を決める

**作成後は変更できない**ため、AskUserQuestion で確定してから作る。

| 選択肢 | `--repo-mode` | 選ぶ条件 |
|---|---|---|
| platform-managed Git（既定） | `platform` | 設定なしで始めたい。clone / push は通常の Git で行える |
| 自社 GitHub | `github` | PR レビュー・ブランチ保護を統制に使う。既存の**空の private** リポジトリを用意する |
| 外部ビルド | `none` | 自前の CI でビルドして配備する。管理者による外部成果物デプロイの許可が必要 |

`github` は GitHub.com / GitHub Enterprise Cloud（`*.ghe.com`）のみ。対象 organization に
GitHub App「Microsoft Managed Apps」を導入しておく。
Copilot Code・Cowork・Copilot Studio で作ったアプリとの関係は [repository-modes.md](references/repository-modes.md)。

### Step 4: アプリを作成する（または既存アプリを引き継ぐ）

新規作成は dry-run で検証してから実行する。

```powershell
python .github/skills/managed-runtime/scripts/create_app.py `
  --display-name "<表示名>" --dir ./<app-folder> --repo-mode platform --dry-run
python .github/skills/managed-runtime/scripts/create_app.py `
  --display-name "<表示名>" --dir ./<app-folder> --repo-mode platform
```

自社 GitHub は `--repo-mode github --repo-url https://github.com/<org>/<repo>` を付ける。
スクリプトは作成先が空か、アプリが入れ子にならないか、URL の形式、リポジトリが private かつ空かを
CLI 実行前に検証する。既存の Web プロジェクトを登録する場合は、そのフォルダーで
`ms app init --display-name "<表示名>" --repo native|none|<url>` を実行する。

既存アプリ（Copilot Cowork / Copilot Studio / 他の開発者が作成）を引き継ぐ場合:

```powershell
ms app list --permission edit
ms app clone --app <app-id> ./<app-folder>   # 自社 GitHub のアプリは git clone <repository-url>
```

### Step 5: ローカルで開発する

```powershell
Set-Location ./<app-folder>
npm install
ms app dev
```

`ms app dev` が唯一のローカル起動コマンド。表示された Local Play URL を、テナントにサインインしている
ブラウザー プロファイルで開く。まだ何もデプロイされていないことをユーザーに伝える。
UI は React + TypeScript で実装し、SDK はサブパス（`@microsoft/managed-apps/auth` など）から import する
（[sdk-usage.md](references/sdk-usage.md)）。

### Step 6: データソースを追加する

```powershell
ms connector list --search <語>
ms connector list-actions --connector <connector-id>
ms app add data-source --connector <connector-id> --as table --table <table>
```

1. `ms connector list` の DLP / ACP 状態で、使うコネクタと操作がブロックされていないことを確認する。
   特定の環境（`--environment-id`）に作った場合は、[admin スキル](../admin/SKILL.md) の環境チェックと DLP 事前チェックも実行する。
2. 追加後は `generated/` のサービスを import して呼ぶ。`fetch` / `axios` で直接呼ばない。
3. 追加後に `ms.config.json` を読み、`sharedConnectionId` が付いた共有接続があれば、
   画面の実装後に `allowedActions` を決めて宣言する（[sdk-usage.md](references/sdk-usage.md#共有接続の-allowedactions唯一の手編集)）。

### Step 7: 検証して push し、preview で確認する

```powershell
python .github/skills/managed-runtime/scripts/validate_project.py --project . --build
git add .
git commit -m "<変更内容>"
git push
ms app play --mode preview
```

NG が 0 件になってから push する。preview は push 済みの最新コミットをビルドして表示する。
ビルドに失敗したら `ms app build-status --show-log` で原因を確認し、直して push し直す。
preview URL は書き込み権限を持つ開発者だけが開ける。

### Step 8: live へデプロイする

```powershell
python .github/skills/managed-runtime/scripts/validate_project.py --project . --stage deploy
ms app deploy
ms app info
```

`--stage deploy` は未 commit・未 push と共有接続の `allowedActions` も NG にする。
ユーザーが preview を確認して承認してから `ms app deploy` を実行する。
戻すときは `ms app deploy --commit <sha>` で過去の成功ビルドを指定する。

### Step 9: 共有する

```powershell
ms app share <user-email>,<group-object-id> --access play
ms app share <developer-email> --access edit
```

利用者は `play`、共同開発者だけ `edit`。組織全体に配る場合は `ms app share link create`。
利用者は [managedapps.cloud.microsoft](https://managedapps.cloud.microsoft/) からアプリを開く。

### Step 10: CI を構成する（外部ビルド方式のみ）

`--repo-mode none` で作ったアプリは、テンプレートから GitHub Actions のワークフローを生成する。

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/managed-runtime/templates/github-actions-deploy `
  --target . --force --dry-run
```

サービス プリンシパルの権限とシークレットの登録は [github-actions.md](references/github-actions.md)。
platform / github 方式は Step 7・8 のプラットフォーム ビルドを使う。

## 出力

最後に次を報告する: アプリ名と App ID、プロジェクトのパス、リポジトリ方式と Git remote、
追加したコネクタ、`validate_project.py` の結果、preview / live URL（`ms app info`）、共有先。
実行していない手順（deploy・共有など）は「未実施」と書く。

## 参考

- [リポジトリ方式](references/repository-modes.md)
- [SDK とデータ接続](references/sdk-usage.md)
- [ms CLI 早見表](references/cli-reference.md)
- [GitHub Actions による外部成果物デプロイ](references/github-actions.md)
- [トラブルシュート](references/troubleshooting.md)
- [Code Apps との比較](../architecture/references/managed-runtime-vs-code-apps.md)
