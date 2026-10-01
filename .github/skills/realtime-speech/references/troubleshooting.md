# 異常系・トラブルシュート

Code Apps 固有の制約（CSP・iframe・デバイス）は [code-apps のデバイス・メディア](../../code-apps/references/device-media.md) と
[code-apps の troubleshooting](../../code-apps/references/troubleshooting.md)（#54〜#56）も参照する。

## 1. 文字起こしが途中から無言で止まる（エラーも `canceled` も出ない）

**原因**: Speech SDK が送信の待ち合わせに使う `data:` URL の Worker タイマーが、CSP の `worker-src` で読み込めない。
待ち合わせは送信開始 5 秒以降にチャンクがまとめて届いたときだけ発生するため、短い試験では出ない。
Console に `Creating a worker from 'data:…' violates … Content Security Policy` が 1 回だけ出る。

**対処**: `PropertyId.WebWorkerLoadType` を `"off"` にする。**恒久対策済み** — テンプレートの `createRecognizer()` が常に設定する。

## 2. マイクは動いているのに結果が一切出ない

**原因**: SDK にマイクを直接渡している（`AudioConfig.fromDefaultMicrophoneInput` / `fromStreamInput(MediaStream)`）。
SDK 内部の `AudioContext` がユーザー操作の外で作られて開始しない、または内部の `blob:` Worklet がブロックされる。

**対処**: 自前の `AudioContext` で PCM にして Push ストリームで渡す。**恒久対策済み** — テンプレートのフックがこの経路だけを使う。

## 3. メインスレッドが詰まった瞬間の文が崩れる（例: 「40ヒッヒッヒ」）

**原因**: ScriptProcessor で取り込んでいる。メインスレッドで動くため、止まっている間の音声が欠ける。

**対処**: 同一オリジンの AudioWorklet で取り込む。**恒久対策済み** — テンプレートは Worklet を第一候補にし、
読み込めないときだけ ScriptProcessor に切り替えて `音声の取り込み方式` をログに出す。

## 4. 開始ボタンを押しても何も起きない

**原因**: トークンが無い（コネクタ未追加・手動トークン未入力）まま開始した。

**対処**: 前提が欠けているときは開始ボタンを無効にして理由を表示する。**恒久対策済み** — フックの `brokerAvailable` で判定できる。

## 5. Console に `WebSocket connection to 'wss://…' failed:` だけが出る

**原因**: CSP は通過しており、Speech 側で拒否されている（トークン無し・期限切れ・リージョン違い）。
CSP で止まった場合は `Refused to connect … Content Security Policy` が出る。

**対処**: トークンの有効期限とリージョンを確認する（`inspectToken()` / ログの `認識器を作成`）。

## 6. トークン発行 Function が 502（ログに `issueToken failed: 401`）

**原因**: Managed Identity のロールが足りない、または付与の反映待ち。

**対処**: Managed Identity にリソース グループの範囲で Foundry User を付ける（実測で数秒〜2 分で反映）。リソース範囲で付けた場合は反映に 10 分以上かかることがあるので、15 分以上待ってから判断する（[認証とロール](auth.md)）。

## 7. `get_speech_token.ps1` が「カスタム サブドメインが未設定です」で止まる

**原因**: Entra ID 認証（STS 発行・`aad#` 形式）にはカスタム サブドメインが必要。

**対処**: `az cognitiveservices account update -n <name> -g <rg> --custom-domain <subdomain>` で設定する（一度設定すると変更できないため、名前は慎重に決める）。**恒久対策済み** — スクリプトが事前に確認する。

## 8. 検証スクリプトが `Cannot find module 'microsoft-cognitiveservices-speech-sdk'`

**原因**: Node はスクリプトの場所から依存を探すが、スクリプトは `.github/skills` の下にある。

**対処**: Speech SDK を入れたプロジェクトのフォルダーで実行する。**恒久対策済み** — スクリプトはカレント フォルダーから SDK を解決する。

## 9. Windows PowerShell 5.1 で `.ps1` が `The string is missing the terminator` で動かない

**原因**: 日本語を含むスクリプトを BOM なし UTF-8 で保存すると、Windows PowerShell 5.1 が誤ったエンコードで読む。

**対処**: `.ps1` は BOM 付き UTF-8 で保存する（このスキルの `.ps1` は BOM 付き）。

## 10. 最初の途中結果まで 3 秒以上かかる

**原因**: 多くは話し始めるまでの無音を含めて測っている。話し始めから最初の途中結果までは約 1.5 秒が実測値。

**対処**: `発話開始を検知` の offset を差し引いて評価する（[遅延と精度](latency-accuracy.md)）。

## 11. コネクタ経由だけ 401（Function のログに `missing scope ... untrusted client`）

**原因**: カスタム コネクタは API アプリ自身をクライアントにして v1 トークンを取り、`scp` が `User.Read` になる。

**対処**: `TRUSTED_CLIENT_IDS`（既定は API アプリ自身）を確認する。**恒久対策済み** — テンプレートの `authorizeClaims()` が
信頼クライアントの委任トークンを許可し、拒否時に `ver` / `aud` / `scp` / `appid` をログに出す。

## 12. アプリを初めて開くと「Allow &lt;アプリ&gt; to access your data?」が出る

正常。カスタム コネクタを使うアプリでは、利用者・アプリごとに 1 回出る。接続が「Connection Complete」と表示されていれば Allow する。
