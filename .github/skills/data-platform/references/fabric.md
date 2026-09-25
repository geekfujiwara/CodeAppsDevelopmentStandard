# Microsoft Fabric リファレンス

## 使う場面

- Power BI・OneLake・Microsoft 365 と一体で分析する。SaaS で運用負荷を下げたい。
- 業務エンティティと関係（例: 店舗 → 冷凍庫 → 計測値 / 作業指示）を **Fabric IQ Ontology** で明示的にモデル化し、
  グラフで辿る・エージェントに MCP で問い合わせさせる。
- Dataverse の業務データを Link to Fabric で分析側に持ち込む。

## 構成要素と作成方法

| 要素 | 作成 | API |
|---|---|---|
| Fabric capacity（F2 以上） | `deploy_platform.py`（ARM） | `Microsoft.Fabric/capacities@2023-11-01` |
| workspace | `deploy_platform.py`（post step） | `POST /v1/workspaces`（`capacityId` は Fabric の capacity ID。ARM ID ではない） |
| Lakehouse | 同上 | `POST /v1/workspaces/{id}/lakehouses` |
| Ontology item | 同上 | `POST /v1/workspaces/{id}/items`（`type: "Ontology"`） |
| entity type / relationship / binding | **Fabric UI** | 公開オーサリング API なし（2026-09 時点） |
| テーブルデータ | data-migration | OneLake DFS + `POST .../lakehouses/{id}/tables/{table}/load`（preview） |

## 命名規則（実測）

- capacity 名: 英小文字と数字のみ。ハイフン不可。
- Lakehouse / Ontology 名: 英数字とアンダースコアのみ。ハイフン不可。
- workspace 名: ハイフン可。

## Ontology の UI 構成（Step 6）

1. 統合ブラウザを開く前に AskUserQuestion で Edge プロファイルを確認する。
2. Fabric ポータルで対象 workspace の Ontology item を開く。
3. entity type を作成し、Lakehouse テーブルへ binding する（例: Store / Freezer / TelemetryReading / WorkOrder）。
4. relationship を作成する（Store–Freezer、Freezer–TelemetryReading、Freezer–WorkOrder）。
5. 保存後、`verify_platform.py --check fabric-mcp` で `list_ontology_entity_types` が 1 件以上になることを確認する。

## Ontology MCP

```text
POST https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/{workspaceId}/items/{ontologyId}/ontologyEndpoint
Authorization: Bearer <https://api.fabric.microsoft.com/.default>
Accept: application/json, text/event-stream
```

- protocol `2025-06-18`。`initialize` → `notifications/initialized` → `tools/list` → `tools/call`。
- 実測ツール: `list_ontology_entity_types`、`search_ontology`。
- ツール実行の失敗は HTTP 200 の `result.isError=true` で返る。`verify_platform.py` は `blocked` と判定する。

## コスト

- capacity は稼働中は時間課金。`manage_compute.py stop --target fabric` で `Paused` にする。
- Paused 中は Ontology MCP・Lakehouse 読み書きとも使えない。検証時だけ `start` する。

## 参考（Microsoft Learn）

- [Fabric IQ Ontology 概要](https://learn.microsoft.com/fabric/iq/ontology/overview)
- [Ontology MCP サーバー](https://learn.microsoft.com/fabric/iq/ontology/how-to-use-ontology-mcp-server)
- [Lakehouse Load Table API](https://learn.microsoft.com/rest/api/fabric/lakehouse/tables/load-table)
- [OneLake へのアクセス](https://learn.microsoft.com/fabric/onelake/onelake-access-api)
