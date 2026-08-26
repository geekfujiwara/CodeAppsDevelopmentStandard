# Dataverse OData API トラブルシューティング

Dataverse Web API / OData 操作で頻出する問題と対処法。
Python スクリプト（`auth_helper.py` 経由）および Code Apps SDK 共通。

---

## 1. ナビゲーションプロパティ名の大文字小文字が不正確で 400 エラー

### 症状

`PATCH` でルックアップ列にレコードを紐付ける際、HTTP 400 エラーが返る:
```
An undeclared property 'msdyn_iotalert' which only has property annotations
in the payload but no property value was found in the payload.
```

### 原因

`@odata.bind` のナビゲーションプロパティ名の **大文字小文字が正確でない**。
OData のバインド構文では、スキーマ定義上の正確なプロパティ名が必要。

```json
// ❌ 小文字のみ — 400 エラー
{ "msdyn_iotalert@odata.bind": "/msdyn_iotalerts(xxx)" }

// ✅ スキーマ通りの大文字小文字 — 成功
{ "msdyn_IoTAlert@odata.bind": "/msdyn_iotalerts(xxx)" }
```

### 正しいプロパティ名の調べ方

EntityDefinitions API で `ManyToOneRelationships` を照会する:

```python
GET /api/data/v9.2/EntityDefinitions(LogicalName='{entity}')/ManyToOneRelationships
  ?$filter=ReferencedEntity eq '{target_entity}'
  &$select=SchemaName,ReferencingEntityNavigationPropertyName,ReferencingAttribute
```

**`ReferencingEntityNavigationPropertyName`** が `@odata.bind` で使うべき正確な名前。

### よくある例

| エンティティ | ルックアップ先 | ナビゲーションプロパティ名 |
|---|---|---|
| incident | msdyn_iotalert | `msdyn_IoTAlert` |
| msdyn_workorder | msdyn_iotalert | `msdyn_IoTAlert` |
| msdyn_iotalert | msdyn_customerasset | `msdyn_CustomerAsset` |
| msdyn_iotalert | incident | `msdyn_Case` |

---

## 2. IoT アラートのリレーション構造（多経路データ取得）

### 背景

IoT アラートは複数のテーブルから参照されるため、1 つのクエリパスだけでは取得漏れが発生する。

### リレーション構造

```
IoTAlert ──→ CustomerAsset   (_msdyn_customerasset_value)
IoTAlert ──→ Incident         (_msdyn_case_value)
Incident ──→ IoTAlert         (_msdyn_iotalert_value)
WorkOrder ──→ IoTAlert        (_msdyn_iotalert_value)
```

### 完全な取得パターン（3 ルートマージ）

```typescript
// パス 1: 資産に直接紐づく IoT アラート
const directAlerts = await getIoTAlertsByAsset(assetId);

// パス 2: 作業指示書経由の IoT アラート ID
const woIotIds = workOrders
  .map(wo => wo._msdyn_iotalert_value)
  .filter(Boolean);

// パス 3: サポート案件経由の IoT アラート ID
const incidentIotIds = incidents
  .map(inc => inc._msdyn_iotalert_value)
  .filter(Boolean);

// 全 ID をマージして一括取得（重複排除）
const allIds = [...new Set([...woIotIds, ...incidentIotIds])];
const linkedAlerts = await getIoTAlertsByIds(allIds);

// マージ（パス 1 + パス 2,3）
const merged = new Map();
directAlerts.forEach(a => merged.set(a.msdyn_iotalertid, a));
linkedAlerts.forEach(a => { if (!merged.has(a.msdyn_iotalertid)) merged.set(a.msdyn_iotalertid, a); });
```

---

## 3. エンティティリレーションシップの調査パターン

### 特定テーブルのルックアップ列一覧を取得

```python
# ManyToOne（N:1）リレーションシップを取得
GET /api/data/v9.2/EntityDefinitions(LogicalName='{entity}')/ManyToOneRelationships
  ?$select=SchemaName,ReferencedEntity,ReferencingAttribute,
           ReferencingEntityNavigationPropertyName,
           ReferencedEntityNavigationPropertyName
```

### 特定テーブル間のリレーションシップを検索

```python
# incident → msdyn_iotalert の関係を調べる
GET /api/data/v9.2/EntityDefinitions(LogicalName='incident')/ManyToOneRelationships
  ?$filter=ReferencedEntity eq 'msdyn_iotalert'
  &$select=SchemaName,ReferencingEntityNavigationPropertyName,ReferencingAttribute
```

### 逆方向（OneToMany）の確認

```python
GET /api/data/v9.2/EntityDefinitions(LogicalName='{entity}')/OneToManyRelationships
  ?$filter=ReferencingEntity eq '{child_entity}'
  &$select=SchemaName,ReferencedEntityNavigationPropertyName
```

---

## 4. PowerShell + Python 実行時の f-string エスケープ問題

### 症状

PowerShell で `python -c "..."` を実行すると、Python の f-string 内の `{}`
が PowerShell の ScriptBlock と解釈されてエラーになる:

```
python.exe: ScriptBlock should only be specified as a value of the Command parameter.
```

### 対処

複雑な Python コードはインラインではなくスクリプトファイルを作成して実行する:

```bash
# ❌ インライン実行 — {} がPowerShellに解釈される
python -c "print(f'value={x}')"

# ✅ スクリプトファイル経由
python scripts/check_data.py
```

### 適用範囲

- Dataverse API 調査スクリプト
- デモデータ投入スクリプト
- エンティティメタデータ確認スクリプト

---

## 5. 既存テーブルを再利用せず重複作成して二重管理になる

### 症状

顧客・製品・ユーザーなど、すでに標準/既存テーブルがあるのにカスタムテーブルを新規作成し、
データが 2 カ所に分散してレポート・検索が不整合になる。

### 原因

設計前に環境スキャンをしていない。「顧客 = account/contact」「製品 = product」「ユーザー = systemuser」
という標準テーブルの存在を見落としている。

### 対処

- 設計前に `scan_environment.py` を実行し、再利用レポートをユーザーと合意する。
- ユーザー参照は `ownerid`/`createdby`/`modifiedby` システム列＋`systemuser` Lookup。
- 顧客参照は customer 型 Lookup（account/contact ポリモーフィック）。

---

## 6. 標準テーブルの EntitySetName / NavProp を推測して失敗

### 症状

標準テーブルへの Lookup やクエリで `account` → `accounts` のように推測したが、
`contact` → `contacts`、`opportunity` → `opportunities` など複数形が不規則で 404/400 になる。

### 対処

EntitySetName と NavProp は必ず API から取得する（推測しない）。

```python
# EntitySetName
api_get("EntityDefinitions(LogicalName='opportunity')?$select=EntitySetName")
# NavProp（customer 型は account/contact で別名）
api_get("EntityDefinitions(LogicalName='opportunity')/ManyToOneRelationships"
        "?$filter=ReferencedEntity eq 'account'&$select=ReferencingEntityNavigationPropertyName")
```

---

## 7. customer 型 Lookup の @odata.bind で account/contact の別名を誤る

### 症状

customer 型（account/contact ポリモーフィック）の Lookup を設定する際、
`{lookup}@odata.bind` だけで設定しようとして 400 エラーになる。

### 対処

customer 型は**ターゲット型ごとの別名 NavProp** を使う。

```json
// account を指す
{ "{prefix}_customerid_account@odata.bind": "/accounts({id})" }
// contact を指す
{ "{prefix}_customerid_contact@odata.bind": "/contacts({id})" }
```

正確な別名は `ManyToOneRelationships` の `ReferencingEntityNavigationPropertyName` で確認する。

---

## 8. `ThreadPoolExecutor` 並行構築中の一時的なネットワーク切断／スロットリングでビルド全体が停止する

### 症状

14 テーブル×多数列を `ThreadPoolExecutor` で並行構築する長時間バッチの途中で、
`requests.exceptions.ConnectionError`（`RemoteDisconnected`）や `429 Too Many Requests` が
1 回発生しただけでスクリプト全体が異常終了する。`retry_metadata()` は
「既に存在（スキップ）」「メタデータロック競合（"another"+"running"）」しかリトライ対象にしておらず、
一時的なネットワーク断・スロットリングは想定外エラーとして即座に再送出されていた。

### 原因

`retry_metadata()`（`auth_helper.py`）の例外分岐が固定 4 パターンのみで、
Dataverse API 呼び出し数が多い一括構築では避けられない下記のエラー種別に対応していなかった:

- `requests.exceptions.ConnectionError` / `Timeout`（"Connection aborted", "Remote end closed connection" 等）
- HTTP `429`（スロットリング）/ `503`（一時的な過負荷）

### 対処（`auth_helper.py` の `retry_metadata()` に恒久対応済み）

`already exists` / ロック競合の既存分岐に加え、以下 2 分岐を追加する。

```python
# --- 一時的なネットワーク切断 → リトライ ---
if isinstance(
    exc, (requests.exceptions.ConnectionError, requests.exceptions.Timeout)
) or "remote end closed connection" in detail_lower:
    wait = 10 * (attempt + 1)
    time.sleep(wait)
    continue

# --- スロットリング（429 / 503）→ Retry-After を尊重してリトライ ---
status_code = exc.response.status_code if isinstance(exc, requests.HTTPError) and exc.response is not None else None
if status_code in (429, 503) or "429 client error" in detail_lower:
    retry_after = exc.response.headers.get("Retry-After") if isinstance(exc, requests.HTTPError) and exc.response is not None else None
    wait = int(retry_after) if retry_after else 15 * (attempt + 1)
    time.sleep(wait)
    continue
```

これにより、長時間の一括メタデータ構築でも一時的な通信エラー／スロットリングで
スクリプト全体がクラッシュせず、自動的にリトライして完走できる。

---

## 9. Decimal 型列の `maxValue` が Dataverse の上限を超えて `0x80040203`（Min/max out of range）

### 症状

金額系の Decimal 列（例: 1 兆円を上限にしたい `金額(円)` 列）を作成すると
`400 Bad Request` + `{"error":{"code":"0x80040203","message":"Min/max values are out of range"}}` になる。

### 原因

Dataverse の Decimal 属性がサポートする値の範囲は **-100,000,000,000 〜 100,000,000,000（1000億）** まで。
`maxValue: 1000000000000`（1 兆）のように 1000 億を超える値を指定すると作成に失敗する。

### 対処

金額系 Decimal 列の `maxValue` は 1000 億（`100000000000`）以内に収める。
それ以上の桁が必要な場合は「百万円単位」等の縮小した単位で保持する（本プロジェクトの
`出資簿価(百万円)` 列がこのパターン）。

**恒久対応（★ `setup_dataverse.py` に実装済み）**: `TABLES` 定義から API 呼び出し前に
`validate_tables()` が Decimal/Integer の値域・String/Memo の `maxLength` を静的検証し、
上限超過があれば Step 1 の前（=ネットワーク呼び出し前）にエラーで停止する。これにより、
並行構築の途中で一部のテーブルだけ作成された不完全な状態で失敗する事故を防げる。

---

## 10. 標準テーブル（`systemuser` 等）への Lookup 追加で `SchemaName` がプレフィックス不正エラーになる

### 症状

`systemuser` のような標準テーブルにカスタム Lookup 列を追加する際、
`RelationshipDefinitions` への POST が `400 Bad Request` +
`{"error":{"code":"0x80044366","message":"...must start with a valid customization prefix..."}}` になる。

### 原因

Lookup（1:N リレーション）の `SchemaName` を `f"{from_table}_{column_logical}"` のように機械的に組み立てると、
`from_table` が `systemuser` のような標準テーブルの場合はプレフィックスの付いていない文字列
（例: `systemuser_geek_organizationid`）になり、Dataverse のカスタマイズプレフィックス検証に失敗する。

### 対処

`SchemaName` を組み立てる際、`from_table` がカスタマイズプレフィックスで始まっていなければ明示的に付与する。

```python
from_schema = l["from_table"] if l["from_table"].startswith(PREFIX) else f"{PREFIX}_{l['from_table']}"
body["SchemaName"] = f"{from_schema}_{l['column_logical']}"
```

---

## 11. stdout をファイルにリダイレクトすると絵文字 `print()` が `UnicodeEncodeError` でクラッシュする（Windows）

### 症状

スクリプトの標準出力を PowerShell の `*>` でログファイルにリダイレクトして実行すると、
エラーハンドラの `print(f"❌ {msg}")` 等が
`UnicodeEncodeError: 'cp932' codec can't encode character '\u274c'` で失敗し、
**本来の原因より先にこの二次エラーで異常終了する**（原因の隠蔽）。

### 原因

Windows で stdout が非 tty（ファイルリダイレクト）になると、Python はコンソールの UTF-8 ではなく
**システムロケール（cp932 = Shift-JIS）** をデフォルトエンコーディングとして使う。
絵文字（`❌` 等）は cp932 で表現できない文字のため出力時に例外になる。

### 対処

スクリプト冒頭で stdout/stderr を明示的に UTF-8 に固定する（`errors="replace"` で万一の非対応文字も潰す）。

```python
try:
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
except AttributeError:
    pass
```

ログファイルを `Get-Content` で確認する際も、既定のロケールではなく `-Encoding UTF8` を付ける
（`Get-Content log.txt -Encoding UTF8`）と文字化けを避けられる。

---

## 12. エラーメッセージにレスポンスボディを含めないと 400 系エラーの原因究明ができない

### 症状

`str(exc)` だけを使ったエラーメッセージは `400 Client Error: Bad Request for url: ...` としか表示されず、
実際の失敗理由（属性名重複・値域超過・プレフィックス不正等）が分からない。
特に `ThreadPoolExecutor` での並行実行時や、`retry_metadata` を呼び出す側がループを
`try/except` で囲わずに丸ごと失敗させている箇所（Lookup 作成ループ等）では、
最初の 1 件のエラーで残り全件の処理が止まり、かつ原因も分からないまま終了する。

### 対処

- 例外を捕捉する箇所では `requests.HTTPError` の `exc.response.text`（レスポンスボディ）を
  必ずログに含める。
- ループ処理は 1 件ずつ `try/except` で捕捉してエラーを蓄積し、**最後まで処理を続行**してから
  まとめて `RuntimeError` を送出する（`create_tables()` の並行実行と同じパターンを、
  逐次処理の `create_lookups()` にも適用する）。

```python
except Exception as exc:
    detail_text = ""
    resp = getattr(exc, "response", None)
    if resp is not None:
        try:
            detail_text = f"\n  詳細: {resp.text}"
        except Exception:
            pass
    msg = f"... の作成でエラー: {exc}{detail_text}"
    print(f"  ❌ {msg}")
    errors.append(msg)
```

このパターンにより、1 回のスクリプト実行で「どのテーブル／列／Lookup が失敗したか」と
「なぜ失敗したか」が同時に分かり、修正→再実行（べき等）のサイクルを最短で回せる。

---

## 13. Windows PowerShell でログをファイルにリダイレクト/`Tee-Object`すると日本語が文字化けする（`chcp 65001` だけでは直らない）

### 症状

`python -u setup_dataverse.py *> setup_dataverse.log` や
`python -u setup_dataverse.py 2>&1 | Tee-Object -FilePath log.txt` のように出力を
リダイレクト/`Tee-Object`すると、ログ中の日本語（テーブル名の日本語表示名や進捗メッセージ、
`auth_helper` のログ等）が `繝・・繝悶Ν` のような文字化けになる。スクリプト側は
`sys.stdout.reconfigure(encoding="utf-8", ...)` で UTF-8 出力しているにもかかわらず発生し、
実行前に `chcp 65001` を実行していても直らないことがある（`Get-Content -Encoding UTF8` で
読み直しても直らない）。

### 原因

`chcp 65001` は Windows の**コンソールの既定コードページ**を切り替えるだけで、
PowerShell（特に pwsh 7.x を含む）が子プロセスの出力を解釈する際に使う
**`[Console]::OutputEncoding`（.NET プロパティ）には自動反映されない**。
そのため `chcp 65001` 実行後でも `[Console]::OutputEncoding` が cp932（Shift-JIS）の
ままになっていることがあり、この場合 Python が UTF-8 で出力したバイト列を PowerShell が
cp932 として誤ってデコードして文字化けする。実際に確認された値の例:
```powershell
> [Console]::OutputEncoding
EncodingName : Japanese (Shift-JIS)   # chcp 65001 実行後でもこのままのことがある
```

### 対処

`chcp 65001` に加えて、**`[Console]::OutputEncoding` を明示的に UTF-8 へ設定**してから
Python を実行する。これが恒久対策で、`chcp` 単体より確実に直る。

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001
python -u setup_dataverse.py 2>&1 | Tee-Object -FilePath setup_dataverse.log
```

なお、この文字化けは表示上の問題であり、Dataverse API 呼び出しやテーブル／列の作成結果
そのものには影響しない（あくまでログの可読性の問題）。

---

## 14. ロック競合でリトライ上限に達しても `retry_metadata()` が例外を投げず、列/Lookup が未作成のまま後続処理が「成功扱い」で進んでしまう

### 症状

ログに `xxx: max retries (5) exceeded` と出力されるものの、呼び出し元の `try/except` で
検知されず、`errors` リストにも追加されないまま Step 4（`PublishAllXml`）まで進んでしまう。
実際にはその列/Lookup は作成されていないのに、スクリプトはエラーなく完走したように見える。

### 原因

`retry_metadata()` は「`already exists`（既に存在するので意図的にスキップ）」と
「ロック競合/ネットワークエラー/スロットリングでリトライ上限に達した（本来はエラー）」の
どちらの場合も同じ `return None` を実行していた。呼び出し元は戻り値を見ておらず、
例外が飛んでこない限り「成功した」とみなすため、後者のケースが握りつぶされていた。

複数プロセスの同時実行（本項目の直前に発見した「別プロセスが同じ環境に対して並行実行
されていた」ケース等）でロック競合が慢性化すると、この握りつぶしが頻発しやすい。

### 対処

`retry_metadata()` のリトライ上限到達時は、`already exists` スキップとは明確に区別し、
`RuntimeError` を送出する（`None` を返さない）。呼び出し元は既存の `try/except` で
このエラーを捕捉し、`errors` リストに蓄積 → ループ完走後にまとめて `RuntimeError` を送出する
（項目 6・12 のパターンと合流する）。

```python
# retry_metadata() の末尾
msg = f"{description}: max retries ({max_attempts}) exceeded"
print(f"  {msg}")
raise RuntimeError(msg)  # None を返して黙って成功扱いにしない
```

この修正により、ロック競合等でリトライを使い切った列/Lookupは確実にエラーとして検出され、
再実行（べき等）で確実に補完対象になる。

---

## 15. `pandas` の数値列を `api_post` に渡すと `TypeError: Object of type int64 is not JSON serializable` で 400 系エラーになる

### 症状

デモデータ投入ループ（`pd.read_excel()` → `iterrows()` → `api_post()`）で、ある行から
突然 `400 Bad Request` や `TypeError: Object of type int64 is not JSON serializable` が
発生する。同じパターンの他のループ（例: 直前まで問題なく完走していた別テーブルの投入）では
発生しないことがあり、原因がわかりにくい。

### 原因

`pandas` の数値列（int/float）を `row.get("Xxx")` で取り出すと、値は Python 標準の
`int`/`float` ではなく `numpy.int64`/`numpy.float64` になる。`requests` の `session.post(url, json=body)`
は内部で標準の `json` モジュールを使ってシリアライズするため、`numpy.int64`/`numpy.float64` が
`body` 内に残っていると `TypeError: Object of type int64 is not JSON serializable` で失敗する。

このエラーは `numpy`/`pandas` のバージョンや `iterrows()` の内部実装（行を Series 化する際の
dtype 昇格）によって発生タイミングが変わることがあり、「同じコードパターンの別ループでは
たまたま発生しない」ように見えることがある — が、`numpy` スカラー型が `body` に混入している
限り、いつ発生してもおかしくない潜在バグである。

### 対処

数値/日付のクレンジングを行う共通ヘルパー（`_clean()` 等）で、`numpy` スカラー型を
`.item()` でネイティブ Python 型に変換してから返す。

```python
def _clean(v):
    import numpy as np
    import pandas as pd
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, np.generic):
        return v.item()  # numpy.int64/float64/bool_ → int/float/bool
    return v
```

Excel/CSV から読み込んだ値を Dataverse Web API に渡す全てのループで、必ずこのような
クレンジング関数を経由させること（数値列を `row["Xxx"]` で直接 `body` に入れない）。

### 恒久対策（スクリプトに実装済み）

`_clean()` での変換に加え、`_post_debug()`（Step 6 の全エンティティ投入がこれを経由）内で
`_assert_json_safe(body, label)` を呼び、投入直前に `numpy.generic` 型が `body` に残っていないかを
**毎回**検証する。将来 `_clean()` を経由しない新しいフィールドが追加された場合でも、
成功する実行（正常系）を含めて必ずこのチェックが働き、明確なエラーで検出できる。

---

## 16. `Decimal` 型の上限（1000億）を超える金額を `Money` 型に変更したら、今度は `Money` のデフォルト上限（10億）で 400 エラーになる

### 症状

`Decimal` 型の列が `0x80044330`（値域外）エラーになったため `Money`（Currency）型に変更したところ、
今度は次のようなエラーになる:
```
A validation error occurred for geek_shipment.geek_amountjpy. The value 26036836560 of type
Microsoft.Xrm.Sdk.Money is outside the valid range(0 to 1000000000).
```

### 原因

Dataverse の `MoneyAttributeMetadata` は `MinValue`/`MaxValue` を明示しないと
**デフォルトで 0～10億（1,000,000,000）** に制限される。`Decimal`（デフォルト上限1000億）より
むしろ狭いデフォルト値のため、単純に型だけ `Money` に変えても解決しない。

### 対処

列作成 JSON ボディに `MinValue`/`MaxValue` を明示的に指定する（`Money` の実際のプラットフォーム
上限は約 ±922,337,203,685,477 と `Decimal` よりはるかに広い）。

```python
elif col["type"] == "Money":
    base["@odata.type"] = "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
    base["Precision"] = col.get("precision", 2)
    base["MinValue"] = col.get("minValue", 0)
    base["MaxValue"] = col.get("maxValue", 1_000_000_000_000)  # 明示しないと10億に制限される
```

型を `Decimal` → `Money` に変更する場合、既存の列は削除して作り直す必要がある
（メタデータ更新で型変更は不可）。列削除時は当該列を含む既存レコードの値が失われるため、
影響を受けるレコードも合わせて削除するか、削除前に値を退避しておくこと。

### 恒久対策（スクリプトに実装済み）

`build_column_body()` の `Money` 分岐は `MinValue`/`MaxValue` を必ず明示するようにし、
`DATAVERSE_LIMITS["Money"]` を追加して `validate_tables()`（Step 0・API 呼び出し前の静的検証）でも
Money 列の上限を毎回チェックする。さらに `validate_demo_data_ranges()`（Step 6 開始直前）で
Excel 実データの min/max を `TABLES` 定義の Decimal/Money 上限と突き合わせ、実データが
スキーマ上限を超えていれば投入ループに入る前に明確なエラーで停止する（正常系でも毎回実行）。

---

## 17. デモデータ投入ループ（Step 6 等）に既存チェックを入れず「べき等でない」まま運用すると、途中失敗からの再実行で重複行が生まれる

### 症状

大量行を `api_post()` で連続投入するループ（テーブル/Lookup 作成とは別に、デモデータ本体を
投入するループ）が途中の行でエラー停止した後、原因を直して再実行すると、既に投入済みだった
先頭側の行が再度 `api_post()` され、Dataverse 上に重複レコードが作られてしまう。

### 原因

テーブル/Lookup 作成側（Step 2/3）は「既存なら DisplayName 等で存在チェックしてスキップ」する
べき等設計になっていたが、行データ投入側（Step 6）は「毎回 for ループで無条件に `api_post()`」
という設計のままだった。途中で失敗して再実行する運用が前提の Excel 一括投入スクリプトでは、
データ本体のループも必ずべき等化しておく必要がある。

### 対処

投入対象のコード列（自然キー、例: `geek_code`）で **投入前に一括で既存 code→id を取得**し、
ループ内で「既に存在すればその id を使い回してスキップ、無ければ新規作成」するパターンに変更する。

```python
def _prefetch_codes(entity_set: str, id_attr: str, code_attr: str = f"{PREFIX}_code") -> dict:
    """既存レコードの code→id マッピングを一括取得する。"""
    resp = api_get(f"{entity_set}?$select={id_attr},{code_attr}&$top=5000")
    return {rec[code_attr]: rec[id_attr] for rec in resp.get("value", []) if rec.get(code_attr)}

existing = _prefetch_codes(entity_set, f"{PREFIX}_xxxid")
for _, row in df.iterrows():
    code = row["XxxID"]
    if code in existing:
        ids[code] = existing[code]
        continue
    ids[code] = api_post(entity_set, body)
```

この対処により、Excel 一括投入スクリプト全体（テーブル/Lookup 作成 ～ デモデータ本体）が
一貫して「何度失敗して再実行しても安全」なべき等スクリプトになる。

### 恒久対策（スクリプトに実装済み）

Step 6 の全 15 エンティティ投入ループ（division/organization/group/counterparty/commodity/
site/route/altroute/systemuser/contract/shipment/investment/creditline/event/eventimpact）が
`_prefetch_codes()` による既存チェックを経由する構成になっており、正常系（何も失敗していない
実行）で再実行しても常に「既存ならスキップ」を毎回評価する。API 呼び出しは全て `_post_debug()`
経由に統一し、`_assert_json_safe()` によるチェックも合わせて毎回働く。

---

## 18. `ThreadPoolExecutor`（並行数2）でもテーブル数が多い（10件前後）と、複数テーブルが同時にリトライ上限（5回）へ到達し、1回の実行では完走しない

### 症状

多数の既存カスタムテーブル（他ソリューションと共用の混雑した環境）で 10 個前後のテーブルを
並行数 2 で作成すると、複数のテーブル・列が同時にメタデータロック競合の `retry_metadata` 上限
（5回・最大 50秒待機）へ到達し、`Errors occurred during parallel table creation` で
スクリプトが異常終了する（実測: 10テーブル中 4テーブル/列が失敗）。項目 14 の修正により
エラー自体は正しく検出されるようになったが、**エージェント/ユーザーが手動でスクリプトを
再実行しないと完走しない**状態のままだった（スクリプトは冪等なので再実行自体は安全だが、
「自動で完走する」体験ではなかった）。

### 原因

`create_tables()` は並行実行（`ThreadPoolExecutor(max_workers=2)`）の結果、失敗した
テーブルをまとめて `RuntimeError` として送出するだけで、失敗分だけを対象にした
自動リトライは行っていなかった。混雑環境では並行実行そのものがロック競合の原因になるため、
同じ並行度で再試行しても解消しない一方、**直列（並行数1）で少し待ってから再試行すれば
高確率で成功する**（実際、手動でスクリプトを再実行した際は 2 回目で全テーブルが完成した）。

### 対処（恒久対策・`create_tables()` に実装済み）

並行実行パスの後に、失敗したテーブルだけを対象とした**直列の自動リトライパス**を追加した。
これにより、混雑環境でも 1 回のスクリプト実行内で自己修復し、ユーザーの手動再実行が
不要になる（それでも失敗した場合のみ最終的に `RuntimeError` を送出する）。

```python
# create_tables() 内: 並行実行後に失敗分だけ直列リトライ
if failed:
    print(f"⚠ {len(failed)} table(s) failed during parallel creation (lock contention). Retrying sequentially...")
    for tbl in TABLES:
        if tbl["logical"] not in failed:
            continue
        time.sleep(15)  # メタデータロックの解放を待つ
        _create_single_table(tbl)  # 失敗すれば still_failed に集約し、最後に RuntimeError
```

この恒久対策により、10 テーブル規模・混雑環境でも通常は 1 回の実行で完走するようになった。

