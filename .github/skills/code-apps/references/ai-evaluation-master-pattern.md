# AI 評価ルールのマスタ化パターン

LLM で自動評価する仕組みを作るとき、**判定基準をコードに埋めると業務側が触れなくなる**。
評価軸をテーブルに出し、Code App から編集し、変更を過去データにも遡って適用できるようにする構成。

対象例: エージェントの会話ログを「ツール呼び出し精度」「タスク遵守度」などの軸で採点し、
その根拠と改善提案を画面上でたどれるようにする評価アプリ。

---

## 全体構成

```
Code App ──編集──> geek_evalrule  （ルール = 判定プロンプト）
Code App ──依頼──> geek_evaljob   （ジョブ = 再実行の待ち行列）
                        │
                  定期実行のパイプライン（PowerShell + Python）
                        │
                        ├─ ルールを読む
                        ├─ 対象ターンを読む
                        ├─ LLM で (ターン × ルール) を判定
                        └─ geek_evalresult に upsert
                        ↓
Code App <──表示── geek_evalresult（スコア・理由・根拠・改善提案）
```

**Code App は評価を実行しない。** ブラウザから長時間バッチは回せないので、
アプリは「依頼を書く」だけにして、実行は外のパイプラインに任せる。

---

## 1. ルールテーブル

| 列 | 型 | 役割 |
| --- | --- | --- |
| `name` | String | ルール名（画面表示） |
| `rulekey` | String | **結果行の主キーの一部。作成後は変更不可にする** |
| `summary` | Memo | 一覧に出す 1〜2 文 |
| `prompt` | Memo 32000 | LLM にそのまま渡す判定基準 |
| `scoreguide` | Memo | 1〜5 の各点の意味 |
| `target` | Picklist | 応答 / ツール呼び出し / 両方。渡す情報を絞ると判定が安定する |
| `enabled` | Boolean | 次回の評価で使うか |
| `sortorder` | WholeNumber | 表示順 |
| `builtin` | Boolean | 標準ルール。UI 側で削除ボタンを出さない |

**`rulekey` を変更不可にする**のが要点。結果行の名前を `<ターン ID>::<ルールキー>` にして
upsert の一致キーに使うため、後から変えると過去の結果が孤児になる。

## 2. 結果テーブル

| 列 | 型 | 役割 |
| --- | --- | --- |
| `name` | String 300 | `<ターン ID>::<ルールキー>` |
| `turnname` | String | 評価対象への論理参照（Lookup にしない。後述） |
| `rulename` | String | 評価時点のルール名のスナップショット |
| `score` | WholeNumber | 1〜5 |
| `reason` | Memo | 判定理由（日本語） |
| `evidence` | Memo 100000 | 根拠 JSON |
| `suggestions` | Memo 100000 | 改善提案 JSON |

> **Lookup ではなく文字列で紐づける**: 評価対象がまだ Dataverse に無い状態でも結果を書けるようにし、
> パイプライン側で GUID を引く往復を無くすため。件数が多くない管理系ではこの割り切りが有効。

## 3. JSON 列の形

```jsonc
// evidence: どこを見てそう判定したか
[{
  "kind": "response" | "tool_call" | "query",
  "quote": "原文の完全一致部分文字列",   // ← 画面ハイライトに使うので言い換え禁止
  "note": "なぜ根拠なのか",
  "polarity": "positive" | "negative",
  "matched": true                        // 原文に見つかったか（後処理で付与）
}]

// suggestions: 次に何を直すか
[{
  "title": "不要なツール呼び出しを抑制する",
  "target": "skill" | "system_prompt" | "tool" | "other",
  "detail": "何が問題で、どう変えるか",
  "example": "そのまま貼れる文面や差分"
}]
```

---

## 4. 根拠ハイライトの実装

引用を原文の位置に戻して `<mark>` で囲む。**曖昧一致はしない**（ずれた位置を光らせると誤解を招く）。

```ts
export function highlightSegments(text: string, evidence: Evidence[]): Segment[] {
  if (!text) return []

  const ranges: { start: number; end: number; evidence: Evidence }[] = []
  for (const item of evidence) {
    const quote = item.quote?.trim()
    if (!quote || item.matched === false) continue
    const start = text.indexOf(quote)
    if (start < 0) continue
    ranges.push({ start, end: start + quote.length, evidence: item })
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end)

  const segments: Segment[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start < cursor) continue          // 入れ子のハイライトは読みにくいので捨てる
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start) })
    segments.push({ text: text.slice(range.start, range.end), evidence: range.evidence })
    cursor = range.end
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}
```

### 落とし穴

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| ハイライトが 1 つも出ない | 本文を Markdown で描画している。整形後の DOM と原文で位置がずれる | ハイライト表示中だけ素のテキストにフォールバックする |
| 引用が原文に見つからない | LLM が要約・言い換えをした | プロンプトで「1 文以内・60 文字程度」に制限する。実測で一致率 74% → 82% |
| 一致しなかった引用が消える | 落とすと根拠自体が見えなくなる | `matched: false` を付けて残し、一覧側には文章として表示する |
| ツール呼び出しに色が付かない | 判定側は整形済み JSON を見て、UI 側は `JSON.stringify(call)` で照合していた | 詰めた形と整形した形の両方で照合し、ツール名の部分一致もフォールバックにする |

## 5. ジョブ行キュー（アプリからバッチを起こす）

HTTP エンドポイントも Power Automate も足さずに済む最小構成。

- アプリ: `status = 待機中` の行を作るだけ。**状態遷移はアプリ側でやらない**
- パイプライン: 起動時に最古の待機中を 1 件拾い、`実行中` → `完了 / 失敗` と進める
- 進捗は `targetcount` / `donecount` に書き、アプリは開いている間だけポーリングする

```powershell
$job = @(Get-All "geek_evaljobs?`$filter=geek_status eq 1&`$orderby=geek_requestedon asc") | Select-Object -First 1
```

> `(...)[0]` は 0 件のとき「Cannot index into a null array.」で落ちる。`@(...) | Select-Object -First 1` にする。

スコープは「未評価のみ / 全件 / 期間指定」の 3 つで足りる。
既存結果のキー一覧を先に引いて skip セットにし、`(ターン × ルール)` 単位で飛ばすと、
ルールを 1 本足したときに**その 1 本だけ**が課金対象になる。

## 6. 旧列へのミラー

指標を後からルール化した場合、既存の一覧・グラフが参照している列を壊さない。

```powershell
$mirror = @{
    "tool_call_accuracy" = @{ Score = "geek_toolcallaccuracy"; Reason = "geek_toolcallaccuracyreason" }
    "task_adherence"     = @{ Score = "geek_taskadherence";    Reason = "geek_taskadherencereason" }
}
```

結果を書いたあと、対応するルールだけ親レコードにも書き戻す。画面側の移行を別のタイミングにできる。

---

## パイプライン側の落とし穴

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| upsert が毎回 INSERT になり行が倍々に増える | キーに `+` が含まれ（ISO8601 のタイムゾーン `+00:00` など）、クエリ文字列上で空白として解釈される | `[uri]::EscapeDataString()` で **リテラルだけ**を URL エンコードしてから `$filter` に埋める |
| `ConvertTo-Json -AsArray` が使えない | PowerShell 7 専用。タスクスケジューラが Windows PowerShell にフォールバックすると落ちる | `@(...)` で包んで出力し、先頭が `[` でなければ自前で括る |
| テーブル作成直後の `EntityDefinitions` 取得が `0x80060888 Error in query syntax` | メタデータキャッシュが未更新。404 ではなく構文エラーとして返る | 3 秒間隔で 10 回程度リトライする |
| 日本語が化けて保存される | `ContentType` に charset が無い | `"application/json; charset=utf-8"` を明示する |
| BOM が先頭のキーにくっつく | Windows PowerShell の `-Encoding utf8` は BOM 付き | Python 側で `encoding="utf-8-sig"` で読む |

## LLM 呼び出し

- **構造化出力（`response_format` の `json_schema` + `strict`）を使う**。自由記述をパースすると必ず壊れる
- `strict: true` は全プロパティを `required` に入れ、`additionalProperties: false` を付ける必要がある
- 推論モデルは `max_tokens` を拒否するライブラリがある。判定用途は `gpt-4.1` 系で足りる
- ローカル認証を無効化したリソースでは `azure_ad_token_provider` を使う

```python
client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    azure_ad_token_provider=get_bearer_token_provider(
        DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"
    ),
    api_version="2024-10-21",   # json_schema は 2024-08-01 以降
)
```

- 結果は **1 行 1 JSON（JSONL）で逐次 flush** する。途中で落ちてもそこまでの判定が残る
- 1 件の失敗で全体を止めない。失敗件数だけ集計して続行する

## 画面側チェックリスト

- [ ] 判定理由・根拠・改善提案がすべて日本語で出るか
- [ ] ルール名から編集画面へ遷移できるか（`rulekey` → ルールの GUID を引く）
- [ ] カードを選ぶと本文・ツール呼び出しの該当箇所が色付くか
- [ ] 改善提案に「何を」「どう変えるか」「貼れる例」の 3 つが揃っているか
- [ ] ルールを保存しただけでは過去データが変わらないことを画面で説明しているか
- [ ] 旧ルールで評価された行にもフォールバック表示があるか
