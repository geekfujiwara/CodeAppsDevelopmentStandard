---
name: azure
description: "Azure 上のリファレンスアーキテクチャを選定し、テナントのセキュリティガバナンスに準拠した構成で構築・デプロイ・検証する。組織ポリシー（公衆ネットワークアクセス禁止・共有キー禁止・MFA 必須等）の下でも動作する構成を、Private Link / Managed Identity / VNet 統合を用いて実装する。"
category: architecture
triggers:
  - "Azure 構築"
  - "Azure リファレンスアーキテクチャ"
  - "Private Endpoint"
  - "publicNetworkAccess"
  - "共有キー禁止"
  - "Managed Identity でストレージ"
  - "VNet 統合 Functions"
  - "テナント準拠 Azure"
  - "ストレージを Web で使う"
  - "セキュアな Web サイト"
  - "linked backend"
  - "Azure ガバナンス準拠"
---

# Azure リファレンスアーキテクチャ スキル

Azure 開発を、**テナントのセキュリティガバナンスに準拠**したまま進めるためのスキル。
要件から適切なリファレンスアーキテクチャを選定し、構築・デプロイ・検証・クリーンアップまでを一貫して行う。

> **原則**: 組織ポリシー（Azure Policy / Conditional Access）と戦わず、**準拠する構成**を採る。
> `publicNetworkAccess=Disabled` でも Private Link は常に到達可能——これを土台にする。

## リファレンスアーキテクチャ一覧（メニュー）

| リファレンス | 用途 | ドキュメント |
|---|---|---|
| セキュアな Web × ストレージ | 公衆アクセス禁止ストレージのコンテンツを Web で安全配信 | [references/secure-website.md](references/secure-website.md) |
| Microsoft Foundry エージェント | Web 組み込みエージェント / 知識グラウンディング(Work IQ・Foundry IQ・Fabric IQ) / AI Gateway ガバナンス | [references/foundry-agent.md](references/foundry-agent.md) |

> 新しいリファレンスは `references/<topic>.md` として追加し、この表と参考リンクに1行足す。

---

## Web サイトの UI / デザインの参照方針

Azure 上で Web サイト/フロントを作る際、UI は**新規に定義せず、この開発標準の既存デザイン資産を参照**する（shadcn/ui + Tailwind CSS v4 を前提）。

| 対象 | 参照先 |
|---|---|
| **カラーパレット / 配色**（常に統一） | [code-apps デザインテンプレート](../code-apps/references/design-templates.md) / [デザインパターン](../code-apps/references/design-pattern.md) |
| **内部向け業務システム**の画面 | [code-apps デザインパターン](../code-apps/references/design-pattern.md) と各 `*-pattern.md`（CRUD / カンバン / ウィザード / ダッシュボード / タイムライン等） |
| **外部向けポータル / 公開サイト** | [power-pages デザインパターン](../power-pages/references/design-pattern.md) / [デザインテンプレート](../power-pages/references/design-templates.md) |

> 配色は常に **code-apps** に統一する。用途（内部業務アプリ or 外部公開ポータル）で参照するパターン集を切り替える。
> Web 配信のセキュア構成は [references/secure-website.md](references/secure-website.md) を併用する。

---

## ワークフロー（正常系）

### Step 1: リファレンスアーキテクチャを選定する
1. ユーザー要件を確認し、上のメニューから該当リファレンスを選ぶ。
2. 該当が無ければ、要件に近い構成を `references/` から選び、差分を明示する。

### Step 2: 事前確認で「Sure」にする
1. [references/preflight-checklist.md](references/preflight-checklist.md) を上から確認する。
2. 特に **強制ポリシーの対象リソース型**（ストレージのみか、コンピュートも含むか）を確定し、公開バックエンド可否を判断する。
3. **公式仕様は Microsoft Learn MCP**（`microsoft_docs_search` / `microsoft_docs_fetch`）で裏取りし、推測を残さない。

### Step 3: MFA 認証済みセッションを確保する
1. 組織が ARM 書込に MFA を要求する場合、`scripts/ensure_az_mfa.ps1` で MFA 済みトークンを確保する。
2. トークンの `amr` に `mfa`/`rsa` が含まれることを確認（`amr=pwd` は未 MFA で書込不可）。

### Step 4: インフラを段階構築する
1. `scripts/setup_private_endpoint.ps1` を **段階（Stage）実行**する（ポリシーでの失敗を切り分けるため）。
2. VNet/サブネット → Private DNS → Private Endpoint → バックエンドストレージ → コンピュート（VNet 統合・**MI デプロイ認証を作成時に指定**）→ RBAC → アプリ設定 → フロント連携 の順。
3. パラメータは引数か `.env`（[references/.env.example](references/.env.example)）から取得する。

### Step 5: アプリをデプロイする
1. **企業ネットワークからの大容量デプロイはリセットされる**ため、CI からデプロイする（`scripts/deploy_functionapp.yml`）。
2. コンテンツ配信はブラウザ直アクセスをやめ、**API プロキシ（HTTP Range 対応）**に変更する（詳細は各リファレンス）。

### Step 6: 検証する
1. 未認証で保護エンドポイントが `401` を返す（配信・認証保護の確認）。
2. 認証後にデータ取得が `200`（**Private Endpoint 経由の読取成功**）。
3. コンテンツは Range 要求に `206` + `Content-Range` を返す。
4. ブラウザ E2E は **VS Code 統合ブラウザ**で自動化する（Playwright 単体・MCP は使わない）。

### Step 7: クリーンアップとセキュリティ
1. 旧「公開切替」自動化（Automation runbook / スケジュール / CI）は不要かつ無効のため削除する。
2. シークレットは env / Key Vault 参照で管理し、コミットしない。一時ファイル・認証キャッシュは `.gitignore`。
3. 露出したシークレットはローテーションする。

---

## 参考リンク
- [セキュアな Web × ストレージ構成](references/secure-website.md)
- [Microsoft Foundry エージェント開発](references/foundry-agent.md)
- [事前確認チェックリスト](references/preflight-checklist.md)
- [異常系・トラブルシュート](references/troubleshooting.md)
- [パラメータ定義（.env.example）](references/.env.example)
