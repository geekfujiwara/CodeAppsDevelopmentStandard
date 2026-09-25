# data-migration 設計

## 1. 目的と責務

CSV / JSON などの既存データを、data-platform または dataverse が用意した先へ **スキーマ変換 → 検証 → 投入 → 照合**する。
「どの列をどの型で、どのキーで、どの順に入れるか」を 1 つのマッピング契約に固定し、同じ入力なら何度実行しても同じ結果になるようにする。

| 責務 | 担当 |
|---|---|
| ソースのプロファイル（型推定・NULL 率・一意性・キー/外部キー候補） | **data-migration** |
| マッピング契約の生成と検証 | **data-migration** |
| データ投入（upsert / merge / 全件ロード）と照合 | **data-migration** |
| 投入先の作成（Dataverse テーブル、Databricks catalog、Fabric Lakehouse） | dataverse / data-platform |
| 投入後のセマンティック層・MCP 検証 | data-platform |

## 2. 処理の流れ

```text
source files ──profile_source.py──► profile.json
profile.json ──build_mapping.py───► mapping.json（利用者がレビュー・修正）
mapping.json + source ──migrate_data.py plan──► plan.json（検証結果 + planHash）
plan.json ──利用者承認──► migrate_data.py apply --approve-hash
plan.json ──migrate_data.py verify──► reconcile.json（件数・キー集合・列値ハッシュ）
```

## 3. マッピング契約

詳細は [mapping-contract.md](mapping-contract.md)。要点:

- `target.kind` は `dataverse` / `databricks` / `fabric-lakehouse`。
- 各テーブルは **業務キー（`key`）必須**。サロゲートキーだけのテーブルは冪等に投入できないため受け付けない。
- 外部キーは `relationships` に宣言し、`loadOrder` は親 → 子のトポロジカル順で自動計算する。循環はエラー。
- 識別子（テーブル名・列名）は正規表現で検証し、SQL・URL に埋め込む値は必ずパラメーター化またはエスケープする。

## 4. 投入方式

| 投入先 | 方式 | 冪等性 |
|---|---|---|
| Dataverse | Web API の代替キー upsert（`PATCH {set}({key}='{value}')`）、Lookup は代替キー参照の `@odata.bind` | 代替キー単位で冪等。代替キー未定義なら `blocked` |
| Databricks | SQL Statement Execution API で `CREATE TABLE IF NOT EXISTS` → `MERGE INTO`（名前付きパラメーター） | 業務キー単位で冪等 |
| Fabric Lakehouse | 正規化 CSV を OneLake `Files/` へアップロード → Load Table（`Overwrite`、preview API） | テーブル全件の置換で冪等 |

## 5. 安全モデル

1. `plan` は読み取りだけ。ソースを検証し、エラーが 1 件でもあれば計画を出さない（終了コード 2）。
2. `planHash` はマッピング・ソース内容ハッシュ・投入先を含む。ソースを 1 バイトでも変えると hash が変わる。
3. `apply` は hash を再計算し、一致しなければ何も書き込まない。
4. `verify` は投入先から読み戻して、件数・キー集合・列値ハッシュを比較する。Lakehouse はテーブル存在のみ `verified`、件数は SQL analytics endpoint 未接続のため `not-tested` と明示する。
5. 削除（ソースから消えた行の削除）は行わない。差分は `verify` の `extraKeys` として報告する。

## 6. 検証ルール

| ルール | 内容 |
|---|---|
| 業務キー | NULL 不可、重複不可 |
| 必須列 | `required: true` の列に NULL / 空文字が無い |
| 型変換 | すべての値が宣言型に変換できる（整数・小数・真偽・日付・日時・文字列） |
| 文字列長 | `maxLength` を超えない |
| 参照整合性 | 子の外部キー値が親の業務キー集合に存在する |
| 識別子 | `^[A-Za-z_][A-Za-z0-9_]{0,127}$`（Dataverse は小文字 + prefix） |

## 7. 既知の注意点

- Dataverse の `$filter` リテラルに `+`（ISO 8601 の `+00:00` 等）を含めると空白扱いになる。値は URL エンコードする。
- 日本語を含む本文は `Content-Type: application/json; charset=utf-8` で送る。
- Databricks は 1 ステートメントあたりのパラメーターが 1,000 個以内になるよう行を分割して `MERGE` する。
- Fabric Load Table はテーブル名 `^(?=[0-9]*[a-zA-Z_])[a-zA-Z0-9_]{1,256}$`、パスは `Files/...` に制限される。
