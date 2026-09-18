# Foundry の標準 Evaluations にスコアを出す

評価ハブ（Dataverse + Code Apps）は「この依頼をちゃんとやり切ったか」を**業務の言葉**で見る。
Foundry の組み込み評価器は別の質問に答える——根拠のある回答か、タスクに沿っているか、
ツールの呼び方は正しいか、有害な内容を含まないか。しかも**誰もテストケースを書かなくても**、
本番トラフィックのサンプルに対して自動で走る。

両方あって初めて「良い同僚か」が分かるので、このスキルでは 2 つとも設定する。

## 実行

```powershell
python scripts/setup_foundry_evaluation.py --check
python scripts/setup_foundry_evaluation.py --execute
```

## 2 つの経路と、どちらが選ばれるか

| 経路 | 対象 | 仕組み |
|---|---|---|
| **継続評価ルール** | prompt agent | 応答完了イベントを直接サンプリングする |
| **トレース評価スケジュール** | **hosted agent（Foundry Autopilot）** | App Insights のトレースを日次で評価する |

Foundry Autopilot の agent は `kind=hosted` なので、**継続評価ルールは API に拒否される**
（→ [troubleshooting.md](troubleshooting.md) #76）。`--mode auto`（既定）はまず継続評価を試し、
この拒否を検出したらトレース評価へ自動で切り替える。明示したいときは
`--mode continuous` / `--mode scheduled` を渡す。

```powershell
# hosted agent と分かっているとき（無駄な 400 を踏まない）
python scripts/setup_foundry_evaluation.py --execute --mode scheduled --hour 9 --max-traces 50
```

## 評価器

既定は次の 4 つ。

| 評価器 | 見るもの | 判定モデル |
|---|---|---|
| `builtin.task_adherence` | 頼まれたことをやったか | 必要 |
| `builtin.tool_call_accuracy` | ツールの選択と引数が妥当か | 必要 |
| `builtin.intent_resolution` | 意図を取り違えていないか | 必要 |
| `builtin.violence` | 有害な内容を含まないか | **不要** |

モデル判定の評価器には `initialization_parameters.deployment_name` が**必須**で、
安全性の評価器には**渡してはいけない**（Content Safety 側で動くため）。
スクリプトはこの区別を持っているので、`--evaluator` で足すときも意識しなくてよい。

判定モデルは `EVALUATION_JUDGE_DEPLOYMENT` →（無ければ）チームメイト本体の `ModelDeployment`
の順で解決される。本体と同じモデルに採点させるのは自己採点に近いので、
**品質を測るなら別系統のデプロイを `EVALUATION_JUDGE_DEPLOYMENT` に指定する**。

```powershell
python scripts/setup_foundry_evaluation.py --execute `
  --evaluator builtin.task_adherence `
  --evaluator builtin.violence `
  --judge-deployment gpt-4o-judge
```

## 前提

- Foundry プロジェクトに **Application Insights が接続済み**であること。
  トレースが無いとスケジュール評価は毎回 0 件で終わる。
- プロジェクトのマネージド ID に **Foundry User** ロールがあること。
  無いとルールは作成できるのに一度も走らず、Monitor タブが静かに空のままになる。
  [publish_foundry_autopilot.py](../scripts/publish_foundry_autopilot.py) が
  エージェント インスタンス ID に対してこれを付与する。

## 確認

1. Teams でチームメイトに数ターン話しかける（トラフィックが無いと何も出ない）
2. Foundry ポータル → 対象エージェント → **Monitor** タブ
3. または **Build → Evaluations → Recurring Configs**

スケジュール評価は日次なので、その場では出ない。すぐ見たいときは Foundry ポータルから
評価を手動実行する。

## 費用

評価は**採点のたびにモデルを呼ぶ**。既定の 4 評価器なら 1 ターンあたり 4 回の追加呼び出しに
なるので、トラフィックが増えたら `--max-hourly-runs`（継続評価）や `--max-traces`
（スケジュール評価）で上限を下げる。上限を超えたぶんは**キューされずに捨てられる**ので、
コストが青天井になることはない。
