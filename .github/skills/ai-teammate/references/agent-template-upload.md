# Agent template upload private API

`manifestVersion: devPreview` と `agenticUserTemplates` を含むZIPはMicrosoft Graphの
`/appCatalogs/teamsApps`では拒否される。M365管理センターが使う次のcontractを2026-09-14に
実測した。

| Phase | Method / path | Contract |
|---|---|---|
| Tenant read | `GET /api/tenantauthorization/GetTenantInfoV2` | 二重JSON文字列内の `Tenant.Id` をapproval planのtenant IDと照合 |
| Stage | `POST /fd/addins/api/apps/uploadCustomApp?workloads=AzureActiveDirectory,WXPO,MetaOS,SharePoint` | `multipart/form-data`の`AppFile`へZIPを設定 |
| Finalize | `POST /fd/addins/api/v2/actionableApps` | `Apps[0]`へ`AppId`、`FINALIZEPACKAGE`、`MetaOS`、version、`MosOperationId`を設定 |
| Read-back | `GET /fd/addins/api/agents` | 同じTitle IDとversionが存在することを確認 |

## Safety boundary

- 認証、MFA、step-up、consentは自動化しない。利用者がログインしたVS Code統合ブラウザだけを使う。
- ZIPは`devPreview`、4 entryの完全一致、manifest/template ID、blueprint GUIDを検証する。duplicate entryも拒否する。
- staging planはtenant ID、ZIP SHA-256/size、manifest ID、version、title、template ID、blueprint IDをhashへ含める。
- staging responseのidentityがplanと一致し、`isDeployed=false`の場合だけfinalize planを作る。
- stagingで発行されたTitle IDと`MosOperationId`は二つ目のplan/hashへ含める。staging approvalはpublish approvalを兼ねない。
- 現在観測済みの公開範囲は**All users**、activationは**None**。別audience contractを推測しない。
- authentication/session headerをファイルや標準出力へ保存しない。
- runnerは各phaseでsession headerを取り直し、401/403を自動retryしない。write結果が不明な場合はread-backしてから再実行を判断する。
- finalize再実行前に同じTitle ID/versionをread-backし、既に公開済みならwriteを送らず成功として返す。

## Workflow

```powershell
python scripts/plan_agent_template_upload.py `
  --package "teams/$env:AGENT_NAME-teams-app.zip" `
  --tenant-id $env:AZURE_TENANT_ID `
  --output .mcp/agent-template-stage-plan.json

# plan内容を確認してから同じhashを指定する。
python scripts/plan_agent_template_upload.py `
  --package "teams/$env:AGENT_NAME-teams-app.zip" `
  --tenant-id $env:AZURE_TENANT_ID `
  --output .mcp/agent-template-stage-plan.json `
  --apply --expected-hash <PLAN_HASH>
```

`READY_FOR_BROWSER_STAGE`の後、coding agentは
`agent_template_browser_runner.mjs`の`stageApprovedPackage(page, planPath, packagePath, hash,
{ finalizePlanPath })`を実行する。戻り値の`finalizePlan`と`finalizeHash`を表示し、利用者から
tenant-wide publishの明示承認を得る。

承認後だけ`finalizeApprovedPackage(page, finalizePlanPath, finalizeHash)`を実行する。
hash不一致、browser tenant不一致、package差し替え、staging responseのidentity不一致、read-back不一致は
すべてfail closedとする。

## Captured response fields

staging成功時は`statusCode: Success`と`appDetail`が返る。finalizeには
`appDetail.titleIdToLog`を`AppId`として使い、`appDetail.mosOperationId`をそのまま束縛する。
`appDetail.appId`は別のGUIDであり、finalize payloadの`AppId`には使わない。

Cancel後にAgents一覧へ対象名が表示されないこと、およびabortした`FINALIZEPACKAGE`が
`Deployment failed`になることをcapture時に確認した。staging endpointの内部一時データについては
削除contractを観測していないため、存在や自動失効を推測しない。