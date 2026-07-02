# AI ファースト開発標準

Power Apps Code Apps, モデル駆動型アプリ, Generative page, Dataverse, Power Automate, Power Pages, Copilot Studio, Azure サービス、Cowork プラグインを **VS Code + GitHub Copilot / Claude Code** で開発するための、実践的な AI ファースト開発標準リポジトリです。
実装標準は **TypeScript + React + Tailwind CSS + shadcn/ui**（Code Apps）を前提にしています。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

📺 [使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

---

## クイックスタート

VS Code + GitHub Copilot が使える状態（[前提条件](#前提条件をまだ準備していない場合)を参照）であれば、次の 1 コマンドと 1 依頼だけで開発を始められます。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github && cp .github/skills/standard/references/gitignore-template .gitignore
```

上記実行後、GitHub Copilot / Claude Code のチャットで **`@GeekPowerCode`** を呼び出し、作りたいテーマを伝えるだけです。プロジェクト一式（Vite + React + Tailwind CSS + shadcn/ui）の scaffold からデザイン選定・Dataverse 接続・デプロイまでをエージェントがガイドします。

> [!NOTE]
> `.gitignore` がないと `node_modules/`・`dist/`・`.power/`・`.env` 等がコミット対象になります。必ずコピーしてください。

チーム開発でリモートリポジトリを最初から使いたい場合は [チーム開発向けの手順](#チーム開発向けの手順) を、既存仕様書がある場合は `/spec-to-markdown` を利用してください。

---

## 目次

- [クイックスタート](#クイックスタート)
- [前提条件](#前提条件)
  - [VS Code + GitHub Copilot](#vs-code--github-copilot)
  - [ライセンス要件](#ライセンス要件)
  - [Power Platform 環境](#power-platform-環境)
  - [前提条件をまだ準備していない場合](#前提条件をまだ準備していない場合)
- [管理者権限（管理者ロール）要件](#管理者権限管理者ロール要件)
- [チーム開発向けの手順](#チーム開発向けの手順)
- [上流の開発標準更新を取り込む](#上流の開発標準更新を取り込む)
- [環境チェック](#環境チェック)
- [カスタムエージェント前提の利用方法](#カスタムエージェント前提の利用方法)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot / Claude Code 活用](#github-copilot--claude-code-活用)
- [ライセンス](#ライセンス)
- [フィードバック](#フィードバック)

---

## 前提条件

### VS Code + GitHub Copilot

VS Code をインストールすると **GitHub Copilot 拡張機能は最初から同梱**されています。別途 Extensions からインストールする必要はありません。GitHub アカウントでサインインするだけで利用できます（Copilot のサブスクリプションが必要、詳細は次項）。

### ライセンス要件

| 対象 | 必要なライセンス / 前提 | 出典 |
|---|---|---|
| GitHub Copilot（VS Code / Claude Code でのエージェント開発） | **GitHub Copilot Pro 以上**（Pro / Pro+ / Business / Enterprise） | [GitHub Copilot のプラン](https://github.com/features/copilot/plans) |
| Code Apps（コードファースト開発） | **Power Apps Premium** または **Dynamics 365 Enterprise / Customer Engagement**。無料利用は **Power Apps 開発者プランの開発者環境**（学習・プロトタイピングのみ。本番利用不可） | [Power Apps Developer Plan](https://learn.microsoft.com/ja-jp/power-platform/developer/plan) |
| Cowork プラグインの開発 | **Microsoft 365 Copilot** ライセンスに加えて、**Azure サブスクリプションの準備**、**Copilot Credits の有効化**、**テナントでの有効化（Frontier 参加を含む）** が必要 | [Build plugins for Cowork (Frontier)](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)、[Copilot Credits の従量課金とコスト管理](https://learn.microsoft.com/en-us/microsoft-365/copilot/usage-based-billing-overview-copilot-credits)、[Frontier プログラムの概要](https://learn.microsoft.com/ja-jp/microsoft-365/copilot/frontier/frontier-program-overview) |
| Copilot Studio の利用 | **Microsoft 365 Copilot** ライセンスに加えて、**Azure サブスクリプション**・**リソース グループ**の準備と、**Copilot Credits の環境割り当て** が必要 | [Copilot Studio の課金とライセンス](https://learn.microsoft.com/en-us/microsoft-copilot-studio/billing-licensing)、[Copilot Studio credits と容量の管理](https://learn.microsoft.com/en-us/power-platform/admin/manage-copilot-studio-messages-capacity) |

### Power Platform 環境

> [!CAUTION]
> **デフォルト環境（Default）では開発しないでください。** 組織全員が参照できる共有環境のため、テーブルやソリューションが意図せず他ユーザーに見えます。必ず専用の **Developer 環境** または **Sandbox 環境** を用意してください。

Code Apps は環境ごとに初期状態で無効です。有効化手順:

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **環境** > 対象の環境を選択 > **設定** > **製品** > **機能**
3. **Power Apps コード アプリ** をオンにして保存

詳細: [Code Apps 公式ドキュメント（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/overview)

### 前提条件をまだ準備していない場合

<details>
<summary><strong>VS Code / Git / Node.js / pac CLI が未導入の方はここを開いて環境準備プロンプトを実行してください（所要 5 分）</strong></summary>

| ステップ | 操作 |
|---|---|
| 1. VS Code をインストール | [https://code.visualstudio.com/](https://code.visualstudio.com/) からダウンロード → インストール |
| 2. GitHub アカウントでサインイン | 左下のアカウントアイコン → GitHub でサインイン（GitHub Copilot 拡張は同梱済みのためインストール不要、サブスクリプションのみ必要） |
| 3. Copilot チャットを開く | `Ctrl+Alt+I`（Mac: `⌃⌘I`）または左サイドバーのチャットアイコンをクリック |

チャットが開いたら、以下のプロンプトをそのまま貼り付けて送信してください。**リポジトリの clone や `npm install` はこの段階では行いません。**

```text
Windows 端末の開発環境準備（開発ツールの導入と動作確認まで）を実行してください。
リポジトリの clone や npm install は行いません。完了したらクイックスタートに進む案内をしてください。

要件:
1. PowerShell 7 を最優先で導入し、以後の作業は PowerShell 7 で確認する。
2. Git / Node.js LTS / Python 3.12 を導入する。
3. Power Platform は PP CLI のみ導入する（VS Code 拡張は入れない）。
4. PATH 未反映の可能性を考慮し、実体パス確認と PATH 反映を行う。
5. `gh auth status` で GitHub CLI のログイン状態を確認する（未ログインなら `gh auth login` を案内）。
6. リポジトリの fork / clone / `npm install` は実行しない。次のステップとしてクイックスタートへ案内する。

検証コマンド:
- $PSVersionTable.PSVersion
- git --version
- node --version
- npm --version
- python --version
- py --version
- pac help  （ヘッダの Version を確認）
- where.exe pac
- gh --version
- gh auth status

実施ルール:
- 長いワンライナーは避け、一時的な `.ps1` ファイルに処理を書いて PS7 で実行する。
- PS7 への初回切り替えは `pwsh` が未解決でも進められるよう、`C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\pwsh.exe` の実体パス実行を優先する。
- VS Code CLI など PATH 未反映の可能性があるコマンドは実体パス呼び出しを優先する。
- 最終検証は「PS7 セッション」と「作業開始時の既存セッション」の両方で確認する。
- 実行結果は「導入済み」「要再起動」「PATH 反映待ち」を分けて報告する。
- 最後のユーザー向けコメントには以下を含める:
  - 「環境準備 OK（ツール導入と動作確認まで完了）」の明示
  - 次のアクションとして README の「クイックスタート」を実行してローカルに clone することを案内
  - クイックスタートはリモートに fork せず、本リポジトリをローカルに直接 clone する方針である旨を補足
  - クイックスタート完了後は、VS Code の Copilot チャット（`Ctrl+Alt+I`）を開き、入力欄に `@GeekPowerCode` と入力してカスタムエージェントを選択し、作りたいテーマを伝えて開発開始すること
  - 可能なら現在ディレクトリ名からテーマ候補を推測し、推奨プロンプトを 1 つ提案すること
```

> [!TIP]
> `pac --version` は無効なため、バージョン確認は `pac help` のヘッダ表示を利用します。

完了したら [クイックスタート](#クイックスタート) に戻ってください。

</details>

---

## 管理者権限（管理者ロール）要件

開発者本人の権限だけでは完結せず、**テナント/環境の管理者**（またはその権限を持つ人）による事前設定が必要な操作があります。特に Cowork プラグイン開発（[cowork スキル](.github/skills/cowork/SKILL.md)）は複数の管理コンソールをまたぐため、事前に必要ロールを確認し、管理者へ依頼してください。

| # | 操作 | 実施場所 | 必要な最小ロール | 出典 |
|---|---|---|---|---|
| 1 | **Code Apps の環境有効化**（`設定 > 製品 > 機能` で「コード アプリを許可する」をオン） | Power Platform 管理センター（環境設定） | 環境の **Environment Admin**（テナント全体で行う場合は **Power Platform Administrator**） | [Power Platform 管理者ロールについて](https://learn.microsoft.com/ja-jp/power-platform/admin/about-administration-overview)、[環境の分離とランドスケープ](https://learn.microsoft.com/ja-jp/power-platform/admin/environments-separation-landscape) |
| 2 | **Cowork を MCP クライアントとして許可**（`allowedmcpclients` テーブルで Microsoft Cowork を有効化） | Power Platform 管理センター／Dataverse（環境） | 対象環境の Dataverse **System Administrator** セキュリティロール | [Dataverse のセキュリティモデル](https://learn.microsoft.com/ja-jp/power-platform/admin/wp-security-cloud-flows)、`.github/skills/standard/references/dataverse-mcp-setup.md`（前提条件1「環境管理者の操作」） |
| 3 | **Entra ID への App Registration 作成**（Cowork 用 OAuth クライアント） | Microsoft Entra 管理センター | **Application Administrator** または **Cloud Application Administrator**（テナント設定で一般ユーザー登録が許可されていれば不要な場合あり） | [Microsoft Entra ロールの権限リファレンス（Application Administrator）](https://learn.microsoft.com/ja-jp/entra/identity/role-based-access-control/permissions-reference#application-administrator) |
| 4 | **API 権限（`Application.ReadWrite.All` 等）の管理者同意** | Microsoft Entra 管理センター（アプリ > API のアクセス許可） | **Global Administrator** または **Privileged Role Administrator**（Cloud Application Administrator は高権限パーミッションの同意不可） | [テナント全体の管理者同意を付与する](https://learn.microsoft.com/ja-jp/entra/identity/enterprise-apps/grant-admin-consent) — `.github/skills/cowork/references/troubleshooting.md` #16 でも同事象を確認 |
| 5 | **Teams 開発者ポータルでの OAuth client registration**（`dev.teams.microsoft.com/tools`） | Teams 開発者ポータル | Entra の **「ユーザーはアプリケーションを登録できる」設定が有効**、無効化されている場合は **Application Administrator** 等の Entra 管理者ロール | [既定のユーザー権限（アプリの登録）](https://learn.microsoft.com/ja-jp/entra/fundamentals/users-default-permissions#restrict-member-users-default-permissions) |
| 6 | **Teams でのカスタムアプリのサイドロード許可**（アップロードした Cowork プラグインを Teams 経由で直接インストールする「迂回」導線を使う場合） | Teams 管理センター（Teams アプリ > アクセス許可ポリシー） | **Teams Administrator**（または Global Administrator） | [Teams のアプリ許可ポリシーを管理する](https://learn.microsoft.com/ja-jp/microsoftteams/teams-app-permission-policies) |
| 7 | **M365 管理センターでのプラグインアップロード・公開**（`admin.cloud.microsoft` の「エージェント」画面） | Microsoft 365 管理センター | **Global Administrator**（Cloud Application Administrator など一部ロールでは統合アプリ/エージェントのアップロードが制限される場合あり） | [Microsoft 365 の統合アプリの追加と管理](https://learn.microsoft.com/ja-jp/microsoft-365/admin/add-users/about-integrated-apps) |
| 8 | **Frontier プログラムへのテナント参加**（Cowork 利用の前提） | Microsoft 365 管理センター | **Global Administrator** | [Frontier プログラムの概要](https://learn.microsoft.com/ja-jp/microsoft-365/copilot/frontier/frontier-program-overview) |

> [!NOTE]
> 上記のうち **#3・#4（Entra App Registration と管理者同意）は一度きり**（テナントで1回）、**#2（allowedmcpclients）は環境ごとに1回**の設定です。開発者自身がいずれのロールも持たない場合は、事前に管理者へ依頼し、[cowork スキルの Step 3〜4](.github/skills/cowork/SKILL.md) を実行できる状態にしてから着手してください。
>
> **ロール名は目安です。** 実際に付与すべき最小権限は組織のセキュリティ方針により異なる場合があるため、上記の出典（Microsoft Learn）を必ず確認し、テナント管理者と合意のうえで進めてください。

---

## チーム開発向けの手順

<details>
<summary>最初からチーム用の private リポジトリを作りたい場合はここを開いてください</summary>

```bash
# 1. GitHub 上で空の private リポジトリを作成してクローン
gh repo create <your-account>/<your-theme-repo> --private --clone && cd <your-theme-repo>

# 2. エージェント・スキルと .gitignore を取得
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github && \
cp .github/skills/standard/references/gitignore-template .gitignore

# 3. @GeekPowerCode にプロジェクト scaffold を依頼
```

> [!TIP]
> GitHub Copilot, Claude Code などに上記 bash をプロンプトとして入れることで対話型で進めることもできます。
>
> Azure DevOps / 社内 Git / ローカル NAS など GitHub 以外のリモートを使う場合も、同じ手順で `git remote add origin <url>` を実行すれば、GitHub には何も公開せずに済みます。

</details>

---

## 上流の開発標準更新を取り込む

git merge は不要です。テーマのリポジトリで以下を再実行するだけで、最新の標準（`.github/` のエージェント・スキル）に追従できます。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github --force
```

> [!TIP]
> 同期対象は `.github/` のみで、テーマ固有のコード（`src/` 等）には触れません。同期後は `git diff` で差分を確認してからコミットしてください。

---

## 環境チェック

```bash
npm run check:env   # Node.js / Python / pac 等の確認のみ
npm run setup       # 上記 + Python venv bootstrap
```

<details>
<summary>詳細・不足時の対応</summary>

`npm run setup` で **環境事前チェック (preflight) + Python bootstrap** をまとめて実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。`gh` が利用可能かつ `gh auth login` 済みの場合は、デフォルトブランチの **Copilot 承認バイパス設定**（Branch protection の bypass app）も確認します。

Python と pip が利用可能な場合は、`spec-to-markdown` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。

不足時の対応:

- Python 未検出: Python 3.10+ を導入して `python --version` または `py -3 --version` を通す
- pip 未検出: `python -m ensurepip --upgrade`（または `py -3 -m ensurepip --upgrade`）
- `pac` 未検出: `npm install -g @microsoft/power-apps-cli` 後、`pac auth create --environment {ENVIRONMENT_ID}`
- `npx power-apps` 未検出: `npm install` を再実行し `@microsoft/power-apps` 依存を確認

</details>

---

## カスタムエージェント前提の利用方法

- この開発標準の実装・運用ルールは、GitHub Copilot / Claude Code で共通利用するスキル（`.github/skills/`）に定義されています。
- 利用者は手順書を読み込んで操作するのではなく、カスタムエージェントに要件を伝えて進める前提です。
- 依頼例: GeekPowerCode エージェントを選択して `在庫管理をもっと効率的に行いたい。`
- 既存仕様書がある場合の入力例: `spec-to-markdown を実行して`

---

## リポジトリ構成

<details>
<summary>ディレクトリツリーを表示</summary>

```text
.
├── .github/
│   ├── agents/                      # Copilot カスタムエージェント定義
│   └── skills/                      # 製品単位で統合された 11 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
│       ├── dataverse/               # テーブル設計・構築・セキュリティロール
│       ├── code-apps/               # Code Apps 開発（UI 設計・CSP・メール送信含む）
│       ├── power-pages/             # Power Pages コードサイト開発・デプロイ
│       ├── generative-page/         # Generative Pages 開発
│       ├── model-driven-app/        # モデル駆動型アプリ構築
│       ├── copilot-studio/          # エージェント構築・トリガー・ニュース配信
│       ├── power-automate/          # クラウドフロー作成・デプロイ
│       ├── ai-builder/              # AI プロンプト作成
│       ├── spec-to-markdown/        # 仕様書→要件 markdown 変換
│       │
│       │   # スキルが所有するアセットはそのスキル配下に置く（例）:
│       ├── standard/scripts/auth_helper.py              # MSAL 認証ヘルパー
│       ├── code-apps/references/patch-nameutils.cjs     # 日本語 DisplayName パッチ
│       ├── code-apps/references/maps/                   # 日本地図 SVG
│       └── */samples/                                   # リファレンス実装（同期対象外）
├── .claude/
│   └── agents/                      # Claude Code カスタムエージェント定義
├── .env.example                     # 環境変数テンプレート
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

> **root には慣習的なリポ直下ファイル（README / .env.example / .gitignore / package.json / LICENSE）だけを置く。**
> 認証ヘルパー・日本語パッチ・地図 SVG など「特定スキルが所有するアセット」はそのスキル配下に置き、`.github/` 同期でテーマに配布する。
> 環境セットアップ（bootstrap.mjs）は `standard/scripts/`、デプロイ前チェック（pre-deploy-check.mjs）は `code-apps/scripts/` に配置。
> アプリの実装（`src/` / `vite.config.ts` 等）は本リポジトリには置かない（リファレンス実装は各スキルの `samples/`）。
> 新規テーマの scaffold は **@GeekPowerCode** がサンプルを参照して生成する。

</details>

このリポジトリは開発標準（スキル・リファレンス）の供給元です。新しいテーマは `npx degit` で `.github/`（エージェント・スキル）を取得し、**@GeekPowerCode** にプロジェクト全体の scaffold を依頼して開発を開始します。

---

## 主要ドキュメント

- [.github/skills/standard/references/power-platform-development-standard.md](./.github/skills/standard/references/power-platform-development-standard.md)
- [.github/skills/dataverse/references/dataverse-guide.md](./.github/skills/dataverse/references/dataverse-guide.md)
- [.github/skills/code-apps/references/connector-reference.md](./.github/skills/code-apps/references/connector-reference.md)
- [.github/skills/code-apps/references/advanced-patterns.md](./.github/skills/code-apps/references/advanced-patterns.md)
- [サンプル実装一覧（.github/skills/README.md）](./.github/skills/README.md#サンプル実装一覧)

---

## GitHub Copilot / Claude Code 活用

- GitHub Copilot では `.github/agents/` と `.github/skills/` が認識されます
- Claude Code では `.claude/agents/` を利用して同じスキル群（`.github/skills/`）を参照できます
- `GeekPowerCode` に実現したい内容を伝えるだけで、必要なスキルが選択されて開発タスクを進められます
- このリポジトリの開発標準はスキルとして定義済みのため、マニュアル手順ベースではなくエージェント駆動で利用します

スキルの一覧・説明・推奨開発フローは **[スキルカタログ（.github/skills/README.md）](.github/skills/README.md)** で一元管理しています。スキルの追加・変更時はそちらを更新してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

### ライセンスガイド

製品のライセンス要件を調べる際は以下の公式ガイドを参照してください。

| ガイド | リンク |
|---|---|
| Power Platform ライセンスガイド（英語） | [aka.ms/PPLic](https://aka.ms/PPLic) |
| Power Platform ライセンスガイド（日本語） | [aka.ms/PPLicJP](https://aka.ms/PPLicJP) |
| Microsoft Copilot Studio ライセンスガイド（英語） | [aka.ms/MCSLic](https://aka.ms/MCSLic) |
| Microsoft Copilot Studio ライセンスガイド（日本語） | [aka.ms/MCSLicJP](https://aka.ms/MCSLicJP) |
| Copilot Credits ライセンスガイド | [aka.ms/CopilotCredirsLicensingGuide](https://aka.ms/CopilotCredirsLicensingGuide) |

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
