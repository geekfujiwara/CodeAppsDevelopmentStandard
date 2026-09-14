# drawing-communication-poc — 図面コミュニケーション ワークベンチ（PoC）

製造設計者が **図面を見ながら指摘し、依頼し、対応を追う**ための Code Apps サンプルです。
図面は版付きの JSON を正本とし、図形は寸法パラメーターから毎回生成します。
再利用できるコア（スキーマ・SVG 描画・会話コントラクト・Python スキル）は
[templates/drawing-communication](../../templates/drawing-communication/README.md) にアドオンとして分離しています。

既定では **Dataverse に接続しません**。会話は DEMO ワーカー（ローカルの寸法規則）が応答し、
UI にもその旨を常時表示します。AI エージェントの応答ではありません。

## 含まれる機能

| ページ | パス | 説明 |
|---|---|---|
| 図面ワークベンチ | `/workbench` | 3 テンプレート選択・寸法/表題欄の編集・A3 SVG プレビュー・図面クリックで注釈追加・注釈一覧・依頼（非同期チャット）・SVG/PDF 出力・Undo・改訂保存 |
| タスク | `/tasks` | 注釈から作ったタスクのカンバン（未着手 / 対応中 / 確認待ち / 完了）、担当者・期限・期限超過 |
| 改訂と候補 | `/revisions` | 未審査候補の差分表示・採用 / 却下・取り消し、改訂履歴と JSON 書き出し |

初回起動時は使い方カルーセルが開き、「使い方を見る」で 9 ステップの画面ツアーが始まります
（ヘッダーの ? ボタンでいつでも再表示）。

### 図面テンプレート

| ID | 内容 | 主な寸法 |
|---|---|---|
| `surface-laptop-exterior` | ノート PC 外観図（平面 / 正面 / 側面の三面図） | 本体幅・奥行・閉時厚さ・開き角・キーボード / タッチパッド |
| `horizontal-pump-assembly` | 横形ポンプ総組立図（側面 / 平面） | ベース寸法・軸心高さ・ケーシング外径・吸込 / 吐出口径・カップリング間隔・モーター |
| `generic-equipment-layout` | 汎用機器配置図（平面） | 室内寸法・通り芯・列数 / 行数・機器寸法・通路幅・保守スペース |

### 非同期の依頼（会話）

- 送信時に **会話 ID / ターン ID / 編集バージョン / 基準ハッシュ** を固定します
- 状態は Pending → Running → Completed（または Failed）として表示します
- 同じターン ID の再送は拒否します
- 待っている間に図面を編集すると、戻ってきた結果は相関不一致として破棄します
- 「待機を打ち切る」はローカルの待機だけを止めます。リモート実行の取り消しではありません
- 候補 JSON は検証を通ったものだけが「未審査の候補」になります。採用は差分を見てから手動で行います

## セットアップ

このサンプルだけなら環境設定なしで動きます（DEMO ワーカー / ローカル下書き）。

```bash
cp .env.example .env
npm install --no-audit --no-fund
npm test
npm run dev
```

Power Apps にデプロイする場合は、共通 `.env`（`.github/skills/standard/references/.env.example`）の
必須項目を `.env` に追記したうえで次を実行します。

```bash
npx pa auth status
npx pa auth switch --account {your-user-principal-name}
npx pa app init --environment-id {your-environment-id} --display-name "図面コミュニケーション"
npx pa app add data-source --connector shared_commondataserviceforapps \
  --connection-ref {your-connection-reference-logical-name} \
  --solution-id {your-solution-id} \
  --org-url https://{org}.crm.dynamics.com/ \
  --non-interactive
npm run build
npm run predeploy
npm run deploy
```

`npm run predeploy` は generic-base 共通のチェック（`.env` の必須項目・`power.config.json`・
ナビとルーターの整合・MCP 直結の禁止・レイアウト崩れの検出）をそのまま実行します。

## Dataverse 接続（任意）

既定は未接続です。接続する場合の差し替え点は **1 ファイル**（`src/services/drawing-backend.ts`）だけです。

| 機能フラグ | 既定 | true にしたときの接続先 |
|---|---|---|
| `VITE_FEATURE_DRAWING_CONVERSATION` | false | 利用者所有の要求 / 結果テーブル（非同期ワーカー） |
| `VITE_FEATURE_DRAWING_STORAGE` | false | 追記専用の改訂テーブル（共有保存） |

テーブル論理名は `{prefix}` を `VITE_PUBLISHER_PREFIX` から組み立てて `.env` で指定します
（コードにテーブル名を直書きしません）。

| 論理名の例 | 用途 |
|---|---|
| `{prefix}_drawing` | 図面台帳 |
| `{prefix}_drawingrevision` | 追記専用の改訂・JSON・ハッシュ |
| `{prefix}_drawingrequest` / `{prefix}_drawingresult` | 利用者所有の非同期要求・結果 |

要求 / 結果テーブルの所有者確認・一意キー・行権限はサーバー側で設計します。画面のフラグは認可ではありません。
設計指針は [conversation-worker.md](../../../agent-flows/references/conversation-worker.md) を参照してください。

## 検証

```bash
npm test        # 図面スキーマ / 相関 / 重複ターン / 差分 / 状態遷移
npm run build   # tsc -b && vite build
npm run predeploy
```

Python スキル（A3 PDF と注釈一覧の生成）はアドオン側にあります。

```bash
python -m pip install -r ../../templates/drawing-communication/agent-skill/requirements.txt
python -X utf8 ../../templates/drawing-communication/agent-skill/renderer.py --input sample.json --pdf review-UNIQUE.pdf
```

## カスタマイズポイント

| 変更箇所 | 説明 |
|---|---|
| `VITE_CODEAPPS_APP_NAME`（.env） | アプリ名 |
| `src/config.ts` の `NAV_SECTIONS` | ページ構成（`src/router.tsx` と同じ path にする） |
| `src/config.ts` の `ASSIGNEES` | 担当者候補（表示名のみ。権限判定には使わない） |
| `src/drawing/drawing-templates.ts` | テンプレートの追加・寸法範囲の変更（アドオンの `agent-skill/schema.json` も合わせて更新する） |
| `src/services/drawing-backend.ts` | Dataverse アダプターの差し替え点 |
| `src/guide-config.ts` | 使い方カルーセルと画面ツアー |

## 範囲と限界

- 図形は検討用の作図です。CAD ではありません。干渉・強度・熱・流体・電気保護・法規・公差は評価しません
- ブラウザの PDF 出力は A3 1 ページの **ラスター**（JPEG 埋め込み）です。文字検索も寸法の再計測もできません。
  ベクター PDF と注釈一覧はアドオンの Python スキルで生成します
- 下書きは `localStorage` に保存します。共有保存ではありません
- DEMO ワーカーの指摘は決め打ちの寸法規則です。AI の評価でも設計の妥当性の証明でもありません
- 実エージェント応答・Dataverse の権限・共有保存の競合・公開ホストでの動作は、導入先で別途確認が必要です
