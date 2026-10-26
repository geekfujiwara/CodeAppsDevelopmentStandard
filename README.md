# AI ファースト開発標準

Power Platform / Azure の業務システムを **VS Code + GitHub Copilot / Claude Code** で開発するための、スキル・エージェント・リファレンスを提供するリポジトリです。Power Apps Code Apps、Dataverse、Power Automate、Power Pages、Copilot Studio、Cowork等に対応します。Code Appsの実装標準は **TypeScript + React + Tailwind CSS** です。

[![VS Code で開く](https://img.shields.io/badge/VS%20Code%E3%81%A7%E9%96%8B%E3%81%8F-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://vscode.dev/github/geekfujiwara/CodeAppsDevelopmentStandard)
[![GitHub Copilot](https://img.shields.io/badge/GitHub%20Copilot-対応-blueviolet?style=for-the-badge&logo=github)](https://github.com/features/copilot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

[使い方を説明した動画（YouTube）](https://youtu.be/-BU7KnjvYoc?si=iO8MtVLq__gOfTqw)

## 対象者別の入口

| 対象者 | 最初に読むガイド | 主な内容 |
|---|---|---|
| 業務アプリを開発する人 | [開発者向けガイド](docs/developer-guide.md) | ツール導入、認証、環境チェック、エージェントへの依頼 |
| テナント・環境を準備する人 | [管理者向けガイド](docs/administrator-guide.md) | ライセンス、専用環境、開発者ロール、Credits、DLP / ACP |
| 自社標準を導入・管理する人 | [自社標準の導入・運用ガイド](docs/company-standard-next-steps.md) | internal/private作成、初期設定、社内規程、更新通知、Issue対応、チーム展開 |
| Claude Codeを使う人 | [Claude Codeクイックスタート](docs/claude-code-quickstart.md) | 標準ファイルの取得・参照と開発の開始 |

## クイックスタート

**アプリを作りたいローカルのフォルダーを VS Code で開き、GitHub Copilot Chat の Agent モードに、次をそのままコピーして依頼してください。**
リポジトリのURLと「クイックスタートして」だけで開始できます。仕様書などの資料があれば、そのフォルダーに置いたままで構いません。

```text
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard クイックスタートして
```

Copilotは[クイックスタート実行手順](.github/skills/standard/references/quickstart.md)に沿って、
**`.github/agents`・`.github/skills`・テンプレートの`.gitignore`を配置するだけでは止まらず**、次まで一気通貫で進めます。

| Step | 実行する内容 |
|---|---|
| 0 | GitHubの標準を配置・更新し、共通`auth_helper.py`・`.env`・インタラクティブサインインの認証キャッシュと再利用検証を準備。**認証後は`AskUserQuestion`で要望と実施範囲を確認して一旦停止し、回答を待ちます。** 資料があればその資料に基づく開発デプロイ・テストまでの継続等を、なければフォルダー名から複数の具体的なアプリ案を選べる形にします。 |
| 1 | 継続回答後、ルートの業務資料を`spec/input/`へ安全に移動・整理し、`spec-builder`で仕様を作成。`architecture`で業務改善・推奨AI機能・適切な既存テンプレートを提案し、**業務フロー図とアーキテクチャ図をMermaidでチャットとMarkdownの両方に出力**します。図は質問ポップアップ内には入れません。 |
| 2 | 認証キャッシュでPower Platform環境、Dataverseテーブル、パブリッシャー・ソリューション、必要時だけAzureサブスクリプション・リソースグループ・AIモデル・リージョンを調査し、理由付きで構成を確定します。 |
| 3 | 資料・テンプレートに基づく**フル構成を実装・品質テスト・プレデプロイ・開発デプロイ・実動作検証**。実際の構成図と各URL・テスト結果を共有し、ドキュメント・実装ステータスを更新します。全必須項目が検証済みの場合だけ「全て完了」と報告します。 |

認証後の一度の要望確認は維持し、**その回答後は自分で分かることを調べ、既知事項や通常の実装判断では質問を繰り返しません。**
資料なしなら選ばれた案を仮説付きで具体化します。提案だけ・準備までという指定は尊重します。

環境スキャンは接続先などを埋めるための情報取得です。通常はDLP・ACP・Code Apps許可の事前診断をしません。
既存ファイル・社内標準は保護し、認証操作や環境選択など本人の判断が必要なときだけ回答を待ち、回答後は続行します。
取得できた事実と提案上の仮説は区別します。要望確認で承認された開発範囲は引き継ぎますが、
本番・外部公開・破壊的変更・実データ移行・追加費用・権限付与など、範囲外の判断は別途確認します。

詳細な指示も含めたい場合は、次をコピーできます（配置後はCopilotの `/Quickstart` からも実行可能です）。

```text
https://github.com/geekfujiwara/CodeAppsDevelopmentStandard クイックスタートして。
.github/agents・.github/skills・テンプレートの.gitignoreを配置しただけで止めず、
環境候補のスキャン、auth_helper.py・.envとインタラクティブサインインの認証キャッシュを準備して。
ここで一旦停止し、AskUserQuestionで要望を確認して回答を待って。
資料があれば対象資料からの継続・対象変更・準備までを選べる形にし、
なければフォルダー名から複数のアプリ案を先に提案して選択肢を与えて。
継続の選択肢には、資料・テンプレートに基づく開発環境へのデプロイ・テストまでの範囲を明記して。
継続回答後、ルートの業務資料をspec/inputへ安全に移動・整理してspec-builderを実行し、
なければ選ばれた案を具体化して。その後は自分で分かることを調べ、既知事項を質問し直さないで。
業務要件を一から質問せず、プロのコンサルタントとして業界知識とベストプラクティスから補完し、
業務改善・推奨AI機能・architecture・既存リポ内の適切なテンプレートを提案して。
業務フローとアーキテクチャのMermaid図をチャットとMarkdownの両方に出し、
図は質問ポップアップ内に入れず、事実・仮説を区別した推奨案をチャットに提示して。
認証キャッシュで既存のPower Platform環境と必要時だけAzureを調べて構成を確定し、
承認済みの開発範囲でフル構成を品質テスト・デプロイ・実動作検証まで進めて。
最後に実際の構成図・各URL・検証結果を共有し、ドキュメントを更新して。
本人の判断が不可欠な未解決事項・承認範囲外の操作だけ追加確認して。
```

実装へ進む際はCopilotで **GeekPowerCode** を選択します。自社標準がある場合は、その承認済み版と自社名のエージェントを使ってください。ローカルツールの詳細は[開発者向けガイド](docs/developer-guide.md)を参照してください。

- 設計・承認後はすぐに実装し、Code Appsの初回デプロイを優先します。環境・DLPチェックは明示依頼時または障害時だけ行います。
- SharePoint URLは、直接接続・継続利用の明示がなければ移行元として扱い、Dataverseに移行してCode Appsを開発します。
- Code Appsが選定された場合だけ、そのスキルが依存関係を配置・インストールします。
- `.env`・認証情報・生成物をコミットしないよう、`.gitignore`を確認してください。
- 既存の仕様書から始める場合は [spec-builder](.github/skills/spec-builder/SKILL.md) を利用します。
- Claude Codeの開始手順は [専用ガイド](docs/claude-code-quickstart.md) を参照してください。

## 開発者向け

<a id="前提条件"></a>
<a id="統合プロンプトで一気に準備する推奨"></a>
<a id="ローカル開発環境の準備"></a>
<a id="環境チェック"></a>
<a id="ローカル開発ツールのチェック"></a>
<a id="power-platform-環境のチェック開発着手前に必須"></a>
<a id="カスタムエージェント前提の利用方法"></a>
<a id="github-copilot--claude-code-活用"></a>

[開発者向けガイド](docs/developer-guide.md)に、ローカルツールの準備、Pythonパッケージ、初回サインイン、明示依頼時の環境チェックと障害時の復旧をまとめています。通常開発では管理APIによる事前診断を挟みません。

一括準備は [Setup Development Environment](.github/prompts/setup-development-environment.prompt.md) をCopilot Chatの `/` から選択できます。管理者権限が不足する工程では停止し、管理者へ依頼する内容を報告します。

## テナント・環境管理者向け

<a id="ライセンスの準備"></a>
<a id="クラウド環境の準備"></a>
<a id="管理者権限管理者ロール要件"></a>

[管理者向けガイド](docs/administrator-guide.md)に、ライセンス、専用環境、セキュリティロール、Copilot Credits、ACP、Code Apps有効化と必要な管理者ロールをまとめています。

Default環境では開発せず、対象環境を限定して必要最小限の権限・ポリシーを設定します。設定変更は影響とdry-runを確認し、明示承認後に行ってください。

## 自社標準の管理者向け

<a id="自社標準リポジトリを-api-で作成する"></a>
<a id="チーム開発向けの手順"></a>
<a id="上流の開発標準更新を取り込む"></a>

[自社標準の導入・運用ガイド](docs/company-standard-next-steps.md)に、OrganizationへのREST API作成と、コピー後の作業をまとめています。

1. [Create Company Standard Repository](.github/prompts/create-company-standard-repository.prompt.md) でOrganizationと可視性を確認し、独立したリポジトリを作成する。
2. 上流更新をIssueで通知するActionsと、社内向けのIssue回答フローを整備する。
3. GeekPowerCodeを自社名に変更し、社内ルールを反映する。
4. 承認済み標準をチームへ展開し、上流変更は自社変更を保護してPRで取り込む。

各作業の依頼プロンプトと推奨添付資料はガイド内にあります。公開リポジトリのforkは非公開化できないため、internal/privateの標準は独立コピーで作成します。

## スキル・関連資料を探す

<a id="リポジトリ構成"></a>
<a id="主要ドキュメント"></a>

- [スキルカタログ・サンプル実装一覧](.github/skills/README.md)
- [リポジトリ構成と配置方針](docs/company-standard-next-steps.md#リポジトリ構成)
- [主要ドキュメント](docs/company-standard-next-steps.md#主要ドキュメント)
- [Claude Codeの利用方法](docs/claude-code-quickstart.md)

## ライセンス

MIT License。詳細は [LICENSE](LICENSE) を参照してください。

## フィードバック

- [Issues](https://github.com/geekfujiwara/CodeAppsDevelopmentStandard/issues)
- [X](https://twitter.com/geekfujiwara)
