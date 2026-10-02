# 株主総会 Q&A アシスト（scaffold テンプレート）

株主総会の質疑応答を 1 画面で支える Code Apps。`generic-base` を継承する完全テンプレート。

| 機能 | 内容 |
|---|---|
| 連続の文字起こし | Azure AI Speech（ブラウザから直結）。開始から終了まで 1 本で録り、議長の指名・名乗りで株主ごとに区切って録音（WAV）を切り出す |
| 株主の特定 | 名乗りから名簿の候補をブラウザで絞り、生成 AI（構造化出力）が候補から選ぶ。確からしさ 0.8 以上で自動、紛らわしい候補（同姓で番号が近い）がいれば候補を表示して担当者が選ぶ。番号はその場で直せる |
| 質問の整理と回答案 | 質問カード（想定問答の候補つき）と、カードごとの回答案のストリーム生成。根拠の ID は押すと吹き出しで中身を確認できる |
| 想定問答の検索 | 検索結果を根拠に要約・回答案を生成し、**回答案の各行とその行が引用した想定問答・IR 抜粋を線（React Flow）で結ぶ** |
| 記録 | 発言・質問・回答案を Dataverse、録音とまとめを SharePoint に保存。後から株主番号を直せる |
| 総会・集計 | 総会ごとの KPI・グラフ・回答案の評価、Markdown / CSV でまとめて保存 |
| LIVE 共有 | 担当者 1 人が操作し、幹部は読み取り専用で同じ画面を見る（Dataverse のレコード共有） |
| リハーサル | 台本（Dataverse・Cowork で作成可）を Windows の音声で読み上げ／人が読む／文字だけ流す |
| 想定問答の追加・承認 | アプリから追加・編集。Cowork（[agm-qa-plugin](../../../cowork/templates/agm-qa-plugin/README.md)）で作った下書きを承認すると質疑応答の検索に使われる |
| 文字起こしの比較 | Azure Speech（リアルタイム）の確定文ごとに MAI-Transcribe（既定 2）で認識し直し、置き換え／比較を選べる |
| 設定 | 文字起こしの接続先・モデル、回答案と株主照合の AI モデル（デプロイ・推論の強さ・最大トークン）。「既定にする」で組織の既定、「この端末だけで試す」 |

構成・モデル・権限は生成後の `spec/architecture.md`・`spec/security.md`、要件とテスト計画は `spec/requirements.md`・`spec/test-plan.md`。

## 生成する（変数は AskUserQuestion で 1 問ずつ聞く）

1. まだ答えの無い質問を出す。`detect` があれば先に調べて `choices` に並べ、`default` は推奨として先頭に置く。

   ```powershell
   python .github/skills/update-skills/scripts/scaffold_from_template.py `
     --template .github/skills/code-apps/templates/agm-qa-assist --questions --env agm.answers.env
   ```

2. 返ってきた JSON の順に **AskUserQuestion で 1 問ずつ**聞き、答えを `agm.answers.env`（`KEY=VALUE`）に追記する。
   `sameAs` の質問は聞かない（元の答えを使う）。もう一度 1. を実行して `[]` になるまで繰り返す。
3. 生成して `.env` を書く（`--dry-run` で先に確認）。

   ```powershell
   python .github/skills/update-skills/scripts/scaffold_from_template.py `
     --template .github/skills/code-apps/templates/agm-qa-assist --target <出力先> `
     --env agm.answers.env --write-env <出力先>/.env
   ```

## 開始の手順（生成した出力先で）

| Step | 内容 | コマンド・参照 |
|---|---|---|
| 1 | 環境チェック（既定環境ではない・Code Apps・マネージド環境・DLP） | admin スキルの環境チェック |
| 2 | 依存の導入と単体テスト | `npm install --no-audit --no-fund` → `npm run test`（40 件） |
| 3 | Dataverse のテーブル（7 つ）を作る | `python scripts/setup_dataverse.py --skip-localize` |
| 4 | アプリの初期化・初回デプロイ・データソース | `npx --no pa app init ...` → `npm run deploy -- --solution-id $env:SOLUTION_ID` → `add_data_source.py --connector dataverse` と `--connector sharepoint --as action`（code-apps SKILL の §2） |
| 5 | Azure の土台 | API のアプリ登録（mcp-server の `configure_entra_api.py`。スコープ `Speech.Token`）、Function App・ストレージ・ネットワーク（azure-infra）。`.env` に `API_AUDIENCE` を追記 |
| 6 | このアプリ固有の Azure 設定 | `python scripts/configure_azure.py`（計画）→ `--apply`。Speech・Azure OpenAI とモデル・Foundry User・アプリ設定・CORS をそろえる（冪等） |
| 7 | Function とコネクタ | `cd azure/speech-token-broker; npm install; npm run build; npm test` → `deploy_mcp_function.py --project azure/speech-token-broker --app $env:FUNCTION_APP_NAME --route speech/token --route answer/ticket --route shareholder/identify` → custom-connector スキル Step 1〜7（`connector/` を登録・OBO で接続・接続参照・Code Apps のデータソース）。`.env` に `AGM_SPEECH_CONNREF` / `AGM_SHAREPOINT_CONNREF` を追記 |
| 8 | CSP と残りの Dataverse | `configure_code_app_csp.py --directive Connect-Src --source wss://<region>.stt.speech.microsoft.com --apply` と `https://<FUNCTION_APP_NAME>.azurewebsites.net` → `python scripts/setup_dataverse.py --localize-only`（日本語化・デモの想定問答 45 / IR 36 / 名簿 20）→ `python scripts/setup_security_roles.py --assign-operator <UPN> --assign-viewer <UPN>` |
| 9 | デプロイと確認 | `npm run deploy` → `python scripts/test/verify_answer_stream.py`（チケット・CORS・ストリーム）→ `python scripts/test/fetch_answer_ticket.py --out .mcp/answer-ticket.json; node scripts/test/eval-identify.ts`（照合の評価セット）→ テスト用ビルドで `node scripts/test/e2e-cockpit.mjs`（spec/test-plan.md） |

## 置き換える場所

- 想定問答・IR 抜粋・名簿・台本は `data/demo/` の架空データ。本番は Dataverse の想定問答・IR 抜粋・株主名簿のテーブルに入れる（data-migration スキル）。
- 照合の評価セット `data/demo/identify-cases.json` には、実音声で出た誤認識をそのまま足していく。
- 画面の文言（株主番号・株主総会）は業務固有。ほかの会議（決算説明会など）に使う場合は `src/lib/agm/turns.ts` の区切りの言葉と画面の文言を直す。

## テンプレートの更新

元のプロジェクトで `python scripts/export_template.py` を実行すると、generic-base と違うファイルだけを書き出し、
環境に固有の値（プレフィックス・リソース名・テナント等）を `${VAR}` に戻す。`--check` で実値が残っていないかを確認する。
