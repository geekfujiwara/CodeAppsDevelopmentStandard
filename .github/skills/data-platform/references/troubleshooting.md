# data-platform 異常系・トラブルシュート

## 1. Databricks workspace が作成直後から壊れている

- 症状: workspace の `provisioningState` が `Failed`、または UI が開けない。
- 原因: managed RG を事前に作成した。
- 対処: 失敗した workspace を削除し、managed RG を作らずに再デプロイする。
- 恒久対策済み: `deploy_platform.py` の `guard_databricks_managed_rg()` と `preflight_platform.py` が、workspace 管理外の既存 managed RG を検出して停止する。

## 2. Fabric capacity / item の作成が 400 になる

- 症状: `InvalidName` など。
- 原因: capacity 名にハイフン、Lakehouse / Ontology 名にハイフンを使った。
- 恒久対策済み: `deploy_platform.py` の `validate_names()` が plan 時に検出する。

## 3. Fabric workspace 作成時に capacity が見つからない

- 症状: `/v1/capacities` に対象 capacity が出ない。
- 原因: サインイン中の利用者が capacity 管理者ではない、または capacity が `Paused`。
- 対処: `FABRIC_CAPACITY_ADMIN` を確認し、`manage_compute.py start --target fabric` 後に再実行する。

## 4. metric view の作成が列解決エラーになる

- 原因: ディメンション経由の多段 join。
- 対処: join 済み view（例 `telemetry_enriched`）を作り、`source` に指定する。サンプル仕様はこの形になっている。

## 5. Fabric Ontology MCP が HTTP 200 なのに回答がない

- 症状: `tools/call` の `result.isError=true`。
- 原因: entity type / binding が未構成（新規 Ontology の定義は `{}`）。
- 対処: Fabric UI で entity / relationship / binding を構成する。
- 恒久対策済み: `mcp_outcome()` が `result.isError` と JSON-RPC `error` を `blocked` と判定する。

## 6. Foundry IQ retrieve が 400 になる

- `minimal` に `messages` を送った → `intents` を使う。
- `low` 以上に `intents` だけを送った、または KB にモデルが無い → `messages` を使い、KB の `models` を確認する。
- Fabric Ontology source を `minimal` の KB に追加した → `low` 以上にする。
- 恒久対策済み: `verify_platform.py` は KB 定義の reasoning を読み取って入力形状を切り替え、`configure_semantics.py` は Fabric source 併用時に `low` へ引き上げる。

## 7. Foundry IQ で 401 / 403

- Search の `authOptions` が API キーのみ → テンプレートの `aadOrApiKey` を適用する。
- 利用者に Search Index Data Reader / Contributor が無い → ロール付与後、反映まで数分待つ。
- KB のモデル呼び出しで 401 → Search のマネージド ID に AIServices の **Cognitive Services User** が必要（OpenAI User だけでは不足）。
- リソースを別 RG へ移動した → 旧 RG スコープのロールは失われる。新しいスコープで再付与する。

## 8. SQL warehouse が勝手に起動している

- 検証・Genie・MCP の呼び出しで自動起動する。`auto_stop_mins=10` で止まるが、作業終了時は `manage_compute.py stop` を実行する。

## 9. Genie space の作成が `data_sources.tables must be sorted by identifier` で 400

- 原因: `serialized_space.data_sources` の `tables` / `metric_views` が identifier の昇順でない。
- 恒久対策済み: `configure_semantics.py` の `databricks_operations()` が identifier 順に並べ替える（`test_genie_data_sources_are_sorted`）。

## 10. Genie MCP の `query_space` が回答を返さない

- 症状: `status: ASKING_AI` と「Use the poll_response tool」だけが返る。
- 原因: Genie Agent MCP は非同期。`poll_response` を `COMPLETED` まで呼ぶ必要がある。
- 恒久対策済み: `verify_platform.py` の `check_genie_mcp()` がポーリングして行を正解と比較する（`test_genie_mcp_polls_until_completed`）。
