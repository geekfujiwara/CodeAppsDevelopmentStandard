# store-assist-plugin — 店長アシスト（Cowork プラグイン）

Code Apps テンプレート [`code-apps/templates/store-ordering`](../../../code-apps/templates/store-ordering/README.md)（店舗発注システム）と
同じ Dataverse（架空店舗の合成データ）を使い、店長が Cowork から単品管理・発注・本部通達・週次レポートを任せられるようにする。

| スキル | 内容 | トリガー例 |
|---|---|---|
| `tanpin-kanri` | 店長の判断基準（天気・イベント・欠品・廃棄）で、品目ごとの発注案と仕込み量を作る。相談（廃棄が続く商品など）にも答える。登録はしない | 「おはよう。今日の発注案を作って」「この商品、廃棄が続いている。どうする？」 |
| `order-execute` | 店長が承認した発注だけを、発注単位・締め時刻・便を確かめてから発注テーブルに登録し、読み戻す | 「この内容で発注して」 |
| `hq-notice-triage` | メールと Teams の本部通達から、自店のやること・期限・担当・売場変更を整理（不審な通達は要確認） | 「本部通達を整理して」 |
| `weekly-store-report` | 直近 1 週間の売上・廃棄・欠品・施策から SV 向けの週次レポート | 「週次レポートを作って」 |

- 結果は **チャットのグラフ（Render UI）・表・HTML レポート**で返す（cowork スキルの標準。[visual-output.md](../../references/visual-output.md)）。
  各スキルの `<!-- include: display-rules.md -->` はビルドで共通ルールに置き換わり、`scripts/report_builder.py` が同梱される。
  単位（個・本・パック）はデータの列から読み、単位の違う数は 1 つの図・合計にしない。
- 標準の Dataverse MCP（`describe` / `read_query` / `create_record`）だけを使う。書き込みは、店長が承認した発注の登録だけ。
- `tanpin-kanri` の「店長の判断基準」の節は、店長へのインタビューから作った判断基準に差し替える前提（ほかの節は変えない）。

## 生成（変数は AskUserQuestion で 1 問ずつ聞く）

```powershell
# 1. まだ答えの無い質問（JSON）を出し、1 問ずつ聞いて store-plugin.answers.env に追記 → [] になるまで繰り返す
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/cowork/templates/store-assist-plugin --questions --env store-plugin.answers.env
# 2. 生成
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/cowork/templates/store-assist-plugin --target cowork/store-assist --env store-plugin.answers.env
```

## 権限

`PERMISSIONS.md`（担当ごとの権限と利用者のロール）を担当者と確認してから公開に進む。共通の考え方は [references/permissions.md](../../references/permissions.md)。

## 公開

1. Dataverse（8 テーブルとデモデータ）とロール「店長アシスト デモ利用者」は、`code-apps/templates/store-ordering` から作ったアプリで `npm run dv:setup` → `npm run dv:role`。
2. [cowork スキル](../../SKILL.md) の Step 3〜5（Entra OAuth アプリ → `allowedmcpclients` → OAuth client registration）。既存の Cowork 用 OAuth 登録が同じ環境にあれば再利用できる。
3. ビルドする。共通の表示ルール・`report_builder.py` の差し込みと、結果の見せ方の検査（`check_visual_output.py`）もここで行う:

   ```powershell
   & .github/skills/cowork/scripts/build_agent_package.ps1 -PluginRoot cowork/store-assist -OutputName store-assist -EnvPath .env
   ```

4. スキルの SQL を実際の Dataverse MCP で 1 本ずつ確かめる（読み取りだけ。20 行で切れるクエリも検出）:

   ```powershell
   $env:AUTH_MODE = 'interactive'; python -u cowork/store-assist/scripts/check_skill_queries.py
   ```

5. 作成者が `install_agent_package_personal.py install` で自分だけに入れ、Cowork の**新しいタスク**で「おはよう。今日の発注案を作って」→ Render UI のグラフ（単位ごと）・表・HTML レポートを確かめる。
   発注案だけでは登録されないこと（発注 0 件のまま）も確かめる（`npm run dv:state`）。
6. 管理センター private API で組織に登録・公開（cowork スキル Step 8）。

## 見本

[samples/order-proposal.results.json](samples/order-proposal.results.json) は、雨・夕方にライブのシナリオでの発注案の計算結果（`report_builder.py` の入力の形）。

```powershell
python .github/skills/cowork/scripts/report_builder.py cowork/store-assist/samples/order-proposal.results.json --out out
```
