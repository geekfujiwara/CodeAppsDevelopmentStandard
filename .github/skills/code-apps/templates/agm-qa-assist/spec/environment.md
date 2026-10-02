# 環境の記録（scaffold 時に生成）

このファイルは scaffold のときに、聞いた答えで埋めて作られる。秘密（シークレット・キー）は書かない。

| 区分 | 項目 | 値 |
|---|---|---|
| アプリ | 表示名 | ${VITE_CODEAPPS_APP_NAME}（タブ: ${VITE_CODEAPPS_DOCUMENT_TITLE}） |
| アプリ | 最初の総会 | ${VITE_AGM_MEETING_TITLE}（${VITE_AGM_MEETING_DATE}） |
| Power Platform | テナント | ${TENANT_ID} |
| Power Platform | 環境 | ${ENV_ID} |
| Power Platform | Dataverse | ${DATAVERSE_URL}（アプリから: ${VITE_DATAVERSE_URL}） |
| Power Platform | プレフィックス | ${PUBLISHER_PREFIX}（アプリから: ${VITE_PUBLISHER_PREFIX}） |
| Power Platform | ソリューション | ${SOLUTION_NAME}（${SOLUTION_DISPLAY_NAME}） |
| SharePoint | 保存先 | ${VITE_AGM_SP_SITE_URL} / ${VITE_AGM_SP_LIBRARY} |
| Azure | サブスクリプション / リソース グループ / リージョン | ${AZURE_SUBSCRIPTION_ID} / ${AZURE_RESOURCE_GROUP} / ${AZURE_LOCATION} |
| Azure | Speech | ${SPEECH_RESOURCE_NAME} |
| Azure | Azure OpenAI / モデル | ${AOAI_RESOURCE_NAME} / ${AOAI_DEPLOYMENT} ${AOAI_MODEL_VERSION} |
| Azure | MAI-Transcribe / 選べる AI モデル | ${MAI_SPEECH_RESOURCE_NAME} / ${AOAI_DEPLOYMENTS} |
| Azure | Function App | ${FUNCTION_APP_NAME}（API: ${API_AUDIENCE}） |
| ロール | オペレーター / 閲覧（幹部） | ${OPERATOR_UPN} / ${VIEWER_UPN} |

後から決まる値（ソリューション ID・接続参照の論理名・API の audience）は `.env` に追記する（`.env.example` 参照）。
`SOLUTION_ID`: ${SOLUTION_ID}
