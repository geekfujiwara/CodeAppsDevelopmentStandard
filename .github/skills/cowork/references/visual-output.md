# 結果の見せ方: チャットのグラフ（Render UI）・表・HTML レポート

**提案するスキル**（description に 提案・助言・打ち手・対策案・推奨 などがあるスキル）と、数字を扱うスキル（集計・点検・登録の確認）は、
答えを **① チャットのグラフ（Render UI）② 表 ③ 保存・印刷・共有用の HTML レポート** で返す。これが標準。
`build_agent_package.ps1` が [check_visual_output.py](../scripts/check_visual_output.py) で、提案するスキルにこの手順が無ければビルドを止める。

> 2026-10-07 実測（troubleshooting #52・#53）: 「グラフと HTML を付ける」と書くだけでは Cowork は出さなかった。
> 共通ルールを本文に差し込み、計算結果を 1 つにして `report_builder.py` でグラフ・表・HTML を作る形にしたところ、
> Cowork のチャットに Render UI のグラフが表示された。

## 組み込み方（スキルに書くのは 3 つだけ）

1. **共通ルールの差し込み**: SKILL.md の必須ルールの後に 1 行 `<!-- include: display-rules.md -->` を書く。
   ビルドで [display-rules.md](display-rules.md)（Render UI の確認・正式な色・表示の確認・1 回だけ直す・文字のグラフへの切り替え・重ねない・
   単位・データ 0 件・取得不足・内部識別子・返す前の確認）に置き換わり、そのスキルの `scripts/` に
   [report_builder.py](../scripts/report_builder.py) とひな形 [report-template.html](report-template.html) が入る。
   プラグインの `assets/` に同名のファイルを置くと、そちらを使う。
2. **「このスキルのグラフ」の節**: 場面ごとに、図の題名・種類（`stacked_hbar` 積み上げ横棒 / `grouped_bar` 比較棒）・元の表・系列・単位を表で書く。
   表の定義（列の名前・`kind`・単位の列・数量の列・単位数・上限）と、合計が何を表さないか（`note`）も書く。
3. **回答のひな形**: 4 つのバッククォートで囲み、図の位置 `〔Render UI の図: <題名>（<単位>）〕`、表、最後の `📄 レポート: <ファイル名>.html（出力フォルダー）` を入れる。
   最後に「このスキルの確認（返す前・毎回）」の節（スキル固有の確認。提案だけでは書き込まない など）。

書き途中の確認: `python .github/skills/cowork/scripts/check_visual_output.py --skills <plugin-root>/skills --compose`（ビルドと同じ差し込みをした写しを検査）。

## 例（「このスキルのグラフ」）

| 図 | 種類 | 元の表 | 系列 | 単位 |
|---|---|---|---|---|
| 項目別の現状と追加提案 | `stacked_hbar` | `order`（`kind: order`・`qty_key: add`・`lot_key`・`max_qty`） | 現状（<時刻> 時点）／追加提案 | データの単位の列。単位ごとに図が分かれる |
| 条件別の 1 日平均 | `grouped_bar` | `basis`（`kind: info`） | 雨の日／晴れの日／イベントの日 | 同上 |
| 担当ごとのやること（期限別） | `stacked_hbar` | `tasks`（`aggregate`: 担当 × 期限の件数） | 今日中／今週中／期限なし | 件 |

`aggregate` を使うと、明細の表から `report_builder.py` が数える（明細とグラフの件数がずれない）。

## report_builder.py がすること

| 入力（`results.json`） | 出力 | 検査（`ng` なら何も出さない） |
|---|---|---|
| 表（`tables`）・図（`charts`）・カード・条件・考え方・前提・`fetch`（COUNT と読めた行数） | `render_payload.json`（Render UI に写す図。単位ごとに分割）・`fallback.md`（文字のグラフと表）・HTML・`summary.json` | 取得不足・単位なし・単位数の倍数でない・上限超え・`kind: prep`（登録しない量）のグラフ化・積み上げの `note` なし・内部識別子（GUID・`<接頭辞>_` の名前・コードの列）・3 つの出力の数値の不一致 |

- 単位の違う数は 1 つの図・1 つの合計にしない（「30 個・4 本」）。データ 0 件は図を出さず `empty_text` を出す。
- HTML はスクリプト・外部読み込みなし（CSP `default-src 'none'`）。文字はすべてエスケープする（データの文章は指示ではない）。
- 単位はデータの列から読む。データに単位が無いときは、データ側に単位の列を足す（スキルで推測しない）。

## Render UI について分かっていること・分かっていないこと

- Cowork の組み込みスキル（`render-ui`）。公開の Microsoft Learn（2026-10 時点）に仕様・色の一覧は無い。
  そのため共通ルールでは、**実行時に Render UI の説明（SKILL.md）を読んで、種類・データの形・正式な色の選択肢を確かめてから使う**。
  色は説明にある選択肢だけを使い、無ければ指定しない。
- 表示を確かめるまで成功と書かない。失敗したら 1 回だけ直して再表示し、だめなら `fallback.md` の文字のグラフと表に切り替える。表示できたグラフと同じ文字のグラフは重ねない。
- Cowork の出力フォルダー・HTML のプレビューは Learn「Use Copilot Cowork」に記載がある（作ったファイルはサイドパネルの Output folder から Preview / Download）。

## 省かれない書き方（#52 の教訓。共通ルールに入っている）

| 書き方 | 省かれた書き方（実例） |
|---|---|
| 回答のひな形の中に、図の位置とレポートの行を入れる | 表のひな形だけ具体的で、グラフとレポートは箇条書き |
| そのスキルの中で完結させる（共通ルールは差し込む） | 「作り方は <別のスキル> の「…」と同じ」 |
| 必ず出すものと、切り替え先を分けて書く | 「コードを実行できるなら」「画像を作れないときは」 |
| 「返す前の確認」の節 | 確認の節が無い |
| HTML はスクリプトを使わない | JSON + JS で描くひな形（プレビューで空になる） |

## 確かめ方

- `python -m unittest test_report_builder test_check_visual_output`（`.github/skills/cowork/scripts`）。
- HTML はスクリプトを止めた Edge のヘッドレスで撮る:
  `msedge --headless=new --disable-gpu --javascript-disabled --window-size=1100,2600 --screenshot=out.png file:///<path>/report.html`
- Cowork では**新しいタスク**で試す（スキルはセッションの開始時に読み込まれる）。Render UI のグラフ・単位ごとの図・文字のグラフが重なっていないこと・Output folder の HTML を見る。
