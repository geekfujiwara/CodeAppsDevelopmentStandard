# 新アーキテクチャ（cliagent）構造リファレンス

Copilot Studio の「全く新しいアーキテクチャ」エージェント（`template="cliagent-1.0.0"`）の
Dataverse 上の格納構造をまとめる。実機（live 環境）の解析で確認済み。

## Bot 本体（`bots` テーブル）

| 列 | 値の例 | 備考 |
|---|---|---|
| `template` | `cliagent-1.0.0` | **これが新アーキの目印**。API 作成時に必須 |
| `schemaname` | `geek_daily-reporter_benYmv` | `{prefix}_{slug}_{random}` 形式。任意の一意名で可 |
| `language` | `1033` | LCID |
| `authenticationmode` | `2` | |
| `authenticationtrigger` | `1` | |
| `accesscontrolpolicy` | `2` | |
| `configuration` | BotConfiguration JSON 文字列 | **エージェント設定はここにインライン** |
| `synchronizationstatus` | `{... provisioningStatus: Provisioning}` | API 作成直後は Provisioning のまま残ることあり |
| `iconbase64` | PNG base64 | アイコン |

> **重要**: 旧アーキは `POST /bots` が PVA にプロビジョニングされず UI 作成必須だったが、
> **cliagent テンプレートでは API 作成が成立する**（`pac copilot list` で Provisioned/Active 確認済み）。

## configuration（BotConfiguration JSON）

```json
{
  "$kind": "BotConfiguration",
  "channels": [
    { "$kind": "ChannelDefinition", "id": "MsTeams", "channelId": "MsTeams" }
  ],
  "recognizer": { "$kind": "CLICopilotRecognizer" },
  "agentSettings": {
    "$kind": "AgentSettings",
    "model": { "$kind": "ModelConfig", "series": "Sonnet46" },
    "instructions": {
      "$kind": "Instructions",
      "segments": [
        { "$kind": "StaticSegment", "value": "<エージェントの指示文（プレーン文字列）>" }
      ]
    },
    "enableMemory": true
  }
}
```

| パス | 意味 |
|---|---|
| `recognizer.$kind = CLICopilotRecognizer` | 新アーキの認識器 |
| `agentSettings.model.series` | 基盤モデルシリーズ（例 `Sonnet46` = Claude Sonnet 4.x） |
| `agentSettings.instructions.segments[].value` | 指示文。**v1 の PVA ダブル改行 YAML は不要、プレーン文字列** |
| `agentSettings.enableMemory` | 会話メモリの有効化 |

### 改変時はディープマージ

`configuration` を丸ごと上書きするとモデルやメモリ設定を失う。必ず GET → マージ → PATCH。

```python
cfg = json.loads(bot["configuration"])
cfg["agentSettings"]["instructions"]["segments"][0]["value"] = NEW_INSTRUCTIONS
patch = {"configuration": json.dumps(cfg, ensure_ascii=False)}
sess.patch(f"{API}/bots({bot_id})", json=patch)
```

## botcomponents（配下コンポーネント）

| componenttype | 種別 | data / 格納先 |
|---|---|---|
| **9** | InlineAgentSkill（スキル）または McpTool（ツール） | `data` 列（`kind:` で判別） |
| **14** | FileAttachmentComponent（スキル同梱ファイル） | `filedata` File 列。親 = スキル(type=9) |

### type=9 スキル（InlineAgentSkill）の data

```
kind: InlineAgentSkill
content: <!-- bic:bundle=crskill_<name>_zip_<hash> -->
```

`bic:bundle` はバンドルの論理 ID。実体ファイルは type=14 子コンポーネントの `filedata` に入る。

### type=9 ツール（McpTool）の data

```
kind: McpTool
connectorId: /providers/Microsoft.PowerApps/apis/shared_workiqonedrive
authMode: Invoker
connectionReference: <prefix>.cr.shared_workiqonedrive.<guid>
operationId: mcp_OneDriveRemoteServer
```

> MCP ツールは **接続参照（connectionReference）** に依存する。別環境/別 Bot へ複製するには
> 対応する接続参照を先に用意する必要があり、スキルより複製コストが高い。

### type=14 同梱ファイル

| 列 | 内容 |
|---|---|
| `name` | フラットなファイル名（例 `SKILL.md`, `build_pptx.py`, `assets_b64.py`） |
| `schemaname` | `{prefix}_{sanitized_name}_{hash}` |
| `filedata` | File 列。実体バイト |
| `_parentbotcomponentid_value` | 親スキル(type=9)の botcomponentid |

## v1（旧アーキ）との対比早見

| | v1（classic / GPT コンポーネント） | v2（cliagent） |
|---|---|---|
| Bot 作成 | UI 手動必須 | API 可能 |
| 設定 | botcomponents type=15 の data YAML | bots.configuration インライン JSON |
| Instructions 形式 | PVA ダブル改行 YAML | プレーン文字列 segment |
| モデル指定 | `aISettings.model.modelNameHint` | `agentSettings.model.series` |
| スキル/ツール | ナレッジ・トピック | type=9 InlineAgentSkill / McpTool |
