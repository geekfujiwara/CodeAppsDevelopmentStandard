# Agent Skills をチームメイトに持たせる

スキル（`SKILL.md`）は、その組織で合意された「正しいやり方」である。
持たせないとチームメイトは自己流で答える——もっともらしく、しかし社内の手順とは違うやり方で。

## どこから来るか

既定の配布元は [geekfujiwara/copilot-cowork-skills](https://github.com/geekfujiwara/copilot-cowork-skills)
のリリース資産（`skills-manifest.json`）である。

```powershell
# 全部入れる（scaffold 時に自動実行される）
python scripts/install_agent_skills.py --target .

# 特定のスキルだけ
python scripts/install_agent_skills.py --target . --only expense-report

# 入っているものと配布元のドリフトを見る（書き込まない）
python scripts/install_agent_skills.py --target . --check
```

別のリポジトリを使う場合は `--repo owner/name` を渡す。

## なぜエージェントに**同梱**するのか

Copilot SDK にはホスト側のディスカバリー（動いているマシンの `SKILL.md` を拾う機能）があるが、
このスキルでは**無効のまま**にしている。エージェントが、たまたま同居していた手順書を
勝手に取り込むべきではないからである。同梱すれば、どの版のスキルで動いていたかが
コンテナー イメージと 1 対 1 で対応し、あとから再現できる。

```python
options["enable_skills"] = True
options["skill_directories"] = [str(d) for d in skill_dirs]   # 明示したものだけ
```

## 置き場所はホスティング方式で変わる

| ホスティング | 置き場所 | 理由 |
|---|---|---|
| 自己ホスト（C#） | `<プロジェクト>/skills/` | アプリのルートから読む |
| Foundry Autopilot | `src/<パッケージ>/skills/` | コンテナー イメージに入るのは **Python パッケージだけ**。リポジトリのルートに置くとビルド時に置き去りになり、エージェントは何も知らないまま起動する |

[scaffold_ai_teammate.py](../scripts/scaffold_ai_teammate.py) はこの違いを見て
インストール先を決めるので、通常は意識しなくてよい。

## 評価ハブに出す

スキルはファイルとしてエージェントの中にしか存在しないので、同期しないと
評価アプリの「スキル」ページは永久に空のままで、**どのチームメイトが何を知っているか
誰にも分からない**。

常駐する SkillSync が `skills/*/SKILL.md` を読み、`<prefix>_skill` テーブルへ upsert する。

| 列 | 中身 |
|---|---|
| `<prefix>_skillkey` | `<agentkey>:<スキル名>`（この組で冪等） |
| `<prefix>_agentkey` | どのチームメイトのものか |
| `<prefix>_title` / `_summary` | front matter の `name` / `description` |
| `<prefix>_body` | `SKILL.md` 全文 |
| `<prefix>_syncedon` | 最終同期時刻 |

キーが (agentkey, skillkey) なので再デプロイは**その場で更新**される。
スキルの名前を変えた場合、古い行は**わざと残す**——そのチームメイトが以前どう振る舞っていたかの
記録になるからである。

同期間隔は `SKILLS_SYNC_MINUTES`（既定 30 分）。`DATAVERSE_URL` / `PUBLISHER_PREFIX` /
`AGENT_NAME` のどれかが無ければ SkillSync は起動せず、ログにその旨を出す。

## 動いているか確かめる

```powershell
python scripts/run_regression_tests.py --check
```

Layer 1 の不変条件に「`skills/` が空でない」「評価ハブにこのエージェントのスキル行がある」が
入っているので、同梱漏れと同期漏れの両方がここで落ちる。
