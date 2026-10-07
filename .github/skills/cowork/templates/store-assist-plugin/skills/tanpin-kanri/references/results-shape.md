# results.json の形（発注案）

`scripts/report_builder.py` に渡す計算結果の形。1 行ずつの例で、**数字は必ず `read_query` の結果を使う**（ここの数字を使わない）。
表・グラフの定義は SKILL.md の「このスキルのグラフ」。

```json
{
  "title": "発注案の考え方 10/30(金)", "subtitle": "<店舗名> ／ 10/30(金) 08:30 時点", "file_name": "発注案_20261030.html",
  "conclusion": "<一文の結論>",
  "cards": [{ "label": "今日の夕方便で追加", "total": "evening", "tone": "up" }],
  "conditions": [{ "item": "天気", "content": "雨・最高 14℃", "effect": "判断基準 2 に該当" }],
  "reasoning": [{ "rule": "判断基準 2　雨の日", "summary": "<基準の要約>", "applied": "<実際の数字と、どう当てはめたか>" }],
  "notes": ["データはすべて架空店舗の合成データです。", "現在在庫は 08:30 時点で、納品時点の在庫ではありません。"],
  "fetch": [{ "name": "在庫", "expected": 50, "received": 50 }, { "name": "単品の傾向", "expected": 50, "received": 50 }],
  "tables": [
    { "id": "evening", "title": "今日の夕方便（10/30(金) 16:00 納品・締め 10:00）", "kind": "order", "unit_key": "unit", "qty_key": "add", "lot_key": "minlot", "max_qty": 200,
      "empty_text": "今日の夕方便で増やす品目はありません。",
      "columns": [{ "key": "name", "label": "品目" }, { "key": "unit", "label": "単位" }, { "key": "stock", "label": "現在在庫（08:30 時点）", "num": true },
                  { "key": "rest", "label": "本日残りの販売見込み", "num": true }, { "key": "add", "label": "追加提案（発注数）", "num": true },
                  { "key": "minlot", "label": "発注単位", "num": true }, { "key": "reason", "label": "理由" }],
      "rows": [{ "name": "鮭おにぎり", "unit": "個", "stock": 18, "rest": 16.1, "add": 6, "minlot": 2, "reason": "ライブで夕方が伸びる" }] }
  ],
  "charts": [
    { "id": "stock-add", "type": "stacked_hbar", "title": "今日の夕方便: 品目別の現在在庫と追加提案", "table": "evening", "label_key": "name",
      "note": "現在在庫は 08:30 時点。棒の合計は納品時点（16:00）の予想在庫ではありません（納品までに売れる分を引いていない）。",
      "series": [{ "key": "stock", "name": "現在在庫（08:30 時点）" }, { "key": "add", "name": "追加提案（発注数）" }] }
  ]
}
```

- 相談（「この商品、どうする？」）は `tables` に `daily`（日付・単位・納品数・販売数・廃棄数）、`charts` に `grouped_bar` を 1 つ。
- 形が違うと `report_builder.py` が `ng` と直し方を返す。
