---
name: copilot-sdk
description: "GitHub Copilot SDK（Copilot CLI と同じエージェント ランタイムをライブラリとして呼ぶ SDK）でエージェントを新規構築する。モデル経路（BYOK + Managed Identity / GitHub Copilot 経由）とライセンス費用・データ境界を先に確定し、リポジトリと分離した作業ディレクトリで scaffold して疎通を実測し、カスタム ツール・MCP・スキル・承認ゲートを実装して App Service へ載せるまでを非対話スクリプトで完結させる。既存の自前ツールループ（Chat Completions + 独自 MCP クライアント）からの移行対応表も扱う。"
category: automation
triggers:
  - "Copilot SDK"
  - "copilot-sdk"
  - "GitHub Copilot SDK"
  - "copilot-runtime"
  - "CopilotClient"
  - "CopilotSession"
  - "Copilot CLI SDK"
  - "エージェント ランタイム"
  - "BYOK"
  - "AI credits"
  - "AI クレジット"
  - "自前ツールループ 置き換え"
---

# GitHub Copilot SDK エージェント開発スキル

GitHub Copilot SDK は、Copilot CLI と同じエージェント ランタイムを**自分のアプリから呼べる形にした SDK**である。
モデル推論・計画・ツール呼び出しループ・コンテキスト圧縮をランタイム側が持つため、
アプリ側は「ツール」「システム メッセージ」「承認ポリシー」だけを実装すればよい。

| 項目 | 内容 |
|---|---|
| パッケージ | .NET `GitHub.Copilot.SDK` / Node `@github/copilot-sdk` / Python `github-copilot-sdk` / Go / Java / Rust |
| 構造 | アプリ → SDK → **JSON-RPC** → `copilot-runtime`（子プロセス） → モデル |
| ランタイム同梱 | .NET / Node / Python は自動同梱。Go / Java / Rust は CLI を別途用意 |
| ライセンス | SDK 本体は MIT（無償）。**課金はモデル経路で決まる**（→ Step 1） |

> 適用判断・費用・データ境界は [ライセンスとデータ境界](references/licensing-and-data-boundary.md)、
> 既存の自前ループからの移行は [自前ツールループからの移行](references/migration-from-custom-loop.md)、
> 異常系は [troubleshooting](references/troubleshooting.md) を参照。

## スキル同梱スクリプト

値は引数または `.env`（[references/.env.example](references/.env.example)）から取得する。

| スクリプト | 用途 |
|---|---|
| [scripts/check_copilot_sdk_env.py](scripts/check_copilot_sdk_env.py) | 前提チェック: .NET SDK バージョン / 作業ディレクトリがリポジトリ外か / `BaseDirectory` 書込可否 / BYOK エンドポイント形式 / Entra トークン取得 / トークン種別の渡し先（Step 1・3） |
| [scripts/scaffold_copilot_sdk_agent.py](scripts/scaffold_copilot_sdk_agent.py) | 新規エージェント一式を生成: `global.json` / `.csproj` / `Program.cs`（BYOK + Managed Identity）/ `appsettings.json` / `.gitignore` / `skills/`（Step 2）。`--dry-run` 対応 |

## Step 0: 適用可否を判断する

次の 3 つを満たすときに Copilot SDK を採用する。満たさないなら自前ループ（Chat Completions 直接呼び出し）を維持する。

1. **エージェント ループを自作したくない** — 計画・ツール反復・コンテキスト圧縮をランタイムに任せたい。
2. **子プロセスを起動できるホスト** — App Service / Container Apps / VM など。関数の短命実行モデルには向かない。
3. **データ境界の合意が取れる** — GitHub 経由にするなら、プロンプトとツール結果が GitHub のサービスを通ることの承認が要る（BYOK なら不要）。

既存エージェントを載せ替える場合は [移行対応表](references/migration-from-custom-loop.md) で影響範囲を先に見積もる。

## Step 1: モデル経路とライセンスを確定する

**先に決める**。後から変えるとホスティング・認証・課金がまとめて変わる。

| 観点 | 経路 A: GitHub Copilot 経由 | 経路 B: BYOK（推奨） |
|---|---|---|
| 推論の実行先 | GitHub のサービス（自社テナント外） | 自社の Microsoft Foundry / Azure OpenAI（テナント内） |
| 送信されるデータ | プロンプト + **ツール実行結果**（業務データを含む） | 自社リソースのみ |
| 認証 | ユーザー トークン / GitHub App インストール トークン | API キー、または **Managed Identity**（`BearerTokenProvider`） |
| 課金 | Copilot シート + AI クレジット従量 | 既存のモデル従量課金のみ |
| 利点 | 複数プロバイダーのモデルを選択可・Auto ルーティング | データがテナント外へ出ない・キーレス運用を維持できる |

判断の既定値は **経路 B（BYOK + Managed Identity）**。業務データを扱うエージェントでは、
データ境界を変えずに SDK のオーケストレーションだけを得られるため。
費用の分解（シート単価・AI クレジット・トークン単価・無人サービスの課金帰属）は
[ライセンスとデータ境界](references/licensing-and-data-boundary.md) に全て記載する。

```powershell
# 選んだ経路の前提が揃っているかを機械的に検証する
python .github/skills/copilot-sdk/scripts/check_copilot_sdk_env.py --route byok
```

## Step 2: ワークスペースを分離して scaffold する

ランタイムは `bash` / `edit` / `view` などの**ファイル操作ツールを既定で持つ**。
作業ディレクトリをソース リポジトリに向けると、試行錯誤中にリポジトリを書き換える事故が起きる。
そのため次の 3 点を規約として固定する。

| 設定 | 値 | 理由 |
|---|---|---|
| リポジトリ | `<repo-root>/`（エージェントのコード） | 通常の Git 管理 |
| `WorkingDirectory` | `${COPILOT_WORKSPACE_ROOT}/<agent-name>/`（**リポジトリ外**） | エージェントの書き込みをリポジトリから隔離する |
| `BaseDirectory` | `${COPILOT_WORKSPACE_ROOT}/<agent-name>/.copilot/` | セッション状態を既定の `~/.copilot` と共有しない |

命名は kebab-case のエージェント名を軸に、リポジトリ `<agent-name>-agent`、
プロジェクト `<AgentName>Agent`、Entra 表示名 `<AgentName>` で揃える。

```powershell
# 新規エージェント一式を生成（既定は BYOK + Managed Identity 構成）
python .github/skills/copilot-sdk/scripts/scaffold_copilot_sdk_agent.py `
  --name <agent-name> --repo-root <repo-root> --dry-run
python .github/skills/copilot-sdk/scripts/scaffold_copilot_sdk_agent.py `
  --name <agent-name> --repo-root <repo-root>
```

既存の大きなワークスペースへ同居させるのは、Dataverse スキーマ・スキル・評価基盤を共有する場合に限る。
その場合も上記 3 設定は必須とする。

## Step 3: 疎通を実測する

コードを増やす前に「ランタイムが起動し、モデルに 1 往復できる」ことを確認する。

1. `check_copilot_sdk_env.py` が全項目 ✅ になることを確認する。
2. 生成された最小アプリを実行し、`AssistantMessageEvent` と `SessionIdleEvent` が届くことを確認する。
3. ホストが App Service の場合は、**デプロイ先でも同じ確認を行う**（子プロセス起動可否・書込可能パス・送信先の許可はローカルでは再現しない）。

```powershell
dotnet run --project <repo-root>/src/<AgentName>Agent
```

BYOK ではモデル名の指定が必須で、未指定だと "Model not specified" で落ちる（→ troubleshooting）。

## Step 4: システム メッセージとツールを実装する

**システム メッセージ**は `SystemMessageMode.Customize` を既定とする。
`Replace` は全ガードレールを外すため、意図的に必要な場合に限る。

| セクション | 典型的な扱い |
|---|---|
| `Identity` / `Tone` | `Replace` でエージェントの人格・文体を定義 |
| `CodeChangeRules` | `Remove`（コーディング エージェントでなければ不要） |
| `Guidelines` | `Append` で業務ルールを追加 |
| `Safety` | 触らない（残す） |

**ツール**は `CopilotTool.DefineTool` で定義する。JSON スキーマは引数の型と `[Description]` から自動生成されるため、手書きしない。

| オプション | 用途 |
|---|---|
| `SkipPermission = true` | 参照系ツール。承認プロンプトを出さない |
| `OverridesBuiltInTool = true` | `edit_file` など組み込みと同名のツールを差し替える場合に必須 |
| `Defer` | `Auto` でツール検索経由の遅延読込を許可。常時読込は `Never` |

組み込みのシェル / 編集ツールを使わせない場合は、セッションの `ExcludedTools` で明示的に無効化する。

## Step 5: MCP とスキルを接続する

**MCP サーバー**は `McpServers` に `local`（stdio）または `http` で登録する。
実行時のツール名は `<server-key>-<tool-name>` になり、`AvailableTools` / `ExcludedTools` では
`mcp:<server-key>-<tool-name>` の形で指定する。

> **注意**: `http` サーバーの `headers` は**セッション作成時に固定**される。
> 依頼者ごとに変わる委任トークンや短命トークンを使う場合、ヘッダー直書きは失効・取り違えの原因になる。
> その場合は MCP 呼び出しを `DefineTool` のプロキシ ツールで包み、**呼び出しの都度トークンを取得**する。

**スキル**（手順書 Markdown）は `SkillDirectories` に置き、必要なものだけ
カスタム エージェントの `Skills` で先読みさせる。全文を毎ターン注入しないため、コンテキストを節約できる。

**サブエージェント**は `CustomAgents` に `name` / `description` / `prompt` / `tools` を定義する。
`description` が曖昧だと委譲の判定が外れるため、担当領域を具体的に書く。
大量の文脈を生むツールは `DefaultAgent.ExcludedTools` に入れ、担当サブエージェントだけが使える状態にする。

## Step 6: 承認と安全ゲートを実装する

プロンプトの規約に頼らず、**コードで強制**する。

1. **`OnPermissionRequest`** — 送信・作成・削除など実害のある操作の前に呼ばれる。
   `ManagedApprovalRequired` を先に確認し、自動承認してよい範囲だけ `ApproveOnce()` を返す。
   `PermissionHandler.ApproveAll` は検証用に留める（マネージド設定が有効だと例外になる）。
2. **`Hooks.OnPreToolUse`** — 引数の検証・書き換え、`allow` / `deny` / `ask` の判定に使う。
3. **`Hooks.OnPostToolUse` / `OnPostToolUseFailure`** — ツール結果の後処理。
   外部から取り込んだ本文（メール・Web ページ・業務レコード）は、ここで**フェンスで囲んでから**モデルへ返し、
   結果に含まれる指示文をエージェントへの命令として扱わせない
   （→ [プロンプト インジェクション対策](../ai-teammate/references/prompt-injection.md)）。
4. **`ExcludedTools`** — 使わせない組み込みツールを列挙する。

## Step 7: 運用に載せる

| 観点 | 実装 |
|---|---|
| 会話の継続 | 会話 ID ↔ `SessionId` を 1:1 で対応させ、`ResumeSessionAsync` で再開する |
| 長時間タスク | `InfiniteSessions` の自動コンパクションを有効にし、閾値を負荷に合わせて調整する |
| 進捗表示 | `Streaming = true` + `AssistantMessageDeltaEvent` / `ToolExecutionStartEvent` を購読する |
| 可観測性 | `TelemetryConfig`（OTLP）で分散トレースを出す。`CaptureContent` は機密方針に従って設定する |
| 使用量 | 経路 B は自社モデル側のメトリクス、経路 A は AI クレジットのレポートで把握する |
| 多重度 | `CopilotClient` はシングルトン、`CopilotSession` は会話単位。スケールアウト時はセッションの所在をノードに固定する |

デプロイ先では Step 3 の疎通確認を再実行し、子プロセス起動・書込可能パス・送信先の許可を実測で確認する。

## 検証チェックリスト

- [ ] Step 1 でモデル経路（A / B）を明文化し、費用とデータ境界の合意を得た
- [ ] `WorkingDirectory` と `BaseDirectory` が**リポジトリ外**を指している
- [ ] `check_copilot_sdk_env.py` が全項目 ✅（ローカルとデプロイ先の両方）
- [ ] BYOK では `Model` を明示している（未指定は起動時エラー）
- [ ] 実害のある操作が `OnPermissionRequest` または `OnPreToolUse` を通る
- [ ] 外部由来のツール結果をフェンスで囲んでいる
- [ ] MCP の短命トークンをヘッダー直書きにしていない（プロキシ ツール経由）
- [ ] 組み込みのシェル / 編集ツールの要否を判断し、不要なら `ExcludedTools` で無効化した

## 参考リンク

- [ライセンスとデータ境界（費用分解・課金帰属）](references/licensing-and-data-boundary.md)
- [自前ツールループからの移行](references/migration-from-custom-loop.md)
- [異常系・トラブルシュート](references/troubleshooting.md)
- [AI チームメイト（Agent 365 での公開）](../ai-teammate/SKILL.md)
- [MCP Server 開発](../mcp-server/SKILL.md)
