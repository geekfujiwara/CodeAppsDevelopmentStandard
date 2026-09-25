---
name: data-platform
description: "architecture で選定したデータ基盤（Microsoft Fabric / Azure Databricks / Foundry IQ）を、事前確認 → plan と hash 承認 → デプロイ → セマンティック層 → runtime 検証 → 計算停止まで API で構築し、MCP 接続情報を Cowork / Copilot Studio / Foundry へ引き渡す。Dataverse は dataverse スキル、データ投入は data-migration スキルへ委譲する。"
category: data
triggers:
  - "データ基盤を構築"
  - "Fabric を構築"
  - "Fabric capacity"
  - "Fabric IQ"
  - "Fabric Ontology"
  - "オントロジー"
  - "Lakehouse"
  - "Databricks を構築"
  - "Databricks Genie"
  - "metric view"
  - "SQL warehouse"
  - "Foundry IQ"
  - "ナレッジベース"
  - "knowledge base MCP"
  - "データ基盤の MCP"
  - "計算リソースを止める"
---

# データ基盤構築スキル（Fabric / Databricks / Foundry IQ）

architecture の §6.6 で決めたデータ基盤を、**すべて API で**構築・検証する。
Foundry IQ はデータストアではなく、文書やオントロジーを根拠付きでエージェントに渡す knowledge layer として扱う。

| 原則 | 内容 |
|---|---|
| 役割ごとに選ぶ | system of record / analytics / semantic / knowledge を別々に決める（[選定ガイド](../architecture/references/data-platform-selection.md)） |
| 1 基盤 = 1 リソースグループ | Databricks の managed RG は Databricks が作るので事前作成しない |
| 変更は hash 承認 | `plan` → `planHash` を提示 → `apply --approve-hash`。削除はスキルに含めない |
| 実測で判定 | HTTP 200・リソース存在・MCP の initialize だけで成功にしない。業務の正解まで確認する |
| キーレス | Entra トークン（standard の `auth_helper`）とロールで認可する。API キー・PAT を使わない |
| コストを止める | 検証後は必ず `manage_compute.py stop` を実行し、常時課金されるリソースを報告する |

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [設計](references/design.md) | 責務分担、契約、状態分類、安全モデル、認証スコープ |
| [テスト計画](references/test-plan.md) | Unit / Contract / Live / E2E の ID と合格基準 |
| [Microsoft Fabric](references/fabric.md) | capacity・workspace・Lakehouse・Ontology item・Ontology MCP |
| [Azure Databricks](references/databricks.md) | workspace・SQL warehouse・metric view・Genie・managed MCP |
| [Foundry IQ](references/foundry-iq.md) | Search・knowledge source・knowledge base・retrieve / MCP |
| [Dataverse への委譲](references/dataverse.md) | system of record が Dataverse の場合の担当範囲 |
| [MCP 公開](references/mcp-exposure.md) | 基盤ごとの MCP エンドポイントと公開先スキル |
| [capability-matrix.json](references/capability-matrix.json) | 基盤選定の重みと MCP テンプレート（正本） |
| [.env サンプル](references/.env.example) | 本スキルのパラメータ |
| [異常系・トラブルシュート](references/troubleshooting.md) | 実際に踏んだ失敗と恒久対策 |

## ワークフロー（正常系）

スクリプトはすべて `.github/skills/data-platform/scripts/` にある。以下では `$dp` と略す。

```powershell
$dp = ".github/skills/data-platform/scripts"
```

### Step 1: 選定契約を確定する

`spec/data-platform.json` が無ければ、architecture のヒアリング結果から作る。

```powershell
python $dp/recommend_platform.py --requirements spec/data-requirements.json --out spec/data-platform.json
```

終了コード 3（`needsDecision` あり）なら、候補と理由を AskUserQuestion で提示して確定する。
`decision.systemOfRecord` が `dataverse` の部分は [dataverse スキル](../dataverse/SKILL.md) に渡す。

### Step 2: 事前確認をまとめて行う

[standard の共通事前確認契約](../standard/SKILL.md#共通の事前確認契約会話の最初に-1-回だけ)に加え、**1 回の AskUserQuestion** で確認する。

| # | 確認事項 | 合格条件 |
|---|---|---|
| 1 | subscription・region・名前 prefix | `.env` の `AZURE_SUBSCRIPTION_ID` / `DP_LOCATION` / `DP_NAME_PREFIX` が確定 |
| 2 | 課金の承認 | Fabric capacity・Databricks warehouse・AI Search・モデルの概算と停止方法に合意 |
| 3 | 権限 | 対象 subscription の Contributor + User Access Administrator 相当、Fabric capacity 管理者 UPN |
| 4 | テナント設定 | Fabric IQ Ontology（preview）が有効、Databricks の serverless SQL が利用可能 |
| 5 | データ分類 | 投入データに個人情報・機密情報が含まれるか、公開先（Copilot Studio / Cowork / Foundry）の利用者範囲 |

続けて読み取り専用の preflight を実行する。`blocked` があれば解消するまで次へ進まない。

```powershell
python $dp/preflight_platform.py --platform fabric --platform databricks --platform foundry --out .data-platform/preflight.json
```

### Step 3: デプロイ計画を作り、承認を得る

基盤ごとに計画を作る。既存 RG がある場合は `--validate` で ARM validate まで行う。

```powershell
python $dp/deploy_platform.py plan --platform databricks --validate
```

出力の `planHash`・リソースグループ・パラメータを利用者に提示し、明示承認を得る。

### Step 4: デプロイし、read-back で確定する

```powershell
python $dp/deploy_platform.py apply --plan .data-platform/plan-databricks.json --approve-hash <planHash>
```

出力の ID（Fabric workspace / Lakehouse / Ontology、Databricks host / warehouse、Search endpoint）を `.env` に転記する。
`status` が `verified` でなければ [troubleshooting](references/troubleshooting.md) を参照する。

### Step 5: データを投入する

スキーマ変換・投入・照合は [data-migration スキル](../data-migration/SKILL.md) で行う。
Databricks は `DATABRICKS_CATALOG` のスキーマ、Fabric は Lakehouse、Dataverse は dataverse スキルで作ったテーブルが投入先になる。

### Step 6: セマンティック層を構成する

仕様ファイル（例: [cold-chain-semantics.json](references/samples/cold-chain-semantics.json)）から計画を作り、承認後に適用する。

```powershell
python $dp/configure_semantics.py plan --target databricks-genie --spec spec/semantics.json
python $dp/configure_semantics.py apply --plan .data-platform/plan-databricks-genie.json --approve-hash <planHash>
python $dp/configure_semantics.py plan --target foundry-kb --spec spec/semantics.json --with-fabric-ontology
```

Fabric IQ Ontology の entity / relationship / binding は公開オーサリング API が無いため、
[ブラウザ自動化方針](../standard/references/browser-automation.md)に従い、Edge プロファイルを確認してから統合ブラウザで構成する（手順は [fabric.md](references/fabric.md)）。

### Step 7: runtime を検証する

業務の正解（[期待値](references/samples/cold-chain-expected.json)）まで実測し、合格した MCP だけを接続情報として書き出す。

```powershell
python $dp/verify_platform.py --check all --spec spec/semantics.json --emit-mcp spec/mcp-endpoints.json --out .data-platform/verify.json
```

`blocked` / `failed` / `not-tested` は理由付きで報告する。空の Ontology への質問は `blocked` になる（正常）。

### Step 8: MCP を公開先スキルへ引き渡す

`spec/mcp-endpoints.json` を公開先スキルへ渡す。対応は [mcp-exposure.md](references/mcp-exposure.md)。

| 公開先 | スキル |
|---|---|
| Copilot Studio | [copilot-studio](../copilot-studio/SKILL.md) / [copilot-studio-v2](../copilot-studio-v2/SKILL.md) |
| Cowork | [cowork](../cowork/SKILL.md) |
| Foundry Agent / Teams | [ai-teammate](../ai-teammate/SKILL.md) |

公開後は、公開先の実利用者 ID で [テスト計画 §6](references/test-plan.md#6-e2e-テストmcp-クライアント) を実行する。

### Step 9: 計算を停止し、残る課金を報告する

```powershell
python $dp/manage_compute.py stop --target all
```

Fabric `Paused`、warehouse `STOPPED` を確認し、停止できない課金（AI Search の時間課金、Databricks managed RG の NAT Gateway・Public IP、モデルのトークン従量）を利用者に報告する。
