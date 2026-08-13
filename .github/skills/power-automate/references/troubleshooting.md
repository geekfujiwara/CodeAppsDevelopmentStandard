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
