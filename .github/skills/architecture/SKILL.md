---
name: architecture
description: "Power Platform ソリューションの全体アーキテクチャを設計する。Copilot Studio / Power Automate / Code Apps / Power Pages / AI Builder の使い分け判断、コンポーネント選定、統合パターンを決定する。"
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
  - "データ入力の接点"
  - "統合パターン"
  - "設計判断"
  - "どれを使う"
  - "使い分け"
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
| **AI・自動化** | チャットで問い合わせできると便利ですか？自動通知は必要ですか？ |

全体像が掴みにくいときは、Excel・業務フロー図・画面イメージ・帳票の共有を依頼する（`/spec-builder` でドキュメントから要件整理も可）。要件が明確になったら、以下の判断フローチャートでコンポーネントを選定し設計提案へ進む。

---

## 1. コンポーネント早見表

| コンポーネント        | 得意なこと                                                                                   | 苦手なこと                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Copilot Studio**    | 自然言語対話、ナレッジ検索、LLM による推論・要約、ツール呼び出しの自律的オーケストレーション | 確定的なフロー制御、大量データの一括処理、トランザクション保証 |
| **Power Automate**    | イベント駆動の自動化、確定的なワークフロー、コネクタ経由の外部連携、条件分岐・ループ         | 自然言語対話、あいまいな入力の解釈、自律的判断                 |
| **Code Apps**         | リッチ UI、複雑なデータ操作画面、カスタムビジュアル、オフライン対応                          | ノーコードでの素早いプロトタイプ、モバイルネイティブ           |
| **Canvas Apps**       | （常に対象外 — パフォーマンス・カスタマイズ性・エンタープライズ運用の観点で不採用）           | —                                                                |
| **Model-Driven Apps** | Dataverse 標準 UI、フォーム/ビュー/ダッシュボードの自動生成、ビジネスルール統合              | カスタムビジュアル、外部 JS ライブラリ、ノーコード開発者       |
| **Power Pages**       | 外部ユーザー向けポータル・公開サイト、認証/匿名アクセス、Dataverse 連携、テーブル権限による公開制御 | 複雑なサーバーサイド処理、SSR/ISR、内部業務向けの複雑なリッチ UI |
| **AI Builder**        | **Power Automate フロー内**に組み込む定型 AI 処理（通知・リマインド等、イベント駆動でチャット UI を使わない場合のみ） | チャット UI での対話・社内汎用業務全般（★ §6 参照: 原則 Cowork、AI Builder は限定的採用） |
| **Dataverse**         | リレーショナルデータ、行レベルセキュリティ、監査、ビジネスルール                             | 大量ログデータ、非構造化データ、全文検索                       |
| **Copilot Cowork プラグイン** | 自然言語での業務データ登録・照会（Dataverse MCP 経由）、M365 Copilot 上での入力、SKILL.md による業務知識の付与 | リッチな一覧/編集 UI、複雑なビジュアル、外部/匿名公開 |

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

> **社内汎用業務は原則 Cowork（Dataverse + Code Apps）で実現する**。AI Builder は「通知・リマインド等で
> Power Automate フロー内に AI 処理を組み込みたい」イベント駆動・非チャット UI のケースに限定して採用する（§6 参照）。

### 2.1.1 「対話型が必要」の分岐: まず Cowork プラグインを検討する（★重要）

**対話型の体験が必要 = 即 Copilot Studio ではない**。
利用者が **自分から AI に話しかけて Dataverse へ登録・照会し、Code Apps で結果を見る**ような
「チャットで話しかけて実行する」業務は、**Copilot Cowork プラグインを第一候補**にする。

```
対話型の体験が必要
    │
    ├─ ① ユーザーが能動的に AI へ話しかけて解決する
    │     （Dataverse への登録/照会 + Code Apps で閲覧。M365 Copilot / Cowork 上で完結）
    │        ──→ ★【Copilot Cowork プラグイン】を第一候補（→ cowork スキル）
    │
    ├─ ② 自律的に起動して動く必要がある
    │     （メール受信・Teams 返信・スケジュール等のイベントで自動実行、無人で判断・応答）
    │        ──→ 【Copilot Studio（Workflow / トリガー）+ Power Automate】（§3・§4 へ）
    │
    └─ ③ アプリ（Code Apps / Web サイト）に組み込んで呼び出す
          （画面内チャット・埋め込み・WebChat SDK での外部公開）
             ──→ 【Copilot Studio v1】（§3 へ）
```

> **使い分けの原則**:
> - **ユーザーがチャットで話しかけて実行するケース**（能動的・有人）は **Cowork プラグイン**で実装する。
>   Dataverse + Code Apps で組んだ業務データへのアクセスは、原則 Cowork プラグイン経由の自然言語操作を提案する。
> - **Copilot Studio でエージェントを作るのは次の 2 つのケースに限る**:
>   1. **自律的なケース** — イベント/トリガーで無人起動し、自分で判断・応答・データ更新する（②）
>   2. **アプリに組み込むケース** — Code Apps / Web サイトに埋め込んで呼び出す（③、v1 必須）
> - 上記②③以外の「チャットで話しかけて実行する」ケースはすべて **Cowork** で行う。
> - 構築手順は [`cowork` スキル](../cowork/SKILL.md)、Cowork+Code Apps の UI 併設方針は §5 を参照。

### 2.2 複合パターン（最も多い）

多くの要件は **複数コンポーネントの組み合わせ**になる（CRUD+通知、対話+データ操作、対話+外部連携、対話+定期実行/イベント駆動、AI 分析+対話、外部ポータル+データ操作、フルスタック）。各パターンの構成・典型ユースケースの一覧表は [設計リファレンス](references/design-patterns.md#0-複合パターン早見表) を参照。

---

## 3. Copilot Studio を使う判断ポイント

> ★ **まず §2.1.1 を確認する**。「ユーザーがチャットで話しかけて Dataverse に登録/照会する」有人の対話は
> **Copilot Cowork プラグインを第一候補**とし、Copilot Studio は次の 2 ケースに絞って採用する:
> ① **自律的なケース**（イベント/トリガーで無人起動）、② **アプリに組み込むケース**（Code Apps / Web 埋め込み）。
> これ以外の「話しかけて実行」は Cowork で行う。

**使う**: 自律起動（イベント/トリガー）での無人実行・アプリ埋め込み/Web 公開・複数ツールの自律オーケストレーション・ナレッジ検索・要約/分析/レポート生成。
**使わない**（→ 代替）: ユーザーが能動的にチャットで登録/照会するだけ → **Cowork プラグイン**／確定手順の 100% 実行・大量一括処理・LLM 不要の条件分岐 → **Power Automate**／UI 入力編集 → **Code Apps**／承認ワークフロー → **Power Automate**。

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

> ★ **入力の既定は Copilot Cowork プラグインを優先提案する（Dataverse + Code Apps 構成では特に）**。
> Dataverse にデータを貯める構成では、利用者は今後**アプリ画面を見ながら入力するのではなく、Copilot Cowork のプラグインから自然言語で登録**するようになる。
> そのため初回のアーキテクチャ提案では、**データ入力の主接点として Cowork プラグイン**（`SKILL.md` + Dataverse MCP コネクタ）を**第一候補**に含める。
> Code Apps は「一覧・ダッシュボード・複雑な編集・可視化」を担う**閲覧/操作の接点**として併設する（入力専用の画面作り込みに時間をかけない）。
>
> - **提案の型**: **Dataverse（基盤）＋ Code Apps（閲覧・分析・複雑操作）＋ Copilot Cowork プラグイン（自然言語での登録・照会）** を既定セットとして提示する。
> - **内部ユーザー向け**の入力は Cowork プラグインを優先。**外部ユーザー向け**は Cowork ではなく Copilot Studio 埋め込み / Power Pages を使う（§3・§5 参照）。
> - 構築手順は [`cowork` スキル](../cowork/SKILL.md) を参照。

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

本プロジェクトでは **Code Apps（TypeScript + React + Tailwind + shadcn/ui）** を標準とする。
**Canvas Apps は常に対象外**とする（パフォーマンス・カスタマイズ性・エンタープライズ運用の観点で不向きなため）。
内部ユーザー向けの新規画面は、UI の複雑さに関わらず常に Code Apps を提案する。

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
> - 詳細は [`code-apps` スキル §2 環境の前提条件](../code-apps/SKILL.md#2-初回デプロイ) を参照。

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

### 基本方針: AI Builder は基本的に利用しない。社内汎用業務は Cowork で実現する

**社内の汎用業務は、ほぼ Cowork（Dataverse + Code Apps）で実現できる**。
利用者がチャットで話しかけて Dataverse に登録・照会し、Code Apps で結果を見る構成（§2.1.1・§5 参照）を第一候補とし、
AI Builder を安易に採用しない。

**AI Builder を使うのは次の限定的なケースのみ**:

> **通知・リマインド等で Power Automate の中に AI 処理を組み込みたいとき**に AI Builder を使う。
> どうしてもチャット UI ではなく、**イベント駆動でフロー内に AI 処理を組み込む必要がある**場合に限り、
> Power Automate フロー内で AI Builder（AI プロンプト）を呼び出すパターンを採用する。
> それ以外（対話型・社内汎用業務全般）は **Cowork** を使う。

```
AI 処理が必要
    │
    ├─ チャットで話しかけて実行する（有人・能動的） ──→ 【Cowork プラグイン】（§2.1.1 へ）
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
**使わない**（→ 代替）: 社内汎用業務全般・チャットで話しかけて登録/照会する業務 → **Cowork プラグイン**、対話形式／リアルタイム応答／1 回限りの分析 → **Copilot Studio**。

> 使う場面/使わない場面の詳細表は [コンポーネント選定 詳細](references/component-selection-details.md#4-ai-builder-使う場面--使わない場面) を参照。

### Copilot Studio の Instructions vs AI Builder プロンプトの判断

> 前提: この判断は「Copilot Studio エージェント or Power Automate フロー内で AI 処理を使う」と決まった後の実装方式の選択。
> 社内汎用業務のチャット対話そのものは、まず §2.1.1 に従い **Cowork** を検討する。

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


## 7. 統合パターン・テンプレート

統合アーキテクチャパターン集・設計アウトプットテンプレート・よくある判断ミスは [設計リファレンス](references/design-patterns.md) を参照。

## 8. 判断チェックリスト（設計開始時に確認）

設計を始める前に、以下を順番に確認する:

- [ ] **外部ユーザー向け UI か？** → YES なら既定で Azure、ユーザーが Power Pages を宣言した場合のみ Power Pages を含む構成
- [ ] **Dataverse にデータを貯める構成か？** → YES なら入力接点として **Copilot Cowork プラグイン**（自然言語登録）を第一候補に含める（Code Apps は閲覧・分析・複雑操作を担当）
- [ ] **自然言語対話が必要か？** → YES ならまず §2.1.1 で分岐。**ユーザーが能動的にチャットで話しかけて実行**するなら **Cowork プラグイン**を第一候補。Copilot Studio は **①自律起動 / ②アプリ組込** の 2 ケースに限る
- [ ] **イベント駆動の自動処理が必要か？** → YES なら Power Automate を含む構成
- [ ] **データ操作 UI が必要か？** → YES で外部ユーザー向けなら既定 Azure（Power Pages 宣言時のみ Power Pages）、内部ユーザー向けなら Code Apps / Model-Driven Apps を含む構成（Canvas Apps は常に対象外）
- [ ] **標準ビュー/フォームで十分か？** → YES なら Model-Driven Apps が最速。カスタム UI なら Code Apps
- [ ] **通知・リマインド等で Power Automate フロー内に、チャット UI を使わずイベント駆動で AI 処理を組み込みたいか？** → YES なら AI Builder を含む構成。それ以外の社内汎用業務は原則 Cowork
- [ ] **確定的な処理か、LLM 判断が必要か？** → 確定的なら Power Automate、LLM なら Copilot Studio
- [ ] **応答文の生成が必要か？** → YES なら Copilot Studio
- [ ] **外部トリガー（メール/スケジュール）でエージェントを起動するか？** → YES なら Power Automate + Copilot Studio
- [ ] **複数エージェント/フローから共用する AI 処理があるか？** → YES かつ Power Automate フロー内での利用なら AI Builder で共通化（社内汎用業務は Cowork を優先）
- [ ] **画面設計はブロックの組み合わせで決めたか？** → 同じ CRUD をテーブル数だけ量産しない。可視化ニーズがあれば **ReactFlow を第一候補**に（[設計リファレンス §4](references/design-patterns.md#4-画面設計ブロックの組み合わせテンプレ化しない設計)）
