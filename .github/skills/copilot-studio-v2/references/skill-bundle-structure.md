# スキルバンドル botcomponent 構造リファレンス

フラット Python スキルを cliagent Bot へ添付する際の Dataverse 操作詳細。

## 全体像

```
bots(BOT_ID)                                    template = cliagent-1.0.0
  └─ botcomponents (type=9, InlineAgentSkill)   data: kind/content + bic:bundle マーカー
       ├─ botcomponents (type=14)  SKILL.md       filedata = 実体バイト
       ├─ botcomponents (type=14)  build_xxx.py    filedata = 実体バイト
       └─ botcomponents (type=14)  assets_b64.py   filedata = 実体バイト
```

## type=9 スキル本体の作成

```python
skill_body = {
    "name": "geek-pptx-py",
    "schemaname": f"{BOT_SCHEMA}.skill.geek_pptx_py_{hash3}",
    "componenttype": 9,
    "description": "…Use when: PowerPoint作成, スライド作成 …",
    "data": f"kind: InlineAgentSkill\r\ncontent: <!-- bic:bundle={bundle_id} -->",
    "parentbotid@odata.bind": f"/bots({BOT_ID})",
}
r = sess.post(f"{API}/botcomponents", json=skill_body, headers={"Prefer": "return=representation"})
skill_id = r.json()["botcomponentid"]
```

- `bundle_id` 例: `crskill_geek_pptx_py_zip_<12hex>`
- `data` の改行は **CRLF（`\r\n`）** で書く（ソースと同形式）

## type=14 同梱ファイルの作成 + filedata アップロード

```python
file_body = {
    "name": "SKILL.md",                       # フラットなファイル名
    "schemaname": f"geek_skill_md_{hash12}",
    "componenttype": 14,
    "parentbotid@odata.bind": f"/bots({BOT_ID})",
    "ParentBotComponentId@odata.bind": f"/botcomponents({skill_id})",  # ← Pascalケース必須
}
rr = sess.post(f"{API}/botcomponents", json=file_body, headers={"Prefer": "return=representation"})
comp_id = rr.json()["botcomponentid"]

# filedata（File 列）に単一ブロックでアップロード
sess.patch(
    f"{API}/botcomponents({comp_id})/filedata",
    data=path.read_bytes(),
    headers={"Content-Type": "application/octet-stream", "x-ms-file-name": "SKILL.md"},
)
```

## ナビゲーションプロパティ名（重要）

`botcomponent` の親系ルックアップの **正しいナビゲーションプロパティ名**:

| ルックアップ列 | ナビゲーションプロパティ | 参照先 |
|---|---|---|
| `_parentbotid_value` | `parentbotid` | `bot` |
| `_parentbotcomponentid_value` | **`ParentBotComponentId`** | `botcomponent` |
| `_parentbotcomponentcollectionid_value` | `ParentBotComponentCollectionId` | `botcomponentcollection` |

```
❌ "parentbotcomponentid@odata.bind"   → 400: undeclared property
✅ "ParentBotComponentId@odata.bind"   → OK
```

メタデータで確認する場合:

```python
url = ("EntityDefinitions(LogicalName='botcomponent')?$expand="
       "ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity)")
```

## filedata の読み取り検証

```python
dl = sess.get(f"{API}/botcomponents({comp_id})/filedata/$value")
assert dl.status_code == 200 and len(dl.content) > 0
```

## 冪等な再添付

同名スキルを作り直すときは、先に既存 type=9 とその type=14 子を削除する。

```python
q = (f"{API}/botcomponents?$select=botcomponentid&"
     f"$filter=_parentbotid_value eq {BOT_ID} and name eq '{SKILL_NAME}' and componenttype eq 9")
for comp in sess.get(q).json()["value"]:
    sid = comp["botcomponentid"]
    kids = sess.get(f"{API}/botcomponents?$select=botcomponentid&$filter=_parentbotcomponentid_value eq {sid}").json()["value"]
    for k in kids:
        sess.delete(f"{API}/botcomponents({k['botcomponentid']})")
    sess.delete(f"{API}/botcomponents({sid})")
```

## 既知のエラーと対処

| エラー | 対処 |
|---|---|
| `405 0x8004023b "Connection State is closed"` | Bot プロビジョニング直後の一時エラー。数秒待ってリトライ |
| `400 undeclared property 'parentbotcomponentid'` | `ParentBotComponentId`（Pascalケース）に修正 |
| `filedata` PATCH が 4xx | ヘッダ `x-ms-file-name` とバイナリ body を確認。大容量は分割アップロード API を検討 |
