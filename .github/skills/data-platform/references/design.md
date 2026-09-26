# data-platform 設計

## 1. 目的と責務

architecture で決めたデータ基盤を、**API だけで再現可能に**構築・検証し、エージェント（Cowork / Copilot Studio / Foundry）が
MCP で接続できる状態まで持っていく。

| 責務 | 担当 |
|---|---|
| 基盤の選定（4 役割の決定） | architecture（判定ロジック `recommend_platform.py` と重み表はこのスキルが所有） |
| Fabric / Databricks / Foundry IQ の事前確認・デプロイ・read-back | **data-platform** |
| セマンティック層（Databricks metric view + Genie、Foundry IQ knowledge base） | **data-platform** |
| Fabric IQ Ontology の entity / relationship / binding | Fabric UI（統合ブラウザ）。本スキルは作成前後の状態検証のみ |
| runtime 検証（SQL・Genie・Ontology MCP・KB retrieve / MCP） | **data-platform** |
| 計算リソースの停止・再開 | **data-platform** |
| Dataverse のテーブル・権限 | dataverse |
| スキーマ変換・データ投入・照合 | data-migration |
| MCP のクライアント登録・公開 | cowork / copilot-studio / copilot-studio-v2 / ai-teammate |
| VNet / Private Endpoint などのネットワーク統制 | azure |

## 2. 契約

### 2.1 入力: `spec/data-requirements.json`

architecture のヒアリング結果。キーは [capability-matrix.json](capability-matrix.json) の signal 名と一致させる。

```json
{
  "needs": {
    "transactionalCrud": true, "rowLevelSecurity": true, "powerPlatformApps": true,
    "powerBi": false, "oneLake": false, "streaming": true, "ml": false, "sparkEngineering": false,
    "entityRelationshipModel": false, "governedMetrics": true, "documents": true, "citations": true
  },
  "dataVolumeGb": 50,
  "exposure": {"clients": ["copilot-studio", "foundry"]}
}
```

### 2.2 出力: `spec/data-platform.json`

```json
{
  "schemaVersion": "1.0",
  "matrixVersion": "2026-09-25",
  "decision": {"systemOfRecord": "dataverse", "analytics": "databricks", "semantic": "databricks-metric-view", "knowledge": "foundry-iq"},
  "scores": {"analytics": {"fabric": 0, "databricks": 3}},
  "reasons": ["analytics=databricks: streaming(+3)"],
  "warnings": [],
  "needsDecision": [],
  "delegates": {"dataverse": "dataverse", "databricks": "data-platform", "migration": "data-migration"},
  "mcp": [{"platform": "databricks-genie", "endpoint": "...", "clientSkills": ["copilot-studio"]}]
}
```

`needsDecision` が空でない場合、スクリプトは終了コード 3 を返し、利用者の選択を待つ。

## 3. 状態分類

すべてのチェック結果を次のいずれかで記録する。HTTP 200 やリソース存在だけで `verified` にしない。

| 状態 | 意味 |
|---|---|
| `verified` | 期待値まで実測した |
| `blocked` | 前提不足・権限不足・製品制約で実行できない（理由を必ず記録） |
| `failed` | 実行したが期待値と一致しない |
| `not-present` | 対象リソースが存在しない |
| `not-tested` | 未実行（コスト未承認・入力不足など） |

## 4. 変更操作の安全モデル

1. `plan` は読み取りだけで、作成予定リソース・パラメータ・テンプレートの SHA-256 を含む計画 JSON を出力する。
2. 計画 JSON の `planHash` を利用者に提示し、明示承認を得る。
3. `apply --approve-hash` は計画を再計算し、hash とテンプレートの hash が一致しない場合は何も変更しない。
4. 適用後は必ず read-back（ARM `provisioningState`、Fabric item、Databricks warehouse）で結果を確定する。
5. 削除はスキルに含めない。リソースグループ削除は利用者が明示的に依頼した場合のみ手動で行う。

## 5. リソース配置

- **1 プラットフォーム = 1 リソースグループ**（`<prefix>-fabric-rg` / `<prefix>-databricks-rg` / `<prefix>-foundry-rg`）。
- Databricks は製品仕様上、Databricks 自身が作る managed RG が追加で必要。**managed RG は事前作成しない**
  （事前作成すると workspace が壊れる）。`deploy_platform.py` は既存 managed RG を検出したら停止する。
- 名前は `DP_NAME_PREFIX` から機械的に導出する。Fabric capacity 名は英小文字と数字のみ、Fabric item 名は英数字とアンダースコアのみ。

## 6. スクリプト構成

| スクリプト | 変更 | 役割 |
|---|---|---|
| `recommend_platform.py` | なし | 要件 → 4 役割の決定・理由・未決事項・MCP 候補 |
| `preflight_platform.py` | なし | サブスクリプション、リソースプロバイダー、RG、既存リソース、計算状態 |
| `deploy_platform.py` | あり（hash 承認） | ARM デプロイと Fabric workspace / Lakehouse / Ontology item、Databricks SQL warehouse |
| `configure_semantics.py` | あり（hash 承認） | Databricks metric view + Genie space、Foundry IQ index / knowledge source / knowledge base |
| `verify_platform.py` | なし（計算は起動しうる） | SQL・Genie・Ontology MCP・KB retrieve / MCP の実測と MCP 接続情報の出力 |
| `manage_compute.py` | あり | Fabric capacity と Databricks SQL warehouse の状態確認・停止・再開 |
| `data_platform_common.py` | ― | 認証（standard の `auth_helper`）、HTTP 再試行、LRO、plan hash、MCP 応答判定 |

## 7. 認証

`standard/scripts/auth_helper.get_token(scope=...)` を使い、Azure CLI 互換のパブリッククライアントでトークンを取る。

| 対象 | スコープ |
|---|---|
| ARM | `https://management.azure.com/.default` |
| Fabric REST / Ontology MCP | `https://api.fabric.microsoft.com/.default` |
| OneLake | `https://storage.azure.com/.default` |
| Azure Databricks | `2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default`（第一者 resource app） |
| Azure AI Search / Foundry IQ | `https://search.azure.com/.default` |

API キー・PAT は使わない。Search は `aadOrApiKey` を有効化し、ロール（Search Index Data Reader / Contributor）で認可する。

## 8. 既知の制約

- Fabric IQ Ontology の定義 API は新規 item に対して `{}` を返し、entity / binding の公開オーサリング API は未提供（2026-09 時点）。
- Fabric Ontology knowledge source は `minimal` reasoning を受け付けない。`low` 以上を使う。
- Foundry IQ の `minimal` retrieve は `intents`、`low` 以上は `messages` を入力にする。
- Databricks metric view はディメンション経由の多段 join で列解決に失敗することがある。join 済み view を source にする。
- MCP の失敗は HTTP 200 の本文（JSON-RPC `error` または `result.isError=true`）で返ることがある。
