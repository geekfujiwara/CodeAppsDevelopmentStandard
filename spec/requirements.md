# Drawing Communication PoC Requirements

## Status

🟡 実装中

## Goal

Code Apps 上で図面テンプレートを選び、Copilot Studio v2 の非同期ワーカーへ自然言語で作図・修正を依頼し、検証済み JSON から SVG/PDF を生成する。AI 注釈と手入力注釈をチームで管理し、タスク化、図面改訂への反映、Teams 通知までを一気通貫で検証する。

## Approved Scope

- 対象環境: 現在の `usdevgeek01` 開発環境
- 実装レベル: PoC、対象環境への実デプロイまで
- AI: Copilot Studio v2 + Workflow Agent ノードによる非同期要求/結果方式
- UI: React/TypeScript の Code Apps、Slate Mono ベース
- データ: Dataverse。利用者は `systemuser`、チームは標準 Team を再利用
- 通知: Teams の担当者メンションと Code Apps ディープリンク
- AI 出力: 未審査提案。人の採用前に共有改訂へ反映しない
- 初期テンプレート: ノート PC 外観一般図、横形ポンプ総組立図、汎用機器配置図
- 成果物: Code Apps、Dataverse スキーマ、v2 スキル、Workflow、PDF/SVG、再利用テンプレート、スキル更新 PR

## Functional Acceptance

- [x] 図面テンプレートを選択し、初期 JSON と SVG プレビューを表示できる
- [x] アプリ内チャットから要求を登録し、受付済み・実行中・完了・失敗を表示できる
- [x] v2 応答の conversation/turn/version/base hash を検証できる
- [x] AI 候補 JSON をスキーマと業務ルールで検証し、差分確認後にドラフトへ採用または却下できる
- [x] SVG と A3 PDF を出力でき、PDF に注釈を含められる
- [x] 図面上で注釈を追加・編集し、一覧、コメント、担当者、期限、状態を管理できる
- [x] 注釈からタスクを作成し、対応済み改訂を追跡できる
- [ ] Teams へ担当者メンション付き通知を送信し、対象注釈へのディープリンクを含められる
- [x] 改訂保存時に基準 revision/hash の競合を検出できる
- [x] 同じ turn の重複イベントで v2 を二重実行しない

## Security And Reliability Acceptance

- [ ] 要求と結果はユーザー所有で、別の一般利用者から読み書きできない
- [x] クライアント指定の identity/engine/completed status を信頼しない
- [x] タイムアウト時は同一 receipt を照合し、自動的に別要求を作らない
- [x] AI 結果は共有保存・発行・通知を直接実行しない
- [x] 外部文章・図面 JSON はデータとしてフェンスし、指示として実行しない
- [x] Dataverse、Agent node、Teams の DLP/ACP チェックに合格する

## Deployment Acceptance

- [x] Code Apps の `npm run predeploy` が成功する
- [x] Dataverse テーブル、Code Apps、Workflow、v2 bot が同一ソリューションに所属する
- [x] v2 bot のスキル添付内容をダウンロードしてハッシュ照合する
- [x] Workflow の実行受付、完了、構造化応答を別々に確認する
- [ ] Code Apps を対象利用者へ共有し、デプロイ URL を記録する
- [ ] デスクトップとモバイル幅で主要ワークフローを実ブラウザ検証する

## Reuse Acceptance

- [x] Code Apps の再利用可能な drawing-communication 追加テンプレートを作成する
- [x] v2 drawing skill を環境非依存のフラット Python バンドルとして作成する
- [x] 実装・デプロイで得た知見を該当スキルの正常系または references に反映する
- [x] テンプレートとスキルを標準検証し、既存 PR を確認して PR を作成または更新する