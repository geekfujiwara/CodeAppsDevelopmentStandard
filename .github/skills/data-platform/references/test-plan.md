# data-platform テスト計画

## 1. 方針

| レベル | 実行環境 | 課金 | 実行タイミング |
|---|---|---|---|
| Unit | ローカル（HTTP はモック） | なし | すべての変更で必須（`python -m unittest discover`） |
| Contract | ローカル + 読み取り API | なし | preflight / plan の変更時 |
| Live | 評価用サブスクリプション | あり（承認必須） | デプロイ・API バージョン変更時 |
| E2E | Live + MCP クライアント | あり | 公開前・製品更新時 |

合否は [design.md §3](design.md#3-状態分類) の状態で記録する。`verified` 以外は理由と証跡を必須にする。

## 2. 基準シナリオ

店舗冷凍庫の異常検知（cold-chain）。基準質問:

> 直近 24 時間で -15 ℃ を超えた計測が 3 回以上あり、未完了の作業指示を持つ高重要度の冷凍庫は？

正解は 1 行のみ: `Tokyo Central / FZ-101 / 3 / -13.0 / WO-9001 / P1`
（データは [data-migration のサンプル](../../data-migration/references/samples/cold-chain/)、期待値は [cold-chain-expected.json](samples/cold-chain-expected.json)）。

## 3. Unit テスト

| ID | 対象 | 観点 | 期待結果 | 自動化 |
|---|---|---|---|---|
| DP-U-001 | recommend | 業務 CRUD + Power Platform | systemOfRecord=`dataverse` | `test_recommend_platform.py` |
| DP-U-002 | recommend | streaming + ML | analytics=`databricks`、理由に signal と重み | 同上 |
| DP-U-003 | recommend | Power BI + OneLake | analytics=`fabric` | 同上 |
| DP-U-004 | recommend | Fabric と Databricks が同点 | `needsDecision` に analytics、終了コード 3 | 同上 |
| DP-U-005 | recommend | entityRelationshipModel + analytics=databricks | semantic は Databricks 側、Fabric Ontology 併用の警告 | 同上 |
| DP-U-006 | recommend | documents のみ | knowledge=`foundry-iq`、analytics=`none` | 同上 |
| DP-U-007 | recommend | 大容量を Dataverse に置く | `dataverseComfortGb` 超過の警告 | 同上 |
| DP-U-008 | recommend | 未知の signal | 入力エラー（黙って無視しない） | 同上 |
| DP-U-009 | recommend | MCP 候補 | 決定した基盤ごとに endpoint と clientSkills | 同上 |
| DP-U-010 | common | plan hash | キー順が違っても同じ hash、値が違えば別 hash | `test_common.py` |
| DP-U-011 | common | HTTP 429 | `Retry-After` に従い上限回数だけ再試行 | 同上 |
| DP-U-012 | common | MCP 判定 | JSON-RPC `error` と `result.isError=true` を `blocked`、正常のみ `verified` | 同上 |
| DP-U-013 | common | SSE 応答 | `data:` 行の最後の JSON を採用 | 同上 |
| DP-U-014 | common | トークン秘匿 | 例外・出力に Bearer トークンが残らない | 同上 |
| DP-U-015 | deploy | 名前導出 | capacity は英小文字数字、Fabric item は英数字と `_` のみ | `test_deploy_platform.py` |
| DP-U-016 | deploy | hash 不一致 | 何も変更せず終了 | 同上 |
| DP-U-017 | deploy | テンプレート改変 | template hash 不一致で停止 | 同上 |
| DP-U-018 | deploy | Databricks managed RG が既存 | 停止し、事前作成しない旨を表示 | 同上 |
| DP-U-019 | deploy | 1 プラットフォーム 1 RG | 3 基盤で RG が重複しない | 同上 |
| DP-U-020 | deploy | Fabric item の冪等性 | 同名 workspace / item が既存なら作成しない | 同上 |
| DP-U-021 | semantics | Genie 本文 | `serialized_space` version 2、tables と metric_views を含む | `test_configure_semantics.py` |
| DP-U-022 | semantics | Foundry KB | Fabric Ontology source 併用時は reasoning `low` | 同上 |
| DP-U-023 | semantics | SQL 識別子 | catalog / schema の不正値を拒否 | 同上 |
| DP-U-024 | verify | 期待行の比較 | 正解 1 行のみで `verified`、余分な行は `failed` | `test_verify_platform.py` |
| DP-U-025 | verify | Genie 失敗状態 | `FAILED` / `CANCELLED` を `failed` | 同上 |
| DP-U-026 | verify | 空 Ontology | entity 0 件を `blocked`（理由: 未バインド） | 同上 |
| DP-U-027 | verify | KB retrieve | reasoning に応じて `intents` / `messages` を切り替え | 同上 |
| DP-U-028 | verify | MCP 接続情報 | endpoint・audience・tool 名を JSON 出力し、トークンを含まない | 同上 |
| DP-U-029 | compute | 停止 | 実行中なら停止、停止済みなら何もしない | `test_manage_compute.py` |
| DP-U-030 | compute | Fabric suspend | Active → Paused の read-back まで待つ | 同上 |

## 4. Contract テスト（読み取りのみ）

| ID | 観点 | 期待結果 |
|---|---|---|
| DP-C-001 | preflight: サブスクリプション | 取得できれば `verified` |
| DP-C-002 | preflight: リソースプロバイダー | 未登録を `blocked` として列挙 |
| DP-C-003 | preflight: 既存リソース | 無ければ `not-present`、あれば状態付きで `verified` |
| DP-C-004 | plan `--validate` | 既存 RG に対する ARM validate が成功 |

## 5. Live テスト（課金・承認必須）

| ID | 基盤 | 手順 | 期待結果 |
|---|---|---|---|
| DP-L-001 | Fabric | `deploy_platform.py apply --platform fabric` | capacity `Active`、workspace・Lakehouse・Ontology item を read-back |
| DP-L-002 | Databricks | `deploy_platform.py apply --platform databricks` | workspace `Succeeded`、managed RG は Databricks が作成、Serverless PRO warehouse |
| DP-L-003 | Foundry IQ | `deploy_platform.py apply --platform foundry` | AIServices / project / Search（`aadOrApiKey`）/ モデル 2 種 / ロール割り当て |
| DP-L-004 | Databricks | data-migration で cold-chain 投入 → `configure_semantics.py --target databricks-genie` | metric view と Genie space を作成 |
| DP-L-005 | Databricks | `verify_platform.py --check databricks-sql` | `MEASURE()` で FZ-101 = 3 / -13.0 |
| DP-L-006 | Databricks | `verify_platform.py --check databricks-genie` | 正解 1 行、`COMPLETED` |
| DP-L-007 | Fabric | `verify_platform.py --check fabric-mcp` | initialize・tools/list 成功。未バインドなら基準質問は `blocked` |
| DP-L-008 | Fabric | UI で 4 entity / 3 relationship / binding 後に再実行 | 基準質問が正解 1 行 |
| DP-L-009 | Foundry IQ | `configure_semantics.py --target foundry-kb` → `verify --check foundry-kb` | FZ-101 の手順・P1・引用 `manual-fz101` |
| DP-L-010 | Foundry IQ | Fabric Ontology knowledge source を追加 | source 定義を read-back、reasoning `low` |
| DP-L-011 | 全体 | `manage_compute.py stop --all` | Fabric `Paused`、warehouse `STOPPED` |

## 6. E2E テスト（MCP クライアント）

| ID | クライアント | 接続先 | 期待結果 | 担当スキル |
|---|---|---|---|---|
| DP-E-001 | Copilot Studio | Foundry IQ KB MCP | `knowledge_base_retrieve` が引用付きで回答 | copilot-studio |
| DP-E-002 | Copilot Studio | Databricks Genie MCP | 基準質問で正解 1 行 | copilot-studio |
| DP-E-003 | Foundry Agent | Foundry IQ KB MCP | 同上（project connection 経由） | ai-teammate |
| DP-E-004 | Cowork | Fabric Ontology MCP | バインド済み Ontology で正解 1 行 | cowork |
| DP-E-005 | 任意 | 権限の無い利用者 | 401/403 または MCP `isError` で拒否され、データを返さない | 各スキル |

## 7. 合格基準

- Unit はすべて成功、`validate_skill.py` が ERROR 0。
- Live は DP-L-001〜007、009、011 が `verified`。DP-L-008 / 010 は Fabric UI 作業が必要なため `blocked` を許容し、理由を記録。
- 実行後に計算リソースが停止し、固定課金（AI Search、Databricks managed RG の NAT / Public IP）を報告している。

## 8. 実施記録（2026-09-25、評価用サブスクリプション・Japan East）

| ID | 結果 | 証跡 |
|---|---|---|
| Unit 58 件 | `verified` | `python -m unittest discover -s tests` |
| DP-C-001〜003 | `verified` | preflight: provider 登録、RG、既存リソース、Databricks managed RG が workspace 管理下 |
| DP-C-004 | `verified` | 3 テンプレートとも ARM validate 成功 |
| DP-L-001〜003 | `not-tested` | 既存の評価リソースに対する validate のみ（apply は未実施） |
| DP-L-004 | `verified` | コメント 3 件、join 済み view、metric view、Genie space を作成 |
| DP-L-005 | `verified` | `MEASURE()` が FZ-101 / 3 / -13.0、正解 SQL が 1 行 |
| DP-L-006 | `verified` | Genie が正解 1 行を返却 |
| DP-L-007 / 008 / 010 | `not-tested` | capacity が Paused。前回評価では initialize / tools/list は成功、未バインドのため質問は `blocked` |
| DP-L-009 | `verified` | reasoning `low` で `manual-fz101` を引用。Paused の Fabric source が失敗し 206（`failedSources` に記録） |
| DP-L-011 | `verified` | warehouse RUNNING → STOPPED、Fabric Paused |
| Genie Agent MCP（直接呼び出し） | `verified` | `query_space` → `poll_response` で正解 1 行 |
| Foundry IQ MCP（直接呼び出し） | `verified` | `knowledge_base_retrieve`（`query_variants`）が FZ-101 / P1 を返却 |
| DP-E-001〜005 | `not-tested` | 公開先スキルでのクライアント登録は未実施 |

実施中に見つけて恒久対策した不具合: Genie `data_sources` の並び順（troubleshooting #9）、Genie MCP の非同期応答（#10）、
Foundry IQ MCP の配列引数、206 Partial Content の扱い。
