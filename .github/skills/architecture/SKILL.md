---
name: architecture
description: "Power Platform ソリューションの全体アーキテクチャを設計する。Copilot Studio / Power Automate / Code Apps / Power Pages / AI Builder の使い分け判断、コンポーネント選定、統合パターンを決定する。Agent 365 の AI チームメイトを採用する場合はライト実装（PoC）と本格実装（private リポジトリ + CI/CD + Agent Evals）を AskUserQuestion で選ばせ、Git ホスティング（GitHub / Azure DevOps Repos / その他）も確定してから実装へ進む。外部の文章を読むエージェントではプロンプト インジェクション対策を設計段階で工数に含める。"
category: architecture
triggers:
  - "アーキテクチャ設計"
  - "全体設計"
  - "コンポーネント選定"
  - "技術選定"
  - "Copilot Studio vs Power Automate"
  - "Code Apps vs Canvas Apps"
  - "AI Builder"
  - "Cowork プラグイン"
  - "Copilot Studio スキル"
  - "Dataverse MCP"
  - "自前 MCP Server"
  - "基幹データをエージェントに繋ぐ"
  - "Dataverse に無いデータ"
  - "データ入力の接点"
  - "統合パターン"
  - "設計判断"
  - "どれを使う"
  - "使い分け"
  - "Agent 365"
  - "Foundry エージェント"
  - "ライト実装か本格実装か"
  - "PoC か本番か"
  - "AI 社員"
  - "AI チーム"
  - "エージェントテンプレート"
  - "名前付きの複数エージェント"
  - "デジタルな同僚"
  - "AI の部下を増やしたい"
  - "エージェントにメールアドレスを持たせたい"
  - "エージェントに予定表を持たせたい"
  - "予定調整を任せたい"
  - "メールを捌いてほしい"
  - "自分の権限の範囲を超えて働くエージェント"
---

# Power Platform 共通アーキテクチャデザインスキル

ユーザー要件から **Power Platform のどのコンポーネントを使うか** を判断し、全体アーキテクチャを設計する。
各コンポーネントの得意領域・制約・統合パターンを把握し、**迷わず最適な構成を選定**するためのスキル。

> **このスキルの位置づけ**: Phase 1（設計）の最初に実行する。個別コンポーネントのスキルに入る前に、まず要件を深掘りして全体像を確定させる。

---

## 0. 要件ヒアリング（Phase 1 の最初に必ず実行）

**IT に詳しくないエンドユーザーに向き合うプロの IT コンサルタントとして振る舞う。**
専門用語を使わず、業務課題・現状・理想の姿を引き出すことを最優先にする。

### AskUserQuestion で深掘りする項目

以下をまとめて質問し、一問一答の往復を最小化する。

| 確認項目 | 質問の例 |
|---|---|
| **解決したい課題** | 今どんな問題・不便がありますか？ |
| **現状の管理方法** | 今は Excel・メール・紙などで管理していますか？ |
| **利用者・規模** | 誰が使いますか？社内のみですか？何人くらいですか？ |
| **必要な操作** | 登録・検索・承認・通知・レポートのうち何が必要ですか？ |
| **外部連携** | Teams / Outlook / SharePoint / 既存システムとつなぎたいですか？ |
| **Dataverse 外のデータ** | 参照したいデータは **既存の基幹 DB・ファイルサーバー・業務 API** にありますか？（→ あるなら §6.5：自前 MCP Server） |
| **AI・自動化** | チャットで問い合わせできると便利ですか？自動通知は必要ですか？ |
| **人としての同僚** | ツールとしての AI でよいですか？それとも**自分のメールアドレスや予定表を持ち、メンバーとして働く存在**が欲しいですか？（→ 後者なら §7） |

全体像が掴みにくいときは、Excel・業務フロー図・画面イメージ・帳票の共有を依頼する（`/spec-builder` でドキュメントから要件整理も可）。要件が明確になったら、以下の判断フローチャートでコンポーネントを選定し設計提案へ進む。

---

## 1. コンポーネント早見表

| コンポーネント        | 得意なこと                                                                                   | 苦手なこと                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Copilot Studio**    | 自然言語対話、ナレッジ検索、LLM による推論・要約、ツール呼び出しの自律的オーケストレーション | 確定的なフロー制御、大量データの一括処理、トランザクション保証 |
| **Power Automate**    | イベント駆動の自動化、確定的なワークフロー、コネクタ経由の外部連携、条件分岐・ループ         | 自然言語対話、あいまいな入力の解釈、自律的判断                 |
| **Code Apps**         | React/Vite のリッチ Web UI、複雑なデータ操作画面、カスタムビジュアル                          | ノーコードでの素早いプロトタイプ、モバイルネイティブ           |
| **Native Mobile Code Apps** | Expo/React Native、camera／barcode／location 等の端末機能、Wrap（Private Preview） | 本番利用、store 配布、未検証の offline runtime |
| **Canvas Apps**       | （常に対象外 — パフォーマンス・カスタマイズ性・エンタープライズ運用の観点で不採用）           | —                                                                |
| **Model-Driven Apps** | Dataverse 標準 UI、フォーム/ビュー/ダッシュボードの自動生成、ビジネスルール統合              | カスタムビジュアル、外部 JS ライブラリ、ノーコード開発者       |
| **Power Pages**       | 外部ユーザー向けポータル・公開サイト、認証/匿名アクセス、Dataverse 連携、テーブル権限による公開制御 | 複雑なサーバーサイド処理、SSR/ISR、内部業務向けの複雑なリッチ UI |
| **AI Builder**        | **Power Automate フロー内**に組み込む定型 AI 処理（通知・リマインド等、イベント駆動でチャット UI を使わない場合のみ） | チャット UI での対話・社内汎用業務全般（★ §6 参照: 原則 Copilot Studio v2 + Dataverse MCP、AI Builder は限定的採用） |
| **Dataverse**         | リレーショナルデータ、行レベルセキュリティ、監査、ビジネスルール                             | 大量ログデータ、非構造化データ、全文検索                       |
| **Copilot Studio v2 スキル + Dataverse MCP** | 自然言語での業務データ登録・照会（Dataverse MCP 経由）、Teams / Copilot Studio 上での利用、SKILL.md による業務知識の付与。**環境制約が少なく作りやすい（★ 第一候補）** | リッチな一覧/編集 UI、複雑なビジュアル、外部/匿名公開 |
| **Copilot Cowork プラグイン** | M365 Copilot 上での自然言語登録・照会（Dataverse MCP / **自前 MCP Server** 経由）。M365 Copilot との統合が必須要件の場合に採用。**会社環境で Cowork の利用が許可されている場合のみ推奨** | 環境制約が多い（Entra App 登録・Teams 開発者ポータル・M365 管理センター公開・Teams Admin / Global Admin 権限が必要）。環境が揃わない場合は Copilot Studio v2 + Dataverse MCP を優先 |
| **自前 MCP Server（Azure Functions）** | **Dataverse に無いデータ**（既存の基幹 DB / ファイルサーバー / 業務 API）をエージェントに公開する。Private Endpoint の内側にあるデータをキーレス（Entra JWT + Managed Identity）で提供。**Copilot Studio / Cowork の両方から同じ Server を使い回せる** | ノーコードでの構築。Azure の基盤（VNet / Private Endpoint / 監視）と運用が別途必要。Dataverse の行レベルセキュリティは傣かない（自前で設計する） |
| **Agent 365 / AI チームメイト** | カスタムエンジンエージェントをコードファーストでバージョン管理し、Teams / M365 Copilot へ公開。インストールごとの専用 Entra Agent ID。**エージェント自身のメールアドレス・予定表・権限を持つ「デジタルな同僚」**（★ §7: 採用時はライト/本格を必ず確認） | ノーコードでの素早い構築、Code Apps / Web への埋め込み、Dataverse 標準 UI |

---

## 2. 判断フローチャート

### 2.1 メイン判断: 「何を実現したいか？」

```
ユーザー要件
    │
    ├─ 対話型の体験が必要？ ──→ YES ──→ 対話の性質は？（下の 2.1.1 で分岐）
    │                          NO
    │                          ↓
    ├─ イベント/条件に基づく自動処理？ ──→ YES ──→ 【Power Automate】（§4 へ）
    │                                     NO
    │                                     ↓
    ├─ データの閲覧・編集 UI が必要？ ──→ YES ──→ 【Code Apps / Power Pages or Azure / Model-Driven Apps】（§5 へ、Canvas Apps は常に対象外）
    │                                    NO
    │                                    ↓
    ├─ Power Automate フロー内にイベント駆動（非チャット UI）で AI 処理を組み込みたい？
    │     （例: 通知・リマインドの文面生成、条件判定への AI 組み込み） ──→ YES ──→ 【AI Builder】（§6 へ）
    │                                   NO
    │                                   ↓
    └─ データモデル/ストレージが必要？ ──→ YES ──→ 【Dataverse のみ】
```

> **社内汎用業務は原則 Copilot Studio v2 スキル + Dataverse MCP（+ Code Apps）で実現する**。AI Builder は「通知・リマインド等で
> Power Automate フロー内に AI 処理を組み込みたい」イベント駆動・非チャット UI のケースに限定して採用する（§6 参照）。

### 2.1.1 「対話型が必要」の分岐: まず Copilot Studio v2 スキル + Dataverse MCP を検討する（★重要）

**対話型の体験が必要 = 即 Copilot Studio（v1）ではない**。
利用者が **自分から AI に話しかけて Dataverse へ登録・照会し、Code Apps で結果を見る**ような
「チャットで話しかけて実行する」業務は、**Copilot Studio v2 スキル + Dataverse MCP を第一候補**にする。
環境制約が少なく作りやすいため、Cowork プラグインより先に検討する。

```
対話型の体験が必要
    │
    ├─ ① ユーザーが能動的に AI へ話しかけて解決する
    │     （Dataverse への登録/照会 + Code Apps で閲覧。Teams / Copilot Studio 上で完結）
    │        ──→ ★【Copilot Studio v2 スキル + Dataverse MCP】を第一候補（→ copilot-studio-v2 スキル）
    │                 M365 Copilot 上での利用が必須要件の場合かつ会社環境で Cowork の利用が許可されている場合のみ Cowork プラグインを追加検討
    │
    ├─ ② 自律的に起動して動く必要がある
    │     （メール受信・Teams 返信・スケジュール等のイベントで自動実行、無人で判断・応答）
    │        ├─ トリガーが Dataverse のレコード作成/更新 ──→ ★【Copilot Studio v2 ワークフロー（Agentflow: Dataverse トリガー + エージェント ノード）】（設計リファレンス パターン F）
    │        └─ トリガーがメール/Teams/スケジュール等の外部イベント ──→ 【Copilot Studio（Workflow / トリガー）+ Power Automate】（§3・§4 へ）
    │
    ├─ ③ アプリ（Code Apps / Web サイト）に組み込んで呼び出す
    │     （画面内チャット・埋め込み・WebChat SDK での外部公開）
    │        ──→ 【Copilot Studio v1】（§3 へ）
    │
    └─ ④ カスタムエンジンエージェントとして Teams / M365 Copilot に公開する
          （独自モデル・独自ツール・コードファーストのバージョン管理が要る
           ★または、エージェント自身がメールアドレス・予定表・権限を持つ「人」として働く）
             ──→ 【Agent 365 / AI チームメイト】（§7 へ）
```

> **使い分けの原則**:
> - **ユーザーがチャットで話しかけて実行するケース**（能動的・有人）は **Copilot Studio v2 スキル + Dataverse MCP**で実装する。
>   環境制約が少なく作りやすいため、第一候補とする。
>   Dataverse + Code Apps で組んだ業務データへのアクセスは、原則 Copilot Studio v2 スキル経由の自然言語操作を提案する。
>   M365 Copilot との統合が必須要件の場合のみ **Cowork プラグイン**を追加検討（Global Admin 等の権限が別途必要。**会社環境で Cowork の利用が許可されている場合のみ推奨**）。
> - **Copilot Studio でエージェントを作るのは次の 3 つのケース**:
>   1. **チャットで話しかけて実行するケース**（v2 スキル + Dataverse MCP）— 第一候補（①）
>   2. **自律的なケース** — イベント/トリガーで無人起動し、自分で判断・応答・データ更新する（②）
>   3. **アプリに組み込むケース** — Code Apps / Web サイトに埋め込んで呼び出す（③、v1 必須）
> - **自律的なケース（②）で、すでに Copilot Studio v2 スキルを採用している場合**は、Power Automate + v1 トリガーではなく **Copilot Studio v2 ワークフロー（Agentflow: Dataverse トリガー + エージェント ノード）を標準の第一候補**とする。既存の発行済み v2 スキルをエージェント ノードから呼び出せるため、Power Automate も v1 も追加せずに同一アーキテクチャで完結できる（設計リファレンス [パターン F](references/design-patterns.md#パターン-f-dataverse-トリガー駆動-agentflowcopilot-studio-v2-ワークフロー--エージェント-ノード)）。
> - 構築手順は [`copilot-studio-v2` スキル](../copilot-studio-v2/SKILL.md)（①）、Cowork の UI 併設方針は §5 を参照。
> - **参照したいデータが Dataverse に無い場合**（既存の基幹 DB・ファイルサーバー・業務 API）は、
>   上記のどの分岐であっても **自前 MCP Server（Azure Functions）** を併せて検討する（→ §6.5）。
>   同じ MCP Server を **Copilot Studio v2 にも Cowork にも**登録できるため、公開先は後から増やせる。

### 2.2 複合パターン（最も多い）

多くの要件は **複数コンポーネントの組み合わせ**になる（CRUD+通知、対話+データ操作、対話+外部連携、対話+定期実行/イベント駆動、AI 分析+対話、外部ポータル+データ操作、フルスタック）。各パターンの構成・典型ユースケースの一覧表は [設計リファレンス](references/design-patterns.md#0-複合パターン早見表) を参照。

---

## 3. Copilot Studio を使う判断ポイント

> ★ **まず §2.1.1 を確認する**。「ユーザーがチャットで話しかけて Dataverse に登録/照会する」有人の対話は
> **Copilot Studio v2 スキル + Dataverse MCP を第一候補**とし、Copilot Studio v1 は次の 2 ケースに絞って採用する:
> ① **自律的なケース**（イベント/トリガーで無人起動）、② **アプリに組み込むケース**（Code Apps / Web 埋め込み）。

**使う**: 自律起動（イベント/トリガー）での無人実行・アプリ埋め込み/Web 公開・複数ツールの自律オーケストレーション・ナレッジ検索・要約/分析/レポート生成。
**使わない**（→ 代替）: ユーザーが能動的にチャットで登録/照会するだけ → **Copilot Studio v2 スキル + Dataverse MCP**（Cowork は M365 Copilot 必須時かつ会社環境で利用が許可されている場合のみ）／確定手順の 100% 実行・大量一括処理・LLM 不要の条件分岐 → **Power Automate**／UI 入力編集 → **Code Apps**／承認ワークフロー → **Power Automate**。

> 使う場面/使わない場面の詳細表は [コンポーネント選定 詳細](references/component-selection-details.md#1-copilot-studio-使う場面--使わない場面) を参照。

### 構築モード: 生成オーケストレーション一択

```
❌ トピックベース開発（Classic PVA）は行わない
✅ 生成オーケストレーション（Generative Orchestration）モード一択
   — LLM が Instructions に基づいてツール呼び出しを自律的に判断
```

### ★ 構築アーキテクチャの選択（Copilot Studio 採用時に必ず確認）

Copilot Studio を採用すると決まったら、**v2（新アーキ）/ v1（旧アーキ）のどちらで作るかを必ずユーザーに確認する**。

**判断の起点は「他サービスと連携して使うか、単独で使うか」**:

```
そのエージェントを Code Apps / Web サイト / 他システムから呼び出すか？

├─ YES（連携利用）──→ ★ v1 を推奨
│     理由: v2（cliagent）は Code Apps からも Web サイトからも呼び出せない致命的制約がある。
│           外部公開（Web 埋め込み・WebChat SDK）・トリガー・他サービス連携は v1 のみ対応。
│
└─ NO（単独利用：Teams / Copilot Studio 単体での対話のみ）──→ ★ v2 を推奨
      理由: UI 操作なしで自動構築でき、再現性・量産性に優れる。
```

> **重要（v2 の致命的制約）**: v2（新アーキ / cliagent）のエージェントは **Code Apps から呼び出せない・Web サイトに埋め込めない**。
> Code Apps の `ExecuteCopilotAsyncV2` 連携や WebChat SDK での外部公開を行うシナリオでは **必ず v1 を選ぶ**。

AskUserQuestion で次のように尋ねる:

> Copilot Studio エージェントの構築方法を選べます。どちらにしますか？
> - **v1（旧アーキテクチャ / classic）**: Code Apps・Web サイト・他システムと**連携**するなら必須。外部公開（Web 埋め込み・WebChat SDK）・トリガー・ニュース配信の既存 references 資産も流用可。Bot 作成は UI 手動。
> - **v2（新アーキテクチャ / cliagent）**: Teams 等での**単独利用**向け。Dataverse API だけで UI 操作なしに自動構築でき、再現構築・量産に優れる。**Code Apps / Web サイトからは呼び出せない**。

| シナリオ | 推奨 | 使用スキル |
|---|---|---|
| **連携利用**（Code Apps / Web 埋め込み / 他システム連携）【既定で確認】 | **v1** | [`copilot-studio`](../copilot-studio/SKILL.md) |
| **単独利用**（Teams / Copilot Studio 単体の対話のみ） | **v2** | [`copilot-studio-v2`](../copilot-studio-v2/SKILL.md) |

> v1/v2 の詳細な判断軸表（呼び出し可否・自動構築・作り込み等）は
> [コンポーネント選定 詳細](references/component-selection-details.md#copilot-studio-v1--v2-の判断軸詳細) を参照。

---

## 4. Power Automate を使う判断ポイント

**使う**: イベント駆動の自動実行・確定的な手順・コネクタ経由の外部連携・承認ワークフロー・一括処理・トランザクション処理。
**使わない**（→ 代替）: ユーザー対話／あいまい入力の解釈／自然言語レポート → **Copilot Studio**、リッチ UI → **Code Apps**。

### Power Automate 単体 vs Copilot Studio + トリガーの判断（要約）

**最も迷いやすいポイント**。判定: ① Copilot Studio でしかできない処理（下表 ✅）があれば **PA(トリガー)+Copilot**、② コンテンツを確定手順で加工・転送するだけなら **PA 単体**、③ LLM の判断・生成が要れば **PA(トリガー)+Copilot**。

| 判断基準                               | Power Automate 単体 | Copilot Studio + トリガー |
| -------------------------------------- | ------------------- | ------------------------- |
| コンテンツ（添付・本文）の転送・保存   | ✅                  | ❌ 不要                   |
| 固定条件での分岐・ルーティング         | ✅                  | ❌ 不要                   |
| Web 検索                               | ❌ 不可             | ✅                        |
| ナレッジ検索（SharePoint / Dataverse） | ❌ 不可             | ✅                        |
| Word ファイル作成（Work IQ MCP）       | ❌ 不可             | ✅                        |
| MCP Server ツール利用                  | ❌ 不可             | ✅                        |
| 自然言語での応答・レポート生成         | ❌ 不可             | ✅                        |
| あいまいな入力の解釈                   | ❌ 困難             | ✅                        |

> 詳細な判断フロー（ASCII 図）・使う場面/使わない場面・役割パターン（スタンドアロン/トリガー/ツール）は
> [コンポーネント選定 詳細](references/component-selection-details.md#2-power-automate-使う場面--使わない場面) を参照。

---

## 5. UI コンポーネント選定

> ★ **入力の既定は Copilot Studio v2 スキル + Dataverse MCP を優先提案する（Dataverse + Code Apps 構成では特に）**。
> Dataverse にデータを貯める構成では、利用者は今後**アプリ画面を見ながら入力するのではなく、Copilot Studio v2 スキル（Dataverse MCP 経由）から自然言語で登録**するようになる。
> Cowork プラグインと比べて**環境制約が少なく作りやすい**ため、初回のアーキテクチャ提案では Copilot Studio v2 + Dataverse MCP を第一候補とする。
> そのため初回のアーキテクチャ提案では、**データ入力の主接点として Copilot Studio v2 スキル + Dataverse MCP**（`SKILL.md` + Dataverse MCP）を**第一候補**に含める。
> Code Apps は「一覧・ダッシュボード・複雑な編集・可視化」を担う**閲覧/操作の接点**として併設する（入力専用の画面作り込みに時間をかけない）。
>
> - **提案の型**: **Dataverse（基盤）＋ Code Apps（閲覧・分析・複雑操作）＋ Copilot Studio v2 スキル + Dataverse MCP（自然言語での登録・照会）** を既定セットとして提示する。
> - **内部ユーザー向け**の入力は Copilot Studio v2 スキル + Dataverse MCP を優先。M365 Copilot との統合が必須要件の場合のみ **Cowork プラグイン**を追加検討（Global Admin 等の権限が別途必要。**会社環境で Cowork の利用が許可されている場合のみ推奨**）。**外部ユーザー向け**は Copilot Studio v1 埋め込み / Power Pages を使う（§3・§5 参照）。
> - **既存の基幹 DB ・ファイルサーバーのデータを併せて見せたい場合**は、Dataverse への移行を前提にせず
>   **自前 MCP Server** を追加して読み取りだけ公開する（→ §6.5）。Copilot Studio v2 / Cowork のどちらからでも使える。
> - 構築手順は [`copilot-studio-v2` スキル](../copilot-studio-v2/SKILL.md) を参照。

```
Q: 対象ユーザーは？

├─ 外部ユーザー（顧客・パートナー・匿名アクセス含む）
│   └─ → 既定は Azure（Power Platform 外の Web/API）。ユーザーが Power Pages を明示的に希望した場合のみ Power Pages
│
└─ 内部ユーザー
    └─ Q: 標準の D365 開発をしたい、または既存 Model-Driven App の改修か？

        ├─ YES → Model-Driven Apps
        │
        └─ NO（新規の独自 UI）→ Code Apps（UI の複雑さに関わらず一択。Canvas Apps は常に対象外）
```

### 外部ユーザー向け UI: 既定は Azure、Power Pages はユーザー宣言時のみ

**外部ユーザー向け（顧客・パートナー・匿名アクセス含む）の UI は既定で Azure（Power Platform 外の Web/API 実装）を提案する**。
Power Pages を提案するのは **ユーザーが明示的に「Power Pages で作りたい」と宣言した場合のみ**とする:

```
Power Pages を選ぶ条件（ユーザー宣言 + 以下が該当）:
  ① ユーザーが Power Pages の利用を明示的に希望している
  ② Dataverse のデータを外部公開したい、またはテーブル権限で公開範囲を制御したい
  ③ 認証（Azure AD B2C 等）または匿名アクセスが必要

ユーザーが宣言しない場合（内部ユーザー向けを含む）→ Azure / Code Apps
```

> 詳細な開発・デプロイ手順は [power-pages/SKILL.md](../power-pages/SKILL.md) を参照。
> ⚠️ プロビジョニングに **10〜20 分**かかるため、Phase 6 では完了を待ってから開発を続ける。

### 内部ユーザー向け: Code Apps を既定とする（参考: Model-Driven Apps）

> **方針**: 内部ユーザー向けの新規画面は常に **Code Apps** を提案する。**Canvas Apps は常に対象外**
> （パフォーマンス・カスタマイズ性・エンタープライズ運用の観点で不利なため）。Model-Driven Apps は標準 D365 開発または既存改善の場合のみ。

要点: カスタム UI・カンバン/ガント・インライン編集・ダークモードは **Code Apps** が優位。標準ビュー/フォーム自動生成・ビジネスルール/セキュリティロール統合、または標準 D365 開発をしたい場合は MDA が優位。

> Code Apps / Canvas / MDA の機能比較マトリクス（11 項目、Canvas は参考情報）は
> [コンポーネント選定 詳細](references/component-selection-details.md#3-ui-code-apps-vs-canvas-apps-vs-model-driven-apps機能比較) を参照。

### このプロジェクトの標準: Code Apps（Canvas Apps は常に対象外）

本プロジェクトでは **Code Apps（TypeScript + React + Tailwind CSS）** を標準とする。
**Canvas Apps は常に対象外**とする（パフォーマンス・カスタマイズ性・エンタープライズ運用の観点で不向きなため）。
内部ユーザー向けの新規画面は、UI の複雑さに関わらず常に Code Apps を提案する。

camera、barcode、location 等の端末ネイティブ機能が必須なら、Web Code Apps と Native のどちらかを確認する。
Native を選ぶ場合だけ [`mobile-apps`](../mobile-apps/SKILL.md) を使い、Private Preview／本番利用禁止への
明示承認を得る。承認がなければレスポンシブ Web Code App を提案する。

> ★ **Code Apps を適切なソリューションとして提案したら、このタイミングで環境側の前提条件チェックを必ず実行する**。
> Code Apps のデプロイには「マネージド環境の有効化」と「環境での Code Apps 許可（コード アプリを許可する）」の
> 2 点が事前に必要で、未有効のまま設計・実装を進めると後工程で `CodeAppOperationNotAllowedInEnvironment` (403) 等の
> エラーにより手戻りが発生する。設計フェーズ・実装に入る前に以下を実行し、結果をユーザーに提示する。
>
> ```bash
> python .github/skills/code-apps/scripts/check_code_apps_environment.py
> ```
>
> - ✅ 両方有効 → そのまま設計フェーズ（デザインテンプレート選択）へ進む。
> - ❌ いずれか未有効 → スクリプトが出力する有効化手順（Power Platform 管理センター）をユーザーに提示し、
>   有効化を待ってから設計・実装を続ける。
> - ⚠️ API で判定できない（Power Platform 管理者ロールがない場合は Code Apps 許可が 403 になる）
>   → 出力される管理センター URL をユーザーに提示し、目視確認を依頼する。
> - 詳細は [`code-apps` スキル §2 環境の前提条件](../code-apps/SKILL.md#2-初回デプロイ) を参照。

> **★ Code Apps + Dataverse 並行開発パターン（正常フロー）**
>
> Code Apps が確定し、`dataverse` スキルでスキーマがユーザー承認されたら、**`code-apps` スキルを
> サブエージェントとして起動し、Dataverse 構築と並行して Code Apps 開発を進める**。
>
> ```
> [dataverse スキル — メインエージェント]       [code-apps スキル — サブエージェント（並行）]
> Step 4: --skip-localize で構築開始       →   scaffold → pac code init → npm run deploy
>                                              → pac code add-data-source（全テーブル）
> Step 4: --localize-only でローカライズ完了   （独立して実装フェーズへ継続）
> ```
>
> Dataverse 側は `--skip-localize` 完了後に `--localize-only` へ進み、
> Code Apps 側の `add-data-source` 完了を待たずに独立して動作する。

### Model-Driven Apps の方針: 標準 D365 開発 または 既存改善のみ

**Model-Driven Apps を使うのは以下のいずれかに該当する場合に限る**（それ以外の新規開発は常に Code Apps）:

```
Model-Driven Apps を使う条件（いずれかに該当）:
  ① 標準的な Dynamics 365 の開発をしたい（標準 UI・自動生成のフォーム/ビューをそのまま使いたい）
  ② 既に本番稼働中の Model-Driven App があり、フォーム追加・ビュー変更・ビジネスルール追加等の改善要件である

上記いずれにも該当しない（新規の独自 UI）→ 常に Code Apps
```

> **理由**: Code Apps は保守性・拡張性・UI カスタマイズ性に優れ長期的に有利。MDA は標準 D365 開発・自動生成が利点だが
> カスタマイズ制約で後から移行コストが発生しやすい。Canvas Apps は常に対象外。**迷ったら Code Apps**。

---

## 6. AI Builder を使う判断ポイント

### 基本方針: AI Builder は基本的に利用しない。社内汎用業務は Copilot Studio v2 + Dataverse MCP で実現する

**社内の汎用業務は、ほぼ Copilot Studio v2 スキル + Dataverse MCP（+ Code Apps）で実現できる**。
利用者がチャットで話しかけて Dataverse に登録・照会し、Code Apps で結果を見る構成（§2.1.1・§5 参照）を第一候補とし、
AI Builder を安易に採用しない。

**AI Builder を使うのは次の限定的なケースのみ**:

> **通知・リマインド等で Power Automate の中に AI 処理を組み込みたいとき**に AI Builder を使う。
> どうしてもチャット UI ではなく、**イベント駆動でフロー内に AI 処理を組み込む必要がある**場合に限り、
> Power Automate フロー内で AI Builder（AI プロンプト）を呼び出すパターンを採用する。
> それ以外（対話型・社内汎用業務全般）は **Copilot Studio v2 スキル + Dataverse MCP** を使う（M365 Copilot 統合が必須かつ会社環境で Cowork の利用が許可されている場合のみ **Cowork プラグイン**を追加検討）。

```
AI 処理が必要
    │
    ├─ チャットで話しかけて実行する（有人・能動的） ──→ 【Copilot Studio v2 スキル + Dataverse MCP】（§2.1.1 へ）
    │
    ├─ イベント駆動で無人実行し、自律的な判断・応答が必要 ──→ 【Copilot Studio + Power Automate】（§3・§4 へ）
    │
    └─ イベント駆動（非チャット UI）で、Power Automate フロー内に
       定型 AI 処理（通知文生成・分類・抽出等）を組み込みたいだけ
          ──→ 【Power Automate + AI Builder】（本節）
```

### AI プロンプト（カスタムプロンプト）を常に優先する

AI Builder を採用すると決まった場合、実装方式は **AI プロンプト（カスタムプロンプト）を常に優先**する。プロンプトテキストだけで実現でき、トレーニングデータ不要・即時更新で導入/保守コストが圧倒的に低い。請求書処理・ドキュメント抽出も、まず AI プロンプト + document 入力で検討し、OCR 精度が必須等プレビルトでしか実現できない場合のみプレビルトを使う。

> プレビルト/カスタムモデルとの詳しい比較は [コンポーネント選定 詳細](references/component-selection-details.md#5-ai-builder-ai-プロンプト優先の方針) を参照。

**使う**: 通知・リマインド等、**Power Automate フロー内**にイベント駆動（非チャット UI）で組み込む定型 AI 処理（文面生成・分類・抽出等）。
**使わない**（→ 代替）: 社内汎用業務全般・チャットで話しかけて登録/照会する業務 → **Copilot Studio v2 スキル + Dataverse MCP**（Cowork は M365 Copilot 必須時かつ会社環境で利用が許可されている場合のみ）、対話形式／リアルタイム応答／1 回限りの分析 → **Copilot Studio**。

> 使う場面/使わない場面の詳細表は [コンポーネント選定 詳細](references/component-selection-details.md#4-ai-builder-使う場面--使わない場面) を参照。

### Copilot Studio の Instructions vs AI Builder プロンプトの判断

> 前提: この判断は「Copilot Studio エージェント or Power Automate フロー内で AI 処理を使う」と決まった後の実装方式の選択。
> 社内汎用業務のチャット対話そのものは、まず §2.1.1 に従い **Copilot Studio v2 スキル + Dataverse MCP** を検討する。

```
Q: その AI 処理は再利用するか？

├─ エージェントの対話内で直接使う（1つのエージェント専用）
│   └─ → Instructions に記述（AI Builder 不要）
│
├─ 複数のエージェント / フローから呼び出す
│   └─ → AI Builder プロンプト（ツール化して共有）
│
└─ 構造化された入出力（JSON スキーマ）が必要
    └─ → AI Builder プロンプト（output.formats: ["json"]）
```

---

## 6.5 自前 MCP Server を使う判断ポイント（Dataverse 外のデータを繋ぐ）

**使う**: 参照したいデータが **Dataverse に無い**（既存の基幹 DB / ファイルサーバー / 業務 API に既にある）／
移行・二重管理をせずに **読み取りだけエージェントへ公開**したい／Private Endpoint の内側にあるデータを
キーレス（Entra JWT + Managed Identity）で安全に出したい。

**使わない**（→ 代替）: データが Dataverse にある → **Dataverse MCP**（自前実装は不要）／
確定手順での一括連携・書き込み同期 → **Power Automate**／単発の分析 → **Copilot Studio のナレッジ**。

```
Q: エージェントに読ませたいデータはどこにある？

├─ Dataverse ──────────────→ 【Dataverse MCP】（追加開発なし。§2.1.1 ①）
│
├─ SharePoint / Web / ファイル（非構造）
│                ──────────→ 【Copilot Studio のナレッジ】
│
└─ 既存の基幹 DB / ファイルサーバー / 業務 API
                 ──────────→ ★【自前 MCP Server（Azure Functions）】（mcp-server スキル）
                                 ＋ 呼び出し側を下の「公開先」で選ぶ
```

### 公開先の選択（★ Cowork とセットで提案できる）

同じ MCP Server を **Copilot Studio からも Cowork からも**使える。違いは登録方法だけで、
Server 側の実装は共通（どちらも Streamable HTTP + Entra OAuth）。

| 公開先 | 登録方法 | 向くケース | 使用スキル |
|---|---|---|---|
| **Copilot Studio v2 スキル** | カスタム コネクタ（OpenAPI, `x-ms-agentic-protocol: mcp-streamable-1.0`） | Teams / Copilot Studio 単体で使う。**環境制約が少なく第一候補** | [`mcp-server`](../mcp-server/SKILL.md) + [`copilot-studio-v2`](../copilot-studio-v2/SKILL.md) |
| **Copilot Cowork プラグイン** | manifest の `agentConnectors.remoteMcpServer` | **M365 Copilot（Cowork）上での利用が必須要件**。文書作成・レビュー等 Cowork の生成能力と組み合わせたい | [`mcp-server`](../mcp-server/SKILL.md) + [`cowork`](../cowork/SKILL.md) |

> **AskUserQuestion で確認する**: 「このデータをどこから使いますか？
> ① Teams / Copilot Studio（作りやすい・第一候補）、② M365 Copilot（Cowork。Global Admin 権限と
> Frontier 参加が必要）、③ 両方（MCP Server は 1 つのまま、登録を 2 系統作る）」
>
> **③ を選んでも Server の実装は増えない**。API アプリ（`api://<api-app-id>`）を 1 つに集約しておけば、
> Copilot Studio 用のカスタムコネクタと Cowork 用の OAuth registration を並行して作れる。

### セット提案の型（Cowork + 自前 MCP Server）

M365 Copilot 上で基幹データを扱いたい要件では、次の 3 点セットで提案する。

1. **自前 MCP Server（Azure Functions）** — データソースごとに 1 つ。ツールは「一覧 / 検索 / 取得」の 3 系統
2. **Entra API アプリ** — スコープ 1 つ（例 `MCP.Access`）を公開し、Cowork の OAuth クライアントを事前承認
3. **Cowork プラグイン** — ビジネススキル（`SKILL.md`）＋ `agentConnectors`（MCP Server 分だけ列挙）

Dataverse も併用する場合は、`agentConnectors` に Dataverse MCP を**併載**し、各 `description` に
どのコネクタをどの用途で使うかを明記する（エージェントはこの説明でツールを選ぶ）。
手順は [cowork スキルの自前 MCP コネクタ手順](../cowork/references/custom-mcp-connector.md) を参照。

### 外部データを繋ぐときの設計原則（★ 実プロジェクトで有効だった型）

複数の外部データソースを横断して回答させる要件では、次の 5 つを設計段階で決めておく。
決めずに実装に入ると、あとから「どこに何を置くか」が崩れて破綻する。

| # | 原則 | 決めておく内容 |
|---|---|---|
| 1 | **移さずに繋ぐ** | 外部データは Dataverse に移行しない。Dataverse は**台帳**（問い合わせ・ナレッジ・マスタ）に限定し、外部データは MCP で都度読む。移行を選ぶと二重管理と権限の作り直しが発生する |
| 2 | **1 データソース = 1 MCP Server** | 種類の違うストレージ（ファイル / RDB / 業務 API）を 1 つの Server に同居させない。権限（Managed Identity のロール）とデプロイ単位を分けられなくなる |
| 3 | **書き込みは 1 か所に集約** | 外部データソース向け MCP は**読み取り専用**にする。書き込みは Dataverse MCP だけに担わせる。読み書き両方を外部に開くと監査（S-05 相当）が Server ごとに分散する |
| 4 | **事前索引化するか、都度読むか** | 全文検索が要件なら索引化（コストと鮮度ずれが発生）。**該当箇所を辿れれば足りる**なら索引化せず都度読む。後者なら Azure AI Search 等の追加コンポーネントが不要になる |
| 5 | **効果を KPI で測れる形にする** | 「外部データソースを根拠に含む回答の割合」を集計できるよう、回答・ナレッジの出典に**種別**（ファイルサーバー / 業務システム / 文書 / 台帳）を持たせる。MCP 追加の投資対効果が可視化できる |

> 原則 5 の具体例: ナレッジの出典テーブルに出典種別の Choice 列を置くと、
> 「外部データソース参照率」「根拠の横断度（2 種類以上の出典を突き合わせた割合）」が
> **追加の計測テーブルなしに**ダッシュボードで出せる。MCP Server を増やす判断の根拠になる。

### 見積もりに含める工数

| 項目 | 備考 |
|---|---|
| Azure 基盤（VNet / Private Endpoint / Managed Identity / 監視） | [azure スキル](../azure/SKILL.md)。テナントのガバナンス次第で増減 |
| MCP Server 実装（ツール定義 → 実装 → デプロイ → 実測検証） | データソース 1 つあたり。ツール数に比例 |
| Entra 認可（スコープ公開・事前承認・コネクタ用 OAuth） | 管理者同意の調整リードタイムを含める |
| 登録（カスタムコネクタ or Cowork パッケージ） | 公開先の数だけ |
| **運用**（証明書/シークレット更新・スキーマ変更追従・障害対応） | MCP Server は自社資産になるため、Dataverse MCP には無い継続コストが発生する |

> **プロンプト インジェクション対策**: MCP Server が返すデータに外部由来の文章（メール本文・
> 取り込んだ文書等）が含まれる場合は、§0 のとおり対策を設計段階で工数に含める。

---

## 7. Agent 365 / AI チームメイトを使う判断ポイント（★ 実装レベルを必ず確認）

**使う**: 独自モデル・独自ツールのエージェントを Teams / M365 Copilot に公開したい／
エージェント定義をコードとしてバージョン管理・レビューしたい／インストールごとに専用の Entra Agent ID を持たせたい／
**エージェント自身のメールアドレス・予定表・権限を持つ「デジタルな同僚」が欲しい**。
**使わない**（→ 代替）: Dataverse への自然言語登録・照会が主目的 → **Copilot Studio v2 スキル + Dataverse MCP**（§2.1.1）／
Code Apps や Web サイトに埋め込む → **Copilot Studio v1**（§3）。

> ★ **実装方式は Agents SDK の自己ホスト一択**。Foundry の `activityprotocol` を
> agentUser エンドポイントにする方式はトークンが 401 で拒否され、
> **Teams で話しかけても応答が返ってこない**（回避策なし）。設計段階で Foundry ホストを前提にしない。

> ★ **パターン認識**: 「ハンター（リード開拓）・テック（技術提案）・ミーナ（進捗管理）のように、
> 名前と役割を持つ複数の AI エージェントが 1 チームとして協働する（AI 社員・AI チーム）」という要件は、
> **`ai-teammate` スキル（エージェントテンプレート）を第一候補**として提案する。各エージェントを
> 個別の agentUser（Teams 公開）として構築し、共有データが必要な場合は
> Dataverse テーブルを介した非同期連携を検討する。

### ★ パターン認識: 「デジタルな同僚が欲しい」は Agent 365 で提案する

次のような言い回しが出たら、**その場で Agent 365 のエージェンティック ユーザー方式を提案する**。
他の選択肢（Copilot Studio / Power Automate / 通常の bot）では**構造的に実現できない**要件だから。

| ユーザーの言い回し | 本当に求めているもの |
|---|---|
| 「デジタルな同僚が欲しい」「AI の部下・メンバーを増やしたい」 | ディレクトリに載る、独立した 1 人のメンバー |
| 「エージェント専用のメールアドレスを持たせたい」 | **自分のメールボックス**での送受信 |
| 「エージェントに予定表を持たせたい」「会議に呼びたい」 | **自分の予定表**と会議の作成権 |
| 「予定調整を任せたい」「間に入って日程を決めてほしい」 | 相手とのやり取りを代行する秘書 |
| 「メールを捌いてほしい」「一次対応をさせたい」 | 自分から受信トレイを見て返信する動き |
| 「自分の権限の範囲を超えて働いてほしい」 | **依頼者の代理ではなく、エージェント自身の権限**で動く |

> 最後の 1 行が決定打になる。Copilot Studio や Power Automate のエージェントは
> **呼び出したユーザー（またはフローの接続所有者）の権限**で動くため、
> 「自分には見えない情報にも到達できる独立したメンバー」にはならない。
> Agent 365 の agentUser だけが**自分の Entra ユーザーと自分の権限**を持ち、監査ログにも自分の名前が残る。

**提案の進め方**（同じ質問を繰り返さない）:

1. [ai-teammate/references/digital-colleague-design.md](../ai-teammate/references/digital-colleague-design.md) §2 の
   **役割カタログ（R1 予定調整の秘書 / R2 一次受付 / R3 ウォッチャー / R4 まとめ役 / R5 起票係 / R6 チーム）**を
   AskUserQuestion の選択肢として提示する（複数選択可）
2. 同 §5 の**制約を先に伝える** — メールは push されず数分遅れる／エージェントはメールを既読にできない／
   他人の予定表は直接読めない（自然言語照会で代替）。後から言うと要件が崩れる
3. 同 §7 の**段階（L1 話せる → L2 予定を持つ → L3 メールで働く → L4 業務データ → L5 自分から動く）**で
   どこまで作るかを合意する
4. **社外の情報が業務に含まれていたら、その場で Web 検索（B10）も提案する**（下記）
5. **繰り返しの仕事が見えたら、定期実行（B11）も提案する**（下記）
6. **外部の文章を読むブロック（メール / Web 検索 / ファイル取り込み）を入れるなら、
   プロンプト インジェクション対策を工数に含める**と伝える。agentUser は**依頼者ではなく自分の権限**で動くため、
   メール本文に書かれた命令がそのまま実行されると実データに被害が及ぶ
   （→ [ai-teammate/references/prompt-injection.md](../ai-teammate/references/prompt-injection.md)）
7. そのうえで下の**ライト実装 / 本格実装**を選ぶ
8. 選択結果をまとめて [`ai-teammate` スキル](../ai-teammate/SKILL.md) の Step 0 へ引き渡す

### ★ Web 検索は聞かれる前に提案する（既定は Grounding with Bing）

業務内容に**社外の情報が一つでも含まれていたら**——相手企業・業界動向・競合・製品仕様・ニュース・
「最新の」「URL を読んで」——、要件として挙がっていなくても**その場で Web 検索を提案する**。
「調べられると思っていた」という後からの齟齬がいちばん多い箇所。

> 社外の情報も自分で調べられるようにしますか？
> - **はい（推奨）**: **Grounding with Bing**（Azure OpenAI Responses API の `web_search` ツール）で
>   Web 検索と URL 閲覧を足す。**追加の Azure リソースもプレビュー招待も不要**で、
>   LLM に使う Azure OpenAI とマネージド ID のまま動く
> - **いいえ**: 社内データ（Work IQ / Dataverse）だけで完結させる

| ルート | 選ぶ条件 |
|---|---|
| **Grounding with Bing（既定）** | 上記に当てはまるすべての場合。実機検証済みで、招待や課金の追加手続きが無い |
| **Web IQ MCP（使えるなら併用）** | **画像・動画の検索が業務要件**の場合だけ。プレビュー招待が要るので、無ければ待たずに Bing で進める |

同時に制約も伝える: Web の情報は正確性が保証されず、認証が要るページは読めない。
回答には必ず出典 URL を添える。詳細は
[ai-teammate/references/web-grounding.md](../ai-teammate/references/web-grounding.md)。

### ★ 定期実行も聞かれる前に提案する（頻度はこちらから出す）

業務の中に**繰り返される仕事が一つでも見えたら**——「毎朝」「週次」「月初に」「見ておいて」
「止まっているものを探して」「サマリを送って」——、**時刻起動で自分から動く形を提案する**。
対話しか無いエージェントは、呼ばれなくなった時点で使われなくなる。

> 時間が来たら自分から動いて、結果を届ける形にしますか？
> - **はい（推奨）**: 頻度・時刻・配信先を会話で決めて登録する。変更のたびに再デプロイしない
> - **いいえ**: 聞かれたときだけ答える

**頻度を聞かない。** 仕事の内容から推定して「平日 8:00 に Teams チャットへ」のように
1 案を提示し、可否だけ取る。確定させるのは**頻度・時刻・配信方法・宛先**の 4 点だけ。

| 配信経路 | 選ぶ条件 | 前提 |
|---|---|---|
| **Teams チャット** | 毎日読むもの、その場で反応してほしいもの | インスタンス SP への Graph 委任同意（B9） |
| **メール** | 週次・月次、転送や保管されるもの | Work IQ 接続（B4） |

同時に制約も伝える: 粒度は日単位（時間ごとは想定外）、実行に失敗しても同じ回は再送しない、
アプリが長く停止するとその回は飛ぶ。「毎朝必ず届く」と約束しない。詳細は
[ai-teammate/references/scheduled-delivery.md](../ai-teammate/references/scheduled-delivery.md)。

**Agent 365 にしない場合の代替**（要望が実は軽いとき）:

| 実際の要望 | 代替 |
|---|---|
| チャットで話しかけて Dataverse を操作したいだけ | **Copilot Studio v2 スキル + Dataverse MCP**（§2.1.1 ①） |
| 決まった条件でメールを自動処理したいだけ（判断が不要） | **Power Automate**（§4） |
| 共有メールボックスの体裁だけが欲しい | Exchange の共有メールボックス + Power Automate |
| Code Apps / Web に埋め込むチャット | **Copilot Studio v1**（§3） |

### ★ ライト実装 / 本格実装を AskUserQuestion で選ぶ（`ai-teammate` スキルに入る前に必ず実行）

`ai-teammate` スキルは **本格実装（private リポジトリ + CI/CD + Agent Evals）を既定**としているが、
検証目的の PoC にはその一式が重すぎる。**着手前に実装レベルを確認し、選んだ結果を `ai-teammate` スキルへ引き渡す**。

AskUserQuestion で次のように尋ねる:

> エージェントの作り方を選べます。どちらにしますか？
> - **ライト実装（PoC・検証用）**: 共有エージェントとして最短で Teams に公開する。ローカルの `.env` だけで動かし、
>   CI/CD・秘匿化ゲート・インスタンス化は作らない。**あとから本格実装へ昇格できる**（作り直し不要）。
> - **本格実装（本番運用）**: private リポジトリでエージェント定義をバージョン管理し、
>   秘匿化ゲート・**Agent Evals** による品質ゲート・承認付き自動デプロイまでを CI/CD で構築する。
>   インストールごとに専用の Entra Agent ID を持つインスタンス化エージェントとして公開する。

| 観点 | ライト実装（PoC） | 本格実装（本番運用） |
|---|---|---|
| 公開形態 | 共有エージェント（全員が同じ 1 体） | インスタンス化（Agent 365 ブループリント + `agenticUserTemplates`） |
| リポジトリ | 任意（ローカルのみでも可） | **private リポジトリ必須** |
| 秘匿値 | ローカル `.env` のみ | `.env` + CI のシークレットストア |
| 品質担保 | 手動での動作確認 | 秘匿化ゲート + Agent Evals + 承認ゲート |
| 実施 Step | `ai-teammate` スキルの Step 4（ブループリント）・11（インスタンス同意）を省略 | 全 Step |

> **迷ったらライト実装から始める**。エージェント定義・Teams パッケージ・スクリプトはそのまま流用でき、
> Step 4（Agent 365 ブループリント）と Step 11（インスタンス SP への同意）を追加し、
> CI/CD を `alm` スキルで有効化するだけで本格実装へ移行できる。

### 本格実装を選んだ場合: Git ホスティングも AskUserQuestion で確認する

**GitHub 前提にしない**。エージェント定義（`instructions`）は業務知識そのものなので private リポジトリを前提とし、
利用中の Git ホスティングに合わせて CI とシークレット保管先を決める。

> どの Git リポジトリで管理しますか？（いずれも private リポジトリ前提です）
> - **GitHub（private）**
> - **Azure DevOps Repos（private）**
> - **その他の Git**（GitLab / Bitbucket / 自己ホスト）

| Git ホスティング | CI | シークレット保管先 | `ai-teammate` の `SECRET_BACKEND` |
|---|---|---|---|
| GitHub（private） | GitHub Actions | GitHub Actions Secrets | `github` |
| Azure DevOps Repos（private） | Azure Pipelines | 変数グループ（Key Vault 連携可） | `azure-devops` |
| その他 Git | 各 CI | Azure Key Vault | `keyvault` |
| （ライト実装） | なし | ローカル `.env` のみ | `none` |

> 選択結果は `ai-teammate` スキルの Step 0 でそのまま使う（同じ質問を繰り返さない）。
> 構築手順は [`ai-teammate` スキル](../ai-teammate/SKILL.md)、CI 定義の雛形は
> [alm/references/ci-providers.md](../alm/references/ci-providers.md) を参照。

---

## 8. 統合パターン・テンプレート

統合アーキテクチャパターン集・設計アウトプットテンプレート・よくある判断ミスは [設計リファレンス](references/design-patterns.md) を参照。

## 9. 判断チェックリスト（設計開始時に確認）

設計を始める前に、以下を順番に確認する:

- [ ] **外部ユーザー向け UI か？** → YES なら既定で Azure、ユーザーが Power Pages を宣言した場合のみ Power Pages を含む構成
- [ ] **Dataverse にデータを貯める構成か？** → YES なら入力接点として **Copilot Studio v2 スキル + Dataverse MCP**（自然言語登録）を第一候補に含める（Code Apps は閲覧・分析・複雑操作を担当）
- [ ] **自然言語対話が必要か？** → YES ならまず §2.1.1 で分岐。**ユーザーが能動的にチャットで話しかけて実行**するなら **Copilot Studio v2 スキル + Dataverse MCP**を第一候補（M365 Copilot 統合が必須かつ会社環境で Cowork の利用が許可されている場合のみ Cowork も検討）。Copilot Studio v1 は **①自律起動 / ②アプリ組込** の 2 ケースに限る
- [ ] **エージェントに読ませたいデータが Dataverse の外にあるか？**（既存の基幹 DB / ファイルサーバー / 業務 API） → YES なら **自前 MCP Server（Azure Functions）** を構成に含め、公開先（Copilot Studio v2 / Cowork / 両方）を AskUserQuestion で確定する。Server の実装は共通で、登録方法だけが変わる（§6.5）
- [ ] **エージェント自身のメールアドレス・予定表・権限が要るか？**（デジタルな同僚・予定調整・メール一次対応） → YES なら **Agent 365**。他のコンポーネントでは実現できない（§7）
- [ ] **その業務に社外の情報が含まれるか？**（相手企業・業界動向・製品仕様・ニュース・URL 閲覧） → YES なら**聞かれる前に Web 検索を提案**する。既定は **Grounding with Bing**（追加リソース・招待なし）、画像/動画検索が要件なら Web IQ を併用（§7）
- [ ] **その業務に繰り返しの仕事が含まれるか？**（毎朝の要約・週次レポート・滞留チェック） → YES なら**聞かれる前に定期実行を提案**する。頻度は質問せず 1 案（例: 平日 8:00 / Teams チャット）を出して可否を取る（§7）
- [ ] **イベント駆動の自動処理が必要か？** → YES なら Power Automate を含む構成
- [ ] **データ操作 UI が必要か？** → YES で外部ユーザー向けなら既定 Azure（Power Pages 宣言時のみ Power Pages）、内部ユーザー向けなら Code Apps / Model-Driven Apps を含む構成（Canvas Apps は常に対象外）
- [ ] **標準ビュー/フォームで十分か？** → YES なら Model-Driven Apps が最速。カスタム UI なら Code Apps
- [ ] **名前付きの複数 AI エージェント（AI 社員 / AI チーム）を作りたいか？** → YES なら **`ai-teammate` スキル（エージェントテンプレート）を第一候補**にし、実装レベル（ライト/本格）を確認してから着手する
- [ ] **通知・リマインド等で Power Automate フロー内に、チャット UI を使わずイベント駆動で AI 処理を組み込みたいか？** → YES なら AI Builder を含む構成。それ以外の社内汎用業務は原則 Copilot Studio v2 + Dataverse MCP
- [ ] **確定的な処理か、LLM 判断が必要か？** → 確定的なら Power Automate、LLM なら Copilot Studio
- [ ] **応答文の生成が必要か？** → YES なら Copilot Studio
- [ ] **外部トリガー（メール/スケジュール）でエージェントを起動するか？** → YES なら Power Automate + Copilot Studio
- [ ] **複数エージェント/フローから共用する AI 処理があるか？** → YES かつ Power Automate フロー内での利用なら AI Builder で共通化（社内汎用業務は Copilot Studio v2 + Dataverse MCP を優先）
- [ ] **カスタムエンジンエージェントを Teams / M365 Copilot に公開するか？** → YES なら §7 で **ライト実装（PoC）/ 本格実装** を AskUserQuestion で確定してから `ai-teammate` スキルへ渡す（実装方式は **Agents SDK の自己ホスト一択**。Foundry ホストを前提にしない）
- [ ] **そのエージェントは外部の文章を読むか？**（メール本文 / Web ページ / 取り込んだファイル / 業務レコード） → YES なら**プロンプト インジェクション対策を設計段階で工数に含める**。agentUser は自分の権限で動くため、未対応だと実データに被害が及ぶ（[ai-teammate/references/prompt-injection.md](../ai-teammate/references/prompt-injection.md)）
- [ ] **本格実装を選んだか？** → YES なら **Git ホスティング（GitHub / Azure DevOps Repos / その他 Git）** も確認し、private リポジトリ前提で `SECRET_BACKEND` を決める
- [ ] **画面設計はブロックの組み合わせで決めたか？** → 同じ CRUD をテーブル数だけ量産しない。可視化ニーズがあれば **ReactFlow を第一候補**に（[設計リファレンス §4](references/design-patterns.md#4-画面設計ブロックの組み合わせテンプレ化しない設計)）
