# 頭脳の実装方式（B3）— Copilot SDK ランタイム / 自前ツールループ

同僚エージェントの頭脳（B3）は、**同じ Agents SDK アプリの中で 2 通りに実装できる**。
どちらも App Service で自己ホストし、Teams / メール / 定期実行の入口も、機能ブロックも、
評価Hub も共通で、違うのは**ツール ループを誰が回すか**だけである。

| | `runtime: "copilot-sdk"`（既定） | `runtime: "agents-sdk"` |
|---|---|---|
| ツール ループ | GitHub Copilot SDK のランタイム（子プロセス） | アプリ内の Chat Completions ループ |
| 計画・反復・コンテキスト圧縮 | ランタイムが持つ | 自分で書く（`Agent:MaxToolIterations`） |
| 追加パッケージ | `GitHub.Copilot.SDK` | なし（`Azure.AI.OpenAI` のみ） |
| 生成されるファイル | `CopilotRuntime.cs` + Copilot 版 `AgentBrain.cs` | Chat Completions 版 `AgentBrain.cs` |
| ホストの条件 | **子プロセスを起動できること**（App Service / Container Apps / VM） | 条件なし |
| ターンの上限 | 実時間のみ（`Agent:TurnTimeoutSeconds`） | 実時間 + ツール反復回数 |
| 向く場面 | 調べもの・資料作成など、手順が事前に決まらない仕事 | 手順が決まっていて反復回数を抑えたい仕事 |

決めるのは **Step 0（AskUserQuestion の質問 8）**。`decisions.json` の `runtime` に書き、
どちらでも [scaffold_ai_teammate.py](../scripts/scaffold_ai_teammate.py) がそのまま動く形で生成される。

```jsonc
{ "runtime": "copilot-sdk" }   // 既定。省略時もこちら
```

```powershell
python .github/skills/ai-teammate/scripts/scaffold_ai_teammate.py `
  --decisions decisions.json --env .env --target .
```

> **後から切り替えない。** `AgentBrain.cs` が丸ごと入れ替わるため、作り込んだ後の変更は書き直しになる。
> 迷うなら既定の `copilot-sdk` にする。自前ループから載せ替える場合の影響範囲は
> [自前ツールループからの移行](migration-from-custom-loop.md)。

---

## 1. Copilot SDK ランタイムとは

Copilot CLI と同じエージェント ランタイムを、**自分のアプリから呼べる形にした SDK**である。
モデル推論・計画・ツール呼び出しループ・コンテキスト圧縮をランタイム側が持つため、
アプリ側は「ツール」「システム メッセージ」「承認ポリシー」だけを実装すればよい。

| 項目 | 内容 |
|---|---|
| パッケージ | .NET `GitHub.Copilot.SDK` / Node `@github/copilot-sdk` / Python `github-copilot-sdk` / Go / Java / Rust |
| 構造 | アプリ → SDK → **JSON-RPC** → `copilot-runtime`（子プロセス） → モデル |
| ランタイム同梱 | .NET / Node / Python は自動同梱。Go / Java / Rust は CLI を別途用意 |
| ライセンス | SDK 本体は MIT（無償）。**課金はモデル経路で決まる**（→ §2） |

適用しない条件は 1 つだけ。**子プロセスを起動できないホスト**（短命な関数実行モデルなど）では
`agents-sdk` を選ぶ。

## 2. モデル経路とライセンス

**先に決める**。後から変えるとホスティング・認証・課金がまとめて変わる。

| 観点 | 経路 A: GitHub Copilot 経由 | 経路 B: BYOK（既定） |
|---|---|---|
| 推論の実行先 | GitHub のサービス（自社テナント外） | 自社の Microsoft Foundry / Azure OpenAI（テナント内） |
| 送信されるデータ | プロンプト + **ツール実行結果**（業務データを含む） | 自社リソースのみ |
| 認証 | ユーザー トークン / GitHub App インストール トークン | API キー、または **Managed Identity**（`BearerTokenProvider`） |
| 課金 | Copilot シート + AI クレジット従量 | 既存のモデル従量課金のみ |
| 利点 | 複数プロバイダーのモデルを選択可・Auto ルーティング | データがテナント外へ出ない・キーレス運用を維持できる |

**同僚エージェントは経路 B（BYOK + Managed Identity）に固定する。** メール本文・Dataverse の
レコード・添付ファイルがツール結果としてループに入るため、経路 A はテナント外へ業務データが出る。
scaffold が生成する `CopilotRuntime.cs` は経路 B のみを実装する
（`ProviderConfig.BearerTokenProvider` が UAMI のトークンを都度取得する）。

費用の分解（シート単価・AI クレジット・トークン単価・無人サービスの課金帰属）は
[ライセンスとデータ境界](licensing-and-data-boundary.md)。

```powershell
# 選んだ経路の前提が揃っているかを機械的に検証する（Step 3 / Step 6 の両方で実行する）
python .github/skills/ai-teammate/scripts/check_copilot_sdk_env.py --route byok
```

## 3. 作業ディレクトリを分離する

ランタイムは `bash` / `edit` / `write` などの**ファイル操作ツールを既定で持つ**。
これらは**エージェント ホスト（App Service）の中**で動くので、
そのままではリポジトリやデプロイ済みのアプリ自身を書き換えられる。規約は 3 つ。

| 設定 | 生成される値 | 理由 |
|---|---|---|
| `Copilot:WorkingDirectory` | `/home/data/copilot/work` | アプリの発行先（`/home/site/wwwroot`）の外に出す |
| `Copilot:BaseDirectory` | `/home/data/copilot/state` | セッション状態を既定の `~/.copilot` と共有しない |
| `Copilot:ExcludedTools` | `["bash", "edit", "write"]` | ホスト上での実行・編集を塞ぐ |

**この 3 つは同時に成立して初めて安全になる。** `ExcludedTools` から `bash` を外すと、
エージェントは App Service 上で任意のコマンドを実行できる状態になる。
**コードを実行させたいなら、代わりに B12（隔離されたサンドボックス）を選ぶ**
（→ [feature-blocks.md](feature-blocks.md) §5）。ここを緩めてはいけない。

> ランタイムはこれらのディレクトリを**作らない**。存在しないと子プロセスの起動に失敗するので、
> `CopilotRuntime.cs` が起動時に両方 `Directory.CreateDirectory` する。片方だけでは落ちる。

## 4. システム メッセージとツール

生成される `AgentBrain.cs` は、既に次の形になっている。手を入れるときの判断材料だけ挙げる。

**システム メッセージ**は `SystemMessageMode.Customize`。`Replace` は全ガードレールを外すため使わない。

| セクション | 扱い |
|---|---|
| `Identity` / `Tone` | `prompts/system.md` の内容を `Content` として渡す |
| `CodeChangeRules` | `Remove`（コーディング エージェントではない） |
| `Safety` | 触らない（残す） |

**ツール**は、MCP ツールも自前のローカル ツールも `AIFunction` 派生の `McpProxyFunction` で包んで
`SessionConfig.Tools` に渡す。`CopilotTool.DefineTool` は引数の型からスキーマを起こす方式で、
**実行時までツール一覧が決まらない MCP には使えない**ため、こちらを使う。

| 指定 | 実装 |
|---|---|
| 承認プロンプトを出さない | `AdditionalProperties["skip_permission"] = true` |
| 組み込みと同名を差し替える | `AdditionalProperties["overrides_built_in_tool"] = true` |
| 組み込みツールの無効化 | `SessionConfig.ExcludedTools`（上表の 3 つ） |

**委任トークンをランタイムへ渡さない。** MCP の `http` サーバー定義に書いたヘッダーは
**セッション作成時に固定**され、依頼者ごとに変わる短命トークンには合わない。
生成される実装は MCP 呼び出しをプロキシ ツールの中に閉じ込め、
**呼び出しの都度アプリ側でトークンを取得**する（トークンが子プロセスへ渡らない）。

## 5. 承認と安全ゲート

プロンプトの規約に頼らず、**コードで強制**する。

1. **`OnPermissionRequest`** — `ManagedApprovalRequired` を先に確認し、それが立っていれば
   `NoResult()` を返す（マネージド設定が優先。`ApproveAll` はここで例外になる）。
   立っていない場合だけ `ApproveOnce()`。ツール側が既に委任 ID で認可しているため二重には聞かない。
2. **外部由来のツール結果はフェンスで囲む** — `UntrustedContent.WrapToolResult` を通してから返す。
   メール本文・Web ページ・業務レコードに書かれた指示文を命令として扱わせない
   （→ [prompt-injection.md](prompt-injection.md)）。
3. **`ExcludedTools`** — §3 の 3 つ。

## 6. 運用

| 観点 | 生成される実装 |
|---|---|
| セッション寿命 | **1 ターン 1 セッション**。過去のやり取りは `HistoryBlock` でコンテキストとして渡す |
| ターンの上限 | `Agent:TurnTimeoutSeconds`（既定 **1200 秒**）。`SendAndWaitAsync` に渡す |
| 経過連絡 | B13 の `AgentProgress`。**ランタイム内部のツールは `StepAsync` に来ない**ので、通知はタイマー駆動 |
| 使用量 | `AssistantUsageEvent` を `UsageMeter` に積む（B15） |
| 多重度 | `CopilotClient` はシングルトン（`CopilotRuntime`）、セッションは会話単位 |
| Linux 実機 | zip デプロイで実行ビットが落ちるため、起動時に `runtimes/copilot*` へ `UserExecute` を付け直す |

タイムアウトしたターンは例外型ではなく**分割を促す日本語**で返す（`Agent.cs`）。
「5 分で切れて何も返らない」は体感上の障害そのものなので、
**ターン予算・経過連絡・タイムアウト時の文言は 3 点セットで確認する**。

## 検証チェックリスト

- [ ] `runtime` を `decisions.json` に明記し、経路 B（BYOK）であることを合意した
- [ ] `Copilot:WorkingDirectory` / `BaseDirectory` が発行先（`/home/site/wwwroot`）の外を指している
- [ ] `Copilot:ExcludedTools` に `bash` / `edit` / `write` が入っている
- [ ] `check_copilot_sdk_env.py` が全項目 ✅（**ローカルとデプロイ先の両方**）
- [ ] `AzureOpenAI:Deployment` を指定している（未指定は起動時エラー）
- [ ] MCP の短命トークンをヘッダー直書きにしていない（プロキシ ツール経由）
- [ ] 外部由来のツール結果をフェンスで囲んでいる
- [ ] 長いターンで経過連絡が出て、上限に達したら分割を促す文言が返る

## 参考

- [ライセンスとデータ境界（費用分解・課金帰属）](licensing-and-data-boundary.md)
- [自前ツールループからの移行](migration-from-custom-loop.md)
- [異常系・トラブルシュート（Copilot SDK ランタイム）](copilot-sdk-troubleshooting.md)
- [機能ブロックの実装レシピ](feature-blocks.md)
