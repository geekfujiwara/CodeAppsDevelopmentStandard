# モデル選択: Auto を標準にする

## Step 1: 固定モデルを指定せず API で作成する

新規エージェントの標準は `AGENT_MODEL_SERIES=Auto`。未指定・空欄も同じ。
`model_policy.resolve_model` は保存構成ファイルが未指定なら `None` を返し、
`apply_model` は `agentSettings.model` を含めない。モデル選択はプラットフォームに任せる。
未確認の `Auto` / `auto` を series に送ったり、特定ベンダーのモデルに置き換えたりしない。
**UI 保存構成やブラウザーの利用可否を、Bot 作成の前提にしない。**

```dotenv
AGENT_MODEL_SERIES=Auto
AGENT_AUTO_MODEL_CONFIG_FILE=
```

`create_agent.py` は `template=cliagent-1.0.0` で Bot を新規作成する。
既存の同一スキーマがあれば重複作成を止め、保存済み ID による update を案内する。
ツールが手動追加なら `deploy_agent.py --manual-tools --env-file agent.env` を使う。

## Step 2: 保存構成を読み戻す

作成処理は model 設定を含む保存構成を照合する。API が成功しても、UI の Auto 表示や
実行時に選ばれるモデルを検証したことにはならない。
構築を終えた後、利用者がツール追加時に Model 表示も確認する。
UI 確認待ちを理由に本体・アイコン・スキルの API 構築を止めない。
モデル表示・接続・本人認可・実会話はそれぞれの検証結果として報告する。

```powershell
python .github/skills/copilot-studio-v2/scripts/set_model.py --show
```

既存 Bot の更新で `AGENT_MODEL_SERIES` が未指定ならモデルを維持する。
明示的な `Auto` は固定モデル設定を外してプラットフォーム選択に戻す。
Instructions・メモリ・チャネルなどは保持する。

## Step 3: 必要な場合だけ保存構成・固定モデルを明示する

特殊な環境で UI 保存済みの Auto 構成を正確に再利用したいときだけ、
任意の `AGENT_AUTO_MODEL_CONFIG_FILE` を指定する。
ファイルが明示された場合は、不在・破損・形式不一致で書き込み前に停止し、黙って無視しない。

UI で対象 Bot の Auto を保存済みであることを確認した上で、次の読取専用コマンドを使う。
親フォルダーは先に作成する。既存ファイルは上書きしない。

```powershell
python .github/skills/copilot-studio-v2/scripts/set_model.py --capture-auto .local/auto-model.json --confirm-ui-auto
```

出力は `{"selection":"Auto","model":<実際のmodelオブジェクトまたはnull>}`。
`--confirm-ui-auto` は呼出者の UI 確認の表明で、自動的な UI 検証ではない。
ファイルにトークン・接続情報は含めず、別環境へ無条件に流用しない。

固定モデルが明示要件なら、対象環境の Model UI で現行の保存値を確認して
`AGENT_MODEL_SERIES` に指定する。`claude-opus-5` は過去に確認した例で、
全環境の現在の利用可能性を保証しない。旧命名
`Sonnet46` / `Sonnet5` / `Opus5` / `GPT4o` は作成・変更前に拒否する。

参考: [Microsoft Learn: モデルの選択](https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-select-agent-model)。
公開製品仕様と cliagent の保存構成の検証は区別する。
