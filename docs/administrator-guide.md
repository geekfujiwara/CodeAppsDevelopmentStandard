# テナント・環境管理者向けガイド

[READMEへ戻る](../README.md#テナント環境管理者向け)

対象: ライセンス・環境・セキュリティロール・DLP / ACPを管理する担当者。必要最小限の権限で、対象環境と変更内容を確認してから設定します。

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

これらのクラウド側の設定は、管理センターの画面を開かずに **[admin スキル](../.github/skills/admin/SKILL.md) を読み込んだエージェント**に依頼して実行できます。画面操作は手順が長く、環境が増えるたびに設定漏れとドリフトが起きるため、コマンドを手打ちするのではなく、エージェントにスキルを読ませて再現できる形にしておきます。

[前提条件冒頭の統合プロンプト](developer-guide.md#統合プロンプトで一気に準備する推奨)を使えば、ローカル準備からこのクラウド環境準備までを 1 回の依頼で実行できます。クラウド側だけをやり直したい場合は、そのプロンプトの「フェーズ 2」「フェーズ 3」部分だけを貼り付けて依頼してください。

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
> - 実装に入る前に、そのソリューションが使うコネクタが利用できるかを確認します（[DLP 事前チェック](../.github/skills/admin/references/dlp-precheck.md)）。**参照にも #9 / #10 の管理者権限が必要**なため、権限がない場合は管理者にスクリプトを実行してもらい、結果を共有してもらってください。
> - ポリシー変更の反映には**通常 1 時間以内、最大 24 時間**かかります。変更直後に解消していなくても、再評価まで待ってから判断してください。
> - **Advanced connector policies（ACP）は認定コネクタと MCP コネクタのみ**が対象です。カスタムコネクタ・HTTP コネクタ・Copilot Studio の仮想コネクタは、従来のデータ ポリシーで引き続き管理する必要があります。
> - 上記の管理者ロール一覧と、権限がない場合の進め方は [admin スキルの管理者ロール一覧](../.github/skills/admin/references/admin-roles.md) にまとめています。

</details>

## 設定後の確認

設定変更後は対象設定を読み戻して確認してください。通常開発の前に一括環境チェックを必須にはしません。
明示的な確認依頼時・障害時だけ [環境チェック](developer-guide.md#環境チェック)を利用し、
開発者の委任権限が不足する管理操作は管理者が引き受けます。影響しないローカル開発は継続できます。
