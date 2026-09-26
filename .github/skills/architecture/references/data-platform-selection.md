# データ基盤の選定ガイド（Dataverse / Fabric / Databricks / Foundry IQ）

「どのようにデータを構えたらよいか分からない」利用者に対し、**役割ごとに 1 つずつ**基盤を選ぶ。
1 製品ですべてを賄おうとせず、次の 4 役割を独立に決める。

| 役割 | 問い | 候補 |
|---|---|---|
| system of record | 業務データを登録・更新し、正本として保持するのはどこか | Dataverse / Azure SQL / なし |
| analytics | 集計・履歴・大量データ・機械学習をどこで扱うか | Microsoft Fabric / Azure Databricks / なし |
| semantic | 業務用語・エンティティ・関係・指標をどこで定義するか | Fabric IQ Ontology / Databricks metric view + Genie / なし |
| knowledge | 文書・手順書を根拠付きでエージェントに渡すか | Foundry IQ（Azure AI Search knowledge base）/ なし |

> **Foundry IQ はデータストアではない**。検索・引用・回答合成を担う knowledge layer で、
> Search index / Blob / SharePoint / Fabric Ontology などを knowledge source として束ねる。

## 1. 判定の早見表

| こんなとき | 選ぶもの |
|---|---|
| 申請・案件・台帳など、画面から 1 件ずつ登録・更新する。行レベル権限・監査が要る | **Dataverse**（[dataverse スキル](../../dataverse/SKILL.md)） |
| 既存アプリが SQL Server 互換 DB を前提にしている / Power Platform 外のアプリが主 | **Azure SQL**（[azure スキル](../../azure/SKILL.md)） |
| Power BI・OneLake・Microsoft 365 と一体で分析したい。SaaS で運用負荷を下げたい | **Microsoft Fabric** |
| ストリーミング、Spark によるデータエンジニアリング、機械学習、既存 Databricks 資産がある | **Azure Databricks** |
| 業務エンティティと関係（店舗―設備―センサー―作業指示）を明示的にモデル化し、グラフで辿りたい | **Fabric IQ Ontology** |
| 統制された SQL 指標を自然言語で問い合わせたい | **Databricks metric view + Genie** |
| マニュアル・規程・FAQ を引用付きで回答させたい | **Foundry IQ** |

## 2. 典型構成

| パターン | 構成 | 典型例 |
|---|---|---|
| A. 業務アプリ | Dataverse のみ | 申請管理、設備台帳 |
| B. 業務 + 分析 | Dataverse → Fabric（Link to Fabric / Lakehouse） | 台帳の履歴分析、Power BI |
| C. 大規模分析 | Databricks（Unity Catalog + metric view + Genie） | IoT テレメトリ、需要予測 |
| D. オントロジー | Fabric Lakehouse + Fabric IQ Ontology | 設備・拠点・作業指示の関係探索 |
| E. 根拠付きエージェント | 任意の基盤 + Foundry IQ | 異常設備の特定 + 手順書の引用 |

## 3. エージェント接続（MCP）

どの基盤も MCP で公開でき、Cowork / Copilot Studio / Foundry Agent から同じ方式で接続する。

| 基盤 | MCP | 公開先スキル |
|---|---|---|
| Dataverse | Dataverse MCP（環境の `allowedmcpclients`） | cowork / copilot-studio-v2 |
| Fabric IQ Ontology | Ontology MCP エンドポイント | cowork / copilot-studio / ai-teammate |
| Databricks | managed MCP（Genie Agent / Databricks SQL） | copilot-studio / ai-teammate |
| Foundry IQ | knowledge base MCP（`knowledge_base_retrieve`） | copilot-studio / ai-teammate |
| 上記以外（基幹 DB・ファイル） | 自前 MCP Server | [mcp-server スキル](../../mcp-server/SKILL.md) |

## 4. 機械的な判定

ヒアリング結果を JSON にして [recommend_platform.py](../../data-platform/scripts/recommend_platform.py) に渡すと、
4 役割の決定・理由・未決事項・委譲先スキルを含む契約 `spec/data-platform.json` を出力する。
重み付けの正本は [capability-matrix.json](../../data-platform/references/capability-matrix.json)。

```powershell
python .github/skills/data-platform/scripts/recommend_platform.py --requirements spec/data-requirements.json --out spec/data-platform.json
```

`needsDecision` が空でない場合は、候補が拮抗している。AskUserQuestion で確認してから実装へ進む。

## 5. 選定後の委譲

| 決定 | 次に使うスキル |
|---|---|
| Dataverse | [dataverse](../../dataverse/SKILL.md) |
| Fabric / Databricks / Foundry IQ | [data-platform](../../data-platform/SKILL.md) |
| スキーマ変換・データ投入・照合 | [data-migration](../../data-migration/SKILL.md) |
| MCP の公開・登録 | cowork / copilot-studio / copilot-studio-v2 / ai-teammate / mcp-server |
