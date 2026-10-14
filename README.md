# AI ファースト開発標準

Power Apps Code Apps, モデル駆動型アプリ, Generative page, Dataverse, Power Automate, Power Pages, Copilot Studio, Azure サービス、Cowork プラグインを **VS Code + GitHub Copilot / Claude Code** で開発するための、実践的な AI ファースト開発標準リポジトリです。
実装標準は **TypeScript + React + Tailwind CSS**（Code Apps）を前提にしています。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

📺 [使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

---

## クイックスタート

VS Code + GitHub Copilot が使える状態（[統合プロンプトで一気に準備する](#統合プロンプトで一気に準備する推奨)を参照）であれば、GitHub Copilot / Claude Code のチャットを次のプロンプトから始めてください。そのままコピーして使えます。

> [!NOTE]
> ワークスペースとしてフォルダを作成し、エージェントに適切な実行権限を設定してください。

```text
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard クイックスタートして
```

クイックスタートでは、次のコマンドで開発標準をプロジェクトへ配置します。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills
cp .github/skills/standard/references/gitignore-template .gitignore
```

開発標準の配置後、GitHub Copilot / Claude Code のチャットから **`@GeekPowerCode`** を呼び出し、作りたいテーマを伝えてください。`architecture` スキルがヒアリングを経て Code Apps を選定した場合にのみ、`code-apps` スキルが `.github/skills/code-apps/references/template-snapshot/` の `package.json` / `package-lock.json` をコピーして `npm install` を実行します（Code Apps 以外のソリューションでは `node_modules` は生成されません）。

> [!NOTE]
> `.gitignore` がないと `node_modules/`・`dist/`・`.power/`・`.env` 等がコミット対象になります。必ずコピーしてください。

チーム開発でリモートリポジトリを最初から使いたい場合は [チーム開発向けの手順](#チーム開発向けの手順) を、既存仕様書がある場合は `/spec-build` の運用へ進んでください。

- Claude Code を使う場合: [Claude Code でのクイックスタート](docs/claude-code-quickstart.md)
- 自社標準としてコピーした場合: [コピー後に行うこと・推奨プロンプトと添付資料](docs/company-standard-next-steps.md)

---

## 目次

- [クイックスタート](#クイックスタート)
- [Claude Code でのクイックスタート](docs/claude-code-quickstart.md)
- [前提条件](#前提条件)
  - [統合プロンプトで一気に準備する（推奨）](#統合プロンプトで一気に準備する推奨)
  - [ライセンスの準備](#ライセンスの準備)
  - [クラウド環境の準備](#クラウド環境の準備)
    - [専用環境を作成する](#専用環境を作成する)
    - [開発者へセキュリティ ロールを割り当てる](#開発者へセキュリティ-ロールを割り当てる)
    - [Copilot Credits を環境に割り当てる](#copilot-credits-を環境に割り当てる)
    - [Advanced Connector Policy を設定する](#advanced-connector-policy-を設定する)
    - [Code Apps を有効化する](#code-apps-を有効化する)
  - [ローカル開発環境の準備](#ローカル開発環境の準備)
    - [VS Code + GitHub Copilot](#vs-code--github-copilot)
    - [Python パッケージと初回サインイン](#python-パッケージと初回サインイン)
- [管理者権限（管理者ロール）要件](#管理者権限管理者ロール要件)
- [自社標準リポジトリを API で作成する](#自社標準リポジトリを-api-で作成する)
- [チーム開発向けの手順](#チーム開発向けの手順)
- [上流の開発標準更新を取り込む](#上流の開発標準更新を取り込む)
- [環境チェック](#環境チェック)
  - [ローカル開発ツールのチェック](#ローカル開発ツールのチェック)
  - [Power Platform 環境のチェック](#power-platform-環境のチェック開発着手前に必須)
- [カスタムエージェント前提の利用方法](#カスタムエージェント前提の利用方法)
- [リポジトリ構成](#リポジトリ構成)
- [主要ドキュメント](#主要ドキュメント)
- [GitHub Copilot / Claude Code 活用](#github-copilot--claude-code-活用)
- [ライセンス](#ライセンス)
- [フィードバック](#フィードバック)

---

## 前提条件

### 統合プロンプトで一気に準備する（推奨）

ローカル開発環境の準備から Power Platform のクラウド環境準備までを、コマンドを手打ちせずに **1 つのプロンプト**で一気通貫に実行できます。VS Code の GitHub Copilot Chat で `/` を入力して **Setup Development Environment** を選択するか、[統合プロンプト](.github/prompts/setup-development-environment.prompt.md)を開いて実行してください。

> [!IMPORTANT]
> クラウド環境の準備には Power Platform 管理者権限が必要な工程が含まれます。**実行者が管理者権限を持っていないと判明した時点で、エージェントは処理を中断します。** 権限昇格や迂回は行わず、不足しているロールと管理者への依頼内容を報告して終了する前提のプロンプトです。

> [!NOTE]
> テナント全体の環境戦略（環境グループの設計、命名規則に沿った環境の一括作成、不要環境の整理など）や、Copilot Credits の配分・ACP の適用・CSP の設定を実施したい場合は、`@GeekPowerCode` に「テナント全体の環境戦略を確認して」「この環境に Copilot Credits を配分して」のように明示的に依頼してください。admin スキルの読み取り専用スキャン・dry-run から始まり、内容提示 → ユーザー確認 → `--apply` の順で進みます。

> [!NOTE]
> 設定値は `.github/skills/admin/references/environment-strategy.json`（ブループリント）に集約されています。組織固有の名称・人数・命名規則を変えたい場合は、プロンプト実行前後にこのファイルを編集してください。

### ライセンスの準備

利用する機能ごとに必要なライセンスが異なります。詳細は以下のアコーディオンを開いて確認してください。

<details>
<summary>必要なライセンス一覧・公式ガイドを表示</summary>

| 対象 | 必要なライセンス / 前提 | 出典 |
|---|---|---|
| GitHub Copilot（VS Code / Claude Code でのエージェント開発） | **GitHub Copilot Pro 以上**（Pro / Pro+ / Business / Enterprise） | [GitHub Copilot のプラン](https://github.com/features/copilot/plans) |
| Code Apps（コードファースト開発） | **Power Apps Premium** または **Dynamics 365 Enterprise / Customer Engagement**。無料利用は **Power Apps 開発者プランの開発者環境** を使用 | [Power Apps の価格](https://www.microsoft.com/ja-jp/power-platform/products/power-apps/pricing) |
| Copilot Managed Runtime アプリ（Public Preview） | 使う人ごとに **Power Apps Premium** または **Copilot Credits の従量課金**（起動ごと・API 呼び出しごと）。クレジットで払う場合は、管理者が M365 管理センターで従量課金を有効にし、使う人を実行用の支出ポリシーに入れる | [Copilot Managed Runtime の SDK 概要](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/?view=o365-worldwide)、[Copilot Credits ライセンス ガイド](https://aka.ms/CopilotCredits/LicensingGuide) |
| Cowork プラグインの開発（会社環境で利用が許可されている場合のみ推奨） | **Microsoft 365 Copilot** ライセンスに加えて、**Azure サブスクリプションの準備**、**Copilot Credits の有効化**、**テナントでの有効化設定** が必要 | [Copilot Credits ライセンス ガイド](https://aka.ms/CopilotCredits/LicensingGuide) |
| Copilot Studio の利用 | **Microsoft 365 Copilot** ライセンスに加えて、**Azure サブスクリプション**・**リソース グループ**の準備と、**Copilot Credits の環境割り当て** が必要 | [Copilot Studio のライセンス](https://aka.ms/MCSLicJP) |

製品のライセンス要件を詳しく調べる際は以下の公式ガイドを参照してください。

| ガイド | リンク |
|---|---|
| Power Platform ライセンスガイド（英語） | [aka.ms/PPLic](https://aka.ms/PPLic) |
| Power Platform ライセンスガイド（日本語） | [aka.ms/PPLicJP](https://aka.ms/PPLicJP) |
| Microsoft Copilot Studio ライセンスガイド（英語） | [aka.ms/MCSLic](https://aka.ms/MCSLic) |
| Microsoft Copilot Studio ライセンスガイド（日本語） | [aka.ms/MCSLicJP](https://aka.ms/MCSLicJP) |
| Copilot Credits ライセンスガイド | [aka.ms/CopilotCredits/LicensingGuide](https://aka.ms/CopilotCredits/LicensingGuide) |

</details>

### クラウド環境の準備

> [!CAUTION]
> **デフォルト環境（Default）では開発しないでください。** 組織全員が参照できる共有環境のため、テーブルやソリューションが意図せず他ユーザーに見えます。必ず専用の **Developer 環境** または **Sandbox 環境** を用意してください。

Copilot Studio を利用する場合は、次の順序で管理者による事前設定を行います。

1. Dataverse を含む専用環境を作成する
2. 開発者へ必要なセキュリティ ロールを割り当てる
3. Copilot Credits をその環境に割り当てる
4. Advanced Connector Policy で利用を許可するコネクタを設定する
5. Code Apps を使用する場合は環境の機能を有効化する

#### 自動で設定する（推奨）

これらのクラウド側の設定は、管理センターの画面を開かずに **[admin スキル](.github/skills/admin/SKILL.md) を読み込んだエージェント**に依頼して実行できます。画面操作は手順が長く、環境が増えるたびに設定漏れとドリフトが起きるため、コマンドを手打ちするのではなく、エージェントにスキルを読ませて再現できる形にしておきます。

[前提条件冒頭の統合プロンプト](#統合プロンプトで一気に準備する推奨)を使えば、ローカル準備からこのクラウド環境準備までを 1 回の依頼で実行できます。クラウド側だけをやり直したい場合は、そのプロンプトの「フェーズ 2」「フェーズ 3」部分だけを貼り付けて依頼してください。

管理者権限がない場合、エージェントはフェーズ 2 の時点で処理を中断し、不足している権限と管理者への依頼内容を報告します。開発者へのセキュリティ ロール割り当て（上記手順 2）は管理センターの画面操作が必要なため、エージェントは案内のみ行います（詳細は下のアコーディオンを参照）。

<details>
<summary><strong>手動で設定する場合（Power Platform 管理センターの画面操作）</strong></summary>

#### 専用環境を作成する

この操作には **Power Platform Administrator** または **Dynamics 365 Administrator** などの環境作成権限が必要です。Sandbox 環境の作成には、テナントに 1 GB 以上の空き Dataverse データベース容量も必要です。

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **管理** > **環境** > **新規** を選択
3. 環境名とリージョンを入力し、用途に応じて **Developer** または **Sandbox** を選択
4. **Dataverse データ ストアを追加する** を **はい** にして **次へ** を選択
5. 言語、URL、基本通貨、セキュリティグループを設定する
6. Dynamics 365 アプリが不要な場合は **Dynamics 365 アプリを有効にする** を **いいえ** にして **保存** を選択
7. 作成完了後、次の「開発者へセキュリティ ロールを割り当てる」に進む

詳細: [Power Platform 管理センターで環境を作成および管理する（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/create-environment)

#### 開発者へセキュリティ ロールを割り当てる

Dataverse を含む開発環境では、開発者に次の 2 つのセキュリティ ロールを割り当てます。ロールの権限は累積されるため、両方を割り当てることでテーブルとその他の Power Platform リソースを開発できます。

| セキュリティ ロール | 用途 |
|---|---|
| **System Customizer（システム カスタマイザー）** | Dataverse テーブル、列、リレーションなどを作成・変更する |
| **Environment Maker（環境作成者）** | アプリ、フロー、接続、カスタム API、ソリューションなど、環境内のリソースを作成する |

割り当ては、対象環境の **System Administrator** またはセキュリティ ロールを割り当てる権限を持つ管理者が実施します。

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **管理** > **環境** を選択し、対象環境を開く
3. **設定** > **ユーザー + アクセス許可** > **ユーザー** を選択
4. 対象の開発者を選択し、**セキュリティ ロールの管理** を選択
5. **System Customizer（システム カスタマイザー）** と **Environment Maker（環境作成者）** を選択
6. **保存** を選択し、両方のロールが割り当てられたことを確認する

> [!IMPORTANT]
> **Environment Maker だけでは Dataverse テーブルを作成できません。** テーブルを作成・変更する開発者には **System Customizer** も必要です。通常の開発者へ完全な管理権限を持つ **System Administrator** を安易に割り当てず、必要最小限のロールを使用してください。

詳細: [セキュリティ ロールを割り当てる（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/assign-security-roles)、[Dataverse のロールベースのセキュリティ（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/database-security)

#### Copilot Credits を環境に割り当てる

Copilot Studio のエージェントを作成・実行する環境には、購入済みの **Copilot Credits** を割り当てます。この操作には **Power Platform Administrator** または **Global Administrator** など、ライセンスと容量を管理できるロールが必要です。

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **ライセンス** > **製品** > **Copilot Studio** を選択
3. **Copilot Credits の管理** を選択
4. 検索ボックスから対象環境を選択
5. **容量の割り当て** に環境へ割り当てる Copilot Credits 数を入力
6. **容量超過** の **テナントで使用可能な容量から取得する** を、組織の予算管理方針に合わせて選択または解除する
   - 選択: 環境の割り当てを使い切った後も、テナントの未割り当て容量を使用する
   - 解除: 割り当てを上限とし、使い切るとそれ以上消費しない
7. **保存** を選択

> [!WARNING]
> 利用可能な Copilot Credits がなくなると、クレジットを必要とする作成者向け機能や公開済みエージェントが停止する可能性があります。割り当て量と消費量を定期的に確認してください。

詳細: [Copilot Credits の環境割り当て（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/programmability-tutorial-manage-copilot-credit-allocations)

#### Advanced Connector Policy を設定する

DLP（データ損失防止）のコネクタ制御には、原則として **Advanced Connector Policy（ACP）** を使用します。ACP は許可リスト方式のため、明示的に追加していないコネクタとアクションは既定でブロックされます。

1. 対象環境で利用するコネクタとアクションを事前に棚卸しする。標準利用対象には Dataverse (`shared_commondataserviceforapps`) と新 Copilot Studio Workflow の Agent ノード (`shared_agentnode`) を含める。`microsoft-first-party` 推奨プロファイルも Agent ノードを既定の許可候補に含む（適用は dry-run・承認後）。`shared_powervirtualagents` の許可だけでは代替できない
2. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
3. **セキュリティ** > **データとプライバシー** > **Advanced connector policies** を選択
4. 対象環境を選び、**Add connectors** から必要な認定コネクタを許可リストへ追加する
5. コネクタ内の一部アクションだけを許可する場合は、許可対象のトリガーとアクションを指定する
6. 設定内容を確認して **保存** を選択
7. ポリシーの **Status** が **Applied** になったことを確認する

> [!IMPORTANT]
> 初回導入時は、従来の DLP ポリシーも評価される既定の **Mixed mode** を使用してください。Mixed mode では ACP と従来の DLP のうち、より制限の厳しい設定が適用されます。従来の DLP から完全に移行し、必要な許可リストを検証できた場合にのみ **ACP-only mode** を検討してください。
>
> ACP は現在、認定コネクタと MCP コネクタを対象とします。**カスタムコネクタ、HTTP コネクタ、Copilot Studio の仮想コネクタは ACP だけでは管理できません。** これらを利用する場合は、従来の DLP ポリシーやコネクタ エンドポイント フィルタリングも継続して設定してください。

環境グループへ一括適用する場合は、**管理** > **環境グループ** > 対象グループ > **ルール** > **Advanced connector policies** で許可リストを保存した後、**ルールの公開**を実行します。

詳細: [Advanced connector policies（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/advanced-connector-policies)

#### Code Apps を有効化する

Code Apps は環境ごとに初期状態で無効です。有効化手順:

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **環境** > 対象の環境を選択 > **設定** > **製品** > **機能**
3. **Power Apps コード アプリ** をオンにして保存

詳細: [Code Apps 公式ドキュメント（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-apps/developer/code-apps/overview)

</details>

### ローカル開発環境の準備

> [!IMPORTANT]
> ローカル開発環境のセットアップは、次の条件を満たす端末とアカウントで実施してください。条件を満たさない端末では、スクリプトの実行やアプリの発行が途中で失敗します。
>
> - **ライセンス**: GitHub Copilot Pro 以上と、Power Apps Premium（または Power Apps 開発者プラン）のライセンスが割り当てられていること
> - **セキュリティ ロール**: 対象環境で **System Customizer** と **Environment Maker** が割り当てられていること（テナント全体の設定を行う場合は Power Platform 管理者も必要）
> - **端末の権限**: Git / Node.js / Python と、`npm install -g` や `pip install` によるライブラリ導入が許可されていること（管理された端末では IT 部門に事前確認してください）

#### VS Code + GitHub Copilot

VS Code をインストールすると **GitHub Copilot 拡張機能は最初から同梱**されています。別途 Extensions からインストールする必要はありません。GitHub アカウントでサインインし、Copilot ライセンスを有効化してください。

1. [https://code.visualstudio.com/](https://code.visualstudio.com/) から VS Code をダウンロード → インストール
2. 左下のアカウントアイコンから GitHub でサインイン（Copilot 拡張は同梱済みのためインストール不要、サブスクリプションの有効化のみ必要）
3. Copilot チャットを開く（`Ctrl+Alt+I`、Mac: `⌃⌘I`）

##### 自動で導入する（推奨）

開発ツール（Git / Node.js / Python / PP CLI / GitHub CLI 等）の導入・PATH 設定・動作確認は、手順を手打ちせずに [前提条件冒頭の統合プロンプト](#統合プロンプトで一気に準備する推奨) をチャットに貼り付けて実行してください（クラウド環境の準備が不要な場合は、そのプロンプトの「フェーズ 1」部分だけを貼り付けても構いません）。

<details>
<summary>手動で導入する場合</summary>

| ツール | 入手先 |
|---|---|
| Git | [git-scm.com](https://git-scm.com/downloads) |
| Node.js LTS | [nodejs.org](https://nodejs.org/) |
| Python 3.12 | [python.org](https://www.python.org/downloads/) |
| degit（`npx degit` を高速化） | `npm install -g degit` |
| Power Platform CLI（pac） | VS Code 拡張機能「Power Platform Tools」または `dotnet tool install --global Microsoft.PowerApps.CLI.Tool`（**npm では配布されていない**） |
| GitHub CLI（gh） | [cli.github.com](https://cli.github.com/) |

導入後は、新規ターミナルで以下が全て PATH 経由で解決できることを確認してください：`git --version` / `node --version` / `npm --version` / `npx --version` / `degit --version` / `python --version` / `pac help` / `gh --version` / `gh auth status`。

</details>

> [!Note]
> クイックスタートのコマンドで `npx` が実行できないというエラーが出る場合は、Node.js インストール直後で PATH がまだ反映されていない可能性があります。新しいターミナルを開き直して再実行してください。

#### Python パッケージと初回サインイン

スキルの Python スクリプト（Dataverse 構築、DLP 事前チェック、Azure 連携など）は、共通認証
`.github/skills/standard/scripts/auth_helper.py` 経由で API を呼びます。初回だけ次を実行してください。

```powershell
python -m pip install -r .github/skills/standard/scripts/requirements.txt
```

導入されるのは `azure-identity` / `python-dotenv` / `requests` の 3 つだけです。統合プロンプトのフェーズ 1 を実行済みなら、`.env` の設定と初回認証（インタラクティブ→DEVICE CODE の順で自動検証）もすでに完了しています。

<details>
<summary>認証キャッシュの仕組みと手動設定の詳細を表示</summary>

- `.env` に **`TENANT_ID`** を設定します。認証キャッシュはテナントごとに
  `~/.power-platform-cli/auth_record_{TENANT_ID}.json` へ分離保存されるため、複数テナントを行き来しても再認証は最小限で済みます。
- 環境 ID を使うスクリプト（DLP 事前チェックなど）では **`ENV_ID`** も設定します。
- **初回の認証キャッシュは、ユーザーに確認せず自動で検証します。** まず `.env` に `AUTH_MODE=interactive` を設定してローカルブラウザでの**インタラクティブ認証**を試し、キャッシュ（`AuthenticationRecord`）が作成できるか確認します。ブラウザ操作ができない環境などで失敗した場合は、`AUTH_MODE=interactive` を削除（または `AUTH_MODE=device_code` に変更）し、既定の **DEVICE CODE 認証**（表示されたコードを別のデバイス／ブラウザで入力する方式）にフォールバックします。
  - どちらの方式でキャッシュされても、**初回のみ**認証画面が表示されます。以降はキャッシュからサイレントに認証され、スクリプトは非対話で完走します。
  毎回認証を求められる場合は、`.env` の `TENANT_ID` が未設定でないかを確認してください。

> [!NOTE]
> PR 作成やスキル公開を行う場合は `gh auth login` 済みの GitHub CLI も必要です。

</details>

サインインできたら、開発に入る前に [Power Platform 環境のチェック](#power-platform-環境のチェック開発着手前に必須) を実行してください。

---

## 管理者権限（管理者ロール）要件

開発者本人の権限だけでは完結せず、**テナント/環境の管理者**（またはその権限を持つ人）による事前設定が必要な操作があります。統合プロンプトのフェーズ 2 で管理者権限の有無を自動判定し、不足時は必要ロールと依頼内容を報告するため、通常はこの一覧を読む必要はありません。詳細を確認したい場合や、エージェント経由で対応できない操作（Cowork の Entra/Teams/M365 管理センター設定など）を手動で行う場合は、以下のアコーディオンを開いてください。

<details>
<summary>操作ごとの必要な最小ロール一覧を表示</summary>

特に Cowork プラグインやテナント横断の設定は、開発者単独では実施できない場合があります。**Cowork 関連の操作（#2〜#8）は、会社環境で Cowork の利用が許可されている場合のみ実施してください。**

| # | 操作 | 実施場所 | 必要な最小ロール | 出典 |
|---|---|---|---|---|
| 1 | **Code Apps の環境有効化**（`設定 > 製品 > 機能` で「コード アプリを許可する」をオン） | Power Platform 管理センター（環境設定） | 環境の **Environment Admin**（テナント全体で行う場合は **Power Platform Administrator**） | [Power Platform 管理者ロールについて](https://learn.microsoft.com/ja-jp/power-platform/admin/about-administration-overview)、[環境の分離とランドスケープ](https://learn.microsoft.com/ja-jp/power-platform/admin/environments-separation-landscape) |
| 2 | **Cowork を MCP クライアントとして許可**（`allowedmcpclients` テーブルで Microsoft Cowork を有効化） | Power Platform 管理センター／Dataverse（環境） | 環境の **Environment Admin** または Dataverse のテーブル編集権限を持つ管理者 | [Dataverse のセキュリティと権限の概要](https://learn.microsoft.com/ja-jp/power-platform/admin/wp-security) |
| 3 | **Entra ID への App Registration 作成**（Cowork 用 OAuth クライアント） | Microsoft Entra 管理センター | **Application Administrator** または **Cloud Application Administrator** | [アプリの登録の作成](https://learn.microsoft.com/ja-jp/entra/identity-platform/howto-create-service-principal-portal) |
| 4 | **API 権限（`Application.ReadWrite.All` 等）の管理者同意** | Microsoft Entra 管理センター（アプリ > API のアクセス許可） | **Global Administrator** または **Privileged Role Administrator** | [アプリのアクセス許可を構成する](https://learn.microsoft.com/ja-jp/entra/identity-platform/howto-configure-api-permissions) |
| 5 | **Teams 開発者ポータルでの OAuth client registration**（`dev.teams.microsoft.com/tools`） | Teams 開発者ポータル | Entra の **「ユーザーはアプリケーションを登録できる」** 設定が有効、または同等の管理権限 | [Teams 開発者ポータルの概要](https://learn.microsoft.com/ja-jp/microsoftteams/platform/concepts/build-and-test/tools-and-sdk/teams-developer-portal) |
| 6 | **Teams でのカスタムアプリのサイドロード許可**（アップロードした Cowork プラグインを Teams 経由で直接インストールする「迂回」導線を使う場合） | Teams 管理センター | **Teams Administrator** または **Global Administrator** | [Teams アプリの管理](https://learn.microsoft.com/ja-jp/microsoftteams/manage-apps) |
| 7 | **M365 管理センターでのプラグインアップロード・公開**（`admin.cloud.microsoft` の「エージェント」画面） | Microsoft 365 管理センター | **Global Administrator** または **Teams Administrator**（組織設定による） | [Microsoft 365 管理センターの概要](https://learn.microsoft.com/ja-jp/microsoft-365/admin/admin-overview/about-the-admin-center) |
| 8 | **Frontier プログラムへのテナント参加**（Cowork 利用の前提） | Microsoft 365 管理センター | **Global Administrator** | [Frontier プログラムの概要](https://learn.microsoft.com/ja-jp/microsoft-copilot-studio/frontier/overview) |
| 9 | **テナントレベルのデータ ポリシー（DLP）の参照・作成・編集**（カスタムコネクタの Host URL パターン分類を含む） | Power Platform 管理センター（`セキュリティ > データとプライバシー > データ ポリシー`）または管理 API | **Power Platform Administrator** | [データ ポリシーの管理](https://learn.microsoft.com/ja-jp/power-platform/admin/prevent-data-loss) |
| 10 | **環境レベルのデータ ポリシーの作成・編集** | 同上 | **Environment Admin**（Dataverse を含む環境では **System Administrator**）。テナント管理者が作成したポリシーは編集・削除できない | [データ ポリシーの管理](https://learn.microsoft.com/ja-jp/power-platform/admin/prevent-data-loss) |

> [!NOTE]
> 上記のうち **#3・#4（Entra App Registration と管理者同意）は一度きり**（テナントで1回）、**#2（allowedmcpclients）は環境ごとに1回**の設定です。開発者自身が必要権限を持っていない場合は、管理者へ依頼してください。
>
> **ロール名は目安です。** 実際に付与すべき最小権限は組織のセキュリティ方針により異なる場合があるため、上記の出典（Microsoft Learn）を必ず確認してください。

> [!IMPORTANT]
> **DLP（データ ポリシー）の確認・変更について**
>
> - 実装に入る前に、そのソリューションが使うコネクタが利用できるかを確認します（[DLP 事前チェック](.github/skills/admin/references/dlp-precheck.md)）。**参照にも #9 / #10 の管理者権限が必要**なため、権限がない場合は管理者にスクリプトを実行してもらい、結果を共有してもらってください。
> - ポリシー変更の反映には**通常 1 時間以内、最大 24 時間**かかります。変更直後に解消していなくても、再評価まで待ってから判断してください。
> - **Advanced connector policies（ACP）は認定コネクタと MCP コネクタのみ**が対象です。カスタムコネクタ・HTTP コネクタ・Copilot Studio の仮想コネクタは、従来のデータ ポリシーで引き続き管理する必要があります。
> - 上記の管理者ロール一覧と、権限がない場合の進め方は [admin スキルの管理者ロール一覧](.github/skills/admin/references/admin-roles.md) にまとめています。

</details>

---

## 自社標準リポジトリを API で作成する

この公開リポジトリを基に、会社固有のルールやスキルを追加する非公開の標準リポジトリを作成できます。GitHub Enterprise Cloud の Organization では、Organization 内の全メンバーから参照できる **`internal` を第一候補**とし、`internal` を利用できない場合だけ **`private`** を選択してください。

> [!IMPORTANT]
> 公開リポジトリを fork すると fork も必ず public になり、fork の可視性を `internal` や `private` に変更できません。そのため、この手順では GitHub の fork 関係を作らず、ファイルを新しい履歴へコピーした独立リポジトリを作成します。公開元は `upstream` remote として登録し、更新の比較元にします。

### GitHub Copilot に作成させる（推奨）

VS Code の GitHub Copilot Chat で `/` を入力し、**Create Company Standard Repository** を選択してください。これは [`.github/prompts/create-company-standard-repository.prompt.md`](.github/prompts/create-company-standard-repository.prompt.md) に定義されたプロンプトです。

プロンプト一覧に表示されない場合は、次の内容をチャットへ貼り付けても実行できます。

```text
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard を基に、自社標準用の独立した GitHub リポジトリを REST API で Organization に作成してください。Organization で利用可能なら visibility は internal を推奨し、利用できない場合は私に確認してから private にしてください。公開元のコミット履歴は引き継がず、新しい履歴で開始し、公開元を upstream remote に登録してください。トークンや認証情報は表示しないでください。
```

エージェントは利用可能な Organization を API で取得し、作成先と `internal` / `private` の選択を別々の `AskUserQuestion` で必ず確認してから、`POST /orgs/{org}/repos` を使用して作成します。`internal` の作成が API で拒否された場合、エラーを表示せずに `private` へ切り替えることはありません。

### API を手動で実行する

次は PowerShell と GitHub CLI の認証を利用する例です。`gh api` は GitHub REST API を呼び出しており、トークンをコマンドや出力へ露出しません。

```powershell
$Organization = "<your-organization>"
$Repository = "CompanyDevelopmentStandard"

# 公開元のファイルだけをコピーし、新しい履歴を開始
npx degit geekfujiwara/CodeAppsDevelopmentStandard $Repository
Set-Location $Repository
git init -b main
git add --all
git commit -m "Initial company development standard"

# Organization が GitHub Enterprise Cloud 配下なら internal を推奨
$Body = @{
  name        = $Repository
  description = "Internal company development standards"
  visibility  = "internal"
} | ConvertTo-Json -Compress
$Body | gh api --method POST "orgs/$Organization/repos" --input -

git remote add origin "https://github.com/$Organization/$Repository.git"
git remote add upstream "https://github.com/geekfujiwara/CodeAppsDevelopmentStandard.git"
git push -u origin main
```

`visibility: internal` が利用できない場合は、Organization と Enterprise の契約・ポリシー、実行者のリポジトリ作成権限を確認してください。`private` でよいと判断した場合のみ、API payload の `visibility` を `private` に変更して再実行します。作成後は API で `visibility`、`default_branch`、`owner.login` を読み戻し、`git ls-remote origin refs/heads/main` で push を検証してください。

独立した履歴のため、`git pull upstream main` で自動マージはしません。更新時は [上流の開発標準更新を取り込む](#上流の開発標準更新を取り込む) の手順で必要な標準ファイルを同期し、`git diff` で自社変更への影響を確認します。

**作成後の次のステップ:** [自社標準コピー後の推奨事項](docs/company-standard-next-steps.md) に沿って、まず上流更新をIssueで通知するGitHub Actions、社内向けのIssue回答ワークフロー、自社名のカスタムエージェントを整備してください。アクセス範囲、社内ルール、環境、更新・承認フローの確認方法に加え、それぞれをCopilotに依頼するサンプルプロンプトと、おすすめの添付資料もまとめています。

---

## チーム開発向けの手順

[自社標準ガイドのチーム開発手順](docs/company-standard-next-steps.md#チーム開発向けの手順) に統合しました。

---

## 上流の開発標準更新を取り込む

[自社標準ガイドの上流更新手順](docs/company-standard-next-steps.md#上流の開発標準更新を取り込む) を参照してください。通知Issueから差分を確認し、自社変更を保護してPRで取り込みます。

---

## 環境チェック

### ローカル開発ツールのチェック

[ローカル開発ツールのチェック](docs/company-standard-next-steps.md#ローカル開発ツールのチェック) にコマンドと不足時の対応をまとめています。

### Power Platform 環境のチェック（開発着手前に必須）

[Power Platform環境のチェック](docs/company-standard-next-steps.md#power-platform-環境のチェック開発着手前に必須) に確認項目とDLP / ACPの事前チェックをまとめています。

---

## カスタムエージェント前提の利用方法

[カスタムエージェント前提の利用方法](docs/company-standard-next-steps.md#カスタムエージェント前提の利用方法) を参照してください。

---

## リポジトリ構成

[リポジトリ構成とアセットの配置方針](docs/company-standard-next-steps.md#リポジトリ構成) を参照してください。

---

## 主要ドキュメント

[主要ドキュメント一覧](docs/company-standard-next-steps.md#主要ドキュメント) を参照してください。

---

## GitHub Copilot / Claude Code 活用

[GitHub Copilot / Claude Codeの活用方法](docs/company-standard-next-steps.md#github-copilot--claude-code-活用) と [スキルカタログ](.github/skills/README.md) を参照してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
