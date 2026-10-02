# デバイス・メディア（マイク / 録音 / Web Audio）

Code Apps でマイク音声を扱う（録音・ストリーミング認識・レベル表示）ときの正常系と落とし穴。
CSP 側の設定は [CSP 構成](csp.md) の 7・8、ローカルでの再現試験は [ホスト再現テスト](host-emulation-testing.md)。

## 1. ホストの前提（検証済 2026-10）

| 項目 | 事実 | 帰結 |
|---|---|---|
| マイク | プレイヤーはアプリを載せる iframe に `allow="geolocation; microphone; camera; fullscreen; clipboard-write"` を付ける | `getUserMedia` は Code Apps 内で動く（実機確認） |
| 自動再生 | 上記に `autoplay` は無い | `AudioContext` は**ユーザー操作の中で**開始しないと `suspended` のまま |
| オリジン | アプリは別オリジンの入れ子 iframe で動く | 権限やオリジンは画面内で診断して表示すると切り分けが速い |

```ts
const micAllowed = (document as any).permissionsPolicy?.allowsFeature("microphone") // false ならホスト側の委譲が無い
const ancestors = Array.from(location.ancestorOrigins ?? []).join(" > ")
```

## 2. 正常系: 1 本のマイク ストリームを録音・解析・送信で共有する

1. **クリック ハンドラの最初（`await` より前）**で `AudioContext` を作り `resume()` を呼ぶ。
2. `getUserMedia` で 1 本の `MediaStream` を取得する。
3. `resume()` は拒否されずに**保留のまま**になることがあるため、タイムアウト付きで待ち、`running` でなければエラーにする。
4. 同じ `MediaStream` を `MediaRecorder`（録音）と PCM 変換（認識・レベル表示）の両方に渡す。

```ts
const ctx = ctxRef.current ?? new AudioContext()      // await より前
const resumed = ctx.resume()
const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true } })
await Promise.race([resumed, new Promise((r) => setTimeout(r, 3000))])
if (ctx.state !== "running") throw new Error("AudioContext を開始できません（もう一度ボタンを押す）")

const recorder = new MediaRecorder(media, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 })
recorder.start(1000)                                   // 1 秒ごとに chunk（停止時に Blob へ結合）
```

PCM 変換（16 kHz / 16 bit / mono）は **同一オリジンの静的ファイルとして配信する AudioWorklet** で受ける。
オーディオ スレッドで動くため、メインスレッドが止まっても音声が欠けない（port のメッセージはキューに残る）。
`blob:` URL の Worklet は `script-src` でブロックされるが、`public/` に置いたファイルは `'self'` として読み込める。

```js
// public/pcm-capture-worklet.js — 2048 フレーム（約 43 ms）ごとにメインスレッドへ転送する
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.len = 0 }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (!ch) return true
    for (let i = 0; i < ch.length;) {
      const n = Math.min(ch.length - i, this.buf.length - this.len)
      this.buf.set(ch.subarray(i, i + n), this.len); this.len += n; i += n
      if (this.len === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(2048); this.len = 0 }
    }
    return true
  }
}
registerProcessor("pcm-capture", PcmCapture)
```

```ts
await ctx.audioWorklet.addModule(new URL("pcm-capture-worklet.js", document.baseURI).href)
const node = new AudioWorkletNode(ctx, "pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
node.port.onmessage = (e: MessageEvent<Float32Array>) => onPcm(downsampleToPcm16(e.data, ctx.sampleRate))
ctx.createMediaStreamSource(media).connect(node)
node.connect(ctx.destination) // 出力は無音。グラフから外れて処理が止まらないよう接続しておく
```

`addModule` が失敗したら ScriptProcessor（`createScriptProcessor(4096, 1, 1)`、`destination` への接続が必須）に
切り替え、どちらで動いているかをログに出す。

録音の再生は `data:` URL にする（`blob:` は既定 CSP の `media-src` でブロックされる）。

```ts
const dataUrl = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob) })
```

## 3. SDK にマイクを直接渡さない

音声系 SDK の「マイク / `MediaStream` を渡すだけ」の API は、内部で**別の `AudioContext` と `blob:` URL の
AudioWorklet** を作ることがある。Code Apps では次の 2 点で音声が SDK に届かず、**エラーも出ずに結果だけ出ない**状態になる。

- SDK が `await` の後で作った `AudioContext` はユーザー操作として扱われず開始しない
- `audioWorklet.addModule(blob:…)` が `script-src` でブロックされる

§2 の自前経路で PCM を作り、SDK には **Push ストリーム**で渡す（例: Azure AI Speech の
`AudioInputStream.createPushStream` + `AudioConfig.fromStreamInput(pushStream)`）。実機でこの切り替えにより解消した。

### Azure AI Speech SDK の Worker タイマーを無効にする（必須）

Speech SDK（JavaScript）は音声送信の待ち合わせに **`data:` URL の Worker** でタイマーを作る（`common/Timeout.js`）。
Code Apps の既定 CSP は `data:` の Worker を許可しないため、送信が詰まって待ち合わせが必要になった瞬間に
タイマーが一度も発火せず、**送信ループが止まって文字起こしが無言で止まる**（エラーも `canceled` も出ない）。
最初の 5 秒は待ち合わせが無く、その後も音声がリアルタイムに届く間は待ち合わせが発生しないので、
短い試験では気付きにくい。画面のアニメーションなどでメインスレッドが一瞬止まると発生する。

```ts
speechConfig.setProperty(sdk.PropertyId.WebWorkerLoadType, "off") // window.setTimeout を使わせる
```

`worker-src` に `data:` を足して回避しない（環境全体の CSP を緩め、`data:` Worker による迂回を許すことになる）。

## 4. メインスレッドの停止に強くする（検証結果）

ホスト再現環境で、送信開始 8 秒後にメインスレッドを 0.8 秒止めて比較した（[ホスト再現テスト](host-emulation-testing.md) §4）。

| 構成 | CSP 違反 | 停止後の認識 | 停止中の文 | 停止後の文 |
|---|---|---|---|---|
| SDK 既定（Worker タイマー）+ ScriptProcessor | 1 | **止まる**（停止まで結果なし） | 崩れる | 失われる |
| Worker タイマー無効 + ScriptProcessor | 0 | 続く | 崩れる（例: 「40ヒッヒッヒ」） | 正しい |
| **Worker タイマー無効 + 同一オリジン AudioWorklet** | 0 | 続く | **正しい** | 正しい |

最下段を標準とする。実機（Power Apps ホスト）での Worklet 読み込みは別途確認する。
CPU 全体が高負荷な端末では Worklet でも遅延が増えるため、会場の端末では他アプリを閉じ、
送信音声の秒数（送信バイト ÷ 32000）が経過時間と一致するかを監視する。

## 5. 前提が欠けたら開始させない

トークン・権限・データソースなど**前提が欠けたまま開始できる UI** にすると、「押しても何も起きない」が
原因不明の不具合として報告される（実例: 認可トークン未入力のまま開始され、文字起こしが出ないと誤認された）。
開始ボタンを無効化し、ボタン文言と入力欄の下に**何が足りないか**を表示する。

## 6. 詳細ログはコンソールに集約する

画面内ログだけでは利用者から回収しにくい。DevTools の Console に集約し、コピー＆ペーストで読める形にする。

| 規約 | 内容 |
|---|---|
| 接頭辞 | `[APP hh:mm:ss.mmm][scope]` で始め、Console のフィルターで絞れるようにする |
| データ | オブジェクトは **JSON 文字列**で出す（DevTools のオブジェクトはコピーすると `{…}` になる） |
| 捕捉 | `error` / `unhandledrejection` / `securitypolicyviolation` を全部ログへ流す |
| SDK 内部ログ | 量が多いので `console.debug`（DevTools の「詳細 / Verbose」）に分ける |
| 履歴 | `window.<app>Logs()` で `console.table` 表示できるようにする |
| 機密 | トークンやシークレットは値を出さず、有効期限など属性だけを出す |

Console に出る `[Violation] Permissions policy violation: unload is not allowed` と
`es6.webplayer-host-ui.js` の React 警告はホスト由来で、アプリの不具合ではない。
