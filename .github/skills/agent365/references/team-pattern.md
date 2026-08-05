# 複数の名前付きエージェント（チーム）を構築する標準パターン

「ハンター（リード開拓）・テック（技術提案）・ミーナ（Chief of Staff）」のように、
**役割の異なる複数の名前付き AI エージェントが 1 つのチームとして協働する**という要望は、
`architecture` スキルの判断基準（§7）で `agent365` を第一候補として推奨するパターンである。
本ドキュメントは、そのようなリクエストを受けたときに**単一エージェント向けの手順
（[SKILL.md](../SKILL.md) の Step 0〜16）をどう拡張して複数エージェントに適用するか**の標準フローを示す。

## 1. いつ使うか

- 利用者が「AI 社員」「AI チーム」のように、名前と役割を持つ複数のエージェントを挙げて
  1 つのチームとして構築したいと言っている。
- 各エージェントは Teams / M365 Copilot に個別の Bot として公開される（後述の制約を参照）。

## 2. 標準フォルダ構成

単一エージェントの構成（SKILL.md の「標準フォルダ構成」）を**エージェントごとに横展開**する。
共通スクリプトは 1 セットのみ、エージェント固有の定義・秘匿値・Teams パッケージ素材は
`<agent-name>` サブディレクトリに分離する。

```
<repo-root>/
├── .gitignore                        # agents/**/.env, agents/**/agent.yaml, teams/**/*.zip 等
├── requirements.txt                  # azure-ai-projects / azure-identity / PyYAML / Pillow / requests
├── agents/
│   ├── hunter/
│   │   ├── agent.template.yaml       # コミット対象（${VAR} 入り）
│   │   ├── .env.example              # コミット対象（プレースホルダーのみ）
│   │   ├── .env                      # 実値（.gitignore 済み）
│   │   └── agent.yaml                # レンダリング結果（.gitignore 済み）
│   ├── tech/    （同様の構成）
│   └── meena/   （同様の構成）
├── teams/
│   ├── hunter/manifest.template.json、agenticUser.template.json
│   ├── tech/    （同様）
│   ├── meena/   （同様）
│   └── <agent-name>-teams-app.zip    # ビルド結果（.gitignore 済み）
├── assets/
│   ├── hunter/agent-icon.png
│   ├── tech/agent-icon.png
│   └── meena/agent-icon.png
└── scripts/                          # agent365 + alm の共通スクリプト（1 セットのみ）
```

## 3. `.env` はエージェントごとに分離する

スクリプト（`render.py` / `create_instance.py` / `deploy.py` / `build_teams_package.py` /
`publish_teams_app.py`）はいずれも `--env` 引数で読み込む `.env` を指定できる
（既定値は `.env`）。**3 体を同じ `.env` で運用すると、後から作成したエージェントの
`INSTANCE_IDENTITY_CLIENT_ID` 等で先に作った値を上書きしてしまう**ため、
必ずエージェントごとに `.env` を分離し、実行のたびに明示的に指定する。

```powershell
python scripts/render.py --agent hunter --env agents/hunter/.env
python scripts/create_instance.py --name hunter --mode blueprint --blueprint-id team-blueprint --env agents/hunter/.env
python scripts/deploy.py --agent hunter --env agents/hunter/.env
python scripts/build_teams_package.py --env agents/hunter/.env `
  --template teams/hunter/manifest.template.json `
  --agentic-user-template teams/hunter/agenticUser.template.json `
  --icon assets/hunter/agent-icon.png `
  --output teams/hunter-teams-app.zip
python scripts/publish_teams_app.py --env agents/hunter/.env --package teams/hunter-teams-app.zip
```

同じコマンドを `tech` / `meena` に対して `--env agents/<name>/.env` を差し替えて繰り返す。

## 4. Foundry ブループリントはチームで 1 つ共有する

Foundry のマネージド ID ブループリント（Step 4）は `lifecycle=Manual` で作成すれば
**複数エージェントから共有できる**。チームで 1 回だけ作成し、`BLUEPRINT_ID` /
`BLUEPRINT_PRINCIPAL_ID` / `BLUEPRINT_CLIENT_ID` を 3 つの `.env` すべてにコピーする
（Azure サブスクリプション・リソースグループ・テナント・Foundry エンドポイントなど、
Azure 接続に関する値もチーム共通なので同様に 3 ファイルへ複製する）。

```powershell
python scripts/create_blueprint.py --name team-blueprint          # 1 回だけ実行
python scripts/create_blueprint.py --name team-blueprint --show   # 出力値を 3 つの .env へ配る
```

Agent 365 のエージェント ID ブループリント（SKILL.md Step 4、インスタンス化用）は
**エージェントごとに別個**に作成する（`a365 setup blueprint -n hunter` 等）。
利用者ごとの Entra Agent ID を持たせる仕組みのため、チームで共有すると
インスタンス識別が壊れる。

## 5. 既知の制約: エージェント間のプログラム的な連携はできない

Foundry の Hosted agent（Teams / M365 Copilot へ通常 bot として直接公開する参考形態）は、
本書執筆時点で以下のいずれの機能の対象にもなっていない。

- **Connected Agents（classic）**: 廃止予定。旧 API（`2025-05-15-preview`）ベースで、
  そもそも Hosted agent 向けではない。
- **Workflows（`2025-11-15-preview`）**: ビジュアルデザイナーは 2026-12-01 に廃止予定。
  公式ドキュメントで **Hosted agent は明示的にサポート対象外**とされている。

つまり「ハンターが見つけた商談をテックが自動的に引き継ぐ」といったエージェント間の
自動オーケストレーションは、現時点の Foundry の標準機能だけでは実現できない。
代替案は次のいずれかを利用者と合意してから採用する。

| 案 | 内容 | 工数 |
|---|---|---|
| **(A) 人間仲介**（既定・推奨） | 3 体を独立した自己ホスト Agents SDK アプリ / agentUser として Teams に公開し、
  利用者が Teams 上で @メンションしながら引き継ぐ。各エージェントの instructions にも
  「連携は利用者経由」である旨を明記する。 | 小 |
| **(B) Copilot Studio オーケストレーター** | 1 体（例: ミーナ）を Copilot Studio の
  Generative Orchestration エージェントとして構築し、他の 2 体を接続エージェント／ツールとして
  呼び出す。`architecture` スキルの判断基準を参照。 | 中 |
| **(C) 自前の A2A エンドポイント** | Agent-to-Agent 連携用の独自エンドポイントを実装して
  3 体を連携させる。実験的・工数大。 | 大 |

このスキルのデフォルト実装（上記のテンプレート・Step 0〜16）は **(A)** を前提にしている。

## 6. アイコン運用

各エージェントのアイコン元画像は `assets/<agent-name>/agent-icon.png`
（正方形・アルファチャンネル付き）に置く。`build_teams_package.py` の `--icon` 引数で
参照する。日本語ファイル名（例: `ハンター.png`）で受け取った場合は、
上記のパス・命名規則にリネームしてから配置する。

## 7. 「エージェントテンプレートとしての公開」で止める判断

ユーザーが「まずはテンプレートとして公開できていれば OK」と言った場合、
**Step 6（自己ホストの Azure Bot Service / App Service）・Step 11（組織カタログへの公開）は実施しない**。
以下がそろっていれば「テンプレートとしての公開」は完了している。

> **SKILL.md の事前確認（質問 1）** がまさにこの判断を AskUserQuestion で明示的に確認するゲートである。
> 複数エージェント（チーム）の場合は、一部のエージェントのみ実配信し、他はテンプレートのままにする
> 選択もあり得るため、**エージェントごとに個別に確認する**。

- 各エージェントの Agents SDK アプリ雛形とプロンプト / 設定テンプレートが ${VAR} 入りでコミットされている
  （= 誰でも `.env` を用意すれば同じ自己ホストアプリを再現できる）。
- Agent 365 ブループリント（SKILL.md Step 4）が作成済みで、`teams/agenticUser.template.json` から参照できる。
- Teams manifest / agenticUser テンプレート・アイコンはコミット済みだが、
  `teams/*.zip` のビルドや Graph 公開はまだ行っていない。

Azure Bot Service（課金）・Teams 組織カタログ公開（テナント全体への公開）は
**利用者が実際に Teams で使い始めたいタイミングで改めて Step 6〜14 を実施すればよい**
（本ドキュメントの手順を再利用するだけで追加設計は不要）。

## 8. このパターンを設計する過程で分かった教訓

- **Graph の Teams アプリ公開 API は Delegated 権限のみ**（`AppCatalog.ReadWrite.All`）。
  Application 権限（クライアントクレデンシャル）では動かないため、`publish_teams_app.py` も
  `auth_helper.py` の `DeviceCodeCredential`（永続キャッシュ）を再利用する設計にした。
  → [troubleshooting.md](troubleshooting.md) の該当項目。
- **`auth_helper.py` は `TENANT_ID` を読む**が、`agent365` の `.env.example` は
  `AZURE_TENANT_ID` を使っている。他スキルの `.env` を再利用するスクリプトを書くときは、
  `os.environ.setdefault("TENANT_ID", os.environ.get("AZURE_TENANT_ID", ""))` のような
  ブリッジが必要になる。
- **`.env` の使い回しは事故のもと**: 1 リポジトリに複数エージェントを収める場合、
  インスタンス固有の値（`INSTANCE_IDENTITY_*` / `AGENT_GUID` / `A365_AGENT_BLUEPRINT_ID` 等）
  を単一の `.env` で使い回すと、後発のエージェント作成時に先発の値を上書きしてしまう。
  エージェントごとに `.env` を分離するのが最も単純で事故が起きない構成。
- **Foundry の Hosted agent はマルチエージェント機能の対象外**（§5）。
  複数エージェントの「チーム」を謳う要望を受けたときは、実際にプログラム的な自動連携が
  必要なのか、人間仲介で十分なのかを最初に確認しておくと手戻りが少ない。
- **ARM のサブスクリプション横断リスト API（`Microsoft.CognitiveServices/accounts` 等）は
  1 ページ目が空でも `nextLink` に本体が入っていることがある**。`value` だけ見て
  「0 件」と判定すると誤検知するため、`nextLink` が無くなるまで必ずページングする
  （`scripts/discover_foundry_context.py` の `list_all()` を参照）。
- **「エージェントテンプレートとしての公開」と「Teams への実配信」は別のマイルストーン**。
  Step 1〜5（Agent 365 ブループリント作成 + 自己ホストアプリ雛形 + テンプレート一式の
  コミット）だけでも「テンプレートとして公開した」と言える状態になる。Step 6（自己ホストの Azure Bot
  Service / App Service、課金あり）・Step 11（組織カタログ公開、テナント全員に見える状態に
  なる）は影響範囲が大きいので、**どこまで進めるかを都度ユーザーに確認してから着手する**
  （詳細は §8）。
