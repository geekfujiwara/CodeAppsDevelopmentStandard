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
