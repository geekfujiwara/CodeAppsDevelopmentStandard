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

PCM 変換（16 kHz / 16 bit / mono）は ScriptProcessor で行う。`destination` に接続しないと Chrome では
`onaudioprocess` が発火しない（出力は無音のまま）。

```ts
const source = ctx.createMediaStreamSource(media)
const node = ctx.createScriptProcessor(4096, 1, 1)
node.onaudioprocess = (e) => onPcm(downsampleToPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate))
source.connect(node)
node.connect(ctx.destination)
```

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

## 4. CPU 負荷で認識精度が落ちる

ScriptProcessor はメインスレッドで動く。CPU が詰まると音声が欠けて認識結果が崩れる
（実測: 残留したヘッドレス ブラウザで CPU 約 50% の状態では文字起こしが崩れ、停止後は正確に戻った）。

- 会場・本番端末では他アプリを閉じ、送信音声の秒数（送信バイト ÷ 32000）が経過時間と一致するかを監視する
- 改善案（**未検証**）: Worklet を `blob:` ではなく同一オリジンの静的ファイルとして配信し、UI スレッドから切り離す

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
