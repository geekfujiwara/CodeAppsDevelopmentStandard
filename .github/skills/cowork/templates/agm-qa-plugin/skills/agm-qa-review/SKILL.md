---
name: agm-qa-review
description: |
  株主総会の想定問答を点検し、根拠の IR 抜粋に無い数値・存在しない根拠 ID・回答者や注意事項の抜け・趣旨の重複・下書きのまま残っているものを一覧にするスキル（書き込みはしない）。
  Use when ユーザーが「想定問答を点検して」「根拠の無い数値が無いか確認して」「下書きの想定問答を一覧にして」と依頼したとき。
  Dataverse MCP コネクタ（describe / read_query / search_data）を使用する。
license: MIT
metadata:
  author: "${COWORK_DEVELOPER_NAME}"
  version: "1.0"
---

# 想定問答の点検

総会前の最終確認として、想定問答の品質を機械的に点検する。**読み取りだけ**で、直すのはアプリの想定問答の画面（または agm-qa-authoring）で行う。

## 必須ルール

- 書き込み系のツールは呼ばない。
- 数値の判定は、回答・要点の数値が `根拠 ID` の IR 抜粋の本文に**同じ表記で**あるか（全角半角・カンマは揃えて比べる）。
- 推測で列名を書かない（Step 1 の `describe` を使う）。

## 対象テーブル（接頭辞 `${PUBLISHER_PREFIX}`）

| テーブル | 主な列 |
|---|---|
| `${PUBLISHER_PREFIX}_agmqa` | `_name`, `_category`, `_question`, `_variants`, `_answer`, `_answerpoints`, `_responder`, `_sourceids`, `_cautions`, `_status`, `_createdvia` |
| `${PUBLISHER_PREFIX}_agmirexcerpt` | `_name`, `_doctitle`, `_section`, `_page`, `_text` |

## ワークフロー

### Step 1: スキーマを確認する

`describe` で両テーブルを確認する。

### Step 2: 全件を読む

`read_query` で想定問答と IR 抜粋を全件読む（件数が多ければ分類ごとに分ける）。

### Step 3: 点検する

| 観点 | 判定 |
|---|---|
| 根拠の無い数値 | 回答・要点の数値が根拠 IR の本文に無い |
| 存在しない根拠 ID | `_sourceids` のコードが IR 抜粋に無い |
| 抜け | 回答者・注意事項・キーワードが空 |
| 重複 | 質問の趣旨が同じ問答が複数ある（言い換えへの統合を提案） |
| 下書き | `_status` が「下書き」のまま（作成元も示す） |

### Step 4: 報告する

```
## 想定問答の点検（{件数} 件）
- 要修正 N 件 / 確認 M 件 / 下書き K 件
| コード | 観点 | 内容 | 直し方 |
|---|---|---|---|
```
