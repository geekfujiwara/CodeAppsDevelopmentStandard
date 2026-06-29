---
name: update-skills
description: "スキル（SKILL.md）を新規作成・更新し、リモートへ PR を作成・更新する。SKILL.md は正常系、references に参考情報・異常系、scripts に汎用化したスクリプトを置き、パラメータは .env.example へ外出しする（実値は .env）。会社・個別情報を秘匿化し、番号整合・自動化（Learn/Playwright MCP）・既存オープン PR との整合（更新優先・マージ順提示）までレビューする。"
category: architecture
triggers:
  - "スキル作成"
  - "スキル更新"
  - "スキルを作る"
  - "SKILL.md 作成"
  - "SKILL.md 更新"
  - "skill 作成"
  - "update skill"
  - "スキルを PR"
  - "スキルの PR"
  - "スキルをリモートに"
  - "スキル公開"
  - "スキルカタログ更新"
  - "update-skills"
---

# スキル作成・更新 & PR 作成スキル

スキル（`SKILL.md` + `references/` + `scripts/`）を**新規作成または更新**し、
**リモートリポジトリへ PR を作成・更新**するまでを一貫して行う。

このスキル自身が「良いスキルの形」のテンプレートになっている。守るべき原則は以下の 5 つ。

| 原則 | 内容 |
|---|---|
| 役割分離 | `SKILL.md` = **正常系**のみ。参考情報・**異常系**は `references/`、利用スクリプトは `scripts/` |
| 汎用化 | テナント・組織・テーマに依存しない。パラメータは `references/.env.example` に定義し、**実値は `.env`** から読む |
| 秘匿化 | 会社名・個別プロジェクト名・実 GUID・URL・メール・シークレットを排除（→ Step 3 のスキャン） |
| シンプル | 本文は短く。冗長な説明は `references/` に逃がす。手順の番号は**整数の Step** で統一 |
| 自動化優先 | 公式仕様は **Microsoft Learn MCP** で検証、ブラウザ操作は **Playwright MCP** で自動化（→ Step 4） |

> 前提ツール: Git、GitHub CLI（`gh`、認証済み）、Python 3。
> 異常系・詰まりどころは [references/troubleshooting.md](references/troubleshooting.md)、
> PR の更新/新規判断とマージ順は [references/pr-strategy.md](references/pr-strategy.md) を参照。

## スキル同梱スクリプト（再利用）

`scripts/` は汎用化済み。値は引数または `.env`（[references/.env.example](references/.env.example) 参照）から取得する。

| スクリプト | 用途 |
|---|---|
| [scripts/validate_skill.py](scripts/validate_skill.py) | 構成検証: フォルダ名＝`name` 一致 / Step 番号が整数連番 / `references`・`scripts` の有無 / 役割分離（異常系の直書き）/ 集約ファイル登録・`.env.example` カバレッジ・内部リンク実在・frontmatter lint / 秘匿情報スキャン（Step 3・7） |
| [scripts/manage_skill_pr.py](scripts/manage_skill_pr.py) | リモートのオープン PR を走査し、対象スキルに触れる PR を検出して「更新 or 新規」とマージ順を提示（Step 5） |
| [scripts/publish_skill.py](scripts/publish_skill.py) | 公開を一括自動化: PR 先リポジトリを一時 clone → ブランチ → スキル＋集約ファイルをコピー → 検証 → commit → push → PR 作成/更新（Step 6）。`--dry-run` 対応 |

## 標準フォルダ構成

```
<skill-name>/                 # kebab-case。frontmatter name と完全一致
├── SKILL.md                  # 正常系のワークフロー（Anthropic 上限 5,000 語≈6,500 トークン。日本語は密なので文字数=ほぼトークン数で見る）
├── references/               # 参考情報・異常系（オンデマンド読込）
│   ├── troubleshooting.md    # 異常系・既知の不具合
│   ├── .env.example          # スクリプトが使うパラメータの定義（実値は書かない）
│   └── <topic>.md            # その他の参考資料（任意）
└── scripts/                  # 利用したスクリプト（すべて汎用化）
    └── <verb>_<noun>.py
```

## ワークフロー（正常系）

### Step 0: 対象を決める（新規 / 更新）

1. **新規か更新か**を確認する。更新なら対象スキル名、新規ならスキル名（kebab-case）とカテゴリを決める。
2. 既存スキルの規約は [スキルカタログ README](../README.md) に従う（フォルダ名＝`name`、命名規則、カテゴリ）。
3. 更新時はまず対象 `SKILL.md` を読み、変更範囲を把握する。

### Step 1: 構成を整える（役割分離）

1. **`SKILL.md`（正常系）**: 番号付き **Step** でワークフローを書く。トリガー語・使用ツール・出力フォーマットを明示。
   冗長な背景説明やコード全文は書かず `references/` へ逃がす。
2. **`references/`（参考・異常系）**: `troubleshooting.md`（異常系）と必要な参考資料を置く。
3. **`scripts/`（利用スクリプト）**: 手順内で使ったスクリプトを置く。手作業を残さずスクリプト化する。
4. **集約ファイルの同時更新（新規スキル時は必須）**: スキルを新規追加したら、カタログ `../README.md` の
   一覧表と、参照する `../../agents/*.agent.md` のスキル表にも**1 行追加**する（追加漏れの定番）。

> frontmatter は `name`（フォルダ名と一致）/ `description` / `category` / `triggers` を必須とする
> （[README の YAML 規約](../README.md) 準拠）。`description` にトリガー語は詰め込みすぎない。

### Step 2: 汎用化・秘匿化（.env 外出し）

1. スクリプト・本文から**環境依存値を排除**し、引数か環境変数（`.env`）で受け取る形にする。
2. 必要なパラメータは [references/.env.example](references/.env.example) に**プレースホルダー付き**で定義する
   （取得元コメントを 1 行添える）。**実値は `.env`** に置き、`.gitignore` で除外する。
3. 会社名・個別プロジェクト名・固有のテーブル/プレフィックスを一般名に置換する
   （例: 実プレフィックス → `${PUBLISHER_PREFIX}`、実組織 → `https://<org>.crm.dynamics.com`）。

> 詳細な置換パターンは [package-sample スキル](../package-sample/SKILL.md) のセキュリティスキャン節も参照。

### Step 3: 構成・秘匿情報を検証する

`validate_skill.py` で機械的に検証する（手作業でのチェックを残さない）。

```powershell
# 対象スキルを検証（フォルダ名＝name / Step 整数連番 / references・scripts 有無 / 秘匿情報）
python .github/skills/update-skills/scripts/validate_skill.py .github/skills/<skill-name>

# 全スキルを一括検証
python .github/skills/update-skills/scripts/validate_skill.py --all
```

検出された問題（番号飛び・フォルダ名不一致・実 GUID/URL/メール残存など）を**すべて解消**してから次へ進む。

### Step 4: 自動化レビュー（Learn 検証 / Playwright）

手順が「人手前提」になっていないか見直し、可能な限り自動化に置き換える。

1. **公式仕様の検証**: API 名・スコープ・エンドポイント等は **Microsoft Learn MCP**（`microsoft_docs_search` /
   `microsoft_docs_fetch`）で裏取りし、推測を残さない。Learn MCP が無い場合のみ Web 取得にフォールバック。
2. **ブラウザ操作の自動化**: ポータル操作が必要な手順は **Playwright MCP**（`browser_navigate` /
   `browser_click` / `browser_snapshot` 等）で自動化できる形に書く。手動 UI 操作は最終手段とし、
   その場合も画面パスとセレクタの目印を明記する。
3. **CLI 化**: 繰り返す操作は `scripts/` に追加し、本文からはスクリプト呼び出しで参照する。

### Step 5: PR 戦略を決める（更新 / 新規 + マージ順）

コンフリクトを避けるため、**まず既存のオープン PR を調べる**。

```powershell
# 対象スキルに触れているオープン PR を検出し、更新/新規とマージ順を提示
python .github/skills/update-skills/scripts/manage_skill_pr.py --skill <skill-name>
```

判定ルール（詳細は [references/pr-strategy.md](references/pr-strategy.md)）:

- **同じスキル/同じファイルに触れるオープン PR がある** → その PR のブランチに**追記して更新**（新規を切らない）。
- **無関係な変更（別スキル・別ファイル）** → **新規 PR で OK**。ただし依存関係に応じた**マージ順を提示**する。
- 迷ったら、ベースに近い（小さく独立した）PR を先にマージする順序を提案する。

### Step 6: PR を作成 / 既存 PR を更新する

> **前提（作業ディレクトリ ≠ PR 先リポジトリ）**: スキルを編集している場所が PR 先リポジトリの作業ツリー
> とは限らない（git 管理外のワークスペースで編集していることがある）。その場合は **PR 先リポジトリ
> （`SKILL_PR_REPO`）を一時 clone** し、そこへスキルをコピーして PR を作る。

**推奨（自動）**: 一括スクリプトで実行する。clone → ブランチ → コピー → 検証 → commit → push → PR まで自動。

```powershell
# .env に SKILL_PR_REPO を設定（owner/repo）。新規スキル時は集約ファイルを --extra で同時反映
python .github/skills/update-skills/scripts/publish_skill.py --skill <skill-name> `
  --extra .github/skills/README.md --extra .github/agents/<Agent>.agent.md
# push せず検証だけ確認したいとき
python .github/skills/update-skills/scripts/publish_skill.py --skill <skill-name> --dry-run
```

- 既存の同名ブランチ/PR があれば**更新**（新規 PR を作らない）。
- commit 用の git identity は `gh` のログインユーザーから自動解決する。

**手動で行う場合**:

1. 対象リポジトリの作業クローンを用意（既存ブランチがあればそれを `checkout`）。
2. スキルの差分（`SKILL.md` / `references/` / `scripts/`）＋集約ファイルをクローンへ反映する。
3. **push 前に再度 `validate_skill.py` を実行**し、秘匿情報が混入していないことを確認する。
4. コミット → `gh pr create`（新規）または既存ブランチへ `git push`（更新）。
   既存 PR 更新時は新しい PR を作らない。
5. 新規 PR の場合は、本文に **Step 5 で決めたマージ順**を記載する。

> シークレット（`.env` の値・クライアントシークレット等）は**絶対にコミット・出力しない**。
> push 前スキャンで 1 件でもヒットしたら中止して修正する。

### Step 7: 最終レビュー

[検証チェックリスト](#検証チェックリスト) を上から確認する。特に **Step 番号が整数連番**であること、
**Learn/Playwright で自動化されているか**、**オープン PR との整合（更新優先・マージ順提示）**を最終確認する。

## 検証チェックリスト

- [ ] フォルダ名 ＝ frontmatter `name`（kebab-case）／`category`・`triggers` あり
- [ ] `SKILL.md` は正常系のみ。異常系（よくあるエラー/トラブル/デバッグ等）は `references/troubleshooting.md`、参考は `references/`（`validate_skill.py` の役割分離 WARN が出ないこと）
- [ ] 利用スクリプトは `scripts/` に集約。手作業を極力残していない
- [ ] 新規スキルは README カタログ＋参照する `agents/*.agent.md` のスキル表にも 1 行追加した（登録漏れ WARN が出ないこと）
- [ ] パラメータは `references/.env.example` に定義、実値は `.env`（`.gitignore` 済み）（カバレッジ WARN が出ないこと）
- [ ] SKILL.md/references の Markdown リンクが実在する（リンク切れ WARN が出ないこと）
- [ ] `description` は要点に絞り `triggers` を詰め込みすぎない／本文が肥大していない（frontmatter lint WARN が出ないこと）
- [ ] 会社名・個別 PJ 名・実 GUID/URL/メール/シークレットが無い（`validate_skill.py` が ✅）
- [ ] 手順の番号は**整数で連番**（`Step N` / `## N.` / `フェーズ N` いずれも飛び・重複なし）
- [ ] 公式仕様は **Learn MCP** で検証、ブラウザ操作は **Playwright MCP** で自動化
- [ ] 既存オープン PR を確認（`manage_skill_pr.py`）→ 関連あれば**更新**、無関係なら**新規＋マージ順提示**
- [ ] push 前に秘匿情報スキャン済み

## 参考リンク

- [スキルカタログ README](../README.md)
- [package-sample（汎用化・秘匿化の詳細）](../package-sample/SKILL.md)
- [PR 戦略（更新/新規・マージ順）](references/pr-strategy.md)
- [異常系・トラブルシュート](references/troubleshooting.md)
