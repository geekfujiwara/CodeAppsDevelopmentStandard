---
name: agent365
description: "AI チームメイト。Microsoft Agent SDK アプリを App Service で自己ホストし、Agent 365 のエージェント ID ブループリントと Teams アプリパッケージを介して、Teams / Microsoft 365 Copilot に agentUser として公開する。自分のメールアドレスと予定表を持ち、自分の権限で働く『デジタルな同僚』を、役割カタログと機能ブロック（メール応対 / Dataverse の権限準拠検索 / Web 検索 / 定期実行 / コード実行 / 経過連絡 / 成果物の共有と同意 / Teams プレゼンス）の組み合わせで設計・実装する。Foundry ホスト方式は agentUser チャットが 401 で成立せず無応答になるため正常系では使わず、references の参考情報として隔離する。CI/CD・レビューゲートなどの ALM は alm スキルに委譲する。"
category: automation
triggers:
  - "Agent 365"
  - "AI チームメイト"
  - "Agent Identity Blueprint"
  - "エージェントテンプレート"
  - "AI 秘書エージェント"
---

# AI チームメイト開発スキル

**Microsoft Agent SDK アプリを App Service で自己ホスト**し、**Agent 365 のエージェント ID ブループリント**と
Teams アプリパッケージを通じて、Teams / Microsoft 365 Copilot の
**同僚エージェント（agentUser）**として実際に会話できる状態にする。

> **Foundry ホスト方式は使わない。** Foundry の `activityprotocol` を Agent 365 の agentUser
> エンドポイントに指定すると Agent 365 のトークンが 401 で拒否され、**Teams で話しかけても応答が
> 返ってこない**（無反応）。受理 audience を変える手段が無く、回避策も無い。
> 参考情報としてのみ [references/foundry-hosted-bot.md](references/foundry-hosted-bot.md) に隔離する。
> 実装で作るのは常に**自前 App Service の `/api/messages`**。

本 SKILL.md には**正常系フローだけ**を置く。手順の中身・分岐・異常系はすべて `references/`、
再現可能な操作は `scripts/` にある。

| 原則 | 内容 |
|---|---|
| 正常系は自己ホスト | agentUser チャットが動くのは Agents SDK アプリを App Service で自己ホストする構成のみ |
| Foundry は参考 | Foundry エージェントは正常系に含めない。頭脳として使うなら中間サービスで読替が要る |
| SDK / REST のみ | Azure CLI・`a365` CLI・Agents SDK で完結。ポータルのブラウザ自動操作は行わない |
| テンプレート駆動 | コミットするのは `${VAR}` 入りテンプレートだけ。実値は `.env` / シークレットストアのみ |
| 外部データはデータ | 取り込んだ文章はフェンスで囲って渡し、実害のある操作はコードで ID を検証する |
| インスタンス単位 | 同意・写真・Dataverse 登録は**インスタンスごと**。作り直すたびにやり直す |
| ALM は委譲 | pre-commit・CI/CD・レビューゲート・リリース記録は **`alm` スキル**が担当する |

> 前提ツール: Python 3.10+、Azure CLI（`az`）、Agent 365 CLI（`a365`）、.NET 8 SDK、Git。
> 認証は `standard/scripts/auth_helper.py` のキャッシュを共有し、agent365 用に個別ログインしない。

| 参照 | 用途 |
|---|---|
| [digital-colleague-design.md](references/digital-colleague-design.md) | **何を作るかを決める**（役割カタログ R1〜R6 / 機能ブロック B1〜B16 / 提案条件 / 制約 / 段階導入）。**Step 0 で読む** |
| [self-hosted-agent.md](references/self-hosted-agent.md) | 自己ホストの完全手順（Azure Bot / App Service / `appsettings.json` / ログの読み方） |
| [feature-blocks.md](references/feature-blocks.md) | **機能ブロックの実装レシピ**（B2/B6/B9〜B16 のコピー・アプリ設定・DI 登録）。**Step 8 で読む** |
| [agent-brain.md](references/agent-brain.md) | 中身の作り込み（Azure OpenAI / 会話履歴 / プロンプト外部化 / Dataverse MCP / Work IQ / 再デプロイ） |
| [prompt-injection.md](references/prompt-injection.md) | **外部データを読むなら必須**。フェンス / 許可リスト / 検知 / 同意の強制の 4 層。**Step 8 で読む** |
| [usage-accounting.md](references/usage-accounting.md) | **誰が・何に・いくら使ったか**の計測（B15）。Azure ポータルでは出せない内訳。**Step 8 で読む** |
| [incoming-files.md](references/incoming-files.md) | **送られたファイルを受け取る**（B16）。取得経路と `supportsFiles`。**Step 8 で読む** |
| [assistant-agent-pattern.md](references/assistant-agent-pattern.md) | 秘書・同僚としての標準品質（承認後の実行 / 権限準拠検索 / 人格 / プレゼンス） |
| [architecture.md](references/architecture.md) | 2 種類のブループリントの違い / manifest スキーマ / 公開経路 / 表示名・アイコンの変更 |
| [troubleshooting.md](references/troubleshooting.md) | 異常系（401 / AADSTS82001 / AADSTS65001 / カタログ公開の 409・403 など） |
| [.env.example](references/.env.example) | 環境変数の一覧と取得元 |
| [`alm`](../alm/SKILL.md) | 秘匿化ゲート・CI/CD・リリース記録 |
| 参考のみ | [foundry-hosted-bot.md](references/foundry-hosted-bot.md)（Foundry ホスト方式）/ [poc-quickstart.md](references/poc-quickstart.md)（共有エージェントの簡易ルート）/ [team-pattern.md](references/team-pattern.md)（複数体構成）/ [a365-cli.md](references/a365-cli.md) |

## 事前確認（会話の最初に 1 回だけ）

本スキルの利用が確定したら、**1 回の AskUserQuestion で次の 4 点をまとめて確認する**。
以降の Step で同じ内容を聞き直さない。

| # | 質問 | 選択肢 / 記入例 |
|---|---|---|
| 1 | ゴールはどこまでか | (a) ローカル scaffold のみ（Azure 操作なし）<br>(b) 自己ホスト App Service の endpoint を用意するまで（Step 1〜6）<br>(c) M365 管理センターに "Agent template" として登録するまで（Teams チャットはまだ動かない）<br>**(d) Teams で実際に会話できる状態まで（Step 0〜13・Azure 課金あり）** |
| 2 | Azure サブスクリプションと認証キャッシュは使えるか | (d) を選ぶ場合は Agent 365 ライセンスの割り当ても必要 |
| 3 | 「〇〇を行ってくれる同僚エージェント」の具体的な業務内容は？ | [digital-colleague-design.md](references/digital-colleague-design.md) §2 の役割カタログ（R1〜R6）を選択肢として提示する（複数可・自由記述可） |
| 4 | エージェント名（kebab-case）と Teams での表示名は？ | 希望が無ければ 3 案提案する。アイコン画像（正方形・背景透過 PNG）を用意する。**商標・著作権に触れる名称やキャラクターは使わない** |

質問 1 の回答が**テナントのアプリカタログへの公開の承認を兼ねる**。
(a) は課金もカタログ公開も発生せず、(b) は Azure Bot / App Service の課金だけが発生する。

**質問 3 の回答から、依頼者が言っていない機能ブロックを自分から提案する。**
依頼者は「Web 検索が欲しい」「定期実行を付けて」とは言わない。
社外の情報が出てきたら **B10**、繰り返しの仕事が見えたら **B11**、ファイルが出てきたら **B12**、
B12 を入れるなら **B13 と B14**、相手からファイルを渡されるなら **B16** をその場で提案し、可否を取る
（提案条件と言い回しは [digital-colleague-design.md](references/digital-colleague-design.md) §4）。

**制約もこの場で先に伝える**（同 §5）。とくに「メールは push されないのでポーリングになる」
「エージェントはメールを既読にできない」「他人の予定表は直接読めない」
「共有リンクは一度渡すと取り消せない」の 4 点は、後から言うと要件が崩れる。

## スキル同梱スクリプト

値は引数または `.env`（[references/.env.example](references/.env.example)）から取得する。

| スクリプト | 用途 | Step |
|---|---|---|
| [provision_selfhost.py](scripts/provision_selfhost.py) | UAMI + Azure Bot（Teams チャネル）+ App Service を冪等に作成し `.env` へ書き戻す。`--check` でプラン・Always On のドリフト検出 | 6 |
| [provision_code_sandbox.py](scripts/provision_code_sandbox.py) | コード実行サンドボックス（Container Apps 動的セッション プール）を冪等に作成しロールを付与 | 8 |
| [build_teams_package.py](scripts/build_teams_package.py) | Teams manifest + アイコン + `agenticUser.json` を ZIP 化 | 9 |
| [publish_teams_app.py](scripts/publish_teams_app.py) | Graph で ZIP を組織カタログへ登録（**devPreview は Graph 側で拒否される**） | 10 |
| [grant_agent_instance_consent.py](scripts/grant_agent_instance_consent.py) | インスタンス SP に Messaging Bot API の管理者同意を付与 | 11 |
| [grant_agent_graph_scopes.py](scripts/grant_agent_graph_scopes.py) | インスタンス SP に Microsoft Graph の**委任**スコープを付与（既存の同意へマージ） | 11 |
| [set_agent_user_photo.py](scripts/set_agent_user_photo.py) | エージェンティック ユーザーにプロフィール写真を設定 | 12 |
| [configure_agent_presence.py](scripts/configure_agent_presence.py) | UAMI に Graph プレゼンス権限を冪等付与し設定値を確認 | 12 |

すべて `--check` で確認のみの実行ができる。

> `discover_foundry_context.py` / `create_blueprint.py` / `create_instance.py` / `deploy.py` は
> **Foundry 連携の参考スクリプト**で、正常系では使わない
> （→ [references/foundry-hosted-bot.md](references/foundry-hosted-bot.md)）。
> ALM 共通スクリプト（`render.py` / `sanitize.py` / `check_secrets.py` 等）は **`alm` スキル**が提供する。

## 標準フォルダ構成

```
<repo-root>/
├── .env                            # 実値（.gitignore 済み）
├── .env.example                    # プレースホルダーのみ（コミット対象）
├── agents/<agent-name>/
│   ├── agent.template.yaml         # コミット対象（${VAR} 入り）
│   └── agent.yaml                  # レンダリング結果（.gitignore 済み）
├── src/<agent-name>-agent/         # Agents SDK アプリ（自己ホスト）
│   ├── Program.cs / <Agent>.cs     # AgentApplication 派生。Teams message を受けて応答する
│   ├── AgentBrain.cs               # LLM + ツール ループ（全入口で共用）
│   ├── appsettings.json            # agentic 設定。シークレットは書かない
│   └── （機能ブロックのファイルは Step 8 で足す → references/feature-blocks.md）
├── teams/
│   ├── manifest.template.json      # コミット対象
│   ├── agenticUser.template.json   # コミット対象
│   └── <agent-name>-teams-app.zip  # ビルド結果（.gitignore 済み）
├── assets/agent-icon.png           # 正方形・背景透過（AGENT_ICON 未指定時に使用）
└── scripts/                        # 本スキルの scripts/ をコピー
```

## 正常系フロー

実機で Teams 応答まで到達した手順そのもの。上から順に実行する。

### Step 0: 役割と機能ブロックを決める

**何を作るかを決めずに Step 1 へ進まない。**
[references/digital-colleague-design.md](references/digital-colleague-design.md) に従い、
**役割**（§2 の R1〜R6）・**機能ブロック**（§3・§4。全部は入れない）・
**段階**（§7 の L1〜L5）の 3 つを確定する。決まったブロックが以降の実施範囲を決める。

| ブロック | 実施する Step |
|---|---|
| B1 Teams 会話 / B3 頭脳 / B8 人格 | Step 5・6・7 |
| B4 Microsoft 365 接続 / B5 Dataverse 接続 | [agent-brain.md](references/agent-brain.md) §6・§7 |
| B2 自分の ID / B6 メール / B9 チャット / B10 Web / B11 定期 / B12 作業環境 / B13 経過 / B14 共有 / B15 実績 / B16 添付 | Step 8 |
| B7 Teams プレゼンス | Step 12 |

### Step 1: 名前・表示名・アイコンを決める

**顔（表示名とアイコン）は Teams パッケージに焼き込まれる**ので、Step 9 のビルド前に確定させる。
後から直すには再アップロードが要る（→ [architecture.md](references/architecture.md) §5）。
アイコンは Step 12 のプロフィール写真にも流用する。

```dotenv
AGENT_NAME=mina-secretary          # kebab-case。フォルダ・リソース名
AGENT_DISPLAY_NAME=秘書 ミーナ       # 30 文字以内。Teams の表示名（AGENT_NAME とは別物）
AGENT_FULL_NAME=秘書 ミーナ - 予定とメールを掃く同僚エージェント   # 100 文字以内
AGENT_ICON=assets/agent-icon.png   # アイコン画像のファイルパス
```

`AGENT_ICON` の解決順は `--icon` 引数 › `AGENT_ICON` › `assets/agent-icon.png`。
独自アイコンは**アルファチャンネル付きの正方形 PNG**（512x512 推奨）にする。
背景を透過にしないと Step 9 の outline アイコンが塗り潰しになる。
**商標・著作権に触れる意匠やキャラクターは使わない。**

### Step 2: リポジトリを scaffold する

```powershell
Copy-Item .github/skills/agent365/scripts -Destination scripts -Recurse
Copy-Item .github/skills/alm/scripts/*.py -Destination scripts
Copy-Item .github/skills/agent365/references/templates/agent.template.yaml agents/<agent-name>/
Copy-Item .github/skills/agent365/references/templates/manifest.template.json teams/
Copy-Item .github/skills/agent365/references/templates/agenticUser.template.json teams/
Copy-Item .github/skills/agent365/references/.env.example .env.example
New-Item -ItemType Directory assets -Force | Out-Null
Copy-Item C:/path/to/your-icon.png assets/agent-icon.png
pip install -r requirements.txt   # azure-identity / PyYAML / Pillow / requests
```

`.gitignore` は[汎用化と秘匿化](#汎用化と秘匿化)の一覧を満たすこと。
本格実装のリポジトリ雛形・hook・CI 定義は **`alm` スキル**に従う。

### Step 3: `.env` を用意する

```powershell
Copy-Item .env.example .env
```

最低限 `AZURE_SUBSCRIPTION_ID` / `AZURE_TENANT_ID` / `AZURE_RESOURCE_GROUP` /
`AGENT_NAME` / `AGENT_DISPLAY_NAME` と Teams manifest の公開メタデータを入れる。
認証は `standard/scripts/auth_helper.py` が保存したキャッシュを使い、
`az login` / `a365` の個別ログインを増やさない。

**Foundry プロジェクトの設定は要らない。** `AZURE_AI_ACCOUNT` / `FOUNDRY_PROJECT_ENDPOINT` は
正常系では未設定のままでよい。

### Step 4: Agent 365 のエージェント ID ブループリントを作成する

**Foundry のブループリントとは別物**（→ [architecture.md](references/architecture.md) §1）。
ここで作るのは agentUser インスタンスを払い出すための Agent 365 側の設計図。

```powershell
a365 setup blueprint -n <agent-name> --no-endpoint
```

- 生成された `a365.generated.config.json` の `agentBlueprintId` を `.env` の
  `A365_AGENT_BLUEPRINT_ID` に設定する。
- **クライアントシークレットが平文で標準出力される。ログに残さない。**
- 初回はディレクトリ伝播の遅延で失敗することがあるが、**再実行すれば冪等に修復**される。
- エンドポイント登録は Step 6 で行う（この時点ではまだ URL が存在しない）。

### Step 5: Agents SDK アプリを実装する

**ここで作るアプリが agentUser チャットの実体。**

```text
src/<agent-name>-agent/
├── <agent-name>.csproj   # Microsoft.Agents.Hosting.AspNetCore / Authentication.Msal
├── Program.cs            # AddAgent / AddAgentAspNetAuthentication / MapAgentApplicationEndpoints
├── <Agent>.cs            # AgentApplication 派生
├── AgentBrain.cs         # LLM / ツール呼び出し
└── appsettings.json      # シークレットは書かない
```

`appsettings.json` は [references/self-hosted-agent.md](references/self-hosted-agent.md) §3 に従う。
外せない固定点は 4 つ。

- `AuthType` は confidential client（`ClientSecret` / 証明書 / フェデレーション資格情報）
- `ClientId` は **`A365_AGENT_BLUEPRINT_ID`**（Bot の appId ではない）
- `Scopes` は `5a807f24-c9de-44ee-a3a7-329e88a00ffc/.default`
- `TokenValidation:Audiences` に **ブループリント appId と Bot の `msaAppId` を両方**入れる

### Step 6: デプロイして messaging endpoint を登録する

**agentUser チャットが動く唯一の構成。** 手順とログの読み方は
[references/self-hosted-agent.md](references/self-hosted-agent.md)。

> ★ **App Service は B1 以上 + Always On**。Free / Shared には Always On が無く、
> アプリがアンロードされて**すべての `BackgroundService`（B6・B11・B12）が止まる**。
> さらに**アンロード後の 1 通目はコールド スタート（55〜80 秒）に負けて捨てられる**
> （チャネルは再送しない）。「久しぶりに話しかけると 1 回めだけ無視される」はこれ（→ troubleshooting #44）。
> `provision_selfhost.py` が F1/D1 を弾き、Always On を有効化し、**成功時にも読み戻して検証**する。

```powershell
# 1. UAMI + Azure Bot(Teams チャネル) + App Service を作成し .env に書き戻す
python scripts/provision_selfhost.py --write .env

# 2. ブループリント用シークレットを App Service のアプリ設定へ注入（ファイルには書かない）
$sec = az ad app credential reset --id $env:A365_AGENT_BLUEPRINT_ID --append `
         --display-name "$env:AGENT_NAME-agent" --years 1 --query password -o tsv
az webapp config appsettings set -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME `
  --settings "Connections__ServiceConnection__Settings__ClientSecret=$sec"
Remove-Variable sec

# 3. デプロイ（発行前に publish フォルダを必ず削除する）
Remove-Item .\publish -Recurse -Force -ErrorAction SilentlyContinue
dotnet publish -c Release -o .\publish
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory("$PWD\publish", "$PWD\publish.zip")
az webapp deploy -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME `
  --src-path .\publish.zip --type zip --track-status false --timeout 600000
az webapp restart -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME

# 4. ブループリントにエンドポイントを登録（Step 4 と同じカレントディレクトリで実行）
a365 setup blueprint -n <agent-name> --endpoint-only --messaging-endpoint $env:AGENT_MESSAGING_ENDPOINT
```

- `--messaging-endpoint` は **`--endpoint-only` との併用が必須**。
- 2 つの `a365 setup blueprint` は `a365.generated.config.json` があるディレクトリで実行する。
- エンドポイントは**自前 App Service の `/api/messages`**。ここに Foundry の URL を入れない。
- プランを後から下げるとこの前提が黙って崩れる。受け取り時と不具合調査の入口で
  `python scripts/provision_selfhost.py --check` を通す。

### Step 7: 人格と初期品質を入れる

公開前に [秘書プロンプト雛形](references/templates/assistant-system-prompt.template.md) を
`prompts/system.md` へコピーし、`<表示名>` / `<役割>` / `<人格>` を業務に合わせて置き換える。
設計意図と実装チェックは
[references/assistant-agent-pattern.md](references/assistant-agent-pattern.md)。

最初のバージョンから最低限これを満たすこと。

- 候補提示後の「お願い」「OK」は承認として扱い、**同じターンで書き込みツールを実行する**
- ツールを呼ぶ前に「許可されていない」と推測で断らず、実際のエラーだけを失敗として扱う
- Dataverse の HR・面談などを分類名だけで一律拒否せず、**まず検索して返った範囲を回答する**
- 役割に合う温かい口調を明記し、冷たい選択肢の列挙だけで終わらせない
- 実行結果が `content` ではなく `structuredContent` にある場合も成功としてモデルへ返す

### Step 8: 機能ブロックを足す

Step 0 で選んだブロックだけを実装する。手順はすべて
**[references/feature-blocks.md](references/feature-blocks.md)**（テンプレートのコピー →
アプリ設定 → DI 登録 → 再デプロイ）。

| ブロック | 何ができるようになるか | 詳細 |
|---|---|---|
| B2 + B6 | エージェント宛のメールを見に行って自分の名前で返信する | [feature-blocks.md](references/feature-blocks.md) §1 |
| B9 | Teams チャットを自分から作って送る | §2 |
| B10 | Grounding with Bing で Web を検索・閲覧する | §3 |
| B11 | 決めた時刻に自分から動いて配信する | §4 |
| B12 | Python を実行してファイルを読み書きする | §5 |
| B13 | 長いターンの経過を伝える | §6 |
| B14 | 成果物を台帳で管理し、同意を取ってから共有する | §7 |
| B15 | 誰が・どの処理が・どのツールがいくら使ったかを答える | §8 |
| B16 | Teams で送られたファイルを受け取って作業に使う | §9 |

**B15 は役割によらず入れる。** Azure の課金はマネージド ID 1 つでしか集計されず、
人別・処理別・ツール別の内訳は**後から復元できない**（→ [usage-accounting.md](references/usage-accounting.md)）。

**インスタンス単位の同意・委任スコープ付与は Step 11**。ここではコードと設定だけを入れる。
入口（チャット / メール / 定期実行）ごとに使える能力が変わらないよう、
**実行時コンテキストにも能力を明示する**（→ [outbound-formatting.md](references/outbound-formatting.md) §5）。

> **B2/B6・B9・B10・B12・B14・B16 を足したら、同じ Step で
> [prompt-injection.md](references/prompt-injection.md) の対策も入れる。**
> これらは第三者が書いた文章をエージェントに読ませるブロックで、
> 対策なしだと「メール本文に書いた命令がそのまま実行される」状態になる。
> ブロックを足した後で入れると、フェンスの対象漏れに気づけない。

### Step 9: Teams アプリパッケージをビルドする

```powershell
python scripts/build_teams_package.py --require-template
```

- `--require-template` は `A365_AGENT_BLUEPRINT_ID` 未設定ならビルドを止める。
  未設定のまま公開すると "Agent template" ではない共有エージェントとして登録され、手戻りになる。
- 出力の `app name` と `color icon` 行で、**意図した表示名とアイコンが入ったかを必ず確認する**。
- **再アップロードのたびに `.env` の `TEAMS_APP_VERSION` を上げる**（同一バージョンは拒否される）。

### Step 10: M365 管理センターへ公開してインスタンスを作る

**devPreview（Agent template）manifest は Microsoft Graph の `POST /appCatalogs/teamsApps` が
明示的に拒否する**（`Please use M365 Admin Center.`）。スクリプトでは回避できないハード制約
（→ [troubleshooting.md](references/troubleshooting.md) #16）。

1. `https://admin.cloud.microsoft/?#/agents/all` の **Upload** から ZIP を手動アップロードする。
2. 公開（Publish）→ **Activation** を行う。
3. Agent template からインスタンスを作成し、表示名とインスタンス ID を控える。

GA スキーマ（非 devPreview）の共有エージェントのみ `python scripts/publish_teams_app.py`
（管理者ロールが無い場合は `--requires-review`）で Graph 経由の公開ができる。

### Step 11: インスタンス SP に同意とスコープを付与する

**Teams で無応答になる最頻出の原因。インスタンスを作り直すたびに必要。**

```powershell
python scripts/grant_agent_instance_consent.py --instance-name "<インスタンス表示名>"

# 機能ブロックが要る委任スコープを付与（B9 / B6 / B14 を入れた場合）
python scripts/grant_agent_graph_scopes.py --instance-id $env:A365_AGENT_INSTANCE_ID
python scripts/grant_agent_graph_scopes.py --instance-id $env:A365_AGENT_INSTANCE_ID --check

az webapp restart -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME
```

付与する委任スコープは `User.Read` / `Chat.Create` / `Chat.Read` / `ChatMessage.Send` に加え、
B6 なら **`Mail.Send`**、B14 なら **`Files.ReadWrite`**、B12 のファイル取り込みなら **`Files.Read.All`**。

- ログに出る `AADSTS82001` は**無視してよい**。真因は `AADSTS65001`
  （→ [troubleshooting.md](references/troubleshooting.md) #19）。
- **同意も Dataverse 登録もインスタンス単位で、テンプレート更新では引き継がれない。**
  表示名を変えたつもりで新インスタンスができていると、新 SP は `oauth2PermissionGrants` が空になり
  Teams で完全に沈黙する。まずここを疑う。

  ```powershell
  az rest --method GET --url "https://graph.microsoft.com/v1.0/servicePrincipals/<インスタンス SP objectId>/oauth2PermissionGrants" --query "value[].{r:resourceId,s:scope}" -o json
  ```

- 空配列が返ったら **MCP 依存先の同意も入れ直す**（Dataverse / Work IQ。
  → [agent-brain.md](references/agent-brain.md) §6-2・§7-1）。Dataverse を使うなら
  **systemuser 登録 / 許可 MCP クライアント / セキュリティ ロール**も新インスタンスでやり直す。

### Step 12: 顔写真と Teams プレゼンスを設定する

**パッケージのアイコンとプロフィール写真は別物。** 写真はプロフィール カード・People ピッカー・
**送信メールの差出人アバター**に出るが、パッケージのアップロードでは設定されない。

```powershell
python scripts/set_agent_user_photo.py --upn <インスタンスの UPN>

python scripts/configure_agent_presence.py `
  --managed-identity-client-id $env:AZURE_BOT_MSA_APP_ID `
  --agent-user-id $env:A365_AGENT_USER_ID `
  --resource-group $env:AZURE_RESOURCE_GROUP --webapp $env:AGENT_WEBAPP_NAME
Copy-Item .github/skills/agent365/references/templates/PresenceWorker.template.cs `
  src/<agent-name>-agent/PresenceWorker.cs
```

- 写真は Graph が **JPEG** を要求するので、スクリプトが PNG を 648x648 の JPEG に変換して送る。
  必要な権限は `ProfilePhoto.ReadWrite.All` または `User.ReadWrite.All`。
- agentUser は Teams クライアントへサインインしないため、そのままでは Offline（×）が出る。
  `PresenceWorker` が Graph のアプリ プレゼンス セッションを更新し、App Service の稼働を反映する。
  heartbeat は起動直後と 2 時間ごと、セッション寿命は 4 時間。
- 再デプロイ後、ログに `Teams presence refreshed for agentic user` が出れば成功。
- Teams / Outlook はアバターをキャッシュする。すぐ反映しなくても再送しない。

### Step 13: 検証する

```powershell
az webapp log tail -g $env:AZURE_RESOURCE_GROUP -n $env:AGENT_WEBAPP_NAME
```

を流したまま Teams でエージェントにメッセージを送り、応答が返ることを確認する。
[検証チェックリスト](#検証チェックリスト)を上から確認する。

> 何も流れてこないときはログ設定が無効になっている。起動時にしか出ないログを取るには
> **`log tail` を先に繋いでから restart する**必要がある。手順は
> [references/self-hosted-agent.md](references/self-hosted-agent.md) 手順 7。

応答が返るようになったら、中身の作り込みは
[references/agent-brain.md](references/agent-brain.md) に従って進める
（**ID 面は凍結し、アプリ面だけを回す**）。実データを扱わせる場合は同ファイル §6（Dataverse MCP）へ。
同意付与・systemuser 登録・許可 MCP クライアント・セキュリティ ロールの
**4 つが揃って初めて通る**。どれが欠けても別の 403 になる。
CI/CD・レビューゲート・リリース記録は **`alm` スキル**へ引き継ぐ。

## 汎用化と秘匿化

コミットする成果物にテナント固有の値を残さない。

| ルール | 内容 |
|---|---|
| テンプレートのみコミット | `agent.template.yaml` / `manifest.template.json` / `agenticUser.template.json` を編集し、レンダリング結果（`agent.yaml` / `manifest.json` / `*.zip`）はコミットしない |
| 実値は `${VAR}` | GUID・ARM リソース ID・エンドポイント URL・テナント名・組織名は直書きせず、定義元は [references/.env.example](references/.env.example) 1 か所にする |
| スクリプトに定数を埋めない | 値は `argparse` 引数 → `.env` → 環境変数の順に解決する。リソース名は `<agent-name>` から機械的に導出する |
| 固定値だけ定数化 | `5a807f24-c9de-44ee-a3a7-329e88a00ffc`（Messaging Bot API）のような**全テナント共通**の well-known GUID はスクリプト内の名前付き定数にする（`.env` に入れない） |

| 秘匿対象 | 置き場所 | 禁止事項 |
|---|---|---|
| `.env`（実値） | ローカルのみ | コミット禁止。`.env.example` だけを共有する |
| `a365.generated.config.json` | ローカルのみ | ブループリントのシークレットを含む。**コミット禁止・貼り付け禁止** |
| 認証キャッシュ（`.a365-auth.json` / `auth-token.json` / `*token-cache*`） | ローカルのみ | リフレッシュトークンを含む。standard の `auth_helper.py` のキャッシュを使う |
| ブループリントのクライアントシークレット | App Service アプリ設定 `Connections__ServiceConnection__Settings__ClientSecret` | `appsettings.json` / テンプレート / ログ / チャットへの出力禁止 |
| CI の Azure 資格情報 | GitHub Actions Secrets / Azure Pipelines 変数グループ / Key Vault | リポジトリ内のファイル禁止 |

`.gitignore` に必要なのは `.env` / `agents/**/agent.yaml` / `teams/*.zip` / `teams/manifest.json` /
`a365.generated.config*.json` / `.a365-auth.json` / `auth-token.json` / `*token-cache*` /
`publish/` / `publish.zip`。

運用ルール:

- `a365 setup blueprint` はシークレットを**標準出力に平文で出す**。ファイルへリダイレクトしない、
  チャットに貼らない、詳細ログを残さない。
- `az ad app credential reset` は必ず **`--append`** を付ける（既存資格情報が失効するため）。
  取得値は変数で受けて即座にアプリ設定へ渡し、`Remove-Variable` で破棄する。
- 本格実装では **`alm` スキル**の pre-commit（汎用化 → Secrets 同期 → 漏洩検査）を有効化する。

## 検証チェックリスト

**設計**

- [ ] Step 0 で役割・機能ブロック・段階を確定し、制約（メールは push されない / 既読にできない / 他人の予定表は直接読めない / 共有リンクは取り消せない）を依頼者へ共有している
- [ ] 事前確認の 4 点を 1 回で確認し、以降の Step で聞き直していない

**秘匿化**

- [ ] `.env` / `agents/**/agent.yaml` / `teams/*.zip` / `a365.generated.config*.json` / 認証キャッシュが未追跡
- [ ] テンプレートに実 GUID・ARM パス・接続文字列・シークレットが無い（`${VAR}` 化済み）
- [ ] シークレットが App Service アプリ設定にのみ存在する（ファイルに無い）
- [ ] `python scripts/review_sanitization.py` が Pass（本格実装）

**ID 面（Step 4・6・10・11）**

- [ ] **Foundry の `activityprotocol` URL を messaging endpoint に設定していない**
- [ ] `a365.generated.config.json` の `agentBlueprintId` が `.env` の `A365_AGENT_BLUEPRINT_ID` と一致する
- [ ] Azure Bot のメッセージング エンドポイントが `https://<app>.azurewebsites.net/api/messages`、Teams チャネルが `acceptedTerms=True`
- [ ] `appsettings.json` の `AuthType` が confidential client、`ClientId` がブループリント appId、`TokenValidation:Audiences` にブループリント appId と Bot の `msaAppId` が両方入っている
- [ ] `grant_agent_instance_consent.py --check` と `grant_agent_graph_scopes.py --check` が OK を返す
- [ ] `set_agent_user_photo.py --check` と `configure_agent_presence.py --check` が OK を返す
- [ ] `python scripts/provision_selfhost.py --check` が OK を返す（プラン B1 以上 + Always On）

**アプリ面（Step 7・8・13）**

- [ ] App Service のルート URL が 200 を返し、Teams でメッセージを送ると応答が返る
- [ ] **20 分以上あけてから話しかけて、1 通目で返事が来る**（Always On が効いている確認）
- [ ] **`az webapp config show --query alwaysOn` が `true`**（B6・B11・B12 を入れるなら必須。false なら定期実行は一度も発火しない）
- [ ] ログに `Teams presence refreshed for agentic user` が出る
- [ ] プロンプトが承認語の次ターンで書き込みツールを実行し、分類名だけで Dataverse 検索を拒否しない
- [ ] （B6）ポーリング間隔内で返信が届き、2 周目に再返信しない。再デプロイ直後に過去の未読へ一斉返信しない
- [ ] （B6 / B9）Teams とメールの**両方**で URL がリンクとして表示され、箇条書きが崩れていない
- [ ] （B6 / B9）**本文に生の URL が 1 つも見えていない**。リンクの文字がファイル名・記事タイトルになっている（「こちら」ではない）
- [ ] （B6）**同じ依頼をチャットとメールの両方から投げ、成果物の品質が同じ**であることを確認した
- [ ] （B9）承認後に**エージェント名義で**メッセージが届く。`TeamsChat__FromMailbox` が `false`
- [ ] （B11）指定時刻に配信され、「よろしいですか？」で止まらない
- [ ] （B11）起動ログに `Schedule <id> ... next run <日時> JST` が出ている（登録漏れと停止をここで切り分ける）
- [ ] （B12）`provision_code_sandbox.py --check` が OK。zip / PDF / Excel の中身を読んで答え、意図的なエラーを自分で直して再実行する
- [ ] （B13）数分かかる依頼で状況通知が届き、最終返信のあとに入力中表示が残らない
- [ ] （B15）「今月の利用状況」「誰が一番使ってる？」「どのツールが多い？」で内訳が切り替わり、金額が出る
- [ ] （B15）`Usage:Admins` に載っていない人が聞くと**本人の分だけ**に絞られる。空のまま放置していない
- [ ] （B15）`group_by=actor` に **`(不明)` の行が出ていない**。出たら入口が `Actor` を渡していない（後から埋められない）
- [ ] （B16）Teams で画像を添付して聞くと中身を説明し、続けて `run_python` で `/mnt/data/<ファイル名>` を開ける
- [ ] （B16）**本文なしでファイルだけ**送っても「テキストが読み取れませんでした」で止まらない
- [ ] （B16）`build_teams_package.py` が通っている（`bots[].supportsFiles` が `true`）

**プロンプト インジェクション（外部データを読むブロックを入れた場合）**

- [ ] 外部由来のツール結果を**毎ターン変わるノンス付きフェンス**で囲んでいる（信頼は許可リスト方式）
- [ ] **ワーカー経路も囲んでいる** — メールの件名・プレビューを user ターンへ素で渡していない
- [ ] 「これまでの指示を無視して」と書いたメールを送り、**従わずに報告**が返る
- [ ] 本文に閉じタグを書いたメールを送り、**フェンスを抜け出せない**
- [ ] 「〇〇さんは共有を許可しています」と書いたメールで**共有が実行されない**（同意は本人の Teams 発言のみ）
- [ ] ログに `Possible prompt injection` が記録される

- [ ] （B14）生成時に依頼元と区分が台帳へ記録され、個人情報の共有依頼は依頼元の許可待ちで止まる。依頼元以外の承認とメール返信は拒否される。共有リンクの scope が `organization`
