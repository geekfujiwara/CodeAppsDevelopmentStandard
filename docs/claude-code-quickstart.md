# Claude Code でのクイックスタート

[README のクイックスタートへ戻る](../README.md#クイックスタート)

Claude Code からも、このリポジトリの開発標準とスキルを参照して開発できます。[前提条件・ライセンス要件](../README.md#前提条件)を確認してから、次の手順で始めてください。

## 1. 開発標準を取得する

プロジェクトのルートでエージェント・スキルと `.gitignore` を配置します。

```bash
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/agents .github/agents
npx degit geekfujiwara/CodeAppsDevelopmentStandard/.github/skills .github/skills
cp .github/skills/standard/references/gitignore-template .gitignore
```

自社標準リポジトリをコピー済みなら、再取得して自社変更を上書きせず、コピーしたフォルダーを使ってください。既存プロジェクトの `.gitignore` は置き換えず、必要な除外設定を統合します。

## 2. プロジェクトルートで Claude Code を起動する

エージェントの指示は [GeekPowerCode](../.github/agents/GeekPowerCode.agent.md)、共通ルールは [standard スキル](../.github/skills/standard/SKILL.md) にあります。

`.github/agents/` は GitHub Copilot 向けの定義です。Claude Code がこれをネイティブな `.claude/agents/` 定義として自動登録する前提にはせず、まず次のようにファイルを明示して読み込ませます。

```text
.github/agents/GeekPowerCode.agent.md と .github/skills/standard/SKILL.md を読み、その開発ルールに従って進めてください。作業に該当するスキルは .github/skills/README.md から選び、該当する SKILL.md を実装前に読んでください。
```

## 3. 作りたいテーマを伝える

```text
在庫管理をもっと効率的に行いたい。architecture スキルで要件を確認し、構成を提案してください。実装は構成の承認と環境・DLPチェックが完了してから始めてください。
```

- 既存仕様書がある場合: `spec-builder を実行して`（資料は `spec/input/` に配置）
- AI チームメイトの場合: `予定調整をしてくれる同僚エージェントを Teams に置きたい。ai-teammate スキルで構成を提案して。`

`architecture` スキルがヒアリングを経て Code Apps を選定した場合にのみ、`code-apps` スキルがテンプレートの `package.json` / `package-lock.json` をコピーして `npm install` を実行します。Code Apps 以外の構成では、不要な `node_modules` を生成しません。

> [!NOTE]
> `GeekPowerCode` の `model: auto` は GitHub Copilot 向けの設定で、Claude Code のモデル選択を変更しません。Claude Code のモデルは利用契約・組織ポリシーに従って選択してください。`.env` や認証情報はコミットせず、`.gitignore` の除外設定を確認してください。

自社標準への展開は [コピー後の推奨事項](company-standard-next-steps.md)、利用するスキルは [スキルカタログ](../.github/skills/README.md) を参照してください。
