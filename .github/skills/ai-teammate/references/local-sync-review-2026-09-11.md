# ai-teammate ローカル最新版同期レビュー（2026-09-11）

`C:\dev\hunter` の実装・スキルを検証元、GitHub の
`geekfujiwara/CodeAppsDevelopmentStandard` を公開元として比較した結果と対応状況を記録する。
この文書は実値を持ち込まず、公開スキルへ反映する汎用的な正常フローだけを対象にする。

## 比較結果

| ID | 優先度 | 状態 | 更新対象 | 判断 |
|---|---|---|---|---|
| S1 | P0 | ✅ 実装済 | B17 画像生成の正常フロー | 公開側は C# scaffold を持つが、モデルの事前検証スクリプト、環境変数、手順、検証項目が欠落していたため反映した |
| S2 | P0 | ✅ 実装済 | B17 と scaffold/deploy の接続 | B17 選択時に必要ファイル・依存ブロック・事前検証が常に有効になることをテストで固定した |
| S3 | P0 | ✅ 実装済 | Evaluation Hub の CLI 整合 | `npx pa` の group CLI を使う公開フローに対して CLI 0.15.2 が固定されていた。Code Apps 標準の SDK 1.3.x / CLI 1.x と deploy 順序へ統一した |
| S4 | P1 | ✅ 実装済 | update-skills 最終レビュー | 構成、Step 番号、秘匿化、自動化、正常系、テンプレート同期を機械検証した |

## 段階的な対応

### Stage 1: B17 の正常フローを復元する

- `scripts/provision_image_model.py` を追加し、利用可能モデル一覧からバージョンを解決する。
- `--check` では変更せず、モデル未提供、バージョン不一致、既存 deployment のドリフトで停止する。
- `references/image-generation.md`、`references/feature-blocks.md`、`references/.env.example`、
  `references/digital-colleague-design.md`、`SKILL.md` を更新する。
- `ImageGenerationTools.cs` は既存の汎用 scaffold テンプレートを正とし、重複テンプレートを増やさない。

受け入れ条件:

- B17 の選定からモデル事前検証、構成、デプロイ後検証まで正常フローだけで辿れる。
- Azure OpenAI のモデル名・バージョンを推測せず、未提供時に作成処理へ進まない。
- 画像生成をメールなどの未信頼コンテンツから自動実行しない制約が明記される。

### Stage 2: scaffold と事前検証を固定する

- `scaffold_ai_teammate.py` の B17 依存関係（B3、B14、B12）とファイル出力をテストする。
- B17 有効時だけ画像モデルの preflight を deployment plan に含める。
- `provision_image_model.py` のモデル選択、`--check`、ドリフト拒否を単体テストする。

受け入れ条件:

- B17 を選ぶと `ImageGenerationTools.cs` と依存ブロックが生成される。
- B17 を選ばない構成では画像モデルの Azure 操作を計画しない。
- Windows でも shell 文字列実行や対話入力に依存しない。

### Stage 3: Evaluation Hub の deploy を正常化する

- Evaluation App の SDK、CLI、`deploy` を Code Apps の generic-base と同じバージョン範囲・順序へ統一する。
- scaffold テストで package script の回帰を検出する。

受け入れ条件:

- `npm run build`、`npm run predeploy`、`npx pa app push` の順で実行される。
- `@microsoft/power-apps-cli` 1.x の `pa` bin を明示的な devDependency として持つ。
- 実デプロイは行わず、lint、build、predeploy の非破壊検証まで実施する。

### Stage 4: update-skills による最終レビュー

- `manage_skill_pr.py` で関連 PR がないことを確認し、本更新を単一 PR にする。
- `validate_skill.py`、単体テスト、生成 .NET build、Evaluation App lint/build、`git diff --check` を実行する。
- 実 GUID、テナント URL、メール、シークレット、生成物をスキャンする。
- 公開側だけにある scaffold、deployment orchestration、Evaluation Hub、ALM 連携は維持する。

受け入れ条件:

- すべての検証が成功し、既知の固有値ヒットが 0 件になる。
- `.env`、`a365.generated.config.json`、`bin`、`obj`、`dist`、`node_modules`、`__pycache__` を含めない。

## 反映しない差分

- `hunter3-agent` の namespace、エージェント名、固定 publisher prefix、Azure リソース名。
- `.env`、`a365.config.json`、`a365.generated.config.json`、認証情報、実 GUID、実 URL、実メール。
- ローカルの手動コピー中心の scaffold。公開側の AskUserQuestion decision JSON による一括 scaffold を維持する。
- 公開側にのみ存在する Evaluation Hub、deployment orchestration、単体テスト、ALM scaffold の削除。
- コメントやブランド文言だけの差分で、公開テンプレートの方が汎用的なもの。

## レビュー記録

- `manage_skill_pr.py --skill ai-teammate --repo geekfujiwara/CodeAppsDevelopmentStandard`: 関連オープン PR 0 件。
- `npx pa app push --help`: CLI 0.15.2 ではローカル `pa` bin がなく、無関係な `pa@0.1.1` のインストール要求を確認して中止。Code Apps 標準の CLI 1.x へ同期する判断材料とした。
- `EvaluationDataverse.cs` と `EvaluationRunner.cs`: 環境依存値を除く機能差分なし。
- `AspNetExtensions.cs`: ローカル側は XML コメントが詳細だが、動作差分ではないため本更新の対象外。
- `validate_skill.py`: `✅ ai-teammate`。
- 単体テスト: 68 件成功（image deployment create argv テストを含む）。
- B1〜B17 full scaffold: 任意 prefix で生成し、.NET 8 Release build が警告 0 / エラー 0。
- Evaluation App: `@microsoft/power-apps-cli` 1.0.1、`npx pa --version`、ESLint が成功。
- 既知のテナント固有値スキャン: 0 件。
- 独立差分レビュー: 実行阻害、秘匿化違反、正常フローの欠落なし。モデル/SKU の取得元コメントと
  image deployment create argv の回帰テストを追加した。