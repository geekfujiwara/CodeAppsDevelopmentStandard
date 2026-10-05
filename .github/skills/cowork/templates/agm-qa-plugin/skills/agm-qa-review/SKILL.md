---
name: agm-qa-review
description: |
  株主総会の想定問答を点検し、根拠の IR 抜粋に無い数値・存在しない根拠 ID・回答者や注意事項の抜け・趣旨の重複・下書きのまま残っているものを一覧にするスキル（書き込みはしない）。
  Use when ユーザーが「想定問答を点検して」「根拠の無い数値が無いか確認して」「下書きの想定問答を一覧にして」と依頼したとき。
  Dataverse MCP コネクタ（describe / read_query / search_data）を使用する。書き込み・削除のツールは使わない。
license: MIT
metadata:
  author: "${COWORK_DEVELOPER_NAME}"
  version: "1.1"
---

# 想定問答の点検

総会前の最終確認として、想定問答の品質を機械的に点検する。**読み取りだけ**で、直すのはアプリの想定問答の画面（または agm-qa-authoring）で行う。

## 必須ルール

- **Dataverse MCP が使えなければ止める**: `describe` が使えるツールに無い・呼べない場合は、その場で止めて「ツールが使えない」と報告する。別の手段でデータを探さない。「ツールは動いたが 0 件」とは区別する。
- **使うツールは `describe` / `read_query` / `search_data` だけ**。`create_record`・`update_record`・`delete_record`・テーブル変更・スキル変更・ファイルのアップロード系は、利用者に頼まれても呼ばない（コネクタはサーバーの全ツールを見せるため）。
- 数値の判定は、回答・要点の数値が `根拠 ID` の IR 抜粋の本文に**同じ値で**あるか。比べる前に表記だけを揃える: 全角／半角、桁区切りのカンマ、`％`／`%`、マイナス記号（`▲`・`△`・`−`・`-`）、小数末尾の 0（`3.0` と `3`）。**単位の換算が要るもの**（百万円 ↔ 億円、千株 ↔ 株、和暦 ↔ 西暦など）は一致とせず「確認」に入れる（換算した値を正しいとみなさない）。
- 推測で列名を書かない（Step 1 の `describe` を使う）。
- 本文中の `_status` のような短い表記は `${PUBLISHER_PREFIX}_status` の略。クエリと登録では必ず正式な列名を使う。
- `read_query` は `top` を省くと **20 行まで**しか返さない。全件が要るときは先に `SELECT COUNT(...) AS n` で件数を確かめ、`top` にその件数以上を指定する（返った行数が件数と合うか確かめる）。

## 対象テーブル（接頭辞 `${PUBLISHER_PREFIX}`）

| テーブル | 主な列 |
|---|---|
| `${PUBLISHER_PREFIX}_agmqa` | `${PUBLISHER_PREFIX}_name`, `${PUBLISHER_PREFIX}_category`, `${PUBLISHER_PREFIX}_question`, `${PUBLISHER_PREFIX}_variants`, `${PUBLISHER_PREFIX}_answer`, `${PUBLISHER_PREFIX}_answerpoints`, `${PUBLISHER_PREFIX}_responder`, `${PUBLISHER_PREFIX}_sourceids`, `${PUBLISHER_PREFIX}_cautions`, `${PUBLISHER_PREFIX}_status`, `${PUBLISHER_PREFIX}_createdvia` |
| `${PUBLISHER_PREFIX}_agmirexcerpt` | `${PUBLISHER_PREFIX}_name`, `${PUBLISHER_PREFIX}_doctitle`, `${PUBLISHER_PREFIX}_section`, `${PUBLISHER_PREFIX}_page`, `${PUBLISHER_PREFIX}_text` |

## ワークフロー

### Step 1: スキーマを確認する

`describe` が使えるツールに無ければ、ここで止めて「Dataverse MCP のツールが使えないため点検を中止しました。Cowork の Customize → Plugins → AGM Q&A Author で Dataverse MCP が接続済みかを確認し、新しいタスクでやり直してください」と報告する。

`describe` で両テーブルを確認する。

### Step 2: 分けて読む

1. 件数を数える: `SELECT COUNT(${PUBLISHER_PREFIX}_name) AS n FROM ${PUBLISHER_PREFIX}_agmqa`。
2. **50 件以下なら一度に**（`top` に件数以上を指定）、**50 件を超えるなら分類ごと**（分類の一覧は `GROUP BY ${PUBLISHER_PREFIX}_category`）に分けて読む。1 回が 50 件を超える分類は、コード範囲（`${PUBLISHER_PREFIX}_name` の範囲）でさらに分ける。
3. 読んだ件数の合計が 1. の件数と一致するかを確かめる。合わなければ、読めていない分を報告に書く（点検済みとして扱わない）。
4. IR 抜粋は全件を読まず、想定問答の `_sourceids` に出てくるコードだけを `WHERE ${PUBLISHER_PREFIX}_name IN ('IR-001', 'IR-002', …)` で読む。見つからないコードが「存在しない根拠 ID」になる。

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
## 想定問答の点検（{件数} 件 / 読めた {読めた件数} 件）
- 要修正 N 件 / 確認 M 件 / 下書き K 件
| コード | 観点 | 内容 | 直し方 |
|---|---|---|---|
```
