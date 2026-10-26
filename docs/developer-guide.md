# 開発者向けガイド

[READMEへ戻る](../README.md#開発者向け)

対象: 業務アプリの要件整理・実装・検証を行う開発者。自社標準がある場合は公開元ではなく承認済みの自社標準を利用してください。

## 前提条件

端末へのツール導入許可と対象環境の開発者ロールを確認します。[ライセンス・クラウド設定](administrator-guide.md)は管理者と確認し、権限不足時には管理者へ依頼してください。

### 統合プロンプトで一気に準備する（推奨）

ローカル開発環境の準備から Power Platform のクラウド環境準備までを、コマンドを手打ちせずに **1 つのプロンプト**で一気通貫に実行できます。VS Code の GitHub Copilot Chat で `/` を入力して **Setup Development Environment** を選択するか、[統合プロンプト](../.github/prompts/setup-development-environment.prompt.md)を開いて実行してください。

> [!IMPORTANT]
> クラウド環境の準備には Power Platform 管理者権限が必要な工程が含まれます。**実行者が管理者権限を持っていないと判明した時点で、エージェントは処理を中断します。** 権限昇格や迂回は行わず、不足しているロールと管理者への依頼内容を報告して終了する前提のプロンプトです。

> [!NOTE]
> テナント全体の環境戦略（環境グループの設計、命名規則に沿った環境の一括作成、不要環境の整理など）や、Copilot Credits の配分・ACP の適用・CSP の設定を実施したい場合は、`@GeekPowerCode` に「テナント全体の環境戦略を確認して」「この環境に Copilot Credits を配分して」のように明示的に依頼してください。admin スキルの読み取り専用スキャン・dry-run から始まり、内容提示 → ユーザー確認 → `--apply` の順で進みます。

> [!NOTE]
> 設定値は `.github/skills/admin/references/environment-strategy.json`（ブループリント）に集約されています。組織固有の名称・人数・命名規則を変えたい場合は、プロンプト実行前後にこのファイルを編集してください。

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

導入されるのは `azure-identity` / `python-dotenv` / `requests` の 3 つだけです。統合プロンプトのフェーズ 1 を実行済みなら、`.env` の設定と初回のインタラクティブ認証もすでに完了しています。

<details>
<summary>認証キャッシュの仕組みと手動設定の詳細を表示</summary>

- `.env` に **`TENANT_ID`** を設定します。認証キャッシュはテナントごとに
  `~/.power-platform-cli/auth_record_{TENANT_ID}.json` へ分離保存されるため、複数テナントを行き来しても再認証は最小限で済みます。
- 環境 ID を使うスクリプト（DLP 事前チェックなど）では **`ENV_ID`** も設定します。
- **初回の認証キャッシュはインタラクティブ認証で作成します。** `auth_helper.py` がローカルブラウザを起動し、サインイン後にキャッシュ（`AuthenticationRecord`）を保存します。デバイスコード認証へのフォールバックは行いません。以降はキャッシュからサイレントに認証され、スクリプトは非対話で完走します。
  毎回認証を求められる場合は、`.env` の `TENANT_ID` が未設定でないかを確認してください。

> [!NOTE]
> PR 作成やスキル公開を行う場合は `gh auth login` 済みの GitHub CLI も必要です。

</details>

サインインできたら、既知の対象環境・ソリューションを使って開発を開始し、Code Appsの初回デプロイを優先します。
環境・DLP / ACP・Code Apps許可の事前診断は不要です。明示的にチェックを依頼した場合、または障害時だけ
[環境診断](#power-platform-環境のチェック明示依頼時障害時だけ)へ進みます。
SharePoint URLは直接接続・継続利用の明示がなければ移行元とし、Dataverseに移行して利用します。

## 環境チェック

### ローカル開発ツールのチェック

標準リポジトリのルートで実行します。アプリ側の `package.json` に同名スクリプトがあるとは限りません。

```bash
npm run check:env   # Node.js / Python / pac 等の確認のみ
npm run setup       # 上記 + Python venv bootstrap
```

`npm run setup` は環境事前チェックとPython bootstrapを実行し、Node.js / npm / Python（`python` or `py -3`）/ pip / `npx power-apps` / `pac` を確認します。`gh` が利用可能かつ認証済みの場合は、デフォルトブランチのCopilot承認バイパス設定も確認します。Pythonとpipが利用可能なら、`spec-builder` 用 `.venv` と依存パッケージの導入を試行します。

不足時の対応:

- Python: Python 3.12を推奨。`python --version` または `py -3 --version` を確認する。
- pip: `python -m ensurepip --upgrade`（または `py -3 -m ensurepip --upgrade`）。
- `pac`: PP CLIをMSIまたは `dotnet tool install --global Microsoft.PowerApps.CLI.Tool` で導入し、`pac auth create --environment {ENVIRONMENT_ID}` で認証する。PAC CLIはnpm配布ではない。
- `npx power-apps`: Code Appsを選定したプロジェクトで `@microsoft/power-apps` の依存定義とインストール結果を確認する。

<a id="power-platform-環境のチェック開発着手前に必須"></a>

### Power Platform 環境のチェック（明示依頼時・障害時だけ）

明示的な環境チェック依頼時のみ一括確認します。障害時は
[権限確認付き復旧](../.github/skills/admin/references/development-recovery.md)に従い、原因に必要な診断だけを行います。
現在有効な委任権限・ロール・対象範囲を確認し、読み取り権限がない・不明ならスクリプトを試さず管理者へ依頼します。
通常開発の着手条件にはしません。

実行する場合は `.env` に `TENANT_ID` / `ENV_ID` / `DATAVERSE_URL` を設定し、対象環境だけを確認します。次のスクリプトは読み取り専用で、環境設定を変更しません。PowerShellの環境変数に設定値が読み込まれていることを確認してください。

```powershell
python .github/skills/admin/scripts/check_environment.py --environment-id $env:ENV_ID
```

| 項目 | 確認内容 |
|---|---|
| 既定環境 | Default環境で開発していないこと |
| 環境の状態 | Enabledであること |
| マネージド環境 | 設定状態、共有制限、ソリューションチェッカー |
| Dataverse | Ready、インスタンスURL、バージョン |
| 監査 | `isauditenabled` |
| Dataverse MCP | `IsMCPEnabled` |
| MCPクライアント許可 | `allowedmcpclients` の状態 |
| Code Apps | コードアプリが利用可能か |
| セキュリティロール | System Administrator、または必要なSystem Customizer / Environment Maker等。チーム経由の割り当ても確認 |
| 管理API | 管理APIアクセスと必要な管理者権限 |
| DLP | 対象環境に適用されるデータポリシー |

`NG` は該当操作を再開する前に解消し、権限不足で読めない項目は未確認とします。[adminスキル](../.github/skills/admin/SKILL.md) と [管理者ロール一覧](../.github/skills/admin/references/admin-roles.md) を参照し、権限が不足する場合は管理者へ依頼してください。影響しないローカル開発は継続できます。

明示的な一括環境チェック依頼では、個別チェックの代わりに次の統合診断を使えます。Dataverseと新Copilot Studio WorkflowのAgentノードを含む環境・クラシックDLP・ACPの読み取り権限が必要です。追加コネクタは `--connector shared_xxx` で指定します。

```powershell
python .github/skills/admin/scripts/check_development_environment.py --environment-id $env:ENV_ID --tenant-id $env:TENANT_ID
```

`shared_agentnode` は標準チェック対象で、自動的に許可を付与しません。未許可なら影響範囲とdry-runを確認し、明示承認後だけ変更します。構成チェック成功後もWorkflowのReviewと最小実行を確認してください。実行時HTTP 442（DLP/ACP）では `Last refresh` を記録して反映・同期状態を確認し、実行成功前に準備完了と断定しません。

自社名のカスタムエージェントに「開発を始める前に環境をチェックして」と依頼すれば、チェック結果とNGの解消方針を整理できます。

## カスタムエージェント前提の利用方法

- 最初は [READMEのクイックスタート](../README.md#クイックスタート)をCopilot ChatのAgentモードへコピーしてください。Step 0の標準更新・共通認証後は要望確認で一旦停止して回答を待ちます。継続回答後は、Step 1の業務資料整理・仕様・architecture・既存テンプレート提案、Step 2の環境・必要時のAzure調査、Step 3のフル構成の開発デプロイ・品質／実動作検証・各URL共有・文書更新まで自律的に進めます。分かることを自分で調べ、既知事項を聞き直しません。Mermaid図はチャットとMarkdownへ示し、質問ポップアップ内には入れません。配置後は `/Quickstart` でも実行できます。
- 共通の実装・運用ルールは `.github/skills/` に定義されています。
- Copilotでは自社名に変更したカスタムエージェントを選択し、`在庫管理をもっと効率的に行いたい。` のように要件を伝えます。
- 既存仕様書がある場合は `spec-builder を実行して` と依頼します。
- エージェントは該当スキルを読み、設計・承認後はすぐに実装・初回デプロイへ進みます。全テーブル構築・移行・ローカライズ完了は初回pushの待ち条件にしません。未接続部分は明示し、接続後に改善デプロイします。
- 障害時は委任権限を確認して、最小診断・承認済み修復・元の操作を1回リトライします。権限なし・不明なら管理操作をせず環境管理者へ依頼します。

## 次に読む資料

- [チーム用リポジトリの準備](company-standard-next-steps.md#チーム開発向けの手順)
- [Claude Codeのクイックスタート](claude-code-quickstart.md)
- [主要ドキュメント](company-standard-next-steps.md#主要ドキュメント)
