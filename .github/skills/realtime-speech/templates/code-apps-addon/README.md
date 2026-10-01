# Code Apps 音声文字起こしアドオン（テンプレート）

Code Apps で**マイク・録音・Azure AI Speech のストリーミング文字起こし**を 1 つの開始／停止で扱う部品。
ホストの Code Apps（`code-apps` スキルの generic-base）へ統合して使う。

| ファイル | 役割 |
|---|---|
| `public/pcm-capture-worklet.js` | オーディオ スレッドでマイク音声を受ける AudioWorklet（同一オリジンの静的ファイル） |
| `src/lib/speech/audio-pipeline.ts` | 48 kHz → 16 kHz PCM 変換、Worklet / ScriptProcessor の取り込み、録音形式の選択、`data:` URL 化（依存ゼロ） |
| `src/lib/speech/recognizer.ts` | 認識器の作成（**`WebWorkerLoadType=off`**、フレーズ リスト、詳細ログ） |
| `src/lib/speech/token.ts` | トークン発行コネクタの生成サービスを名前に依存せず探して呼ぶ、キャッシュ、手動トークンの検査 |
| `src/lib/debug-log.ts` | `[TAG hh:mm:ss.mmm][scope]` 形式で Console に集約（SDK 内部ログ・未処理例外・CSP 違反を含む） |
| `src/hooks/use-transcription-session.ts` | 開始／停止、録音、途中結果・確定、トークンの自動更新、停止ごとの記録 |

## 前提

1. 環境の CSP の `connect-src` に `wss://<region>.stt.speech.microsoft.com` を追加済み
   （`python .github/skills/code-apps/scripts/configure_code_app_csp.py --directive Connect-Src --source wss://<region>.stt.speech.microsoft.com --assert`）
2. トークン発行コネクタをデータソースに追加済み（[speech-token-broker テンプレート](../speech-token-broker/README.md)）。
   未追加でもビルドはでき、手動トークン（診断用）で動かせる

## 使い方

```tsx
// main.tsx
import { installDebugLogging } from "@/lib/debug-log"
installDebugLogging({ tag: "APP" })
```

```tsx
// 画面
const session = useTranscriptionSession({ phrases: ["配当性向", "中期経営計画"] })
const running = session.state === "running"
const ready = session.brokerAvailable === true

<Button disabled={!ready || session.state === "starting" || session.state === "stopping"}
        onClick={() => (running ? void session.stop() : void session.start())}>
  {running ? "文字起こし終了" : ready ? "文字起こし開始" : "トークン発行コネクタが必要です"}
</Button>
{session.lines.map((l) => <p key={l.id}>{l.text}</p>)}
{session.interim && <p className="italic text-muted-foreground">{session.interim}</p>}
```

- 開始は必ずボタンのクリックから呼ぶ（`AudioContext` の開始にユーザー操作が要る）
- 前提が欠けているときは開始ボタンを無効にし、何が足りないかを表示する
- 録音の再生は `record.audioDataUrl`（`data:` URL）を `<audio src>` に渡す

## 検証状況（2026-10）

| 項目 | 状況 |
|---|---|
| マイク・AudioContext・WebSocket・確定・録音（手動トークン、Power Apps 実機） | 検証済み |
| Worker タイマー無効 + 同一オリジン AudioWorklet（ホスト再現環境、メインスレッド停止試験） | 検証済み |
| AudioWorklet の読み込み（Power Apps 実機） | 未検証 |
| トークン発行コネクタの生成サービスの検出（`findTokenBroker`） | 未検証（コネクタの接続作成待ち） |
