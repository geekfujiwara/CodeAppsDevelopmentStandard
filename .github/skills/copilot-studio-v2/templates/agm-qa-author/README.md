# agm-qa-author — 株主総会 想定問答アシスタント（Copilot Studio v2 エージェント）

Code Apps テンプレート [`code-apps/templates/agm-qa-assist`](../../../code-apps/templates/agm-qa-assist/README.md)（株主総会 Q&A アシスト）と
同じ Dataverse を、Copilot Studio のエージェントから Dataverse MCP で読み書きし、事務局（IR・総務）が想定問答とリハーサル台本を作れるようにする。
Teams / Microsoft 365 Copilot で使う。

| スキル | 内容 | トリガー例 |
|---|---|---|
| `agm-qa-authoring` | IR 抜粋を根拠に想定問答の下書きを作り、確認後に「下書き」で登録（既存との重複は言い換えに統合） | 「配当について想定問答を 3 件作って」 |
| `agm-rehearsal-script` | 承認済みの想定問答から議長・株主・回答役員の台本を作り、台本テーブルへ登録 | 「株主 4 人分のリハーサル台本を作って」 |
| `agm-qa-review` | 根拠に無い数値・存在しない根拠 ID・抜け・重複・下書きを一覧（読み取りだけ） | 「想定問答を点検して」 |

- 登録は**下書き**・作成元は `Copilot Studio`。承認はアプリの「想定問答」画面で事務局が行う。
- Dataverse MCP は**使う人本人の接続**（End user credentials）で動く。読み書きの範囲はその人のセキュリティ ロール（アプリの「AGM 想定問答作成者」）。
- スキルは Cowork の [agm-qa-plugin](../../../cowork/templates/agm-qa-plugin/README.md) と同じ手順。違いはツールが使えないときの案内と作成元の値だけで、
  `tests/test_agm_qa_author_template.py` が同期を確かめる。Cowork 版を直したら `--write` で作り直す。

## Cowork との使い分け

同じ 3 スキルを Cowork プラグインでも配れる。Cowork で、接続は成功するのに実行時に Dataverse MCP のツールが 0 件になる場合
（cowork スキル troubleshooting #46。Entra のトークン発行はすべて成功しており、プラグインやテナントの設定では直らない）は、こちらを使う。
Copilot Studio ではツールごとに有効・無効を設定でき、公開前に Preview で確かめられる。

## 生成（変数は AskUserQuestion で 1 問ずつ聞く）

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/copilot-studio-v2/templates/agm-qa-author --questions --env agm-agent.answers.env
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/copilot-studio-v2/templates/agm-qa-author --target copilot-studio/agm-qa-author --env agm-agent.answers.env
```

## デプロイ

`agent.env` に名前・スキーマ・モデル・アイコン・説明文がまとまっている。認証と環境（`DATAVERSE_URL` / `TENANT_ID` / `SOLUTION_NAME`）は
プロジェクト直下の `.env` から読む。各スクリプトは `--env-file` のフォルダで動くので、`agent_botid.txt` もそこに残る。

```powershell
# 1. 作成・アイコン・スキル 3 つ（Edit details は作成直後だと Teams チャネル未作成で失敗するが、続行する）
python .github/skills/copilot-studio-v2/scripts/deploy_agent.py --defer-publish --env-file copilot-studio/agm-qa-author/agent.env
```

2. Copilot Studio でエージェントを開き、**Tools → Add tool → Model Context Protocol → Dataverse MCP Server** を追加する。
   接続は自分のアカウント（End user credentials）。ツール一覧の読み込みを待って `describe` / `read_query` / `search_data` /
   `create_record` / `update_record` だけをオンにし、**Confirm → Save**（Save しないと Dataverse に書かれない）。
   ブラウザ操作で自動化する場合は [mcp-servers.md](../../references/mcp-servers.md)（捕捉 → PLAN_HASH 承認 → apply → read-back）。

```powershell
# 3. 公開 → Teams and Microsoft 365 Copilot チャネルを UI で有効化 → Edit details → 再公開
python .github/skills/copilot-studio-v2/scripts/publish_agent.py --env-file copilot-studio/agm-qa-author/agent.env
python .github/skills/copilot-studio-v2/scripts/set_app_details.py --env-file copilot-studio/agm-qa-author/agent.env
python .github/skills/copilot-studio-v2/scripts/publish_agent.py --env-file copilot-studio/agm-qa-author/agent.env
# 4. 構造の確認（スキル 3 つと添付ファイルの読み戻し）
python .github/skills/copilot-studio-v2/scripts/verify_agent.py   # copilot-studio/agm-qa-author で実行
```

## 受け入れ（Preview で新しい会話ごとに）

| # | 入力 | 合格 |
|---|---|---|
| 1 | `想定問答テーブルのスキーマを describe で確認して、使えるツール名を教えて` | `describe` が呼ばれ、想定問答テーブルの列が出る。削除・テーブル変更のツールが一覧に無い |
| 2 | `配当について想定問答を 2 件作って` | 根拠 IR の番号つきの表で提示され、まだ登録されない |
| 3 | （続けて）`その 2 件を下書きで登録して` | 状態=下書き・作成元=Copilot Studio・既存の分類で登録され、読み戻した件数が一致する |
| 4 | `想定問答を点検して` | 書き込みをせず、件数と要修正の一覧が出る |

テストで登録した下書きは、アプリの想定問答画面から削除する。更新は `update_agent.py --env-file ...`（作り直さない。追加済みの MCP ツールは保たれる）。
