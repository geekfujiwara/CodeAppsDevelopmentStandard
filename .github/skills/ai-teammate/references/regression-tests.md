# 回帰テスト — デプロイのたびに自動で流す

デプロイが成功することと、チームメイトが正しく答えることは別の話である。
その差は「誰かがたまたま試したとき」にしか表面化しない。ここで定義する回帰テストは、
**デプロイした本人が気づく**ためのもので、[deploy_ai_teammate.py](../scripts/deploy_ai_teammate.py)
`--execute` の最後に自動で実行される。

## 2 層に分かれている理由

| 層 | 何を見るか | 費用 | 決定性 |
|---|---|---|---|
| **Layer 1 — 不変条件** | 構成そのもの。エンドポイントが生きているか、`accessBoundaries` が 4 値そろっているか、エージェント ID の SP が有効か、スキルが評価ハブに出ているか | 0 | 完全に決定的 |
| **Layer 2 — 振る舞い** | 実際に 1 ターン話しかけて、出典を示すか・推測で断らないか・プロンプト インジェクションに従わないか | モデル課金あり | 生成 AI なのでゆらぐ |

Layer 1 だけで落ちる事故のほうが圧倒的に多い。`accessBoundaries` の欠落
（→ [troubleshooting.md](troubleshooting.md) #74）も、無効な `AgentIdentity`（同 #75）も、
1 回も話しかけずに検出できる。なので Layer 1 は**毎回・無条件**で走る。

## 実行

```powershell
# 不変条件だけ（速い・無料。CI の必須ゲートはこれ）
python scripts/run_regression_tests.py --check

# 振る舞いまで（実際にターンを回す）
python scripts/run_regression_tests.py --execute
```

終了コードは 3 値:

| コード | 意味 |
|---|---|
| 0 | 全件 green |
| 1 | ケースが落ちた（＝直すべきものがある） |
| 2 | そもそも実行できなかった（設定不足・接続不可） |

1 と 2 を分けているのは、CI で「壊れている」と「測れていない」を混同しないためである。
測れていないのに green にするのが一番危ない。

## なぜキュー経由なのか

チームメイトの messaging endpoint は、そのエージェント宛てに署名された Bot Framework の
トラフィックしか受け付けない。外部のテスト ランナーが直接叩くことはできない。

そこで Layer 2 は、評価ハブの `<prefix>_evaltestresult` テーブルに**ケースを積む**。
チームメイト自身に常駐している TestWorker が自分の `agentkey` の行だけを拾って実行し、
応答・ツール呼び出し・所要時間を同じ行に書き戻す。

副次的な効果として、**停止しているチームメイトは行を「待機中」のまま残す**。
他のチームメイトとの比較が壊れないので、「落ちている」ことがそのまま可視化される。

> TestWorker のターンには**サインインした利用者がいない**ため、委任トークンが要るツールは
> 検証されない。書き戻される `_autosummary` にその旨が入るので、green を全項目のカバレッジと
> 読み違えないようにしている。

## ケースの書き方

`regression/suite.json` に入る。scaffold 時に、選ばなかった機能ブロックのケースは
`requiresBlocks` を見て**自動的に除外される**。持っていない機能のテストを残すと毎回赤くなり、
チームが赤を無視する習慣をつけてしまう。これは「テストが無い」より悪い。

```json
{
  "name": "Web を検索して出典を示す",
  "requiresBlocks": ["B10"],
  "prompt": "最近の Microsoft Foundry のリリース情報を 1 つ教えて。出典 URL も付けて。",
  "expectContains": ["http"],
  "expectTools": ["search"],
  "minScore": 3.0,
  "maxDurationMs": 120000
}
```

| キー | 判定 |
|---|---|
| `expectContains` | 応答にこの文字列がすべて含まれるか |
| `expectNotContains` | 応答にこの文字列が 1 つも含まれないか |
| `expectTools` | このツール名がすべて呼ばれたか（部分一致。ホストで名前が違うものは `run_python\|code_interpreter` のように `\|` で別名を並べる） |
| `minScore` | `_autoscore`（0〜5）がこの値以上か。採点はチームメイトの TestWorker が評価ハブのルールで行う |
| `maxDurationMs` | 所要時間の上限 |
| `requiresEnv` | ここに書いた設定がチームメイトの `.env` に無ければ SKIP（scaffold はしたが発行時に無効な機能） |

判定はすべて**任意**で、書いたものだけが検査される。文言の完全一致は書かない。
生成 AI の出力は毎回変わるので、完全一致は「壊れていないのに赤い」を量産する。

## 出力

```powershell
python scripts/run_regression_tests.py --execute `
  --junit regression/regression-results.xml `
  --markdown regression/regression-results.md
```

- **JUnit XML** — GitHub Actions / Azure Pipelines のテスト結果タブにそのまま出る
- **Markdown** — PR コメントや引き継ぎにそのまま貼れる

## CI への組み込み

`alm` スキルの CI テンプレートに、Layer 1 を必須ステータス チェックとして足す。
Layer 2 はモデル課金が発生するので、`main` への push か手動実行に限定するのが現実的である。

```yaml
- name: Regression (invariants)
  run: python scripts/run_regression_tests.py --check

- name: Regression (behaviour)
  if: github.ref == 'refs/heads/main'
  run: python scripts/run_regression_tests.py --execute --junit regression/results.xml
```

## デプロイ時の自動実行を止めたいとき

```powershell
python scripts/deploy_ai_teammate.py --execute --skip-regression
```

スキップした場合でも、デプロイの最後に手動実行のコマンドが案内される。
黙ってスキップされるのが一番まずいからである。
