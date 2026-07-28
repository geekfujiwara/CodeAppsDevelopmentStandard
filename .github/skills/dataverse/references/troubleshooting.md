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

## 13. Windows PowerShell でログをファイルにリダイレクトすると日本語が文字化けする（`-Encoding UTF8` で読んでも直らない）

### 症状

`python -u setup_dataverse.py *> setup_dataverse.log` のように `*>`/`>` でファイルへ
リダイレクトすると、ログ中の日本語（テーブル名の日本語表示名や進捗メッセージ）が
`繝・・繝悶Ν` のような文字化けになる。スクリプト側は `sys.stdout.reconfigure(encoding="utf-8", ...)`
で UTF-8 出力しているにもかかわらず発生し、`Get-Content -Encoding UTF8` で読み直しても直らない。

### 原因

Windows PowerShell（特に 5.1）の `*>`/`>` リダイレクトは、子プロセスの標準出力ストリームを
**一度コンソールの既定コードページ（多くの日本語環境で cp932）でデコードしてから**
ファイルへ書き出す。子プロセスが UTF-8 バイト列を出力していても、この中間デコードの時点で
文字化けが発生し、ファイル自体に不可逆な破損が書き込まれる。そのため読み直し時に
`-Encoding UTF8` を指定しても元には戻らない。

### 対処

スクリプト実行前に `chcp 65001` でコンソールのコードページを UTF-8 に切り替える。

```powershell
chcp 65001
python -u setup_dataverse.py *> setup_dataverse.log
```

これによりリダイレクト経路の中間デコードも UTF-8 になり、文字化けを防げる。
なお、この文字化けは表示上の問題であり、Dataverse API 呼び出しやテーブル／列の作成結果
そのものには影響しない（あくまでログの可読性の問題）。

