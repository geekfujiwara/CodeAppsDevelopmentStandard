---
name: agent-flows
description: "Copilot Studio 新 UI の Agent flows / Workflows を Dataverse と Flow 管理 API で作成・公開・実行する。手動 Start と inline Agent の最小定義、接続参照、new UI 属性、承認付き dry-run、実行結果の検証を扱う。Code Apps との非同期連携を設計する場合にも使用する。"
category: automation
triggers:
  - "Agent flows"
  - "Agentflow"
  - "新 UI Workflow"
  - "Workflows API"
  - "shared_agentnode"
  - "InvokeDefinition"
---

# Agent Flows: 新 UI Workflow の API 構築

対象は新 Copilot Studio Workflow の **手動 Start + 外部ツールなし inline Agent**。
既存の最小フローを信頼済みテンプレートとして読み、同一ソリューション内へ別名作成する。
モデルと接続参照はテンプレートから継承する。既存フローの更新・削除は行わない。
一般クラウドフローは [power-automate](../power-automate/SKILL.md)、既存 bot の構築は
[copilot-studio-v2](../copilot-studio-v2/SKILL.md) を使う。

## Step 1: 対象と実行ゲートを確認する

[standard](../standard/SKILL.md) の共通認証と `.env` を使い、
[admin](../admin/SKILL.md) で環境・クラシック DLP・グループ継承を含む ACP を確認する。
使用コネクタは `shared_agentnode`。ポリシー変更は別の明示承認で行う。
設定の読み戻しと実行基盤の判定は別ゲートとして記録する。

```powershell
python .github/skills/admin/scripts/check_development_environment.py --environment-id $env:ENV_ID --connector shared_agentnode
```

作成名、テンプレート、ソリューション、モデル、固定応答、実行回数をユーザーに提示する。
テナント固有値は [references/.env.example](references/.env.example) に従い `.env` へ置く。
既存テンプレートに Start / Agent / edge / nodeActionMapping / 接続参照が揃っていることを CLI で検証する。

## Step 2: API で別名作成する

```powershell
python .github/skills/agent-flows/scripts/agent_flow.py create --report-file .local/agent-flow/create-plan.json
python .github/skills/agent-flows/scripts/agent_flow.py create --apply --expected-hash <approved-hash> --report-file .local/agent-flow/create-result.json
```

`create-plan.json` の定義と影響を確認してから適用する。計画ハッシュは環境、ソリューション、
テンプレート定義、接続参照、作成名に結び付く。書き込み直前に再読み取りする。
`created-verified` の `flowId` を `.env` の `AGENT_FLOW_ID` に設定する。
新規名の重複を拒否し、`category=5 / type=1 / modernflowtype=1` と Draft を読み戻し検証する。

## Step 3: 新 UI と公開を検証する

ブラウザ起動前に使用する Edge プロファイルを質問して確定する。同一タスクで確認済みなら再質問しない。
VS Code 統合ブラウザで `/environments/{ENV_ID}/flows/{AGENT_FLOW_ID}` を開き、
Start と Agent のキャンバスおよび Review を確認する。独立ブラウザや Playwright MCP は導入しない。
ネットワーク証跡は必要な操作と同一呼び出し内で採取し、method / origin+path / status のみ記録する。
Authorization、Cookie、署名クエリは取得・保存・表示しない。

```powershell
python .github/skills/agent-flows/scripts/agent_flow.py publish --report-file .local/agent-flow/publish-plan.json
python .github/skills/agent-flows/scripts/agent_flow.py publish --apply --expected-hash <approved-hash> --report-file .local/agent-flow/publish-result.json
```

Dataverse の Active と Flow API の Started を照合する。画面でも Published を確認する。

## Step 4: 一度実行して出力を確認する

```powershell
python .github/skills/agent-flows/scripts/agent_flow.py run --report-file .local/agent-flow/run-plan.json
python .github/skills/agent-flows/scripts/agent_flow.py run --apply --expected-hash <approved-hash> --report-file .local/agent-flow/run-result.json
python .github/skills/agent-flows/scripts/agent_flow.py inspect --report-file .local/agent-flow/history.json
python .github/skills/agent-flows/scripts/agent_flow.py inspect --run-id <run-id> --report-file .local/agent-flow/output.json
```

実行受付は `run-accepted` として記録し、成功扱いにしない。履歴の開始時刻と対象 ID を照合して run を指定する。
run / Agent の Succeeded と固定 JSON 一致で `output-verified` になる。
出力の `body.message`、または `body.status=Completed` の `body.result` を検証する。
実行成功と回答内容の検証は別に記録する。利用者から成功 run ID の報告を受けた場合は、再実行せずその履歴を照合する。
履歴の最新1件を無条件に今回の run とみなさず、同時実行時は明示的に識別する。
成功以外は [異常系](references/troubleshooting.md) に従う。自動リトライ・待機ループ・許可範囲拡大は行わない。

## Step 5: 業務連携へ進む

[非同期連携の契約](references/code-apps-integration.md) に従い、Code Apps からの要求・結果と既存 v2 bot 呼び出しを別段階で実装する。
inline `InvokeDefinition` の成功を既存 v2 bot / MCP / スキルの実行成功と同一視しない。
既存エージェントを利用する場合は [Agent ノードの診断](references/existing-agent-node.md) に従い、
`.env` に対象 bot と接続参照を指定して読み取り専用の確認を行う。

```powershell
python .github/skills/agent-flows/scripts/inspect_agent_node.py --report-file .local/agent-flow/agent-discovery.json
```

`target-verified` は一覧上の対象照合のみで、エージェントは実行しない。
Workflow の既存 Agent ノードは公式に案内されているが、ここで観測した直接 API は実験的経路として扱う。
ACP 反映待ちでもユーザーの承認に基づき実装・モックテストを進められるが、実応答・本人認可・本番受入のゲートは保持する。

## Step 6: 検証と結果報告

```powershell
python -m unittest discover -s .github/skills/agent-flows/tests -v
python .github/skills/update-skills/scripts/validate_skill.py .github/skills/agent-flows
```

報告は「作成 / 新 UI / 公開 / 実行受付 / 実行完了 / 出力検証 / 業務連携」を分ける。
ローカルの計画・結果には環境固有情報があるため Git 公開対象から除外する。
仕様・実測・未検証の区分は [API 契約](references/api-contract.md) を参照する。