# agm-qa-plugin — 株主総会 想定問答アシスタント（Cowork プラグイン）

Code Apps テンプレート [`code-apps/templates/agm-qa-assist`](../../../code-apps/templates/agm-qa-assist/README.md)（株主総会 Q&A アシスト）と
同じ Dataverse を使い、事務局（IR・総務）が Cowork から想定問答とリハーサル台本を作れるようにする。

| スキル | 内容 | トリガー例 |
|---|---|---|
| `agm-qa-authoring` | IR 抜粋を根拠に想定問答の下書きを作り、確認後に「下書き」で登録（既存との重複は言い換えに統合） | 「配当について想定問答を 3 件作って」「招集通知から想定問答を作って」 |
| `agm-rehearsal-script` | 承認済みの想定問答から議長・株主・回答役員の台本を作り、台本テーブルへ登録（アプリの台本タブで選べる） | 「リハーサルの台本を作って」「番号を言わない株主も入れて」 |
| `agm-qa-review` | 根拠に無い数値・存在しない根拠 ID・抜け・重複・下書きを一覧（読み取りだけ） | 「想定問答を点検して」 |

- 数値は根拠の IR 抜粋にあるものだけを使う。株主は架空の番号・名前で台本を作る（名簿は読まない）。
- 登録は**下書き**。承認はアプリの「想定問答」画面で事務局が行う（承認するまで質疑応答の検索に使われない）。アプリからも手動で追加・編集・承認できる。

## 生成（変数は AskUserQuestion で 1 問ずつ聞く）

```powershell
# 1. まだ答えの無い質問（JSON）を出し、1 問ずつ聞いて agm-plugin.answers.env に追記 → [] になるまで繰り返す
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/cowork/templates/agm-qa-plugin --questions --env agm-plugin.answers.env
# 2. 生成
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/cowork/templates/agm-qa-plugin --target cowork/agm-qa-plugin --env agm-plugin.answers.env
```

## 権限

生成された `PERMISSIONS.md`（担当ごとの権限と利用者のロール）を担当者と確認してから公開に進む。
共通の考え方は [references/permissions.md](../../references/permissions.md)。

## 公開

[cowork スキル](../../SKILL.md) の Step 3〜8（Entra OAuth アプリ → `allowedmcpclients` → OAuth client registration → ビルド → 管理センター private API）。
OAuth client registration は CLI から作れる（`manage_oauth_registration_api.py create ... --write-env .env`）。組織に公開する前に、
作成者が `install_agent_package_personal.py install` で自分だけに入れて、Cowork で下書きの作成を確かめる。
その前に `rehearse_plugin.py` で 3 つのスキルを実データで通しで動かす（想定問答の下書き・既存との重複判定・台本の登録と JSON の形・点検の件数）。架空の会社「株式会社みらいテクノロジーズ」のデモデータでの記録例は、元のプロジェクトの `spec/eval/cowork-rehearsal/`。
既存の Cowork 用 OAuth 登録が同じ環境にあれば Step 3〜5 を再利用できる。

```powershell
& .github/skills/cowork/scripts/build_agent_package.ps1 -PluginRoot cowork/agm-qa-plugin -OutputName agm-qa-author -EnvPath .env
```

アイコンは `scripts/draw_icons.py` で描き直せる（質問と回答の吹き出し＋根拠の資料）。
