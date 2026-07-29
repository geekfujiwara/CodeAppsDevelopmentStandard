# レビューゲートの構成（自律レビューゲート連鎖）

5 体のレビューエージェントを直列に並べ、**全ゲート PASS のときだけデプロイする**構成。
各エージェントは `scripts/gate_rules.py` のルールを評価するだけなので、判定は決定論的であり
人手承認（HITL）を必要としない。Copilot CLI のトークンを設定した場合のみ、
ルール判定の上に**修正提案**を重ねる（判定自体は変えない）。

```
1. quality-inspector → 2. generalization-auditor → 3. security-reviewer
→ 4. readability-editor → 5. release-gatekeeper → render → deploy → release
```

## 1. ルール一覧（`gate_rules.py`）

| ID | ゲート | チェック内容 |
|---|---|---|
| `Q1` | 品質 | ワークフローが妥当な YAML である |
| `Q2` | 品質 | テンプレートがレンダリング後に YAML / JSON として解析できる |
| `Q3` | 品質 | すべての `${VAR}` が `.env.example` に定義されている |
| `Q4` | 品質 | パイプラインスクリプトが構文エラーなくコンパイルできる |
| `Q5` | 品質 | 依存パッケージがバージョン制約を宣言している |
| `G1` | 汎用性 | `review_sanitization.py` が Pass（実値混入なし・テンプレート汎用化済み） |
| `G2` | 汎用性 | すべての秘匿プレースホルダーがシークレットストア経由で注入されている |
| `G3` | 汎用性 | ワークフローに環境固有のリテラル（GUID / ARM パス / エンドポイント）が無い |
| `G4` | 汎用性 | 秘匿値の環境変数がリテラル代入されていない |
| `S1` | セキュリティ | 最小権限の `permissions:` を宣言（`contents: write` は `contents_write_jobs` のみ） |
| `S2` | セキュリティ | `pull_request_target` を使っていない |
| `S3` | セキュリティ | Action が許可リスト内かつバージョン固定 |
| `S4` | セキュリティ | シークレットの持ち出し・危険なシェルパターンが無い |
| `S5` | セキュリティ | レビューゲートがデプロイ用シークレットにアクセスしない |
| `S6` | セキュリティ | 信頼できないイベントデータをシェルへ展開していない |
| `R1` | 可読性 | ワークフロー冒頭に説明コメントがある |
| `R2` | 可読性 | ジョブと実行ステップに `name:` がある |
| `R3` | 可読性 | 行長が上限（既定 120 文字）以内 |
| `R4` | 可読性 | TODO / FIXME が残っていない |
| `R5` | 可読性 | スクリプトにモジュール docstring がある |
| `A1` | リリース判定 | 上流 4 ゲートがすべて PASS（GO / NO-GO） |

ルールが正当な理由で成立しなくなった場合は、**ルールを緩めずに `alm.config.json` の
許可リストへ限定的に追加**する（例: リリースジョブにだけ `contents: write` を許す）。

## 2. 再利用ワークフロー `.github/workflows/agent-gate.yml`

```yaml
# Reusable review gate executed by one custom-prompt agent.
#
# Each caller job maps to a single agent in .github/prompts/ and shows up as its
# own card in the Actions run graph, so the review chain is readable from the
# run history alone.
name: Agent gate

on:
  workflow_call:
    inputs:
      gate:
        description: Rule pack to evaluate (quality | generalization | security | readability | release).
        required: true
        type: string
      agent:
        description: Custom prompt agent that owns this gate.
        required: true
        type: string
      prompt:
        description: Path to the agent's custom prompt file.
        required: true
        type: string
      collect-verdicts:
        description: Download the upstream gate verdicts before evaluating (used by the release gate).
        required: false
        default: false
        type: boolean
    secrets:
      COPILOT_CLI_TOKEN:
        description: Token used by the Copilot CLI. When absent the gate falls back to the rule engine only.
        required: false
    outputs:
      verdict:
        description: PASS or FAIL.
        value: ${{ jobs.gate.outputs.verdict }}

permissions:
  contents: read

jobs:
  gate:
    name: ${{ inputs.agent }}
    runs-on: ubuntu-latest
    outputs:
      verdict: ${{ steps.rules.outputs.verdict }}
    env:
      GATE_ID: ${{ inputs.gate }}
      GATE_AGENT: ${{ inputs.agent }}
      GATE_PROMPT: ${{ inputs.prompt }}
      GATE_AGENT_ENABLED: ${{ secrets.COPILOT_CLI_TOKEN != '' }}
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install the rule engine dependencies
        run: pip install "PyYAML>=6.0"

      - name: Collect upstream gate verdicts
        if: ${{ inputs.collect-verdicts }}
        uses: actions/download-artifact@v4
        with:
          pattern: gate-verdict-*
          merge-multiple: true
          path: .gate

      - name: Evaluate the rule pack
        id: rules
        continue-on-error: true
        run: |
          set +e
          python scripts/gate_rules.py \
            --gate "$GATE_ID" \
            --verdict-dir .gate \
            --out ".gate/$GATE_ID.json" \
            --summary ".gate/$GATE_ID.md"
          status=$?
          set -e
          report=".gate/$GATE_ID.json"
          verdict=$(python -c 'import json,sys;print(json.load(open(sys.argv[1]))["verdict"])' "$report")
          echo "verdict=$verdict" >> "$GITHUB_OUTPUT"
          echo "rules-exit=$status" >> "$GITHUB_OUTPUT"

      - name: Set up Node.js for the Copilot CLI
        if: ${{ env.GATE_AGENT_ENABLED == 'true' }}
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Run the custom prompt agent
        if: ${{ env.GATE_AGENT_ENABLED == 'true' }}
        continue-on-error: true
        env:
          COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
          GH_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}
        run: |
          npm install -g @github/copilot
          copilot --prompt "$(cat "$GATE_PROMPT")" \
            --allow-tool 'shell(python)' \
            --allow-tool 'write'

      - name: Publish the gate report
        if: ${{ always() }}
        run: |
          {
            echo "# Gate: $GATE_ID"
            echo ""
            echo "Agent: \`$GATE_AGENT\` (prompt: \`$GATE_PROMPT\`)"
            echo ""
            cat ".gate/$GATE_ID.md" 2>/dev/null || echo "No report produced."
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload the gate verdict
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: gate-verdict-${{ inputs.gate }}
          path: .gate/
          # .gate is a dot directory: upload-artifact skips hidden paths by default.
          include-hidden-files: true
          retention-days: 7

      - name: Enforce the verdict
        env:
          GATE_VERDICT: ${{ steps.rules.outputs.verdict }}
        run: |
          if [ "$GATE_VERDICT" != "PASS" ]; then
            echo "::error title=$GATE_AGENT::Gate '$GATE_ID' returned FAIL. See the job summary for findings."
            exit 1
          fi
          echo "Gate '$GATE_ID' passed."
```

## 3. 呼び出し側 `.github/workflows/deploy.yml`

ゲート連鎖 → レポート → デプロイ → リリース記録。
**デプロイステップだけがプロダクト固有**なので、そこを各スキルの手順に差し替える。

```yaml
# Multi-stage delivery pipeline.
#
# On push to the default branch the change passes through four autonomous review
# agents and a release gatekeeper before anything is deployed.
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  gate-quality:
    name: 1. 品質チェック
    uses: ./.github/workflows/agent-gate.yml
    with:
      gate: quality
      agent: quality-inspector
      prompt: .github/prompts/gate-quality.prompt.md
    secrets:
      COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

  gate-generalization:
    name: 2. 汎用性チェック
    needs: gate-quality
    uses: ./.github/workflows/agent-gate.yml
    with:
      gate: generalization
      agent: generalization-auditor
      prompt: .github/prompts/gate-generalization.prompt.md
    secrets:
      COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

  gate-security:
    name: 3. セキュリティレビュー
    needs: gate-generalization
    uses: ./.github/workflows/agent-gate.yml
    with:
      gate: security
      agent: security-reviewer
      prompt: .github/prompts/gate-security.prompt.md
    secrets:
      COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

  gate-readability:
    name: 4. 可読性チェック
    needs: gate-security
    uses: ./.github/workflows/agent-gate.yml
    with:
      gate: readability
      agent: readability-editor
      prompt: .github/prompts/gate-readability.prompt.md
    secrets:
      COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

  gate-release:
    name: 5. リリース判定 (自律ゲート)
    needs: [gate-quality, gate-generalization, gate-security, gate-readability]
    uses: ./.github/workflows/agent-gate.yml
    with:
      gate: release
      agent: release-gatekeeper
      prompt: .github/prompts/gate-release.prompt.md
      collect-verdicts: true
    secrets:
      COPILOT_CLI_TOKEN: ${{ secrets.COPILOT_CLI_TOKEN }}

  review-report:
    name: 6. レビュー結果まとめ
    needs: [gate-quality, gate-generalization, gate-security, gate-readability, gate-release]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Collect every gate verdict
        uses: actions/download-artifact@v4
        with:
          pattern: gate-verdict-*
          merge-multiple: true
          path: .gate

      - name: Build the consolidated review report
        run: python scripts/review_report.py --verdict-dir .gate --out .gate/review-report.md

      - name: Publish the report to the run summary
        run: |
          {
            echo "# デプロイ レビュー結果"
            echo ""
            cat .gate/review-report.md
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Upload the consolidated report
        uses: actions/upload-artifact@v4
        with:
          name: review-report
          path: .gate/review-report.md
          # .gate is a dot directory: upload-artifact skips hidden paths by default.
          include-hidden-files: true
          retention-days: 90

  deploy:
    name: 7. デプロイ
    needs: gate-release
    runs-on: ubuntu-latest
    # Enable once the OIDC secrets are in place.
    if: ${{ vars.DEPLOY_ENABLED == 'true' }}
    # The environment scopes the deployment secrets. Approval is not expected
    # here: the autonomous gate chain above is the review gate.
    environment: production
    permissions:
      contents: read
      id-token: write
    outputs:
      version: ${{ steps.deploy.outputs.version }}
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4

      - name: Azure login (OIDC)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      # ↓ ここだけプロダクト固有。agent365 なら render.py → deploy.py、
      #   code-apps なら npm ci → npm run deploy に差し替える。
      - name: Deploy
        id: deploy
        run: echo "デプロイ手順はプロダクトスキルを参照"

  release:
    name: 8. リリースの記録
    needs: [review-report, deploy]
    if: ${{ needs.deploy.result == 'success' }}
    runs-on: ubuntu-latest
    # Every deployed version is published as a GitHub release, so the deployment
    # history and its review result live on the Releases page instead of
    # polluting the issue tracker.
    permissions:
      contents: write
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      DEPLOYED_VERSION: ${{ needs.deploy.outputs.version }}
      RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4

      - name: Download the consolidated report
        uses: actions/download-artifact@v4
        with:
          name: review-report
          path: .gate

      - name: Compose the release notes
        run: |
          subject=$(git log -1 --pretty=%s | tr -d '\r')
          {
            echo "- コミット: \`${GITHUB_SHA:0:7}\` $subject"
            echo "- 実行: [run #${GITHUB_RUN_NUMBER}]($RUN_URL) (by @${GITHUB_ACTOR})"
            echo ""
            cat .gate/review-report.md
          } > notes.md
          cat notes.md >> "$GITHUB_STEP_SUMMARY"

      - name: Publish or update the release
        run: |
          tag="v${DEPLOYED_VERSION}"
          title="deploy ${tag}"
          if gh release view "$tag" >/dev/null 2>&1; then
            gh release edit "$tag" --title "$title" --notes-file notes.md
          else
            gh release create "$tag" --target "$GITHUB_SHA" --title "$title" --notes-file notes.md
          fi
```

デプロイスクリプトはバージョン番号を `GITHUB_OUTPUT` へ書き出しておく。

```python
github_output = os.environ.get("GITHUB_OUTPUT")
if github_output:
    with open(github_output, "a", encoding="utf-8") as handle:
        handle.write(f"version={version}\n")
```

## 4. ゲートエージェントのプロンプト

`.github/prompts/gate-<gate>.prompt.md` を 5 本用意する。プロンプトは**判定を下さない**。
`gate_rules.py` を実行させ、その結果を再現・説明させるだけにする（判定の一貫性を保つため）。

```markdown
---
description: 品質チェックを担当するレビューエージェント。
---

あなたはこのリポジトリの品質レビュー担当です。

## ルール
| ID | チェック内容 | 失敗時の意味 |
|---|---|---|
| `Q1` | ワークフローが妥当な YAML である | パイプラインが起動しない |
| ... | ... | ... |

## 手順
1. `python scripts/gate_rules.py --gate quality --out .gate/quality.json --summary .gate/quality.md` を実行する。
2. 出力された JSON の `verdict` と `findings` を**そのまま**採用する。独自の判断で覆さない。
3. `fail` のルールごとに、修正方法を 1〜2 行で追記する。

## 出力契約
- `.gate/quality.json` を上書きしない。
- 追加の説明は `.gate/quality.md` の末尾にのみ追記する。
```

## 5. ハマりどころ

| 症状 | 原因 | 対処 |
|---|---|---|
| リリース判定が `missing verdict for the '...' gate` で FAIL | `.gate/` はドットディレクトリで、`actions/upload-artifact@v4` が既定で除外する | upload / download 両方の `.gate/` 指定に `include-hidden-files: true` を付ける |
| デプロイジョブがステップ 0 件で失敗する | 承認待ちの実行中に Environment の保護ルールを変更した | `gh run rerun <run-id> --failed` で再実行する |
| ゲートは全部 PASS なのにデプロイが始まらない | Environment の必須レビュアーが残っている | 自律運用にするなら保護ルールを外す。有人運用なら承認する |
| `S1` が正当な `contents: write` を弾く | リリース発行に書き込み権限が要る | ルールを緩めず `alm.config.json` の `contents_write_jobs` にジョブ名を追加する |
| ゲートがデプロイ用シークレットを読んでいると `S5` が FAIL | 再利用ワークフローに `secrets: inherit` を付けた | ゲートには必要なシークレットのみを明示的に渡す |
