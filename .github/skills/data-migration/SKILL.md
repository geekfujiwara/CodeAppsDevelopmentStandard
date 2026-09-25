---
name: data-migration
description: "CSV / JSON などの既存データを Dataverse / Azure Databricks / Microsoft Fabric Lakehouse へ移行する。ソースのプロファイル → マッピング契約の生成とレビュー → 検証と hash 承認 → 冪等な投入（upsert / MERGE / 全件ロード）→ 件数・キー・列値の照合までをスクリプトで行う。投入先の作成は dataverse / data-platform スキルが担当する。"
category: data
triggers:
  - "データ移行"
  - "データ投入"
  - "既存データを取り込む"
  - "CSV を取り込む"
  - "Excel のデータを移す"
  - "スキーマ変換"
  - "マッピング"
  - "upsert"
  - "MERGE"
  - "Lakehouse にロード"
  - "移行後の照合"
  - "件数照合"
---

# データ移行スキル

既存データを、選定済みのデータ基盤へ **安全に・何度実行しても同じ結果になるように**投入する。

| 原則 | 内容 |
|---|---|
| 契約を正とする | 列・型・業務キー・参照関係を `mapping.json` に固定し、スクリプトはそれだけを読む |
| 業務キー必須 | 各テーブルに一意の業務キーを持たせ、upsert / MERGE で冪等に投入する |
| 先に全件検証 | キー重複・必須 NULL・型変換・長さ・参照整合性を投入前にすべて検出する |
| 変更は hash 承認 | `plan` の `planHash` を利用者が承認してから `apply`。ソースが変われば hash も変わる |
| 読み戻して照合 | 件数・キー集合・列値を投入先から読み戻して比較する。削除は行わない |
| パラメーター化 | SQL・URL に値を埋め込まない。識別子は正規表現で検証する |

## サブリファレンス

| リファレンス | 内容 |
|---|---|
| [設計](references/design.md) | 責務分担、処理の流れ、投入方式、安全モデル |
| [マッピング契約](references/mapping-contract.md) | `mapping.json` の仕様と型対応 |
| [テスト計画](references/test-plan.md) | Unit / Live の ID と合格基準 |
| [サンプル（cold-chain）](references/samples/cold-chain/) | 4 表・22 行。data-platform の基準質問の正解が 1 行に決まる |
| [.env サンプル](references/.env.example) | 本スキルのパラメータ |
| [異常系・トラブルシュート](references/troubleshooting.md) | 実際に踏んだ失敗と恒久対策 |

## ワークフロー（正常系）

```powershell
$dm = ".github/skills/data-migration/scripts"
```

### Step 1: 投入先と権限を確認する

1 回の AskUserQuestion で、投入先（Dataverse / Databricks / Fabric Lakehouse）、書き込み権限、
個人情報の有無、既存データを上書きしてよいかを確認する。投入先が未作成なら先に作る。

| 投入先 | 事前に必要なもの | 担当 |
|---|---|---|
| Dataverse | テーブル・列・Lookup・**業務キー列の代替キー** | [dataverse](../dataverse/SKILL.md) |
| Databricks | workspace・SQL warehouse・catalog（schema は自動作成） | [data-platform](../data-platform/SKILL.md) |
| Fabric Lakehouse | capacity（Active）・workspace・Lakehouse | [data-platform](../data-platform/SKILL.md) |

### Step 2: ソースをプロファイルする

```powershell
python $dm/profile_source.py --source-dir data/ --out spec/profile.json
```

型・NULL 数・一意性・キー候補・外部キー候補を確認する。キー候補が無いテーブルは、業務キーを利用者と決める。

### Step 3: マッピング契約を作り、レビューする

```powershell
python $dm/build_mapping.py --profile spec/profile.json --target databricks --catalog <catalog> --schema <schema> --out spec/mapping.json
```

出力の `review` を 1 件ずつ解消する（Dataverse は entitySet・代替キー・navigationProperty を dataverse スキルの定義と一致させる）。
確定した `mapping.json` を利用者に提示して合意を得る。

### Step 4: 検証して計画を作る

```powershell
python $dm/migrate_data.py plan --mapping spec/mapping.json --source-dir data/ --out .data-migration/plan.json
```

終了コード 2 なら `errors` を修正して再実行する。成功したら `planHash`・ロード順・件数を提示し、明示承認を得る。

### Step 5: 投入する

```powershell
python $dm/migrate_data.py apply --plan .data-migration/plan.json --approve-hash <planHash>
```

`blocked`（例: Dataverse の代替キー未定義）は前提を整えてから再実行する。途中で失敗しても、同じ plan の再実行で冪等に回復する。

### Step 6: 照合する

```powershell
python $dm/migrate_data.py verify --plan .data-migration/plan.json --out .data-migration/reconcile.json
```

全テーブルが `verified` になったら完了。`missingKeys` / `extraKeys` / `mismatched` を報告し、
続けて [data-platform](../data-platform/SKILL.md) の Step 6（セマンティック層）と Step 7（runtime 検証）へ進む。
