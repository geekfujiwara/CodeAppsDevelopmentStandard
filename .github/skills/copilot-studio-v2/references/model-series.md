# モデル系列（`agentSettings.model.series`）の指定

cliagent の BotConfiguration にある `agentSettings.model.series` が、Copilot Studio の
**Build ＞ Model** ドロップダウンに対応する。値が古い命名だと作成自体は成功するが、
UI に「**モデルは廃止されました。エージェントで別のモデルが使用されるようになりました。**」
と警告が出て、意図したモデルで動かない。

## 現行の命名規則

**ベンダーのモデル ID をそのまま使う（小文字 + ハイフン）。**

| 状態 | 値 | 備考 |
|---|---|---|
| ✅ 現行 | `claude-opus-5` | 実機で設定し、UI の Model 表示が正常になることを確認済み |
| ❌ 廃止 | `Sonnet46` / `Sonnet5` / `Opus5` | 旧命名（PascalCase + 数字連結）。POST は 201 で通るが UI で廃止扱い |

> 旧命名で作成された既存エージェントはテナントに多数残っているため、
> **既存エージェントの値をコピーすると廃止モデルを引き継いでしまう**。参考にしない。

## 有効な値の調べ方

モデル一覧を返す API は存在しない（PVA ゲートウェイの `/api/botmanagement/v1/models`
などはすべて 404）。次のいずれかで確認する。

1. **UI で確認する（確実）** — Copilot Studio でエージェントを開き、Build ＞ Model の
   ドロップダウンから目的のモデルを選択して保存する。その後 API で読み戻すと、
   実際に有効な `series` 文字列が分かる。

   ```bash
   python set_model.py --show
   ```

2. **推定する** — 現行はベンダーのモデル ID 形式。`claude-opus-5` が確認済みのため、
   同系統は `claude-<ファミリ>-<バージョン>` と推定できる。**未検証の値を使ったら必ず
   UI の Model 表示を確認する**（警告が出ていなければ有効）。

## 作成時の指定

`.env`:

```dotenv
AGENT_MODEL_SERIES=claude-opus-5
```

`create_agent.py` は旧命名（`Sonnet46` / `Sonnet5` / `Opus5` / `GPT4o`）が指定された場合、
**作成前にエラーで停止する**。また作成直後に保存された `series` を出力する。

## 後から変更する

`configuration` は 1 つの JSON 文字列カラムなので、**GET → deep-merge → PATCH** で更新する
（丸ごと上書きすると instructions / channels / スキル設定が消える）。
`bots` の PATCH は `name` カラムを同送しないと `0x80040265` で失敗する。

```bash
python set_model.py --show              # 現在値の確認
python set_model.py claude-opus-5       # 変更
python publish_agent.py                 # 反映には再公開が必要
```

スクリプト: [scripts/set_model.py](../scripts/set_model.py)

## チェックリスト

- [ ] `.env` の `AGENT_MODEL_SERIES` がベンダーのモデル ID 形式になっている
- [ ] `create_agent.py` の出力で保存された `series` を確認した
- [ ] Copilot Studio の Build ＞ Model に「廃止されたモデル」警告が出ていない
- [ ] 変更した場合は `publish_agent.py` で再公開した
