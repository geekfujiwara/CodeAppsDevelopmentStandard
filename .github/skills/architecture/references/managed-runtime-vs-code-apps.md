# Microsoft Copilot Managed Runtime と Power Apps Code Apps の比較

> 調査日: 2026-09-28  
> 対象: Microsoft Copilot Managed Runtime SDK Public Preview / Power Apps Code Apps GA

## 結論

Microsoft が公開した `@microsoft/managed-apps` は、正式には **Microsoft Copilot Managed Runtime SDK** である。
GitHub の公式リポジトリは
[`microsoft/managed-apps`](https://github.com/microsoft/managed-apps)。
SDK 本体、CLI、Vite plugin はそれぞれ npm パッケージとして提供される。

- [`@microsoft/managed-apps`](https://www.npmjs.com/package/@microsoft/managed-apps)
- [`@microsoft/managed-apps-cli`](https://www.npmjs.com/package/@microsoft/managed-apps-cli)（コマンド名は `ms`）
- [`@microsoft/managed-apps-vite-plugin`](https://www.npmjs.com/package/@microsoft/managed-apps-vite-plugin)

Copilot Managed Runtime と Power Apps Code Apps は、どちらも TypeScript / JavaScript の SPA を
Microsoft 管理ホストで実行し、Entra ID 認証と Power Platform connector をホスト経由で利用する。
一方、製品の管理境界と ALM は異なる。

- **Copilot Managed Runtime**: Microsoft 365 の内部業務アプリを Git-native に開発し、
  Cowork、Copilot Studio、SDK から作成されたアプリを同じ runtime と M365 管理面へ集約する。
- **Power Apps Code Apps**: コードファースト Web アプリを Power Apps 資産として公開し、
  Dataverse Solution、Power Platform Pipelines、Power Apps の共有・管理体系へ統合する。

したがって、`@microsoft/power-apps` を `@microsoft/managed-apps` に置換するだけの移行は行わない。
本リポジトリでは、Copilot Managed Runtime を Code Apps の新バージョンではなく、**別の配備ターゲット**
として扱う。

## 比較表

| 観点 | Microsoft Copilot Managed Runtime SDK | Power Apps Code Apps |
|---|---|---|
| 製品状態 | **Public Preview**。API、template、tooling は変更される可能性がある | **GA** |
| 主な管理境界 | Microsoft 365 / Copilot Managed Runtime | Power Platform / Power Apps |
| 主な用途 | M365 内部 LOB アプリ、複数の作成面を共通 runtime と管理面へ集約 | Power Apps のコードファースト Web アプリ、Dataverse / Solution ALM |
| アプリ形式 | TypeScript / JavaScript SPA | HTML または TypeScript / JavaScript SPA |
| SDK | `@microsoft/managed-apps` | `@microsoft/power-apps` |
| CLI | `ms app create/dev/build/play/deploy/share` | `pa app init/run/push/add data-source` |
| 設定 | `ms.config.json`。CLI / SDK 所有のため直接編集しない | `power.config.json` |
| 生成コード | `ms app add data-source` が `generated/` に型付き model / service を生成 | `pa app add data-source` が型付き model / service を生成 |
| データ | 1,500+ Power Platform connectors。Dataverse も connector として利用可能 | 1,500+ connectors と Dataverse。Code Apps 向け Dataverse、flow、custom API の資料が充実 |
| ソース管理 | platform-managed Git、BYO GitHub、または bring your own build。repository mode は作成後変更不可 | 任意の Git repository を利用可能。ただし Code Apps は Power Platform Git integration 非対応 |
| Build / deploy | commit SHA を基準に platform build。preview と live を分離し、`ms app deploy` で明示昇格 | ローカル build 済み成果物を `pa app push`。環境間は Solution / Pipeline で昇格 |
| Rollback | 過去の successful build を commit SHA で指定可能 | Solution / Pipeline と環境ごとのリリース手順で管理 |
| Repository hosting | CLI の `--repo`: platform-managed Git、GitHub.com、GitHub Enterprise Cloud（Learn 上は GitHub Enterprise Server と Azure DevOps Repos 非対応）。Copilot Code: GitHub / Azure DevOps / Local を選択可（2026-09-30 実機確認） | 製品が Git provider を限定しない。成果物を Power Apps へ push |
| CI/CD | 公式 GitHub Actions。外部 artifact deployment は既定無効 | service principal による `pa app push --non-interactive`、Solution、Power Platform Pipelines |
| 実行ホスト | Copilot Managed Runtime。利用者ポータルは `managedapps.cloud.microsoft` | Power Apps host。通常は `apps.powerapps.com` から実行 |
| 管理 | Microsoft 365 admin center の app inventory、usage、operational health | Power Platform admin center、maker portal、Power Platform Monitor |
| 認証・ガバナンス | Entra ID、Conditional Access、DLP、ACP、sharing limits、環境単位 CSP | Entra ID、Conditional Access、DLP、app quarantine、tenant isolation、sharing limits |
| 共有 | user / group へ `play` / `edit`。組織内リンクは guest / external user 非対応 | Power Apps の共有モデル。Azure B2B guest access 対応 |
| 利用資格 | Power Apps Premium または Managed Application Copilot Credits | Power Apps Premium、Pay-as-you-go、App Pass、Auto-claim |
| 向いている ALM | Git commit、PR、hosted preview、明示的 live promotion | Dataverse Solution、connection reference、Power Platform Pipelines |

## 共通点

1. SPA の UI と業務ロジックは通常の Web framework で実装する。
2. SDK と Microsoft 管理ホストの 3 層構成で動作する。
3. ホストが end-user の Entra ID 認証、アプリ読み込み、ガバナンスを担う。
4. connector 追加時に型付き model / service を生成し、クライアントコードから呼び出す。
5. React に限定されないが、Microsoft の starter は React / TypeScript / Vite を採用している。

## 重要な相違点

### 1. ALM の source of truth

Copilot Managed Runtime では Git repository が source of truth であり、build と deploy は実 commit に
対応する。push 自体では build されず、preview、deploy、または `ms app build` により platform build が
作られる。preview は最新の successful build、live は明示的に deploy した build を保持する。

Code Apps では `pa app push` がコンパイル済み app を Power Platform environment に公開する。
本番昇格は Dev / Test / Prod 環境、Solution export / import、Power Platform Pipelines を中心に設計する。

### 1.1 Copilot から作成したアプリも Git 管理できるか

**できる。** Copilot から作成する Managed Runtime app は Git-backed である。Microsoft Learn は、
Copilot Cowork または Microsoft Copilot Studio で作成したアプリも
Git によって backing され、編集権限を付与された開発者が repository を clone して任意の code editor で
開発を継続できると明記している。

ただし、次の 2 つを区別する。

1. **platform-managed Git を利用する**
   - GitHub Copilot CLI の公式 create-app quickstart はこの方式を使う。
   - coding agent が `ms` CLI を実行し、app record と platform-managed Git repository を作成する。
   - agent は内部で `git add`、`git commit`、`git push` を実行する。
   - Cowork / Copilot Studio から作成した app も、編集権限があれば
     `ms app clone --app <app-id>` で platform-managed repository を clone できる。
   - clone 後は通常の `git pull`、`git add`、`git commit`、`git push` を利用できる。

2. **自社の GitHub repository を Managed Runtime の source of truth にする**
   - app の作成または初期化時に `--repo <https-url>` を指定する。
   - 例: `ms app create my-app --repo https://github.com/<org>/<repo>`
   - GitHub.com と GitHub Enterprise Cloud (`*.ghe.com`) をサポートする。
   - 対象 organization / repository に Microsoft Managed Apps GitHub App の導入が必要。
   - 既存の branch protection、pull request review、CI を継続利用できる。
   - public repository は tenant policy で既定禁止である。

#### 作成経路ごとの Git 利用

| 作成経路 | 作成直後の Git | clone / 通常の Git 操作 | 自社 GitHub を正式な source of truth にする方法 |
|---|---|---|---|
| GitHub Copilot CLI + Managed Runtime plugin の公式 `create-app` skill | platform-managed Git を自動作成 | `ms app clone` または作成済み working tree で commit / push | 現行の first-party skill は `--repo` を付けずに作成するため、BYO GitHub は自動選択されない。外部 GitHub が必須なら、app 作成前に直接 `ms app create --repo <url>` を実行する |
| Managed Runtime SDK / `ms` CLI | platform-managed Git が既定 | 対応 | `ms app create` または `ms app init` の時点で `--repo <url>` |
| Copilot Code（Microsoft Copilot） | プロジェクト作成時に GitHub / Azure DevOps / Local を選択（2026-09-30 実機確認） | 選んだリポジトリで通常の Git 操作 | プロジェクト作成時に GitHub を選ぶ。Azure DevOps を選んだ場合の Managed Runtime デプロイは未検証 |
| Copilot Cowork / Microsoft Copilot Studio | Git-backed app。現在の公式 collaboration 手順は platform-managed repository の clone を説明 | edit access を得て `ms app clone --app <app-id>` | 作成後に repository type を切り替える公式経路はない。外部リポジトリが必須なら、Copilot Code または CLI で作成時に指定する |
| Bring your own build | platform が認識する source repository は持たない | 自社側で任意の Git を利用 | `--repo none` で新規作成し、外部 artifact deployment を使用。管理者による許可が必要 |

> [!IMPORTANT]
> repository type は app の作成時に固定され、後から変更できない。
> platform-managed Git で作成した既存 app を、後から GitHub repository binding に変更することはできない。
> 切り替える場合は、新しい app を正しい repository mode で作成し直す。

#### Copilot Code では最初からリポジトリを指定できる（2026-09-30 実機確認）

**できる。** Microsoft Copilot の **Copilot Code** では、プロジェクトごとに作業先のリポジトリを
最初から指定できることを、2026-09-30 に実テナントの UI で確認した。選択肢は次の 3 つ。

| 選択肢 | 用途 |
|---|---|
| **GitHub** | 既存の GitHub リポジトリ（private を含む）をプロジェクトの作業先にする |
| **Azure DevOps** | Azure DevOps Repos をプロジェクトの作業先にする |
| **Local** | ローカルの作業フォルダーで作業する |

したがって、Copilot から作る場合でも「作成後に platform-managed Git から移し替える」前提にする必要はない。
**プロジェクトの作成時にリポジトリを決める**のが正しい手順になる。

> [!NOTE]
> 根拠の種類を分けて扱う。
> - **実機確認（2026-09-30）**: Copilot Code のプロジェクト設定で GitHub / Azure DevOps / Local を選べる。
> - **Microsoft Learn（2026-09-25 更新版）**: Managed Runtime の CLI（`ms app create --repo`）の BYO repository は
>   GitHub.com / GitHub Enterprise Cloud のみで、Azure DevOps は非対応と記載されている。
>
> 両者は矛盾しているように見えるが、Copilot Code のプロジェクト リポジトリ設定と、CLI の `--repo` binding が
> 同じ仕組みかどうかは公開ドキュメントでは確認できていない。**Azure DevOps を選んだプロジェクトから
> Managed Runtime の preview / live デプロイまで通るかは未検証**のため、本番採用前に実測する。
> 確認項目: ビルド元がどのリポジトリか（`ms app info` の repository URL）、push 後の preview 反映、
> `ms app deploy` の成否、ブランチ保護・PR レビューが効くか。

#### GitHub Cloud Knowledge connector はリポジトリ指定の手段ではない

Microsoft 365 Copilot の **GitHub Cloud Knowledge connector** と、Copilot Code / Managed Runtime の
**リポジトリ設定** は別機能である。Connector を接続してもリポジトリの指定にはならない。

| 機能 | GitHub Cloud Knowledge connector | Managed Runtime の BYO GitHub |
|---|---|---|
| 目的 | GitHub 内の文書を Microsoft 365 Copilot / Search の knowledge として検索する | GitHub repository を app の source of truth として build / deploy する |
| 対象 | `.md`、`.txt`、repository metadata | app の source code と build 設定 |
| private repository | GitHub permission を反映して文書を索引できる | 空の private repository を app 作成 / 初期化時に binding できる |
| 書き込み | 文書の索引・検索用。commit / push 用の機能ではない | 標準 Git で commit / push する |
| App builder との関係 | app 要件の knowledge source にはなり得るが、生成コードの remote 指定にはならない | `ms app create --repo <url>` または `ms app init --repo <url>` で指定する |

GitHub Cloud Knowledge connector の公式資料は、private repository の権限を尊重しつつ、
Markdown と text file を索引して Copilot の回答に利用する機能として説明している。
source code repository の作成、generated code の commit、remote の選択、pull request の作成は説明していない。
リポジトリを指定する場合は、Connector ではなく Copilot Code のプロジェクト設定で選ぶ。

したがって現時点の結論は次のとおり。

- Copilot Code では、プロジェクトの作成時に GitHub / Azure DevOps / Local から作業先リポジトリを選ぶ。
- 作成後に切り替える前提にせず、プロジェクトごとに最初から決める。
- GitHub Cloud Knowledge connector はリポジトリ指定の手段として扱わない。
- Azure DevOps を選んだ場合の Managed Runtime へのデプロイ経路は未検証のため、本番採用前に実測する。

#### 「GitHub にコピーする」と「GitHub を source of truth にする」の違い

platform-managed repository を clone した local working tree に GitHub remote を追加し、mirror / backup として
push すること自体は標準 Git で可能である。しかし、その GitHub repository が自動的に Managed Runtime の
build source へ昇格するわけではない。Managed Runtime は app 作成時に binding された repository から build する。

したがって、本番運用で GitHub の branch protection、pull request approval、GitHub Actions を正式な ALM gate に
したい場合は、**app 作成前に BYO GitHub を選ぶ**。既に Copilot Cowork / Copilot Studio で試作した app は
`ms app clone` でコードを取得し、必要なら新しい BYO GitHub mode の app へ移植する。

#### GitHub Copilot CLI plugin の既定動作

GitHub Copilot CLI + Managed Runtime plugin の経路では、Copilot agent が `ms` CLI と標準 Git command を
代理実行するため、SDK / CLI と同じ Git model を使う。
ただし、2026-09-28 時点の first-party `create-app` skill は `ms app create` を `--repo` なしで実行するよう
定義されている。したがって、この plugin 経由では**自然言語で作らせるだけでは自社 GitHub は使われない**。
自社 GitHub を source of truth にする場合は、空の private repository を先に用意し、公式 skill に app を
作らせる前に `ms app create --repo <url>`、または既存 project 内で `ms app init --repo <url>` を実行する。
Microsoft Copilot の Copilot Code では、前述のとおりプロジェクト作成時にリポジトリを選べる。

### 2. 管理者と利用者の入口

Copilot Managed Runtime は Microsoft 365 admin center と専用 app portal を中心にする。
Code Apps は Power Platform admin center、Power Apps maker portal、Power Apps player を中心にする。
同じ Power Platform connector を利用しても、inventory、共有、監視、公開責任者は同一ではない。

### 3. Git provider と CI/CD

Copilot Managed Runtime の Git-native mode は GitHub.com / GitHub Enterprise Cloud に限定される。
外部 build artifact を公式 GitHub Actions から配備する場合は、管理者が
`AllowExternalArtifactDeployment` を有効にする必要がある。

Code Apps は Git provider から独立してソースを管理できる一方、Code Apps 自体は
Power Platform Git integration に対応していない。CI は `pa app push --non-interactive` と
Solution ALM を組み合わせる。

### 4. 外部共有

Copilot Managed Runtime の組織内共有リンクは guest / external user に対応しない。
Code Apps は Azure B2B guest access をサポートする。外部利用者が要件に含まれる場合は、
現時点では Code Apps または Power Pages を優先する。

### 5. 成熟度

Copilot Managed Runtime は Public Preview である。Microsoft の公式リポジトリも、
API、template、tooling が GA までに変わる可能性を明記している。
Code Apps は GA のため、GA 必須の本番案件では現時点の標準選択とする。

## 選定基準

### Copilot Managed Runtime を検討する

- M365 利用者向けの tenant 内部業務アプリである。
- Cowork / Copilot Studio / SDK から作成したアプリを同じ runtime と管理面に集約したい。
- Git commit、PR review、hosted preview、commit SHA rollback を ALM の中心にしたい。
- M365 admin center で tenant-wide inventory / usage / health を管理したい。
- Public Preview の変更リスクを受容できる PoC または評価案件である。

### Power Apps Code Apps を優先する

- GA が必須である。
- Dataverse Solution、connection reference、Power Platform Pipelines が ALM の中心である。
- Power Platform admin center / maker portal を運用の中心にする。
- Azure B2B guest を含む共有が必要である。
- 既存の Code Apps 資産、`pa` CLI、Power Platform 環境分離を継続利用する。

### 短い判断フロー

1. GA 必須、または Azure B2B guest 必須なら **Code Apps**。
2. Dataverse Solution / Power Platform Pipelines を優先するなら **Code Apps**。
3. M365 全体の app inventory と複数作成面の統合を優先するなら **Copilot Managed Runtime** を評価する。
4. Git commit 単位の preview / live / rollback を優先するなら **Copilot Managed Runtime** を評価する。
5. 判断できない場合は、現在 GA の **Code Apps** を標準とし、Managed Runtime は限定 PoC に留める。

## 移行・共存時のガードレール

1. SDK package の単純置換を禁止する。
2. `pa` と `ms`、`power.config.json` と `ms.config.json` の手順を混在させない。
3. `ms.config.json` は直接編集せず、対応する `ms` command で変更する。
4. repository mode は app 作成前に決定する。GitHub を正式な ALM gate にする場合は、最初から
   `--repo <url>` を指定する。作成後の切り替えを前提にしない。
5. Preview 中は SDK、CLI、Vite plugin の version を固定し、更新時に release 情報と破壊的変更を確認する。
6. build / deploy を commit SHA と対応付け、live promotion を明示的な承認対象にする。
7. public GitHub repository と external artifact deployment は標準で有効化しない。
8. Managed Runtime の `generated/` と Code Apps の生成物を同一 app に混在させない。
9. GitHub repository の MIT License、npm SDK の Microsoft Software License Terms、
   サービス利用資格を別々に確認する。
10. Preview から撤退する場合の Code Apps または通常の Web hosting への再実装範囲を PoC 開始前に記録する。

## 現時点の本リポジトリ方針

- Power Apps Code Apps を引き続き既定のコードファースト Web アプリ基盤とする。
- Copilot Managed Runtime は、M365 中心・Git-native ALM が明確な要件であり、
  Preview 採用が承認された場合に限って比較候補に含める。
- Managed Runtime の実装は独立したスキル [`managed-runtime`](../../managed-runtime/SKILL.md) で行う。
  `code-apps` の skill・template・script は Managed Runtime には使わない。

## 主要な一次情報

### Microsoft Copilot Managed Runtime

- [製品概要](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/?view=o365-worldwide)
- [SDK 開発者向け概要](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/?view=o365-worldwide)
- [Architecture](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/architecture?view=o365-worldwide)
- [CLI quickstart](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/quickstart-managed-apps-cli?view=o365-worldwide)
- [Connect to data](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/connect-to-data?view=o365-worldwide)
- [Build, preview, and deploy](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/dev-inner-loop?view=o365-worldwide)
- [GitHub Copilot CLI での app 作成](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/quickstart-github-copilot?view=o365-worldwide)
- [既存 app の共同開発と repository clone](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/collaborate-on-app?view=o365-worldwide)
- [First-party `create-app` skill](https://github.com/microsoft/managed-apps/blob/main/plugins/microsoft-managed-apps/skills/create-app/SKILL.md)
- [GitHub Actions deployment](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/deploy-managed-apps-github-actions?view=o365-worldwide)
- [GitHub Cloud Knowledge connector overview](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/github-cloud-knowledge-overview)
- [GitHub Cloud Knowledge connector deployment](https://learn.microsoft.com/en-us/microsoft-365/copilot/connectors/github-cloud-knowledge-deployment)
- [Share an app](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/share-app?view=o365-worldwide)
- [Content Security Policy](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/content-security-policy?view=o365-worldwide)
- [Monitoring](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/monitor-apps?view=o365-worldwide)
- [M365 admin overview](https://learn.microsoft.com/en-us/microsoft-365/admin/manage/apps/?view=o365-worldwide)
- [公式 GitHub repository](https://github.com/microsoft/managed-apps)

### Power Apps Code Apps

- [Features, requirements, and limitations](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/overview)
- [Architecture](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/architecture)
- [Create an app](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/create-an-app-from-scratch)
- [Connect to data](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/connect-to-data)
- [Application lifecycle management](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/alm)
- [System limits and configuration](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/system-limits-configuration)
- [Service principal deployment](https://learn.microsoft.com/en-us/power-apps/developer/code-apps/how-to/use-service-principal)
- [公式 GitHub repository](https://github.com/microsoft/PowerAppsCodeApps)

## 再調査が必要な項目

Public Preview 中は少なくとも次を定期確認する。

- GA 時期と SLA / support scope
- SDK / CLI / Vite plugin の version と破壊的変更
- license / Copilot Credits の消費条件
- external sharing と guest support
- repository provider と repository mode の対応範囲
- Copilot Code で Azure DevOps / Local を選んだプロジェクトから Managed Runtime の preview / live へデプロイできるか
- Solution / Power Platform Pipelines との統合可否
- CSP、DLP、ACP、external artifact deployment の管理設定
