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
