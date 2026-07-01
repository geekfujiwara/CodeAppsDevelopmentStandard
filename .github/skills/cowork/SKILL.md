---
name: cowork
description: "目的特化型の Copilot Cowork プラグイン（M365 アプリパッケージ）を開発する。Agent Skills（SKILL.md）と Dataverse MCP コネクタをセットにし、Entra ID の OAuth 2.0 認可コードフロー認証を構成して Teams 開発者ポータルで registrationId を取得、M365 管理センターのエージェント画面からアップロード・公開して Cowork から Dataverse を利用可能にする。"
category: automation
triggers:
  - "Cowork"
  - "Cowork プラグイン"
  - "Copilot Cowork"
  - "Frontier"
  - "M365 アプリパッケージ"
  - "agentSkills"
  - "agentConnectors"
  - "Agent Skills"
  - "SKILL.md"
  - "Dataverse MCP コネクタ"
  - "remoteMcpServer"
  - "OAuthPluginVault"
  - "Teams 開発者ポータル"
  - "OAuth client registration"
  - "SSO client registration"
  - "referenceId"
  - "Enterprise Token Store"
  - "サイドロード"
  - "カスタムアプリのアップロード"
  - "M365 管理センター"
  - "Cowork スキル"
---

# Cowork プラグイン開発（Dataverse MCP セット）

目的特化型の **Copilot Cowork プラグイン**（M365 アプリパッケージ `.zip`）を作る。
ビジネススキル（`SKILL.md`）と **Dataverse MCP コネクタ**をセットにし、**Entra ID の OAuth 2.0 認可コードフロー認証**で
Cowork から Dataverse を直接操作できるようにする。

> 前提: 利用テナントが [Frontier プレビュー](https://adoption.microsoft.com/en-us/copilot/frontier-program/) に参加していること。
> 異常系・トラブルシュートは [references/troubleshooting.md](references/troubleshooting.md) を参照。

## パッケージ構成（Skills + remote connector）

```
<plugin-root>/
├── manifest.json                 # M365 Unified App Manifest v1.28
├── color.png                     # 192×192 フルカラーアイコン
├── outline.png                   # 32×32 アウトラインアイコン
├── build-package.ps1             # .zip 生成（検証付き）
└── skills/
    └── <skill-name>/             # kebab-case。フォルダ名 = SKILL.md の name と一致必須
        └── SKILL.md              # frontmatter(name/description) + ワークフロー本文
```

## 前提条件（最初に確認）

1. **環境で Microsoft Cowork が許可されていること**
   `python .github/skills/standard/scripts/check_mcp_client.py cowork` → ✅ なら OK。
   未許可なら Power Platform 管理センター → 環境 → `allowedmcpclient` で有効化。
2. **Frontier 参加**（管理者も Copilot → Settings → Frontier に登録）。
3. ツール: Azure CLI（`az`）、PowerShell、Python（アイコン生成）。

## スキル同梱スクリプト（再利用）

`scripts/` のスクリプトは汎用化されており、どのテナント・環境でも `.env`（`TENANT_ID` /
`DATAVERSE_URL` / `PUBLISHER_PREFIX` / `COWORK_OAUTH_CLIENT_ID`）を参照して動作する。

| スクリプト | 用途 |
|---|---|
| [scripts/setup_entra_oauth_graph.py](scripts/setup_entra_oauth_graph.py) | **（推奨）** `auth_helper.py` の認証済みトークンで Graph 経由に Entra OAuth アプリを作成・`mcp.tools` 付与・シークレット作成・`.env` 書き込み（Step 3）。**デバイスコード不要** |
| [scripts/setup_entra_oauth.ps1](scripts/setup_entra_oauth.ps1) | 同上を Azure CLI（`az login`）で行う代替版。`az` が使える環境向け（Step 3） |
| [scripts/register_mcp_client.py](scripts/register_mcp_client.py) | Client ID を Dataverse 許可 MCP クライアント（`allowedmcpclients`）に登録・有効化・確認（Step 4） |

## ワークフロー（正常系）

### Step 0: ヒアリング（プラグイン構想の提案）

ユーザーが「プラグインを作りたい」「Cowork で〜したい」と相談してきたら、**いきなり実装に入らず**
まず構想を提案する。以下の流れで会話を始める。

1. **目的の確認**: 「Cowork 用のプラグインとして作りますか？ 例えば『〇〇業務を Cowork から
   Dataverse のデータで支援する』ような形を想定しています」と確認する。
2. **対象データの把握**: 連携する Dataverse 環境／テーブル（顧客・契約・実績など）をヒアリング。
   不明なら `describe` / `search` 系で既存テーブルを軽く調べて候補を出す。
3. **スキル案を5つ提案**: その業務ドメインで Cowork が役立つ**スキルを5つ程度**列挙する。
   各スキルは「名前（kebab-case）＋一言の用途＋トリガー語の例」をセットで示す。

   例（保守契約ドメインの場合）:
   | スキル名 | 用途 | トリガー語の例 |
   |---|---|---|
   | `annual-customer-review` | 年次レビュー資料作成 | 「年間レビュー資料を作って」 |
   | `contract-renewal-proposal` | 契約更新提案の下書き | 「更新提案をまとめて」 |
   | `incident-trend-report` | 障害傾向レポート | 「故障傾向を分析して」 |
   | `equipment-lifecycle-plan` | 機器更新計画 | 「更新計画を提案して」 |
   | `cost-optimization-summary` | コスト最適化提案 | 「コスト削減案を出して」 |

4. **プラグイン名を提案**: 5つのスキル群を束ねる**プラグイン名（短縮名 / 正式名）を 2〜3 案**提示する。
   個社名は避け、業務ドメインが伝わる名前にする（例: 「MFP 年間レビュー」「保守契約アシスタント」）。
5. **合意**: ユーザーが採用するスキル（1つでも複数でも可）とプラグイン名を選んだら、Step 1 以降に進む。

> 最初は **1スキル + Dataverse MCP コネクタ**の最小構成で公開・疎通確認し、動いたら
> 残りのスキルを追加する流れが安全（コネクタ認証の検証を先に済ませられる）。

### Step 1: 対象テーブルを `describe` でスキーマ確認（クエリを書く前に必須）

**スキル本文にクエリを書く前に、必ず `describe` で対象テーブルの実スキーマを確認する。**
テーブル名・列名・**ルックアップ（外部キー）列の正確な名前**を推測で書かない（推測は実行時の
`Read query Failed` の主因。特に FK 列は環境やクエリ方式で表記が異なる）。

1. 対象テーブルごとに `describe` を実行し、以下を確定する:
   - **テーブル名**（論理名 / コレクション名のどちらをクエリで使うか）
   - **列の論理名**（表示名ではなく論理名）
   - **ルックアップ列の表記**: `describe` の結果に出る実際の列名を使う。
     `read_query` のクエリ方式に合わせること（Web API/OData 形式の `_xxxid_value` と
     SQL/論理名 `xxxid` は別物。**describe が返す名前をそのまま使う**）。
   - **選択肢（Picklist）の値とラベル**の対応
2. 確認できたスキーマだけを使ってクエリを書く。describe に無い列・テーブルは使わない。
3. スキル本文の冒頭にも「Step 1: 対象テーブルを `describe` で確認してからクエリする」を入れ、
   **生成するスキル自身も実行時に describe で裏取りする**手順にする（下のテンプレート参照）。

> **オーサリング時のスキーマ確認方法**: `describe` は **Cowork 実行時**に呼ばれる MCP ツールで、
> プラグイン作成時（ローカル）からは呼べない。作者がスキーマを裏取りするときは Dataverse の
> **メタデータ照会**（`auth_helper.py` 経由で `EntityDefinitions` の属性・型・Picklist を取得）で
> 列名・FK 列名・選択肢の値/ラベルを確認し、その結果だけでクエリを書く。生成するスキル本文には
> 引き続き「最初の Step で `describe`」を残す（実行時に Cowork 側が裏取りするため）。
> Picklist のラベルは環境の基本言語（英語など）で返ることがあるため、値（100000000 等）で判定する。

> 確認結果は「対象データ（テーブル）」表に**論理名で**まとめる。表示名は補足に留める。

### Step 2: スキル（SKILL.md）を作る

`skills/<skill-name>/SKILL.md` を作成。**フォルダ名と frontmatter `name` を完全一致**させ、
`name` は kebab-case（小文字英数とハイフン、連続/先頭/末尾ハイフン禁止）。

```yaml
---
name: annual-customer-review
description: |
  <何をするスキルか>。Use when ユーザーが「<トリガー語1>」「<トリガー語2>」と依頼したとき。
  Dataverse MCP コネクタ（read_query / search_data / search / describe）を使用する。
license: MIT
metadata:
  author: <作者>
  version: "1.0"
---
```

本文は **ワークフロー**として書く（番号付き手順／使用ツール名を明示／出力フォーマットを定義）。
本文は約 1,500〜2,000 語以内。詳細は `references/` に逃がす（コンパニオンファイルは最大20・各5MB）。

> **生成するスキル本文の必須ルール**: ワークフローの最初の Step を
> 「対象テーブルを `describe` でスキーマ確認（列名・FK 列名を確定）」とする。
> クエリ例の列名は describe で確認済みのものだけを使い、未確認の列を推測で書かない。

### Step 3: Entra アプリ（OAuth クライアント）を作成・構成

Dataverse MCP は Microsoft ファーストパーティ API のため、トークンの **audience が Dataverse 自身**
（`https://<org>.crm.dynamics.com`）である必要がある。**SSO 方式は audience が「自前アプリ」になり失敗する**
（→ troubleshooting #14）。そのため **OAuth 2.0 認可コードフロー**を使い、Enterprise Token Store に
Dataverse 宛のトークンを直接取得させる。**クライアントシークレットが必要**。値は `.env` に保存する。

**再利用スクリプト（推奨・デバイスコード不要）**: [scripts/setup_entra_oauth_graph.py](scripts/setup_entra_oauth_graph.py) が
`auth_helper.py` の**認証済みトークン**（PAC プロファイル or 2層キャッシュ）で Graph を叩き、
アプリ登録・`mcp.tools` 付与・シークレット作成・`.env` 書き込みを一括で行う。`az login` の
デバイスコード入力が不要なため、エージェント実行でも途中で止まらない（推奨）。

```powershell
# .env の TENANT_ID / DATAVERSE_URL を参照。表示名は環境変数 COWORK_APP_NAME で上書き可
python .github/skills/cowork/scripts/setup_entra_oauth_graph.py
```

> Graph トークンで App registration を作るため、初回は `auth_helper` の資格情報に
> `Application.ReadWrite.All`（委任）の同意が必要。未同意で `403 Authorization_RequestDenied`
> が出たら管理者同意を付与してから再実行する（→ troubleshooting #16）。

**Azure CLI 代替**: `az` が使える環境では [scripts/setup_entra_oauth.ps1](scripts/setup_entra_oauth.ps1) も利用可（値は `.env` から取得）。

```powershell
# TENANT_ID は .env から取得。表示名やシークレット有効年数はパラメータで上書き可
./.github/skills/cowork/scripts/setup_entra_oauth.ps1
# 例: ./setup_entra_oauth.ps1 -DisplayName "Contoso-Cowork-OAuth" -TenantId <GUID>
```

手動で行う場合（`az` CLI で手作りする）の同等コマンドと注意点は
[references/entra-oauth-setup.md](references/entra-oauth-setup.md) を参照。

> ポイント（要点のみ）:
> - OAuth 認可コードフローは Dynamics CRM の委任スコープ `mcp.tools` を直接同意する。
>   SSO と違い `Expose an API`・`preAuthorizedApplications`・`user_impersonation` は**不要**。
> - **シークレットは機密**。`.env`（`.gitignore` 済み）にのみ保存し、スキルや manifest には書かない。

### Step 4: Entra Client ID を許可 MCP クライアントに登録（必須）

OAuth 認可コードフローでは Dataverse に提示されるトークンの **appid がこのカスタムアプリ**になる。
そのため、**Entra の Client ID を `allowedmcpclients` テーブルに登録・有効化**しないと、認証は通っても
データ取得時に失敗する（ブログでも「抜けると plugin は正常に見えても Dataverse 利用時に失敗」と強調）。

**再利用スクリプト（推奨）**: [scripts/register_mcp_client.py](scripts/register_mcp_client.py)（汎用・どのテナントでも可）。

```powershell
# .env の COWORK_OAUTH_CLIENT_ID を登録（未登録なら作成、既存なら有効化）
python .github/skills/cowork/scripts/register_mcp_client.py

# 状態確認のみ（副作用なし）
python .github/skills/cowork/scripts/register_mcp_client.py --check
# 一覧
python .github/skills/cowork/scripts/register_mcp_client.py --list
# app id を明示
python .github/skills/cowork/scripts/register_mcp_client.py --app-id <CLIENT_ID> --name "Cowork Dataverse MCP"
```

> uniquename 未指定時は `<PUBLISHER_PREFIX>_<name のスラッグ>` で生成される。
> GUI なら Power Platform 管理センター → 環境 → 設定 → 機能 →
> Dataverse MCP の詳細設定（`etn=allowedmcpclient`）で +New。

### Step 5: Teams 開発者ポータルで OAuth client 登録 → registrationId 取得（ブラウザ）

> **ブラウザ操作は AI 自動化を必ず実行する**（手動案内にフォールバックしない）:
> このポータル手順は **Playwright MCP**（`browser_navigate` /
> `browser_snapshot` / `browser_type` / `browser_click`）で自動化する。
> AI がフォーム入力〜Save〜registrationId の読み取りまで行い、値を `.env` の
> `COWORK_OAUTH_REGISTRATION_ID` に書き込む。**クライアントシークレットだけは機密**のため、
> `browser_type` で `.env` の値をそのまま入力し、チャットには出力しない。
>
> **VS Code Simple Browser のズーム設定**: 操作前に
> `page.evaluate(() => document.body.style.zoom = '0.5')` でページを 50% に縮小し、
> ポータルの全 UI 要素が視認可能な状態にしてから操作を開始する。
> それでも必要な要素が見えないときはさらに縮小する。

[dev.teams.microsoft.com/tools](https://dev.teams.microsoft.com/tools) → Tools →
**OAuth client registration** → New（**SSO client registration ではない**）。
入力フィールドの詳細（Base URL は `/api/mcp` なし、Scope は `.default offline_access`、
Client secret は `.env` の値、Restrict by app = Any Teams app）は
[references/portal-registration.md](references/portal-registration.md) を参照。

Save すると **OAuth client registration ID** が発行される。これを `.env` の
`COWORK_OAUTH_REGISTRATION_ID` に保存する（この ID をそのまま manifest の `referenceId` に使う）。


### Step 6: manifest.json を作成

M365 アプリパッケージの `manifest.json`（manifestVersion 1.28）を作成する。要点:

- `agentSkills` に `./skills/<skill-name>`、`agentConnectors` に Dataverse MCP（`remoteMcpServer`：`mcpServerUrl` = `https://<org>.crm.dynamics.com/api/mcp`、`authorization.type` = `OAuthPluginVault`、`referenceId` = Step 5 の registration ID）を指定。
- `id` は `uuid5(NAMESPACE_URL, '<安定URL>')` で決定的に生成。
- **`mcpToolDescription` は必須**で、値は **JSON ファイル参照のオブジェクト** `{ "file": "dataverse-mcp-tools.json" }`（文字列や `.md` は不可。アップロード検証で弾かれる）。
- アイコンは `generate_icon_png.py`（standard/scripts）で生成可。

完全な manifest.json / `dataverse-mcp-tools.json` テンプレートと検証の注意点は
[references/manifest-reference.md](references/manifest-reference.md) を参照。

### Step 7: パッケージ（.zip）をビルド

**manifest.json をルートに**置いて圧縮する（フォルダごと圧縮しない）。ツール説明 JSON も含める。

```powershell
Compress-Archive -Path manifest.json, color.png, outline.png, dataverse-mcp-tools.json, skills `
  -DestinationPath dist/<name>.zip -Force
```

ZIP 検証: ルートに `manifest.json` / `dataverse-mcp-tools.json`、`skills/<skill-name>/SKILL.md` が含まれること。

### Step 8: アップロード（M365 管理センター → エージェント画面）

> ⚠️ Cowork プラグインは**「統合アプリ（Integrated apps）」ではなく、新しい「エージェント」画面**
> からアップロードする（UI 変更済み）。Integrated apps 画面は「Agents > All agents へ移動」の案内のみで
> カスタムアプリのアップロード導線は**廃止**された。

> **ブラウザ操作は AI 自動化を必ず実行する**（手動案内にフォールバックしない）:
> このアップロード〜Publish は **Playwright MCP** で自動化する。
> 手順: `browser_navigate` で `https://admin.cloud.microsoft/#/agents/all` へ →
> SSO 完了待ち（`page.waitForURL('**/admin.cloud.microsoft/**')` — 最大 30 秒）→
> Registry ツールバーの **More actions（…）** → **Add agent** → `<input type=file>` に
> `setInputFiles` で zip を投入 → 検証待ち → **Publish to users**（All users + Install None を
> **radio の `.evaluate(el => el.click())` で選択** — `click()` は overlay に遮られるため）→
> Apply template → Accept permissions → Review & finish → Publish → Close。
>
> **VS Code Simple Browser のズーム設定**: 既定の `Match Window` だと管理センターの UI 要素が
> 画面外にはみ出し、**More actions ボタンが不可視になる**ことがある。
> **操作前に `page.evaluate(() => document.body.style.zoom = '0.5')` でページを 50% に縮小**し、
> 全 UI 要素が視認可能な状態にする。それでも必要な要素が見えないときはさらに縮小する。
>
> `Add agent` の **More actions（…）はページ中段の Registry ツールバー** にあり、
> **画面が狭いと折り畳まれて見えない**。検証エラーが出た場合は
> `browser_snapshot` で内容を読み取り troubleshooting と突き合わせて修正→再アップロードする。

1. [Microsoft 365 管理センター](https://admin.cloud.microsoft/) → 左ナビ **エージェント（Agents）** (`#/agents/all`)
2. **Registry** タブ → グリッド中段ツールバーの **Export の右隣「…」(More actions)** → **Add agent** → **Upload agent** ウィザード起動
3. **Upload**: `<name>.zip` を選択→manifest 検証が走る（エラーが出たら troubleshooting 参照）
4. **Publish to users**: 公開対象（All users / **Specific users/groups**）を選択。特定ユーザーは検索ボックスで
   ユーザー/グループを追加する。**Install（None 推奨）は明示選択しないと Next が有効化されない**
5. **Apply template**（Default で Next）→ **Accept permissions**（権限不要なら「No required permissions」）→ **Review & finish** → **Publish**
6. 「You uploaded <name>」表示で完了 → **Close**。詳細パネルの Status が **Available** になる
7. **Cowork → Sources & Skills** にスキル＋Dataverse MCP コネクタが表示されることを確認

> アップロード検証でエラーバーが出たら、同じファイルを再選択しても再検証されない。
> エラーバーを閉じてから zip を選び直すこと。

### Step 9: Cowork で利用・初回同意

1. Cowork でスキルのトリガー語（例: 「年間レビュー資料を作って」）を入力
2. 初回は Dataverse MCP コネクタの **OAuth 同意**が走る（Enterprise Token Store 経由）
3. 同意後、`read_query` 等が実行されデータ取得 → 資料生成

### Step 10: プラグインの更新（再公開）

スキル本文・manifest・アイコン等を変更したら、**同じ `id` のまま再公開**する。
更新も新規と同じ **Add agent → Upload agent ウィザード**を使う（専用の更新メニューはない）。

1. manifest.json の **`version` をインクリメント**（例: `1.0.2` → `1.0.3`）。`id` は変更しない。
2. zip を再ビルド（Step 7 と同じ。`dataverse-mcp-tools.json` も忘れず含める）。
3. 管理センター → **エージェント（Agents）** (`#/agents/all`) → **Registry** タブ →
   ツールバー右の **More actions（…、Export の隣）** → **Add agent**。
4. **Upload agent** で新しい zip を選択 → 検証が再実行される（`id` が一致するため更新として処理される）。
5. **Publish to users**（公開対象と Install を選択。**更新時も再選択が必要**） →
   **Apply template**（Default で Next）→ **Accept permissions** → **Review & finish** → **Publish**。
6. 「**You uploaded \<name\>**」表示で完了 → **Close**。

> 注意:
> - `id` を変えると別エージェント扱いになり、既存の公開設定・同意が引き継がれない。
> - 詳細パネルの Version / 説明文表示はテナント側キャッシュで反映が数分遅れることがある。
> - **公開対象（All users / Install None 等）はウィザードで毎回選択**する（前回設定は自動継承されない）。

## 検証チェックリスト

- [ ] `check_mcp_client.py cowork` が ✅
- [ ] **対象テーブルを `describe` で確認**し、テーブル名・列名・**FK 列名**を確定（推測でクエリを書かない）
- [ ] 生成したスキル本文の最初の Step が「`describe` でスキーマ確認」になっている
- [ ] フォルダ名 = SKILL.md `name`（kebab-case）
- [ ] Entra: redirect URI×2 / Dynamics CRM **mcp.tools** / クライアントシークレット（.env）— `scripts/setup_entra_oauth.ps1`
- [ ] Power Platform: Entra の **Client ID** を許可された MCP クライアントとして登録・有効化— `scripts/register_mcp_client.py`（`--check` で検証）
- [ ] Teams ポータル **OAuth client registration**（SSO ではない）: Base URL は `/api/mcp` なし、scope は `.default offline_access`、Restrict by app = Any Teams app → registrationId を manifest に反映
- [ ] manifest に `mcpToolDescription: { file: "dataverse-mcp-tools.json" }`（JSONツール定義）
- [ ] ZIP ルートに manifest.json / dataverse-mcp-tools.json、skills/<name>/SKILL.md
- [ ] 管理センターの**エージェント画面**からアップロード→Publish→Status=Available
- [ ] Cowork に表示 → 初回同意 → データ取得成功
- [ ] 更新時: version をインクリメント（id 据え置き）→ More actions（… / Export の隣）→ Add agent → Upload agent → Publish

## 参考リンク

- [Build plugins for Cowork (Frontier)](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-plugin-development)
- [Configure authentication for MCP and API plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication)
- [Dataverse MCP 登録](../standard/references/dataverse-mcp-setup.md)
