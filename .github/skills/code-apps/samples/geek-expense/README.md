# geek-expense — 経費精算管理

経費申請・承認・分析を一元管理する Code Apps サンプル。
Power Automate 承認フロー連携と Copilot Studio 連携をオプションで有効化できます。

## 含まれる機能

- **ダッシュボード**: 今月の経費集計・承認待ち件数・ステータス別グラフ
- **経費申請**: 申請の作成・編集・提出・削除
- **承認**: 申請中の経費を承認・差戻し（Power Automate 連携でメール通知）
- **分析**: カテゴリ別・月別・部門別の集計グラフ

## 使い方

1. 共通 `.env.example`（standard/references）を `.env` にコピーして共通設定を入力
2. `samples/geek-expense/.env.example` の内容を `.env` に追記
3. 機能フラグ（`VITE_FEATURE_*`）を用途に合わせて設定
4. `pac code init` + `pac code add-data-source` でデータソースを追加
5. `npm run dev` で動作確認

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名を変更 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成を変更 |
| `VITE_FEATURE_APPROVAL_FLOW=true`（.env） | Power Automate 承認フロー有効化 |
| `VITE_FEATURE_COPILOT=true`（.env） | Copilot Studio 連携有効化 |

## Dataverse テーブル

`{prefix}` は `PUBLISHER_PREFIX` の値（例: `PUBLISHER_PREFIX=myco` → `myco_expense`）

| テーブル論理名 | 用途 |
|---|---|
| `{prefix}_expense` | 経費申請 |

## セットアップ

```bash
# Dataverse テーブルの作成
python scripts/setup_dataverse.py

# データソースの追加
python scripts/toggle_table_lang.py en
pac code add-data-source -a dataverse -t ${PUBLISHER_PREFIX}_expense
python scripts/toggle_table_lang.py jp
```
