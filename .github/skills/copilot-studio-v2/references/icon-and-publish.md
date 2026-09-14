# アイコン登録と公開（API）

cliagent エージェントにアイコンを登録し、公開（PvaPublish）するまでの実機検証済みリファレンス。
スクリプトは [scripts/set_icon.py](../scripts/set_icon.py) と
[scripts/publish_agent.py](../scripts/publish_agent.py)。

## アイコン登録（3 か所）

Pillow で PNG を生成し、以下の 3 か所へ登録する。

| 用途 | 格納先 | サイズ | 備考 |
|---|---|---|---|
| エージェント本体 | `bots.iconbase64` | 240x240 | **生 base64**（`data:` 接頭辞なし） |
| Teams カラー | `applicationmanifestinformation.teams.colorIcon` | 192x192 | JSON 内に base64 |
| Teams アウトライン | `applicationmanifestinformation.teams.outlineIcon` | 32x32 | 白・透明背景 |

### ★ハマりどころ: PATCH に name を必ず含める

`bots` を PATCH するとき **`name` 列を必ず同送**する。含めないと
`0x80040265`（更新不可）エラーになる。

```python
sess.patch(f"{API}/bots({bot_id})", json={"name": name, "iconbase64": icon_b64})
```

`applicationmanifestinformation` は GET → JSON パース → `teams.colorIcon/outlineIcon` を
セット → PATCH（こちらも `name` 同送）。`teams.accentColor` に背景色 HEX を入れておくとよい。

## アイコン意匠

`scripts/set_icon.py` の `draw_icon()` は **汎用意匠**（角丸の単色背景＋中央頭文字＋任意の
アクセントバッジ）。色・頭文字は `.env`（`ICON_BG_COLOR` / `ICON_TEXT` / `ICON_ACCENT_COLOR`）で
差し替える。独自意匠（人物シルエット等）にしたい場合は `draw_icon()` をプロジェクト側で
上書きする。例（人物＋承認チェック）:

```python
# 頭（楕円）＋肩（pieslice）＋右下に緑の承認チェックバッジ
d.ellipse([...], fill=WHITE)
d.pieslice([...], start=180, end=360, fill=WHITE)
d.ellipse([...], fill=GREEN); d.line(check_points, fill=WHITE, width=w, joint="curve")
```

## 公開（PvaPublish）

```python
sess.post(f"{API}/bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", json={})
```

- プロビジョニング直後は一時失敗することがあるため数回リトライする。
- **公開状態の確認は `pac copilot list`（Published / Active / Provisioned）が正**。
  cliagent では `bots.publishedon` が None のままになることがあるため、これで判断しない。

## MCP tool dialog の「確認(Confirm)」

MCP tool編集dialogにConfirmが表示された場合は、Inputsの読み込み完了後にConfirmし、通常Saveしてから
公開する。Confirmクリック自体に独立したnetwork requestはなく、editor内でSaveをenabledにする遷移として
観測されている。公開後に未Confirm状態が見つかった場合も、同じdialogでConfirm、Save、再公開する。
詳細は [mcp-servers.md](mcp-servers.md) を参照。
