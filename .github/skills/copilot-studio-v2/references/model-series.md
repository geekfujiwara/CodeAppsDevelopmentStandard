# モデル選択: Auto を標準にする

新規エージェントは **Auto** を標準とする。特定ベンダー・固定モデルが要件の場合だけ明示指定する。
利用者が対象環境で Auto を選べると確認した後は、モデル選択の質問を繰り返さない。
UI の表示名と内部の `agentSettings.model` の保存形式は別であり、`Auto` / `auto` を
未確認のまま `series` に送ったり、model の省略を Auto と決め付けたりしない。

## Step 1: UI の Auto 保存構成を取得する

統合ブラウザーで対象環境のエージェントを開き、Build ＞ Model の Auto を選択して保存する。
新規 Bot の初回で API 作成用の保存形式がまだない場合は、承認済みの専用 Bot を UI で作成して Auto を保存し、
その ID を `AGENT_BOTID` / `agent_botid.txt` に記録する。既存の無関係な Bot は変更しない。
その後は `update_agent.py` を使い、`deploy_agent.py` で同名 Bot を再作成しない。

対象 Bot の UI 保存完了を確認してから、同じ環境・Bot ID の構成を取得する。
次のコマンドは読み取りだけで、モデルの変更・公開をしない。ファイルの親フォルダーを先に作成する。

```powershell
python .github/skills/copilot-studio-v2/scripts/set_model.py --capture-auto .local/auto-model.json --confirm-ui-auto
```

出力は `{"selection":"Auto","model":<実際のmodelオブジェクトまたはnull>}` のみ。
null は UI 保存後の構成に model がなかった場合だけ記録する。
`--confirm-ui-auto` は呼出者による UI 確認の表明であり、自動的にモデル一覧を検証する機能ではない。
ファイルにはトークン・Bot ID・接続を含めない。別環境・別リリースへ流用せず、UI 表示が変わったら再取得する。
既存ファイルは上書きしない。更新時は別名で取得し、差分と UI を確認して設定パスを切り替える。

## Step 2: 作成・更新時に再利用する

```dotenv
AGENT_MODEL_SERIES=Auto
AGENT_AUTO_MODEL_CONFIG_FILE=.local/auto-model.json
```

`create_agent.py` は未指定・空欄も Auto として解決し、
保存構成がなければ **認証・Bot 作成前**にエラーで停止する。
`model_policy.py` が毎回このチェックを実行する。固定モデルへの暗黙フォールバックはしない。
`set_model.py` は Auto 指定時に同じ保存構成を使い、他の Instructions・メモリ・チャネルを保持する。
`update_agent.py` は既存動作を維持し、モデルが未指定なら現在の設定を変更しない。

```powershell
python .github/skills/copilot-studio-v2/scripts/deploy_agent.py --env-file agent.env --defer-publish
# 既存 Bot は update。Auto を選んだ UI 初回作成後もこちらを使う。
python .github/skills/copilot-studio-v2/scripts/update_agent.py --env-file agent.env --no-publish
```

## Step 3: 読み戻しと UI を確認する

API に保存された構成と UI の Model 表示を両方確認する。
保存成功だけでは Auto の実効動作・利用可能性を保証しない。初回ツール・本人認可を確認後に公開し、
Preview で最小の質問を試験する。

```powershell
python .github/skills/copilot-studio-v2/scripts/set_model.py --show
```

## 固定モデルを明示する場合

利用する環境の Model 選択 UI で現行の保存値を確認し、`AGENT_MODEL_SERIES` に指定する。
`claude-opus-5` は過去に確認した例で、全環境の現在の利用可能性を保証しない。
旧命名 `Sonnet46` / `Sonnet5` / `Opus5` / `GPT4o` は作成・変更前に拒否する。
既存の Bot の値をコピーしてモデルの有効性を判断しない。

参考: [Microsoft Learn: モデルの選択](https://learn.microsoft.com/en-us/microsoft-copilot-studio/authoring-select-agent-model)。
これは公開製品仕様の参考であり、cliagent の内部保存値の根拠にはしない。
