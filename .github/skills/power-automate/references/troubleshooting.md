# power-automate — 異常系・トラブルシューティング

フロー構築・有効化の正常系は [SKILL.md](../SKILL.md) を参照。ここでは失敗時の対処をまとめる。

## 有効化失敗時のデバッグ JSON 出力（フォールバック）

有効化（`statecode` PATCH）が万一失敗した場合は、定義とエラーを JSON に書き出し、
Power Automate UI で手動有効化する。

```python
# 有効化が万一失敗した場合のフォールバック
try:
    api_patch(f"workflows({wf_id})", {"statecode": 1, "statuscode": 2})
except Exception as e:
    debug_path = "flow_definition_debug.json"
    with open(debug_path, "w", encoding="utf-8") as f:
        json.dump({"workflow_body": workflow_body, "error": str(e)}, f, ensure_ascii=False, indent=2)
    print(f"  ❌ 有効化失敗: {e}")
    print(f"  デバッグ JSON: {debug_path}")
    print("  → Power Automate UI で手動有効化してください")
    print(f"     https://make.powerautomate.com/environments/{env_id}/flows/{wf_id}")
    sys.exit(1)
```

## よくあるエラーと解決策

| エラー                                  | 原因                                           | 解決策                                                         |
| --------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `AzureResourceManagerRequestFailed`     | 接続参照なしで直接接続 ID 指定                 | Step 2 の接続参照パターンに変更                                |
| `InvalidOpenApiFlow` (0x80060467)       | 存在しないパラメータを指定                     | operationSchema を確認（body/subject 等）                      |
| `WorkflowOperationInputsApiOperationNotFound` | 存在しない operationId                   | 正しい operationId を確認（UploadFile → UpdateEntityFileImageFieldContent） |
| PowerApps API 504 GatewayTimeout        | 接続検索のタイムアウト                         | 3回リトライ + timeout=120                                      |
| Webhook トリガーが発火しない            | /start 未呼び出し                              | 有効化後に Flow API /start を呼ぶ                              |
| フロー実行時に接続エラー                | 接続が Error/Disconnected 状態                 | Power Automate UI で接続を再認証                               |
| `AppLeaseMissing` / `ConnectionNotFound` | 環境が変わった / 接続 ID が古い               | PowerApps API で毎回 Connected 接続を検索                     |
| Copilot Studio のツール一覧にフローが出ない | トリガーが `kind: PowerAppV2`               | `kind: VirtualAgent` に変更（応答も `kind: VirtualAgent`）     |
| `DirectApiAuthorizationRequired` / `MisMatchingOAuthClaims` / `TriggerInputSchemaMismatch` | `VirtualAgent` / `PowerApp` トリガーを外部から直接呼び出した | 下記「Copilot Studio トリガーのフローを外部から検証する」参照 |

## Copilot Studio のツール一覧にフローが表示されない

**症状**: フローのデプロイ・有効化は成功し Power Automate UI にも出るのに、
Copilot Studio の「ツールを追加 → フロー」の一覧に出てこない。

**原因**: トリガーの `kind` が `PowerAppV2`（Power Apps 専用）になっている。
Copilot Studio は `kind: "VirtualAgent"` のフローだけをツール候補として列挙する。

**対処**:

```python
# トリガー
{"type": "Request", "kind": "VirtualAgent", "inputs": {"schema": {...}}}
# 応答
{"type": "Response", "kind": "VirtualAgent", "inputs": {...}}
```

応答 schema のプロパティは `title` + `x-ms-dynamically-added` のみにする
（`x-ms-content-hint` / `additionalProperties` は付けない）。
詳細は [trigger-action-patterns.md](trigger-action-patterns.md) を参照。

> **再デプロイでフロー ID が変わる点に注意。**
> べき等デプロイ（無効化 → 削除 → 再作成）をすると workflow ID が変わるため、
> Copilot Studio 側に登録済みのツールは参照切れになる。ツールを削除して再追加する。

## Copilot Studio トリガーのフローを外部から検証する

**症状**: `kind: VirtualAgent` / `PowerApp` のフローを Python から直接叩こうとすると
どのルートでも失敗する。

| 試したルート | 結果 |
|---|---|
| `POST /flows/{id}/triggers/manual/run` | body が渡らず `TriggerInputSchemaMismatch` |
| `listCallbackUrl` + Flow API トークン | `DirectApiAuthorizationRequired` |
| `listCallbackUrl` + Dataverse トークン | `MisMatchingOAuthClaims` |
| `flowTriggerUri`（apihub）+ `https://apihub.azure.com/.default` | audience は通るが `missing connection ACL` で 403 |

**原因**: これらの `kind` は「呼び出し元が Power Apps / Copilot Studio であること」を
前提にした認証スキームを要求する。外部から直接呼べないのは仕様。

**対処（検証用の実務パターン）**: フロー定義ビルダー関数を再利用し、
**トリガーと応答だけ HTTP 版に差し替えた一時フロー**をデプロイして検証する。

```python
from deploy_flows import build_flow1_definition  # 本番と同じロジックを再利用

definition = build_flow1_definition(...)
definition["triggers"] = {
    "manual": {"type": "Request", "kind": "Http", "inputs": {"schema": {...}}}
}
definition["actions"]["応答"]["kind"] = "Http"
definition["actions"]["応答"]["inputs"]["statusCode"] = 200
# → デプロイ → listCallbackUrl の SAS URL に認証なしで POST → 検証後に削除
```

ビジネスロジック部分は本番フローと完全に同一なので、
採番・分岐・メール送信・後続フローの発火まで一括で検証できる。検証後は必ず一時フローを削除する。

## Webhook トリガーの登録には反映待ちがある

**症状**: Dataverse Webhook トリガーのフローを作り直し、`/start` も成功しているのに
レコードを作成しても発火しない。

**原因**: フロー再作成直後は webhook 登録がサービス側に反映されるまで時間がかかる（概ね 1〜2 分）。

**対処**: 「発火しない＝定義が壊れている」と即断しない。
数分待ってからレコードの作成／更新で再試行する。
それでも発火しない場合に初めて `/start` の呼び出しとトリガー定義を疑う。

## `contentBase64` が不正、または `$content` を選択できない

SharePoint の `Get file content` は、利用する operation と実行環境により本文が
`{"$content": "..."}` 形式ではなく平文 `String` として返る場合がある。

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| Function が `contentBase64 が不正` を返す | `body('Get_File_Content')` の平文を Base64 契約へそのまま渡した | `@base64(body('Get_File_Content'))` を渡す |
| `Property '$content' cannot be selected` | 実際の本文型が Object ではなく String | `$content` 選択をやめ、本文全体を `base64()` へ渡す |

恒久対策済み: `scripts/validate_flow_definition.py` の
`assert_base64_content_contract()` が、実行時の `contentBase64` 値に `@base64(...)` がない定義を
デプロイ前に拒否する。定義生成スクリプトから毎回呼び出す。

## Dataverse の Create / Update がデザイナーで必須列エラーになる

`CreateRecord` / `UpdateRecord` の列値を `"item": {"<列名>": "<値>"}` と入れ子で渡すと、
API では Draft を作成できても Power Automate デザイナーは列値を復元しない。必須列が空になり、
保存時に「`<列名>` は必須です」「パラメーターが無効です」と表示される。

列値と Lookup は `item/<列名>`、`item/<LookupSchemaName>@odata.bind` のフラットなキーで
`parameters` 直下へ配置する。

恒久対策済み: `scripts/validate_flow_definition.py` の
`assert_flat_dataverse_item_parameters()` が、Dataverse の `CreateRecord` / `UpdateRecord` に
入れ子の `item` オブジェクトがある定義をデプロイ前に拒否する。

## Dataverse `Could not find a property named ...`

Dataverse コネクタの `$filter` や item で、表示名から推測した列名を使うと実行時に400になる。
特に図面番号・改訂番号などが専用列ではなくPrimary Name列に格納されている設計では、
`<prefix>_name` が正しい場合がある。`EntityDefinitions(LogicalName='<table>')/Attributes` から
実列名を取得し、推測せず照合する。

恒久対策済み: `scripts/validate_flow_definition.py` の
`assert_required_dataverse_columns()` へメタデータAPIで取得した列集合とフローの必須列集合を渡し、
既存フローの削除・更新より前に不一致を拒否する。

## Lookup の `@odata.bind` が undeclared property になる

Lookup属性の論理名と `@odata.bind` に使うナビゲーションプロパティ名は一致するとは限らず、
大文字小文字も区別される。属性名や表示名から組み立てず、対象テーブルの
`ManyToOneRelationships` を `ReferencedEntity` と `ReferencingAttribute` で絞り、
`ReferencingEntityNavigationPropertyName` を使用する。

恒久対策済み: `scripts/validate_flow_definition.py` の `require_navigation_property()` が
空または不正な関係メタデータをデプロイ前に拒否する。デプロイスクリプトはこの関数で解決した値だけを
`<navigation-property>@odata.bind` に使用する。

## ジョブ行キューを消化するフローの落とし穴（検証済 2026-08-13）

Dataverse の「行が追加された場合」トリガーでキュー行を拾い、対象を採点して書き戻す
構成で実際に踏んだもの。

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `InvalidVariableInitialization` で保存できない | `InitializeVariable` を `If` / `Scope` の中に置いた | 変数の初期化は**必ずトップレベル**。条件分岐の外へ出す |
| 作成直後の PATCH が `does not support http method 'PATCH'` | `workflows` への POST は **204 で本文を返さない**ため ID が空だった | 作成後に `name eq '<フロー名>' and category eq 5` で ID を引き直す |
| `Compose` が理由なく失敗する | `json('')` は空文字で落ちる。列が NULL ではなく**空文字**だと `coalesce` では防げない | `json(if(startsWith(coalesce(x,''),'['), x, '[]'))` のように中身を見て判定する |
| 1 件の失敗でジョブ全体が失敗する | `Apply to each` の後続アクションが `Succeeded` しか受けていない | 集計アクションの `runAfter` に `Failed` / `TimedOut` を足して**ループを続行させる** |
| 既存行を更新できない | Dataverse コネクタの更新は GUID 必須で、代替キーでの Upsert ができない | `ListRecords` で `\=<キー列> eq '...'` を引き、`length(...)` が 0 かで作成／更新を分ける |
| 待機中のまま溜まっている行が処理されない | トリガーが `message: 1`（作成）のみ | 既存行は発火しない。積み直すか、UI から再実行する |

### 進捗の書き戻しと同時実行

`Apply to each` を同時実行にすると変数のインクリメントが競合する。
進捗を出したいなら**外側のループは逐次（`repetitions: 1`）にして、外側でだけ変数を触る**。
内側は同時実行にしてよいが、同じ行を更新するアクションがあるなら逐次にする。
