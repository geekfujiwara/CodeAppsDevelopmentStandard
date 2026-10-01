# 連続録音を発言ごとに区切る（株主総会・会議の質疑応答など）

録音と文字起こしを止めずに続け、話者が名乗った番号・名前などの**文字起こしの手がかり**で発言を区切る。
区切りごとに録音を切り出して保存し、画面を次の発言者の内容に入れ替える。実測は 2026-10。

## 時間軸をそろえる

| 値 | 意味 |
|---|---|
| `e.result.offset`（100 ns 単位） | Push ストリームに書いた音声の**先頭からの位置**。`recognizing`（途中結果）でも `recognized`（確定）でも取れる |
| Push ストリームに書いた PCM | 16 kHz / 16 bit / mono。1 ms = 16 サンプル |

認識器に送る PCM と**同じバッファを録音として持てば**、`offset` をそのまま録音の切り出し位置に使える。
`MediaRecorder` の WebM は先頭のチャンクにしかヘッダーが無く、任意の位置で切れないため使わない。

- [`templates/code-apps-addon/src/lib/speech/pcm-segmenter.ts`](../templates/code-apps-addon/src/lib/speech/pcm-segmenter.ts): `append(pcm)` で溜め、`take(untilMs)` で前回の切り出し位置から `untilMs` までを WAV にしてメモリを解放する
- 区切りの位置は「区切りの手がかりを含むフレーズ」の `offset`（フレーズの始まり）。名乗りの前に言った「はい、」なども次の発言に入る
- 実測: 3 人分の切り出し長（47.9 / 42.9 / 31.5 秒）が、区切りのフレーズの `offset` の差と一致した
- WAV は 1 分あたり約 1.9 MB。SharePoint コネクタの `CreateFile` で 5.5 MB（約 3 分）を 3.1 秒で保存できた

## 区切りの決め方（揺れを抑える）

1. フレーズ（確定文 + 途中結果）の列を、毎回**最初から純粋関数で区切り直す**。途中結果で番号が変わっても、表示は自然に追従する
2. 途中結果では、番号の後ろに「番」「の」「です」などが来るまで区切らない（「株主番号12」で区切らない）
3. 同じ番号の言い直しでは区切らない
4. **保存は区切りのフレーズが確定してから**。途中結果だけで保存すると、確定で番号が変わったときに取り消せない
5. 画面は途中結果の時点で次の発言者に切り替えてよい（体感の速さ。区切りが消えれば元に戻る）
6. 最初の区切りまでの区間（司会の前置き）は、手がかりも内容も無ければ保存しない
7. 回答者の発言（「〇〇よりお答えいたします」以降）は、質問の検出から外して薄く表示する

区切りの手がかりは誤認識がある前提で、**手入力での修正**と「ここで区切る」を必ず用意する。

## 試験用の音声を Windows の読み上げで作る（クラウド不要）

```powershell
powershell -ExecutionPolicy Bypass -File .github/skills/realtime-speech/scripts/synthesize_script_wav.ps1 -Script <台本.json> -Out .mcp/tts/script.wav
node .github/skills/realtime-speech/scripts/verify_push_stream.mjs --wav .mcp/tts/script.wav   # 端末で認識結果を確認
```

- Windows の日本語音声（Ayumi / Haruka / Ichiro / Sayaka）はローカルで動く。`System.Speech` から使える
- 読み上げた「株主番号0123の青山です」「株主番号1024番の古賀です」は、Azure の認識でそのまま数字に戻った
- 作った WAV を code-apps の `run_headless_media_test.ps1 -Wav` に渡すと、アプリ全体（区切り・照会・切り出し）を実音声で試せる

## アプリ内で台本を読み上げる（リハーサル）

- `speechSynthesis` の音声のうち `localService === true` かつ `lang` が `ja` のものだけを使う（Edge のオンラインの Natural 音声はクラウド）
- 読み上げは**ユーザー操作の中で 1 回 `speak()`** してから始める（開始ボタンの中で音量 0 の空文字を読む）。マイクの準備を待ってからだと許可が切れることがある
- スピーカーの音をマイクで拾わせるので、イヤホンでは試せない。エコーキャンセルは切っておく（`echoCancellation: false`）
