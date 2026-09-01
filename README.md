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
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github
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
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github
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
  - [ライセンスの準備](#ライセンスの準備)
  - [クラウド環境の準備](#クラウド環境の準備)
    - [専用環境を作成する](#専用環境を作成する)
    - [Copilot Credits を環境に割り当てる](#copilot-credits-を環境に割り当てる)
    - [Advanced Connector Policy を設定する](#advanced-connector-policy-を設定する)
    - [Code Apps を有効化する](#code-apps-を有効化する)
  - [ローカル開発環境の準備](#ローカル開発環境の準備)
    - [VS Code + GitHub Copilot](#vs-code--github-copilot)
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
2. Copilot Credits をその環境に割り当てる
3. Advanced Connector Policy で利用を許可するコネクタを設定する
4. Code Apps を使用する場合は環境の機能を有効化する

#### 専用環境を作成する

この操作には **Power Platform Administrator** または **Dynamics 365 Administrator** などの環境作成権限が必要です。Sandbox 環境の作成には、テナントに 1 GB 以上の空き Dataverse データベース容量も必要です。

1. [Power Platform 管理センター](https://admin.powerplatform.microsoft.com/) を開く
2. **管理** > **環境** > **新規** を選択
3. 環境名とリージョンを入力し、用途に応じて **Developer** または **Sandbox** を選択
4. **Dataverse データ ストアを追加する** を **はい** にして **次へ** を選択
5. 言語、URL、基本通貨、セキュリティグループを設定する
6. Dynamics 365 アプリが不要な場合は **Dynamics 365 アプリを有効にする** を **いいえ** にして **保存** を選択
7. 作成完了後、対象の開発者に少なくとも **Environment Maker** セキュリティロールを付与する

詳細: [Power Platform 管理センターで環境を作成および管理する（Microsoft Learn）](https://learn.microsoft.com/ja-jp/power-platform/admin/create-environment)

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

### ローカル開発環境の準備

#### VS Code + GitHub Copilot

VS Code をインストールすると **GitHub Copilot 拡張機能は最初から同梱**されています。別途 Extensions からインストールする必要はありません。GitHub アカウントでサインインし、Copilot ライセンスを有効化してください。

<details>
<summary><strong>プロンプトによる自動環境準備（所要 15 分）</strong></summary>

| ステップ | 操作 |
|---|---|
| 1. VS Code をインストール | [https://code.visualstudio.com/](https://code.visualstudio.com/) からダウンロード → インストール |
| 2. GitHub アカウントでサインイン | 左下のアカウントアイコン → GitHub でサインイン（GitHub Copilot 拡張は同梱済みのためインストール不要、サブスクリプションの有効化のみ必要） |
| 3. Copilot チャットを開く | `Ctrl+Alt+I`（Mac: `⌃⌘I`）または左サイドバーのチャットアイコンをクリック |

チャットが開いたら、以下のプロンプトをそのまま貼り付けて送信してください。**リポジトリの clone や `npm install` はこの段階では行いません。**

```text
Windows 端末の開発環境準備（開発ツールの導入と動作確認まで）を実行してください。
リポジトリの clone や npm install は行いません。完了したらクイックスタートに進む案内をしてください。

要件:
1. PowerShell 7 を最優先で導入し、以後の作業は PowerShell 7 で確認する。
2. VS Code の既定ターミナルプロファイルを PowerShell 7 に設定する（`terminal.integrated.defaultProfile.windows` を `PowerShell` = pwsh 7 にする）。クイックスタートのコマンドがそのまま動くことを確認する。
3. Git / Node.js LTS / Python 3.12 を導入する。
4. `npm install -g degit` で degit をグローバル導入する。クイックスタートの `npx degit` が初回ダウンロード待ちなしで即座に実行できるようにするため。
5. Power Platform は PP CLI のみ導入する（VS Code 拡張は入れない）。
6. PATH 未反映の可能性を考慮し、実体パス確認と PATH 反映を行う。特に Node.js インストール直後は `npx` が既存ターミナルで認識されないことがあるので注意する。
7. `gh auth status` で GitHub CLI のログイン状態を確認する（未ログインなら `gh auth login` を案内）。
8. リポジトリの fork / clone / `npm install` は実行しない。次のステップとしてクイックスタートへ案内する。

検証コマンド:
- $PSVersionTable.PSVersion
- git --version
- node --version
- npm --version
- npx --version
- degit --version  （degit がグローバル導入済みで即座に実行できることを確認）
- Write-Output A && Write-Output B  （`&&` が PS7 で動作することを確認。エラーになる場合は PowerShell 5.1 のままなので既定ターミナルプロファイルの設定を見直す）
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
- 最終検証は「新規に開いた PS7 セッション」と「作業開始時の既存セッション」の両方で確認する。特に `npx --version` と `&&` の検証は、Node.js 導入後に新規セッションで再確認する。
- 実行結果は「導入済み」「要再起動」「PATH 反映待ち」を分けて報告する。
- 最後のユーザー向けコメントには以下を含める:
  - 「環境準備 OK（ツール導入と動作確認まで完了）」の明示
  - クイックスタートのコマンドは新しい VS Code ウィンドウ／ターミナル（既定プロファイルが PowerShell 7 のもの）で実行するよう案内すること
  - 次のアクションとして README の「クイックスタート」を実行してローカルに clone することを案内
  - クイックスタートはリモートに fork せず、本リポジトリをローカルに直接 clone する方針である旨を補足
  - クイックスタート完了後は、VS Code の Copilot チャット（`Ctrl+Alt+I`）を開き、入力欄に `@GeekPowerCode` と入力してカスタムエージェントを選択し、作りたいテーマを伝えるよう案内する
  - 可能なら現在ディレクトリ名からテーマ候補を推測し、推奨プロンプトを 1 つ提案すること
```

> [!Note]
> `pac --version` は無効なため、バージョン確認は `pac help` のヘッダ表示を利用します。

> [!Note]
> クイックスタートのコマンドで `npx` や `&&` が実行できないというエラーが出る場合は、(1) PowerShell 5.1 のターミナルを使っている、(2) Node.js インストール直後で PATH がまだ反映されていない、のどちらかを疑ってください。

完了したら [クイックスタート](#クイックスタート) に戻ってください。

</details>

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

> [!NOTE]
> 上記のうち **#3・#4（Entra App Registration と管理者同意）は一度きり**（テナントで1回）、**#2（allowedmcpclients）は環境ごとに1回**の設定です。開発者自身が必要権限を持っていない場合は、管理者へ依頼してください。
>
> **ロール名は目安です。** 実際に付与すべき最小権限は組織のセキュリティ方針により異なる場合があるため、上記の出典（Microsoft Learn）を必ず確認してください。

---

## チーム開発向けの手順

<details>
<summary>最初からチーム用の private リポジトリを作りたい場合はここを開いてください</summary>

```bash
# 1. GitHub 上で空の private リポジトリを作成してクローン
gh repo create <your-account>/<your-theme-repo> --private --clone && cd <your-theme-repo>

# 2. エージェント・スキルと .gitignore を取得
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github .github
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

Python と pip が利用可能な場合は、`spec-builder` 用 `.venv` の作成と `requirements.txt` の導入まで自動で試行します。

不足時の対応:

- Python 未検出: Python 3.10+ を導入して `python --version` または `py -3 --version` を通す
- pip 未検出: `python -m ensurepip --upgrade`（または `py -3 -m ensurepip --upgrade`）
- `pac` 未検出: VS Code 拡張機能『Power Platform Tools』または `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入後、`pac auth create --environment {ENVIRONMENT_ID}`（**PAC CLI は npm では配布されていない**）
- `npx power-apps` 未検出: `npm install` を再実行し `@microsoft/power-apps` 依存を確認

</details>

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
│   └── skills/                      # 製品単位で統合された 19 スキル
│       ├── architecture/            # アーキテクチャ設計
│       ├── standard/                # 共通基盤（認証・アイコン・メールテンプレート）
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
