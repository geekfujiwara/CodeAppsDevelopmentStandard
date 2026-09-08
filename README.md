# AI ファースト開発標準

Power Apps Code Apps, モデル駆動型アプリ, Generative page, Dataverse, Power Automate, Power Pages, Copilot Studio, Azure サービス、Cowork プラグインを **VS Code + GitHub Copilot / Claude Code** で開発するための、実践的な AI ファースト開発標準リポジトリです。
実装標準は **TypeScript + React + Tailwind CSS**（Code Apps）を前提にしています。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

📺 [使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

---

## クイックスタート

VS Code + GitHub Copilot が使える状態（[ローカル開発環境の準備](#ローカル開発環境の準備)を参照）であれば、次のコマンドと 1 依頼だけで開発を始められます。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills
cp .github/skills/standard/references/gitignore-template .gitignore
```

続けて GitHub Copilot / Claude Code のチャットから **`@GeekPowerCode`** を呼び出し、作りたいテーマを伝えてください。`architecture` スキルがヒアリングを経て Code Apps を選定した場合にのみ、`code-apps` スキルが `.github/skills/code-apps/references/template-snapshot/` の `package.json` / `package-lock.json` をコピーして `npm install` を実行します（Code Apps 以外のソリューションでは `node_modules` は生成されません）。

> [!NOTE]
> `.gitignore` がないと `node_modules/`・`dist/`・`.power/`・`.env` 等がコミット対象になります。必ずコピーしてください。

チーム開発でリモートリポジトリを最初から使いたい場合は [チーム開発向けの手順](#チーム開発向けの手順) を、既存仕様書がある場合は `/spec-build` の運用へ進んでください。

---

## Claude Code でのクイックスタート

GitHub Copilot だけでなく **Claude Code** からも同じ開発標準をそのまま利用できます。手順は次の 3 ステップです。

**1. 開発標準（スキル）を取得する**

プロジェクトのルートで以下を実行し、`.github/`（エージェント・スキル）と `.gitignore` を配置します。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills
cp .github/skills/standard/references/gitignore-template .gitignore
```

**2. Claude Code をプロジェクトルートで起動する**

`.github/agents/` と `.github/skills/` を配置したフォルダーで Claude Code を起動します。Claude Code はカスタムエージェント定義（`.claude/agents/`）とスキル群（`.github/skills/`）を参照して開発タスクを進めます。

**3. `@GeekPowerCode` に依頼する**

チャットから **`@GeekPowerCode`** を呼び出し、作りたいテーマを伝えてください。エージェントが `.github/skills/standard/SKILL.md` を読み込み、要件に応じて必要なスキルを選択します。`architecture` スキルがヒアリングを経て Code Apps を選定した場合にのみ、`code-apps` スキルが `package.json` / `package-lock.json` をコピーして `npm install` を実行します（Code Apps 以外のソリューションでは `node_modules` は生成されません）。

- 依頼例: `@GeekPowerCode 在庫管理をもっと効率的に行いたい。`
- 既存仕様書がある場合の入力例: `spec-builder を実行して`

> [!NOTE]
> 推奨モデルは **Claude Sonnet 5** です（`.github/agents/GeekPowerCode.agent.md` の既定モデル）。`.gitignore` を配置しないと `node_modules/`・`dist/`・`.power/`・`.env` 等がコミット対象になるため、必ずコピーしてください。

前提条件・ライセンス要件は GitHub Copilot と共通です（[前提条件](#前提条件) を参照）。

---

## 目次

- [クイックスタート](#クイックスタート)
- [Claude Code でのクイックスタート](#claude-code-でのクイックスタート)
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

ローカル開発環境の準備から Power Platform のクラウド環境準備までを、コマンドを手打ちせずに **1 つのプロンプト**で一気通貫に実行できます。GitHub Copilot / Claude Code のチャットに、以下をそのまま貼り付けて送信してください。

> [!IMPORTANT]
> クラウド環境の準備には Power Platform 管理者権限が必要な工程が含まれます。**実行者が管理者権限を持っていないと判明した時点で、エージェントは処理を中断します。** 権限昇格や迂回は行わず、不足しているロールと管理者への依頼内容を報告して終了する前提のプロンプトです。

```text
ローカル開発環境の準備から、Power Platform のクラウド環境準備まで、一気通貫で実行してください。
途中で Power Platform 管理者権限が必要な工程に到達し、自分（実行者）がその権限を持っていないと判明した場合は、
その時点で処理を中断し、不足している権限と管理者への依頼内容を整理して報告し、終了してください。
無理に権限を回避・昇格しようとしないでください。

## フェーズ 1: ローカル開発環境の準備
1. Git / Node.js LTS / Python 3.12 を導入する。既定のターミナル（Windows の場合 PowerShell 5.1 で可、追加導入は不要）で動作すればよい。
2. `npm install -g degit` で degit をグローバル導入する。
3. Power Platform は PP CLI（pac）のみ導入する（VS Code 拡張は入れない）。
4. **必要なすべてのツールの PATH を通す**。実体パスを確認したうえで、未登録のものは**ユーザー環境変数 PATH に恒久的に追加**し、さらに現在のセッションの `$env:Path` にも反映して、ターミナルを開き直さずに続行できる状態にする。対象は以下（実際のインストール先に読み替える）。
   - Git: `%ProgramFiles%\Git\cmd`
   - Node.js / npm / npx: `%ProgramFiles%\nodejs`
   - npm グローバル（degit など。`npm config get prefix` で確認）: `%APPDATA%\npm`
   - Python 3.12 本体とスクリプト: `%LOCALAPPDATA%\Programs\Python\Python312` と `%LOCALAPPDATA%\Programs\Python\Python312\Scripts`
   - Power Platform CLI（pac）: MSI 版は `%LOCALAPPDATA%\Microsoft\PowerAppsCLI`、dotnet tool 版は `%USERPROFILE%\.dotnet\tools`
   - GitHub CLI（gh）: `%ProgramFiles%\GitHub CLI`
   - VS Code CLI（code）: `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin`
   - 追加時は既存の PATH を上書きせず**追記**し、重複エントリは作らないこと。特に Node.js インストール直後は `npx` が既存ターミナルで認識されないため、この反映を必ず行う。
5. `gh auth status` で GitHub CLI のログイン状態を確認する（未ログインなら `gh auth login` を案内）。
6. `npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents` と `npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills` を実行し、admin スキルを含むスキル一式とエージェント定義を取得する。
7. `python -m pip install -r .github/skills/standard/scripts/requirements.txt` を実行する。
8. クラウド側の準備に進めるよう、`.env` に設定する `TENANT_ID` / `ENV_ID` / `DATAVERSE_URL` の値をユーザーに確認する。
9. **認証方式はユーザーに確認せず、エージェントが順に検証してキャッシュできる方式を採用する。** まず `.env` に `AUTH_MODE=interactive` を設定し、ローカルブラウザでの**インタラクティブ認証**で `AuthenticationRecord`（認証キャッシュ）が作成できるかを検証する。失敗する、またはブラウザ操作ができない環境（ヘッドレスセッション等）では、`.env` から `AUTH_MODE=interactive` を削除（または `AUTH_MODE=device_code` に変更）し、既定の **DEVICE CODE 認証** で再試行する。どちらの方式でキャッシュに成功したかを結果として報告する。この検証は、フェーズ 2 で最初に認証が行われる前に完了させること。

検証コマンド:
- git --version / node --version / npm --version / npx --version / degit --version
- python --version（または py --version）
- pac help（ヘッダの Version を確認）
- gh --version / gh auth status
- where.exe git / where.exe node / where.exe npx / where.exe degit / where.exe python / where.exe pac / where.exe gh（すべて PATH 経由で解決できること）
- 新規に開いたターミナルでも上記が同じ結果になること（恒久的な PATH 登録の確認）

## フェーズ 2: Power Platform 管理者権限の確認（ここで即座に判断する）
1. `.github/skills/admin/SKILL.md` と `.github/skills/admin/references/admin-roles.md` を読み込み、これ以降の操作に必要な最小ロール（Power Platform Administrator 等）を把握する。
2. `python .github/skills/admin/scripts/check_environment.py --environment-id $env:ENV_ID` を実行し、「管理 API アクセス」（管理者ロール相当か）の判定を確認する。（フェーズ 1 の手順 9 で採用が確定した認証方式で初回のみ認証が行われる。以降はキャッシュからサイレントに認証され、再実行時は非対話で完走する。）
3. 管理者権限がない、または判定が NG の場合は、**ここで作業を中断**し、次を報告して終了する。無理に自分の端末や権限で回避しようとしないこと。
   - 何が不足しているか（必要ロール名）
   - 管理者に依頼すべき内容（環境作成・セキュリティ ロール割り当て・Copilot Credits 割り当て・ACP 設定など）

## フェーズ 3: 開発環境の確認（管理者権限がある場合のみ。これから開発に使う 1 環境だけが対象）
`.github/skills/admin/SKILL.md` を読み込む。
**対象は今回開発に使う 1 つの環境に限定する。テナント全体の環境戦略の棚卸し・環境グループの作成・命名規則に沿った環境の一括作成（`scan_environment_strategy.py` / `apply_environment_strategy.py` / `environment_naming.py` / `create_environments.py`）や、Copilot Credits の配分・ACP の適用・CSP の設定などの構成変更は行わない。これらはユーザーが明示的に依頼した場合にのみ実施する。**

1. 今回開発に使う環境を確認する: 既存の Dataverse 環境から選ぶか、専用の Developer/Sandbox 環境を新規作成するかをユーザーに確認する（新規作成する場合は README の「専用環境を作成する」の手順を管理者へ案内）。決定したら `.env` の `ENV_ID` / `DATAVERSE_URL` / `TENANT_ID` を設定する。
2. `check_environment.py --environment-id $env:ENV_ID` を実行し、その環境で開発するにあたり最低限解消すべき問題点（既定環境ではないか・マネージド環境・Dataverse / Code Apps / MCP の有効化・セキュリティ ロール・管理 API アクセス・適用される DLP）を確認する。
3. `check_dlp.py --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID --connector shared_commondataserviceforapps` で、これから使う予定のコネクタが DLP でブロックされないかを確認する。
4. `NG` があれば、その内容と解消方法（開発者へのセキュリティ ロール割り当て・管理者への依頼内容など）を整理して報告する。`NG` がなければ、その環境で開発を始めてよい旨を報告する。

## 完了報告
- フェーズ 1〜3 それぞれの成否を報告する。
- フェーズ 3 で問題（NG）がなければ、続けて README の「クイックスタート」に進んでよい旨を案内する。
- フェーズ 2 で権限不足により中断した場合は、フェーズ 1（ローカル）が完了済みであることと、フェーズ 3 を再開するために必要な条件（誰にどの権限を依頼すべきか）を案内する。
```

> [!NOTE]
> テナント全体の環境戦略（環境グループの設計、命名規則に沿った環境の一括作成、不要環境の整理など）や、Copilot Credits の配分・ACP の適用・CSP の設定を実施したい場合は、`@GeekPowerCode` に「テナント全体の環境戦略を確認して」「この環境に Copilot Credits を配分して」のように明示的に依頼してください。admin スキルの読み取り専用スキャン・dry-run から始まり、内容提示 → ユーザー確認 → `--apply` の順で進みます。

> [!NOTE]
> 設定値は `.github/skills/admin/references/environment-strategy.json`（ブループリント）に集約されています。組織固有の名称・人数・命名規則を変えたい場合は、プロンプト実行前後にこのファイルを編集してください。

### ライセンスの準備

| 対象 | 必要なライセンス / 前提 | 出典 |
|---|---|---|
| GitHub Copilot（VS Code / Claude Code でのエージェント開発） | **GitHub Copilot Pro 以上**（Pro / Pro+ / Business / Enterprise） | [GitHub Copilot のプラン](https://github.com/features/copilot/plans) |
| Code Apps（コードファースト開発） | **Power Apps Premium** または **Dynamics 365 Enterprise / Customer Engagement**。無料利用は **Power Apps 開発者プランの開発者環境** を使用 | [Power Apps の価格](https://www.microsoft.com/ja-jp/power-platform/products/power-apps/pricing) |
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

### クラウド環境の準備

> [!CAUTION]
> **デフォルト環境（Default）では開発しないでください。** 組織全員が参照できる共有環境のため、テーブルやソリューションが意図せず他ユーザーに見えます。必ず専用の **Developer 環境** または **Sandbox 環境** を用意してください。

Copilot Studio を利用する場合は、次の順序で管理者による事前設定を行います。

1. Dataverse を含む専用環境を作成する
2. 開発者へ必要なセキュリティ ロールを割り当てる
3. Copilot Credits をその環境に割り当てる
4. Advanced Connector Policy で利用を許可するコネクタを設定する
5. Code Apps を使用する場合は環境の機能を有効化する

#### エージェントへのプロンプトで設定する（推奨）

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

1. 対象環境で利用するコネクタとアクションを事前に棚卸しする
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

開発ツールの導入・PATH 設定・動作確認は、手順を手打ちせずに [前提条件冒頭の統合プロンプト](#統合プロンプトで一気に準備する推奨) をチャットに貼り付けて実行してください（クラウド環境の準備が不要な場合は、そのプロンプトの「フェーズ 1」部分だけを貼り付けても構いません）。

> [!Note]
> クイックスタートのコマンドで `npx` が実行できないというエラーが出る場合は、Node.js インストール直後で PATH がまだ反映されていない可能性があります。新しいターミナルを開き直して再実行してください。

#### Python パッケージと初回サインイン

スキルの Python スクリプト（Dataverse 構築、DLP 事前チェック、Azure 連携など）は、共通認証
`.github/skills/standard/scripts/auth_helper.py` 経由で API を呼びます。初回だけ次を実行してください。

```powershell
python -m pip install -r .github/skills/standard/scripts/requirements.txt
```

導入されるのは `azure-identity` / `python-dotenv` / `requests` の 3 つだけです。

- `.env` に **`TENANT_ID`** を設定します。認証キャッシュはテナントごとに
  `~/.power-platform-cli/auth_record_{TENANT_ID}.json` へ分離保存されるため、複数テナントを行き来しても再認証は最小限で済みます。
- 環境 ID を使うスクリプト（DLP 事前チェックなど）では **`ENV_ID`** も設定します。
- **初回の認証キャッシュは、ユーザーに確認せず自動で検証します。** まず `.env` に `AUTH_MODE=interactive` を設定してローカルブラウザでの**インタラクティブ認証**を試し、キャッシュ（`AuthenticationRecord`）が作成できるか確認します。ブラウザ操作ができない環境などで失敗した場合は、`AUTH_MODE=interactive` を削除（または `AUTH_MODE=device_code` に変更）し、既定の **DEVICE CODE 認証**（表示されたコードを別のデバイス／ブラウザで入力する方式）にフォールバックします。
  - どちらの方式でキャッシュされても、**初回のみ**認証画面が表示されます。以降はキャッシュからサイレントに認証され、スクリプトは非対話で完走します。
  毎回認証を求められる場合は、`.env` の `TENANT_ID` が未設定でないかを確認してください。
- サインインできたら、開発に入る前に [Power Platform 環境のチェック](#power-platform-環境のチェック開発着手前に必須) を実行してください。

> [!NOTE]
> PR 作成やスキル公開を行う場合は `gh auth login` 済みの GitHub CLI も必要です。

---

## 管理者権限（管理者ロール）要件

開発者本人の権限だけでは完結せず、**テナント/環境の管理者**（またはその権限を持つ人）による事前設定が必要な操作があります。特に Cowork プラグインやテナント横断の設定は、開発者単独では実施できない場合があります。**Cowork 関連の操作（#2〜#8）は、会社環境で Cowork の利用が許可されている場合のみ実施してください。**

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

---

## チーム開発向けの手順

<details>
<summary>最初からチーム用の private リポジトリを作りたい場合はここを開いてください</summary>

```bash
# 1. GitHub 上で空の private リポジトリを作成してクローン
gh repo create <your-account>/<your-theme-repo> --private --clone && cd <your-theme-repo>

# 2. エージェント・スキルと .gitignore を取得
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills
cp .github/skills/standard/references/gitignore-template .gitignore

# 3. Code Apps 標準の依存関係を先読みインストール（ほとんどのケースで Code Apps を作成するため）
cp .github/skills/code-apps/references/template-snapshot/package.json .
cp .github/skills/code-apps/references/template-snapshot/package-lock.json .
npm install

# 4. npm install の完了を待たず、@GeekPowerCode にプロジェクト scaffold を依頼
```

> [!TIP]
> GitHub Copilot, Claude Code などに上記 bash をプロンプトとして入れることで対話型で進めることもできます。その場合、`npm install` は完了を待たずに実行し（非同期・バックグラウンド実行）、続けて手順 4（`@GeekPowerCode` の呼び出し）に進んでください。デザインテンプレート選定などの序盤の対話は `node_modules` を必要としないため、`npm install` はその間に並行して完了します。
>
> Azure DevOps / 社内 Git / ローカル NAS など GitHub 以外のリモートを使う場合も、同じ手順で `git remote add origin <url>` を実行すれば、GitHub には何も公開せずに運用できます。

</details>

---

## 上流の開発標準更新を取り込む

git merge は不要です。テーマのリポジトリで以下を再実行するだけで、最新の標準（`.github/` のエージェント・スキル）に追従できます。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents --force
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills --force
```

> [!TIP]
> 同期対象は `.github/agents` と `.github/skills` のみで、テーマ固有のコード（`src/` 等）や `.github/prompts`・`.github/workflows`・`.github/community-issue-policy.json` には触れません。同期後は `git diff` で差分を確認してからコミットしてください。

---

## 環境チェック

### ローカル開発ツールのチェック

```bash
npm run check:env   # Node.js / Python / pac 等の確認のみ
npm run setup       # 上記 + Python venv bootstrap
```

<details>
<summary>詳細・不足時の対応</summary>

`npm run setup` で **環境事前チェック (preflight) + Python bootstrap** をまとめて実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。`gh` が利用可能かつ `gh auth login` 済みの場合は、デフォルトブランチの **Copilot 承認バイパス設定**（Branch protection の bypass app）も確認します。

Python と pip が利用可能な場合は、`spec-builder` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。

不足時の対応:

- Python 未検出: Python 3.10+ を導入して `python --version` または `py -3 --version` を通す
- pip 未検出: `python -m ensurepip --upgrade`（または `py -3 -m ensurepip --upgrade`）
- `pac` 未検出: VS Code 拡張機能『Power Platform Tools』または `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入後、`pac auth create --environment {ENVIRONMENT_ID}`（**PAC CLI は npm では配布されていない**）
- `npx power-apps` 未検出: `npm install` を再実行し `@microsoft/power-apps` 依存を確認

</details>

### Power Platform 環境のチェック（開発着手前に必須）

ローカルのツールが揃っても、**環境側の設定が足りないと開発の途中で止まります**（Code Apps が無効、既定環境で作ってしまった、セキュリティ ロールが足りない等）。`.env` に `TENANT_ID` / `ENV_ID` / `DATAVERSE_URL` を設定したら、次を実行してください。読み取り専用で、環境の設定は一切変更しません。

```powershell
python .github/skills/admin/scripts/check_environment.py --environment-id $env:ENV_ID
```

確認する項目:

| # | 項目 | 判定内容 |
|---|---|---|
| 1 | 既定環境ではないか | 既定環境（Default）で開発していないか。既定環境は組織全員が参照できるため `NG` |
| 2 | 環境の状態 | 環境が `Enabled`（無効化・削除待ちでない）か |
| 3 | マネージド環境 | マネージド環境か。共有制限・ソリューション チェッカーの設定値も表示 |
| 4 | Dataverse | Dataverse が有効で `Ready` か。インスタンス URL とバージョンを表示 |
| 5 | 監査 | 組織の監査（`isauditenabled`）が有効か |
| 6 | Dataverse MCP | Dataverse MCP（`IsMCPEnabled`）が有効か |
| 7 | MCP クライアント許可 | `allowedmcpclients` で有効なクライアント数（Cowork 等の利用可否） |
| 8 | Code Apps | 環境でコード アプリが利用できるか |
| 9 | セキュリティ ロール | 自分に **System Administrator**（または System Customizer + Environment Maker）が割り当てられているか。チーム経由の割り当ても検出 |
| 10 | 管理 API アクセス | テナントのデータ ポリシーを参照できるか（管理者ロール相当か） |
| 11 | 適用される DLP | この環境に適用されるデータ ポリシーの一覧 |

`NG` が 1 つでもあれば、開発に入る前に解消してください（対処方法は
[admin スキル](.github/skills/admin/SKILL.md) と
[管理者ロール一覧](.github/skills/admin/references/admin-roles.md) を参照）。
Code Apps・MCP・マネージド環境が要件の場合は `--require-code-apps` / `--require-mcp` / `--require-managed`
を付けると、警告を `NG` に昇格させて確実に止められます。

続けて、ソリューションが使うコネクタが DLP でブロックされないかを確認します。

```powershell
python .github/skills/admin/scripts/check_dlp.py --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID --connector shared_commondataserviceforapps
```

> [!TIP]
> Copilot チャットで `@GeekPowerCode` に「開発を始める前に環境をチェックして」と依頼すれば、
> 上記 2 つを実行して結果を要約し、`NG` があれば解消方針まで提示します。

---

## カスタムエージェント前提の利用方法

- この開発標準の実装・運用ルールは、GitHub Copilot / Claude Code で共通利用するスキル（`.github/skills/`）に定義されています。
- 利用者は手順書を読み込んで操作するのではなく、カスタムエージェントに要件を伝えて進める前提です。
- 依頼例: GeekPowerCode エージェントを選択して `在庫管理をもっと効率的に行いたい。`
- 既存仕様書がある場合の入力例: `spec-builder を実行して`

---

## リポジトリ構成

<details>
<summary>ディレクトリツリーを表示</summary>

```text
.
├── .github/
│   ├── agents/                      # Copilot カスタムエージェント定義
│   └── skills/                      # 製品単位で統合された 22 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
│       ├── admin/                   # 環境チェック・DLP 事前チェック・ガバナンス設定
│       ├── update-skills/           # スキル作成・更新・PR 提出
│       ├── alm/                     # テンプレート化・pre-commit ゲート・CI/CD デプロイ
│       ├── azure/                   # Azure リファレンスアーキテクチャ・セキュアデプロイ
│       ├── dataverse/               # テーブル設計・構築・セキュリティロール
│       ├── code-apps/               # Code Apps 開発（UI 設計・CSP・メール送信含む）
│       ├── mobile-apps/             # Native Mobile Code Apps 開発（Private Preview）
│       ├── power-pages/             # Power Pages コードサイト開発・デプロイ
│       ├── generative-page/         # Generative Pages 開発
│       ├── model-driven-app/        # モデル駆動型アプリ構築
│       ├── copilot-studio/          # エージェント構築・トリガー・ニュース配信
│       ├── copilot-studio-v2/       # 新アーキテクチャ（cliagent）エージェント完全自動構築
│       ├── power-automate/          # クラウドフロー作成・デプロイ
│       ├── cowork/                  # Copilot Cowork プラグイン開発・公開
│       ├── ai-teammate/                # Foundry エージェントを Agent 365 経由で Teams / M365 に公開
│       ├── ai-builder/              # AI プロンプト作成
│       ├── spec-builder/            # 一次情報→要件定義書（仕様書）作成
│       ├── package-sample/          # サンプルのパブリック公開パッケージング
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

スキルの一覧・説明・推奨開発フローは **[スキルカタログ（.github/skills/README.md）](.github/skills/README.md)** で一元管理しています。スキルの追加・変更はまずここを更新してください。

---

## ライセンス

MIT License。詳細は [LICENSE](./LICENSE) を参照してください。

---

## フィードバック

- Issues: https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues
- X: https://twitter.com/geekfujiwara
