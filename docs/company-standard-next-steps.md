# 自社標準コピー後に行うこと

[READMEへ戻る](../README.md#自社標準の管理者向け)

自社の Organization に開発標準をコピーした後は、アプリ実装より先に、アクセス範囲・社内ルール・運用責任を整えることを推奨します。このリポジトリは標準を管理する場所とし、各業務アプリは別リポジトリで開発すると、標準とアプリ固有コードを分離できます。

## 自社標準リポジトリを API で作成する

この公開リポジトリを基に、会社固有のルールやスキルを追加する非公開の標準リポジトリを作成できます。GitHub Enterprise Cloud の Organization では、Organization 内の全メンバーから参照できる **`internal` を第一候補**とし、`internal` を利用できない場合だけ **`private`** を選択してください。

> [!IMPORTANT]
> 公開リポジトリを fork すると fork も必ず public になり、fork の可視性を `internal` や `private` に変更できません。そのため、この手順では GitHub の fork 関係を作らず、ファイルを新しい履歴へコピーした独立リポジトリを作成します。公開元は `upstream` remote として登録し、更新の比較元にします。

### GitHub Copilot に作成させる（推奨）

VS Code の GitHub Copilot Chat で `/` を入力し、**Create Company Standard Repository** を選択してください。これは [`.github/prompts/create-company-standard-repository.prompt.md`](../.github/prompts/create-company-standard-repository.prompt.md) に定義されたプロンプトです。

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

**作成後の次のステップ:** [自社標準コピー後の推奨事項](#推奨する順序) に沿って、まず上流更新をIssueで通知するGitHub Actions、社内向けのIssue回答ワークフロー、自社名のカスタムエージェントを整備してください。アクセス範囲、社内ルール、環境、更新・承認フローの確認方法に加え、それぞれをCopilotに依頼するサンプルプロンプトと、おすすめの添付資料もまとめています。

## 推奨する順序

| 順序 | 作業 | 確認すること |
|---|---|---|
| 1 | リポジトリとアクセス範囲を確認 | Organization、可視性、管理者・利用チーム、`origin` / `upstream` |
| 2 | 上流更新の通知を設定 | GitHub Actionsで公開元の更新を検知し、自社リポジトリにIssueを作成 |
| 3 | Issue対応ワークフローを見直す | 社内利用者への回答、対象者、承認、自動PRの可否、通知Issueとの分離 |
| 4 | エージェント名を自社向けに変更 | `GeekPowerCode` の表示名・ファイル名・呼び出し例を自社名へ統一 |
| 5 | 社内ルールを整理 | セキュリティ、データ分類、利用可能なサービス、命名規則、承認者 |
| 6 | 自社標準へ反映 | 共通ルールとプロジェクト固有ルールを分離し、PRでレビュー |
| 7 | 開発環境を確認 | ツール、対象環境、認証、必要ロール、DLP / ACP |
| 8 | 小さな業務テーマで試行 | 匿名化したサンプルによる要件・設計・テストの一巡 |
| 9 | 更新・承認フローを決める | 上流同期の担当・頻度、レビュー、変更履歴、利用チームへの通知 |

> [!IMPORTANT]
> `internal` は同じ Enterprise 配下のメンバーにも参照される可視性です。特定チームだけに限定する資料やコードには `private` と適切なアクセス権を使ってください。非公開リポジトリであっても、添付資料のAIへの提供が社内規程で許可されているかは別途確認します。

## 最初に整える3つの設定

以下は**コピー先の自社標準リポジトリで実施する作業**です。公開元のワークフローやエージェント名を直接変更するものではありません。後述のプロンプトをGitHub Copilot ChatやGitHubのCopilot Coding Agentへの依頼に使用してください。

### 上流更新をIssueで通知する

公開元の `main` の変更を、定期実行・手動実行できるGitHub Actionsで検知し、自社標準リポジトリに取り込み検討用のIssueを作成します。Issueには比較元・比較先のcommit SHA、比較リンク、変更ファイルと影響を載せ、担当者がレビューしてから必要な変更をPRで取り込みます。**通知と取り込みは分離し、自動上書きや自動マージはしません。**

既存の [weekly-sdk-updates.yml](../.github/workflows/weekly-sdk-updates.yml) はSDK・公式Skillsの更新を検知するものであり、公開元リポジトリとの差分通知とは別の役割です。初回にコピー元SHAを記録し、Issue作成済みの通知位置と、レビュー済み・取り込み済みの位置を区別してください。同じ比較先SHAへの通知は重複作成せず、更新が続く場合も未対応の差分を見失わない設計にします。

### コミュニティIssue対応を社内向けに見直す

[community-issue-agent.yml](../.github/workflows/community-issue-agent.yml) は公開コミュニティ向けの受付・再現・分類・低リスク変更のdraft PR作成を行います。現在の自動受付条件はOWNER・MEMBER・COLLABORATORを除外するため、そのままでは社内利用者のIssueを処理しない場合があります。

コピー先では、誰のIssueに回答するか、受付確認だけか回答案まで生成するか、自動コメント・自動PRを許可するかを決めます。関連する [ポリシー](../.github/community-issue-policy.json)、スクリプト、プロンプト、Secrets・Variablesも一緒に確認してください。上流更新通知用のIssueは専用ラベル等で分離し、一般の問い合わせ処理や自動修正を起動させないことを推奨します。

### GeekPowerCodeを自社名に変更する

[GeekPowerCode.agent.md](../.github/agents/GeekPowerCode.agent.md) の `name` とファイル名を、自社ブランドに合わせた名称（例: `ContosoPowerCode`）へ変更します。README、プロンプト、呼び出し例など、旧名称への参照も確認して更新します。開発ルール・ツール・Autoモデル設定は、別の変更が必要でなければ維持してください。

上流更新で元の `GeekPowerCode.agent.md` を再配置して2つのエージェントが並ばないよう、自社エージェントへの変更反映方法も決めておきます。

## おすすめの添付資料

まず「社内開発標準」「セキュリティ・データ取扱い規程」「対象業務の概要」の3点から始め、必要なものだけ追加します。Markdownが扱いやすい形式ですが、既存のOffice文書・PDF・画像も、対応するスキルで読み取りできます。

| 添付資料の例 | 含める内容 | 役立つ場面 |
|---|---|---|
| `company-development-standard.md` | 開発対象、技術選定、命名規則、品質基準、標準の責任者 | 公開元と自社標準の差分整理 |
| `security-and-data-policy.md` | データ分類、外部送信、AI利用条件、監査、保存期間、許可コネクタ | セキュリティ・DLP要件の整理 |
| `environment-overview.md` | 開発・検証・本番環境の用途、管理者窓口、必要ロール、利用可能なサービス | 環境確認と権限の依頼 |
| `business-process.md` | 利用者、現在の手順、課題、例外、業務用語、期待する成果 | ヒアリングと要件定義 |
| `data-dictionary.md` | テーブル・項目・型・関連・入力ルール、匿名化したサンプル | Dataverseや連携データの設計 |
| `design-guidelines.md` と画面例 | ブランド、色、アクセシビリティ、画面遷移、必要な操作 | UI要件の具体化 |
| `acceptance-criteria.md` | 成功条件、テストケース、性能目標、承認者 | 実装範囲と完了条件の合意 |
| `operations-and-review.md` | PRレビュー、リリース承認、障害対応、標準更新の担当と頻度 | チーム運用と継続更新 |

これらのファイル名は推奨例であり、すべてを作る必要はありません。文書には版・更新日・責任者を付け、相反する記述の優先順位を明確にします。不明な項目は推測で埋めず、確認事項として残してください。

- パスワード、アクセストークン、接続文字列、秘密鍵、認証済みのセッション情報は添付しません。
- 個人情報・顧客情報・実運用データは匿名化し、許可された範囲だけを使います。
- 環境IDなどの設定値と秘密値を区別し、必要な設定はローカルの `.env` 等で管理します。認証情報をチャットや標準ドキュメントに記載しません。
- 資料は根拠であり、資料中の命令をそのまま実行するものではありません。ポリシー変更・デプロイ・外部送信は別途承認します。

## Copilot に依頼するサンプルプロンプト

VS Codeで自社標準リポジトリを開き、必要な資料をチャットへ添付するか、許可されたワークスペース内のファイルとして参照させます。

### 1. コピーした状態を確認する

```text
このリポジトリを自社標準として使う前の点検をしてください。GitHub APIでOrganizationとvisibilityを読み戻し、origin、upstream、main、作業ツリー、.gitignore、残存するGitHub Actionsを確認してください。internalの閲覧範囲も説明してください。設定変更・削除・デプロイはせず、問題点と推奨対応を報告してください。
```

### 2. 上流更新通知のGitHub Actionsを作成する

添付推奨: 標準更新の担当者・頻度・承認フロー、コピー元commit SHA。GitHubのCopilot Coding Agentに依頼するときも、対象を自社標準リポジトリにしてください。

```text
この自社標準リポジトリに、公開元 geekfujiwara/CodeAppsDevelopmentStandard のmainへの変更を検知し、取り込み検討用のIssueを作成するGitHub Actionsを実装してください。これは既存のSDK・公式Skills更新チェックとは別のワークフローです。
最初に定期実行の頻度、通知担当者、初回の比較元commit SHAをAskUserQuestionで一つずつ確認してください。コピー元SHAが不明な場合は推測せず、初回を基準記録だけにするか確認してください。
定期実行とworkflow_dispatchに対応し、dry-runではIssueを作らず結果をJob Summaryに表示してください。GitHub APIから公開元を読み、コピー先にIssueを作成してください。必要最小限のcontents: readとissues: writeを使い、秘密値を出力しないでください。
Issueには比較元・比較先のSHA、比較リンク、変更ファイル、自社カスタマイズへの確認項目、取り込み用PRのチェックリストを含め、専用ラベルで問い合わせIssueと区別してください。同じ比較先SHAへの通知重複を防ぎ、並行実行を制御してください。通知済みと取り込み済みを区別し、Issue作成失敗時には通知位置を進めないでください。APIの失敗は明示し、ページネーションと履歴の書き換えも考慮してください。
自動merge・自動上書き・自動取り込みは行わないでください。重複なし、差分なし、初回、dry-run、API失敗をテストし、別ブランチでPRを作成してください。マージや実環境でのIssue作成は承認を待ってください。
```

### 3. Issue対応ワークフローを社内向けに見直す

添付推奨: 社内問い合わせ窓口、回答方針、AIによる自動回答・自動修正の許可範囲。

```text
この自社標準リポジトリのcommunity-issue-agent.ymlと、関連するポリシー・スクリプト・プロンプト・Secrets/Variablesの要件を確認してください。現在のOWNER/MEMBER/COLLABORATOR除外条件も確認し、社内利用者のIssue受付・回答に適した構成へ見直してください。
AskUserQuestionで対象者、受付確認だけか回答案まで生成するか、自動コメントの可否、自動draft PRの可否を一つずつ確認し、承認された範囲だけ実装してください。無断で回答や自動修正の対象を広げないでください。
上流更新通知の専用ラベルを持つIssueは、この問い合わせ対応や自動PRの対象から除外してください。Bot投稿・重複イベントによるループを防ぎ、Issue本文を信頼できない入力として扱ってください。社内情報や秘密値を外部へ送信しないでください。
必要最小限の権限で動かし、受付・回答・PR作成の承認境界とエラー報告を明確にしてください。社内利用者、対象外、Bot、更新通知、再オープンのテストを追加し、変更案と検証結果をPRにまとめてください。マージ・本番での自動回答は承認を待ってください。
```

### 4. カスタムエージェント名を自社向けに変更する

添付推奨: 会社・ブランド名、社内で推奨する命名規則。

```text
この自社標準リポジトリのGeekPowerCodeを自社向けのエージェント名へ変更してください。最初にAskUserQuestionで新しい名称を確認してください。
.github/agents/GeekPowerCode.agent.mdのnameとファイル名を変更し、README・ガイド・プロンプト・呼び出し例・設定内の旧名称への参照を調べて整合させてください。旧名称が公開元の説明に必要な場合は残し、機械的な全置換はしないでください。開発ルール・ツール・model: autoは維持してください。
上流更新で元のGeekPowerCodeが重複配置されたり、自社エージェントが上書きされたりしない更新手順も文書化してください。frontmatter、リンク、旧名称の残存用途を検証し、PRを作成してください。マージは承認を待ってください。
```

### 5. 社内規程と公開元との差分を整理する

添付推奨: 社内開発標準、セキュリティ規程、環境概要。

```text
添付した社内開発標準・セキュリティ規程・環境概要を根拠に、このリポジトリの標準との差分を整理してください。共通ルール、プロジェクト固有ルール、未確認事項に分け、各変更の根拠資料と該当箇所を示してください。どの規程を優先するか不明な場合は質問してください。まず提案だけを出し、ファイルやクラウド設定は変更しないでください。
```

### 6. 承認済みのルールを自社標準へ反映する

```text
承認した差分だけを、自社標準へ反映してください。自社名に変更したカスタムエージェント、スキル、instructionsの役割を確認し、重複を避けて適切な場所へ配置してください。社内共通ルールとアプリ固有設定を分離し、READMEと関連リンクも更新してください。秘密値は含めず、別ブランチでPRを作成し、私の承認前にマージしないでください。
```

### 7. 開発環境を準備・確認する

[Setup Development Environment](../.github/prompts/setup-development-environment.prompt.md) を選択して実行できます。対象環境と管理者窓口が分かる資料を添付してください。管理者権限が不足している場合は、その場で止めて必要なロールと依頼内容を報告する手順です。

### 8. 最初の業務テーマで試行する

添付推奨: 業務概要、データ辞書、画面例、受け入れ基準。Office文書・PDF・画像から要件をまとめる場合は、[spec-builder](../.github/skills/spec-builder/SKILL.md) の `spec/input/` に資料を配置します。

```text
自社名に変更したカスタムエージェントのルールと自社標準を読み、添付した業務概要・データ辞書・画面例・受け入れ基準から、小さな試行テーマを提案してください。要件と未確認事項を整理してからarchitectureスキルで構成を提案してください。標準リポジトリに業務アプリのコードを混在させず、別のアプリ用リポジトリで進めます。実装・環境変更・デプロイは承認と環境・DLPチェックが完了するまで行わないでください。
```

### 9. 標準の更新運用を決める

```text
公開元をupstreamとして、自社標準の更新運用を提案してください。上流同期の担当者・頻度・差分レビュー・自社変更の保護・検証・承認・利用チームへの通知を整理してください。独立したGit履歴を自動マージしたり、degit --forceで自社変更を無条件に上書きしたりせず、作業ブランチで比較する手順にしてください。
```

## チームへ展開する前のチェック

- Organizationと可視性、管理者・利用チームへのアクセス権が意図どおりである。
- 上流更新通知のActionsをdry-runで検証し、通知済みと取り込み済みを区別して管理できる。
- 社内Issue対応の対象者・回答方針・自動PRの可否を承認し、上流更新通知Issueを除外している。
- カスタムエージェント名と呼び出し例を自社名へ統一し、上流更新で重複・上書きしない手順がある。
- 社内規程と公開元の競合を解決し、自社標準の責任者が承認している。
- 必要なロール・DLP / ACPを対象環境で確認し、変更が必要なら管理者と合意している。
- サンプル業務で要件・実装・テストの流れを検証し、未検証の項目を明記している。
- 利用チームは公開元ではなく、自社標準の承認済み版を参照する手順になっている。
- 上流更新で自社変更を失わないレビュー・承認フローがある。

## チーム開発向けの手順

自社標準を管理するリポジトリと、業務アプリのリポジトリを分離します。Organizationと可視性は事前に確認し、Enterpriseで利用可能かつ閲覧範囲が適切なら `internal`、限定されたチームで管理する場合は `private` を選択します。

```powershell
$Organization = "<your-organization>"
$Repository = "<your-theme-repo>"
$Visibility = "internal" # 確認・承認した可視性。必要に応じて private
$Body = @{ name = $Repository; visibility = $Visibility } | ConvertTo-Json -Compress
$Body | gh api --method POST "orgs/$Organization/repos" --input -
if ($LASTEXITCODE -ne 0) { throw "リポジトリ作成に失敗しました。" }
git clone "https://github.com/$Organization/$Repository.git"
if ($LASTEXITCODE -ne 0) { throw "クローンに失敗しました。" }
Set-Location $Repository
```

続けて、**自社標準の承認済み版**からエージェント・スキルと `.gitignore` を配置します。private/internalの取得には認証済みのGitを使い、別フォルダーへ自社標準をcloneして必要なファイルをコピーしてください。既存の `.gitignore` は必要な設定を統合し、認証情報はコピーしません。公開元の `npx degit` をそのまま再実行すると、自社変更を迂回してしまうため避けます。

自社名のカスタムエージェントにscaffoldを依頼します。Code Appsを選定・承認した場合だけ、`code-apps` スキルがテンプレートの `package.json` / `package-lock.json` を配置して `npm install` を実行します。必要であればインストールと序盤の設計対話を並行できますが、ビルド・テスト前には完了と成功を確認します。

Azure DevOps / 社内Git / ローカルNAS等を使う場合は、そのホスティング先で空のリポジトリを作成し、認証済みGitでcloneするか `git remote add origin <url>` を設定します。GitHub APIでの作成は不要です。

## 上流の開発標準更新を取り込む

自社標準は公開元と独立した履歴なので、`git merge` や `git pull upstream main` で直接同期しません。上流更新通知Issueを起点に、作業ブランチで公開元の基準SHAと対象SHAを比較し、必要な変更だけを適用してPRで承認します。

1. 通知Issueの比較元・比較先SHAを確認し、公開元を別の比較用フォルダーへ取得する。
2. `.github/agents/` と `.github/skills/` の差分を確認し、自社のルールやエージェント名を維持して適用する。削除・改名されたファイルも確認する。
3. `.github/prompts/`・`.github/workflows/`・`.github/community-issue-policy.json` は自動同期せず、必要な変更だけ個別にレビューする。
4. `git diff` と関連テストで検証し、PRの承認後に取り込む。取り込み済みSHAと通知Issueの対応を記録する。

> [!WARNING]
> `npx degit ... --force` を自社標準に直接実行すると、自社変更を上書きします。元のGeekPowerCodeも再配置されるため、自社名のエージェントと重複する可能性があります。比較用フォルダーへの取得に限定し、自社標準やアプリの作業ツリーには無条件で適用しないでください。`src/` 等のアプリ固有コードは標準同期の対象外です。

## 開発者への案内

ローカル環境・Power Platform環境のチェックとカスタムエージェントの利用方法は、[開発者向けガイド](developer-guide.md)に統合しています。環境や権限の設定担当者は[管理者向けガイド](administrator-guide.md)を参照してください。

## リポジトリ構成

```text
.
├── .github/
│   ├── agents/       # 自社名のカスタムエージェント
│   ├── prompts/      # 選択して実行するプロンプト
│   ├── workflows/    # 上流通知・社内Issue対応等
│   └── skills/       # 製品・作業単位のスキル
│       ├── standard/ # 認証・環境設定・共通ルール
│       ├── admin/    # 環境・DLP・ガバナンス確認
│       ├── code-apps/
│       ├── spec-builder/
│       └── ...       # 詳細はスキルカタログ
├── docs/             # 導入・運用ガイド
├── .gitignore
├── package.json
├── LICENSE
└── README.md
```

スキルが所有するスクリプト・リファレンス・サンプルは、そのスキル配下に配置します。認証は `standard/scripts/auth_helper.py`、環境セットアップは `standard/scripts/bootstrap.mjs`、Code Appsのプレデプロイ確認は `code-apps/scripts/` にあります。

このリポジトリは標準の供給元であり、業務アプリの `src/` / `vite.config.ts` 等を混在させません。リファレンス実装は各スキルの `samples/` に置き、アプリのscaffoldは自社名のエージェントに別リポジトリで依頼します。環境変数テンプレートは [standardの `.env.example`](../.github/skills/standard/references/.env.example) を参照してください。

## 主要ドキュメント

- [Power Platform開発標準](../.github/skills/standard/references/power-platform-development-standard.md)
- [Microsoft Copilot Managed RuntimeとPower Apps Code Appsの比較](../.github/skills/architecture/references/managed-runtime-vs-code-apps.md)
- [Dataverseガイド](../.github/skills/dataverse/references/dataverse-guide.md)
- [Code Appsコネクタリファレンス](../.github/skills/code-apps/references/connector-reference.md)
- [Code Apps応用パターン](../.github/skills/code-apps/references/advanced-patterns.md)
- [スキルカタログ・サンプル実装一覧](../.github/skills/README.md#サンプル実装一覧)

## GitHub Copilot / Claude Code 活用

GitHub Copilotでは `.github/agents/` と `.github/skills/` を利用します。Claude CodeではCopilotの定義が自動登録される前提にせず、[Claude Codeクイックスタート](claude-code-quickstart.md) に従って標準ファイルを明示して参照させます。

必要なスキルを選択してエージェント駆動で進めることを基本とします。[スキルカタログ](../.github/skills/README.md) で一覧・説明・推奨フローを管理し、スキルの追加・変更時はカタログも更新してください。
