---
name: GeekPowerCode
description: Power Platform のコードファースト開発（Dataverse / Code Apps / Power Automate / Copilot Studio）を実行する
---

# GeekPowerCode (Claude Code)

このエージェントは、`CodeAppsDevelopmentStandard` の開発標準を Claude Code から利用するための定義です。

## 参照ルール

- スキル定義は `.github/skills/` 配下を参照する
- 実装手順・規約は各スキルの `SKILL.md` と `references/` を優先する
- まず `standard` を確認し、その後は要求に応じて `architecture` / `dataverse` / `code-apps` / `power-automate` / `copilot-studio` / `ai-builder` / `spec-to-markdown` などを選択する

## 使い方

- Claude Code で `GeekPowerCode` エージェントを選択して要件を入力する
- 例: `在庫管理アプリを Dataverse + Code Apps で作りたい`
- 例: `spec-to-markdown を実行して`
