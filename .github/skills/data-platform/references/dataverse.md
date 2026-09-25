# Dataverse への委譲

system of record が Dataverse の場合、テーブル・列・リレーション・代替キー・セキュリティロールは
[dataverse スキル](../../dataverse/SKILL.md) が担当する。本スキルでは作成しない。

| 作業 | 担当 |
|---|---|
| publisher / solution / テーブル / 列 / Lookup | dataverse |
| 代替キー（data-migration の upsert に必須） | dataverse（業務キー列に代替キーを定義） |
| 既存データの投入・照合 | [data-migration](../../data-migration/SKILL.md)（`target.kind: dataverse`） |
| 分析側への連携 | Link to Fabric（Fabric workspace は本スキルで作成） |
| MCP 公開 | Dataverse MCP（`allowedmcpclients`）→ cowork / copilot-studio-v2 |

## Dataverse を選ぶ目安

- 画面から 1 件ずつ登録・更新する業務データ。
- 行レベルの所有者・Business Unit・監査が必要。
- Power Apps / Copilot Studio / Power Automate から直接扱う。

大量の履歴・ログ・センサー値は Dataverse に置かず、Fabric / Databricks に分離する
（`recommend_platform.py` は `dataverseComfortGb` を超えると警告する）。
