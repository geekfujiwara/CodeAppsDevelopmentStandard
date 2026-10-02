# セキュリティ ロールと権限（株主総会 Q&A アシスト）

最終更新: 2026-10-02

## 1. 利用者の種類と必要なもの

| 利用者 | できること | Dataverse のロール | そのほか必要なもの |
|---|---|---|---|
| **オペレーター**（事務局・1 人で操作） | 録音・文字起こしの開始と終了、株主番号の特定・修正、想定問答の採用、評価、総会の作成・まとめて保存、LIVE の開始・終了と閲覧者の追加・解除 | **Basic User** ＋ **AGM オペレーター** | アプリの共有（利用者）／Dataverse・SharePoint・カスタム コネクタの接続（初回起動時に作成）／カスタム コネクタ「AGM Speech Token Broker」の共有／SharePoint ライブラリ `AGMRecordings` の編集権限 |
| **閲覧者**（回答する幹部） | 共有された LIVE の画面を読み取り専用で見る（スクロール・根拠の吹き出し・カードの選択は手元だけ） | **Basic User** ＋ **AGM 閲覧（幹部）** | アプリの共有（利用者）／Dataverse の接続。録音・記録・名簿は読めない |
| **構築・運用担当** | ソリューション・テーブル・ロール・コネクタ・Functions・モデルのデプロイ | 環境の **System Administrator**（または System Customizer + Environment Maker） | 下記 §4 の Azure / Entra の権限 |

## 2. Dataverse のセキュリティ ロール（`scripts/setup_security_roles.py` で作成・ソリューションに含める）

深さ: 組織 = Global、ユーザー = Basic（自分が所有するか、自分に共有されたレコード）。

| テーブル | AGM オペレーター | AGM 閲覧（幹部） |
|---|---|---|
| 想定問答 `${PUBLISHER_PREFIX}_agmqa` | 作成・読み取り・書き込み・削除・追加・追加先・割り当て・共有（組織） | 読み取り（組織） |
| IR 抜粋 `${PUBLISHER_PREFIX}_agmirexcerpt` | 同上 | 読み取り（組織） |
| 株主名簿 `${PUBLISHER_PREFIX}_agmshareholder` | 同上 | なし |
| 株主総会 `${PUBLISHER_PREFIX}_agmmeeting` | 同上 | なし |
| 株主発言 `${PUBLISHER_PREFIX}_agmturn` | 同上 | なし |
| 株主質問 `${PUBLISHER_PREFIX}_agmquestion` | 同上 | なし |
| LIVE 共有 `${PUBLISHER_PREFIX}_agmlive` | 同上（**共有**権限で閲覧者に GrantAccess する） | **読み取り（ユーザー）** — 自分に共有された LIVE だけ |

- Dataverse が新しいロールに既定で付ける SharePoint 連携の権限（`prvReadSharePointData` など）は残っている（読み戻しで確認済み）。
- 割り当て: `python scripts/setup_security_roles.py --assign-operator <UPN の一部> --assign-viewer <UPN の一部>`（現在: オペレーター = 構築者、閲覧 = テスト用の幹部ユーザー）。

### LIVE の共有の仕組み

1. オペレーターが LIVE を開始 → `${PUBLISHER_PREFIX}_agmlive` のレコードを作る（所有者 = オペレーター）。
2. 閲覧者を追加 → Dataverse コネクタの `PerformUnboundActionWithOrganization` で **GrantAccess（ReadAccess）**。解除・終了時は **RevokeAccess**。
   実テナントでコネクタ経由の 204 と、共有の付与・解除（`RetrieveSharedPrincipalsAndAccess`）を確認済み（`scripts/test/probe_live_grant.py`）。
3. 閲覧者のロールは LIVE を「ユーザー」の深さでしか読めないため、**共有されていない LIVE は見えない**。発言・質問・名簿の権限は無い。

> 注意: システム管理者・System Customizer など広いロールを持つ人は、共有に関係なくすべて読める。閲覧者には広いロールを付けない。制限の効き方は、管理者でない実ユーザーでの確認が残っている（TC-47）。

## 3. Power Platform

| 項目 | 設定 |
|---|---|
| 環境 | 開発専用の環境（既定環境ではない）。マネージド環境・Code Apps 有効 |
| アプリの共有 | オペレーター・閲覧者を「利用者」として共有 |
| カスタム コネクタ | 「AGM Speech Token Broker」をオペレーターに共有（接続を作るため）。認証は Entra ID の OAuth（On-Behalf-Of）で、利用者本人の ID で Functions を呼ぶ |
| 接続参照 | `${PUBLISHER_PREFIX}_connref_crmsales_dv`（Dataverse）、`${PUBLISHER_PREFIX}_connref_sharepoint_documentingest`（SharePoint）、`${PUBLISHER_PREFIX}_connref_agmspeechbroker`（カスタム コネクタ） |
| DLP | Dataverse・SharePoint・カスタム コネクタを同じ「Business」グループに置く（カスタム コネクタは未分類のままにしない） |
| CSP | `connect-src` に Speech の wss と Functions のホストを追加（環境の Code Apps の CSP 設定） |

## 4. Azure と Entra ID

### 4.1 実行時（マネージド ID・キーなし）

| 主体 | 対象 | ロール | 理由 |
|---|---|---|---|
| Functions のマネージド ID | リソース グループ `${AZURE_RESOURCE_GROUP}`（Speech `${SPEECH_RESOURCE_NAME}` にも個別付与） | **Foundry User** | Speech の Entra トークン発行、Azure OpenAI の推論（Foundry 系のデータ操作） |
| 同上 | ストレージ `stagmbroker6092` | Storage Blob Data Owner / Contributor | Functions の実行用ストレージ（共有キー無効・Private Endpoint） |

- Azure OpenAI はローカル認証（キー）を無効化。Functions は `ManagedIdentityCredential` でトークンを取り、キャッシュする。
- Functions の受け口: `/speech/token`・`/answer/ticket` は **Entra ID のトークン（カスタム コネクタの OBO）** を検証（aud = API のアプリ、必要なスコープ）。`/answer/stream`・`/shareholder/identify` は `/answer/ticket` が発行した **HMAC のチケット（15 分・利用者の oid 付き）** を検証する。
- 生成に渡す業務データ（想定問答・IR・名乗りの発言・名簿の候補）はフェンスで囲み、指示として扱わないようにしている。照合は候補の番号しか返さない（名簿に無い番号は捨てる）。

### 4.2 Entra ID のアプリ登録

| アプリ | 用途 | 設定 |
|---|---|---|
| API（Functions） | Functions を保護する | スコープを公開。カスタム コネクタのクライアント アプリを事前承認 |
| カスタム コネクタのクライアント | 利用者の代わりに API を呼ぶ（OBO） | API のスコープへの委任アクセス・管理者の同意、リダイレクト URI は Power Platform のコネクタ用 |

### 4.3 構築に使った権限（今回のデプロイ）

| 作業 | 必要な権限 |
|---|---|
| リソース グループ・Speech・Azure OpenAI・Functions・VNet・ストレージの作成 | リソース グループの **共同作成者（Contributor）** |
| マネージド ID へのロール付与（Foundry User / Storage Blob Data …） | **ユーザー アクセス管理者** または **所有者**（ロールの割り当て） |
| モデルのデプロイ（gpt-5.4-mini・DataZoneStandard） | Azure OpenAI アカウントの **Cognitive Services Contributor**（またはリソース グループの共同作成者）と、リージョン・SKU のクォータ |
| アプリ登録・スコープ公開・管理者の同意 | **アプリケーション管理者**（同意はクラウド アプリケーション管理者以上） |
| ソリューション・テーブル・ロールの作成、Code Apps の push、接続参照 | 環境の **System Administrator** |
| マネージド環境・CSP・DLP の確認と設定 | **Power Platform 管理者** |
| SharePoint のライブラリ作成 | サイトの所有者 |

## 5. 記録の保護

- 録音・まとめは SharePoint のライブラリの権限で守る（閲覧者には付けない）。
- 株主番号の後からの修正は、保存状態の列に「株主番号を修正（時刻）」を残す。番号の決め方（手入力・AI 照合・自動検出）と、聞き取った番号の原文も発言に残す。
- テスト用のチケット・トークンはファイルに書いたら使い終わりに削除する（`dist-autotest`・`.mcp/answer-ticket.json`）。

## 6. 追加分（Cowork・MAI-Transcribe・設定）

| 項目 | 内容 |
|---|---|
| ロール「AGM 想定問答作成者」 | Cowork で想定問答・台本を作る人。想定問答と台本は作成（ユーザー）・読み取り（組織）・書き込み（自分のもの）、IR 抜粋は読み取り。名簿・記録・LIVE・設定は無し。`setup_security_roles.py --assign-author <UPN>` |
| Cowork の OAuth クライアント | Entra アプリ（Dynamics CRM の `mcp.tools` の委任）。管理者の同意はクラウド アプリケーション管理者・アプリケーション管理者・AI 管理者のいずれか。Client ID を環境の許可 MCP クライアントに登録（System Administrator）。シークレットは `.env` だけ |
| プラグインの公開 | AI 管理者（管理センターの Agents → Tools → Plugins） |
| 承認 | 想定問答の承認（状態を承認済み）は AGM オペレーター。プラグインは下書きしか作らない |
| MAI-Transcribe の所在 | 確定文の録音を東南アジアのリソースで認識する（保存はしない）。設定の画面に注意を表示。国外処理が認められない場合は「Azure Speech」のままにする |
| Function の許可リスト | デプロイ（`AOAI_DEPLOYMENTS`）・文字起こしの接続先とモデル（`STT_ENDPOINTS`）はアプリ設定だけで決まる。要求の値が外れていれば 400。接続先の URL は `*.cognitiveservices.azure.com` に限る |
| 設定の既定 | 設定テーブルへの書き込みは AGM オペレーターだけ（閲覧・作成者のロールには無い） |
| マネージド ID | Foundry User（リソース グループの範囲）で MAI のリソースも呼べる（同じリソース グループに置く） |
