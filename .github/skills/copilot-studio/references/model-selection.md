# Standard model selection

Copilot Studio Standardの基盤モデルは、所有する`componenttype=15` GPT componentの`data` YAMLにある
`aISettings.model.modelNameHint`へ保存される。Botの`configuration.aISettings`ではない。

## Normal workflow

```powershell
python scripts/set_model.py show --bot-id $env:BOT_ID

python scripts/set_model.py plan `
  --bot-id $env:BOT_ID `
  --model $env:AGENT_MODEL_NAME `
  --output .mcp/copilot-standard-model-update-plan.json

python scripts/set_model.py apply `
  --plan .mcp/copilot-standard-model-update-plan.json `
  --expected-hash <承認したSHA-256>
```

`plan`は変更しない。次をJSONとapproval hashへ束縛する。

- Dataverse origin、Bot ID、GPT component ID/schema
- 元recordのETagと元YAML SHA-256
- 現在modelとtarget model
- 変更後YAML本体とSHA-256
- 固定PATCH pathとread-back contract

`apply`は同じBotから所有GPT componentを再解決する。component、ETag、元YAML hashのいずれかが
plan後に変わっていればPATCHしない。`If-Match`付きで`data`だけをPATCHし、変更後YAML全体hashと
`modelNameHint`を再取得して一致を確認する。draft変更なので、利用者へ反映するにはその後に公開する。

## Component selection

1. `bots.configuration.gPTSettings.defaultSchemaName`があれば、同じschemaのGPT componentが正確に1件必要。
2. `defaultSchemaName`が無ければ、GPT componentが正確に1件のときだけ使用する。
3. 0件、複数候補、空data、ETag欠落はfail closedとする。先頭recordへfallbackしない。

## Observed model values

2026-09-14にStandard環境で次の保存値をread-only確認した。

`GPT41`、`GPT5Chat`、`GPT55Chat`、`Sonnet46`、`sonnet4-5`、`opus4-1`、`Opus48`

保存値はUI表示名と一致しない場合があり、提供状況はtenant/regionで変わる。scriptは安全な文字形式を検証し、
未観測値ならplan時に警告する。未観測値を使う場合もapproval hashとread-backは省略しない。

## Why this is not a private API

UI shellの読み込み障害でModel dropdown requestをcaptureできない場合でも、保存先はDataverseの
`botcomponents.data`としてread-backできる。所有recordへのETag付きDataverse PATCHで完結するため、
未観測のgateway/private endpointを推測してreplayしない。2026-09-14にdisposable Standard Agentで
`GPT55Chat`から`Sonnet46`へ変更し、YAML全体hashとmodel値のread-back成功を確認した。