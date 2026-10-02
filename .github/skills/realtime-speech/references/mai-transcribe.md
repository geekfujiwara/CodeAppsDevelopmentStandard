# MAI-Transcribe を使う（Azure Speech のリアルタイムと組み合わせる）

MAI-Transcribe（Microsoft AI の音声認識モデル）は **Fast Transcription API の enhancedMode** で呼ぶ**ファイル単位**のモデル。
リアルタイムの途中経過は出ないため、Azure Speech（リアルタイム）の区切り・途中経過はそのまま使い、
**確定文ごとにその区間の録音を MAI で認識し直す**形にすると、遅れを小さく保ったまま精度を上げられる。

## 呼び方

```http
POST https://<resource>.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15
Authorization: Bearer <Entra ID（https://cognitiveservices.azure.com/.default）>
Content-Type: multipart/form-data
  audio=<WAV>
  definition={"locales":["ja"],"enhancedMode":{"enabled":true,"model":"MAI-Transcribe-2","modelOptions":{"transcribeStyle":"verbatim"}},"phraseList":{"phrases":[...]}}
```

| 項目 | 実測・注意 |
|---|---|
| リージョン | **japaneast では未提供**（`Enhanced mode with model is currently not supported yet.` の 400）。提供: centralindia / eastus / northeurope / southeastasia / westus / westus2（Learn の Speech service regions の LLM Speech タブ）。日本から近いのは southeastasia。録音が国外で処理されることを画面と規程で扱う |
| リソース | Foundry リソース（`kind=AIServices`・カスタム サブドメイン・キー認証無効）。Entra ID トークンで呼べる。マネージド ID は Foundry User（リソース グループの範囲）で足りる |
| 言語 | MAI は `"ja"`。既定モデル（enhancedMode なし）は `"ja-JP"`（`"ja"` だと `InvalidLocale`） |
| キーワード | `phraseList.phrases` は **200 件で「Context list cannot have more than 200 items」**。100 件に切って渡す |
| モデル | `MAI-Transcribe-2`（60 言語）と `MAI-Transcribe-1.5`。`MAI-Transcribe-1` は 2026-08-20 で廃止。リアルタイムの WebSocket は別モデル `MAI-Transcribe-2-Streaming`（Foundry にデプロイ・別リージョン） |
| エラー本文 | JSON でないことがある（`MAI service returned an error: BadRequest - {...}`）。本文は文字列で受けてから JSON を試す |

## 確定文ごとの再認識（アプリの作り）

1. 録音の PCM（16 kHz / 16 bit / mono）を区切りまで保持する `pcm-segmenter` に、**位置を動かさない `slice(fromMs, toMs)`** を足す（前後 200 ms を含める）。
   発言の区切りで解放済みの区間は返せないので null を返し、画面に「録音が無い区間」と出す（文字だけのリハーサルも同じ）。
2. 確定文（`recognized` の `offset` / `duration`）ごとに WAV を作り、同時 2 件までで中継 API（Function）へ送る。Function はマネージド ID で Fast Transcription を呼ぶ。
   接続先とモデルは **Function の許可リスト**（`STT_ENDPOINTS`）で決め、ブラウザから URL を送らせない。
3. 方式は 3 つから選べるようにする: **Azure Speech のまま／MAI で置き換える／比較（並べる）**。置き換えても途中経過は Azure Speech のまま。
4. 比較では、2 つの文の違う箇所を共通の最長部分列で揃えて色分けし、食い違い（文字の編集距離 / 長い方の文字数）と応答時間を出す。
5. チケット・トークンの期限切れ（401）は取り直して 1 回だけやり直す。

## 実測（台本 231 秒・Windows の読み上げ・正解 961 文字）

| 方式 | 文字誤り率 | 応答 |
|---|---|---|
| Azure Speech（リアルタイム） | 2.39% | — |
| Azure Speech（Fast・ファイル全体） | 1.25% | 6.0 秒 |
| MAI-Transcribe-2（確定文ごと） | 1.56% | 1 文 p50 0.36 秒（直接）／アプリで確定から 1.6 秒（中継込み） |
| MAI-Transcribe-1.5（確定文ごと） | 1.87% | 1 文 p50 0.82 秒（直接） |

- 数値: Azure リアルタイムは「3.84 億円」を「3点84億円」と取り違えた。MAI は正しく取れた。
- 一方 MAI は「キャッシュ創出」を「キャッシュ喪失」と**意味が逆になる**取り違えを 1 件出した。置き換え前提にせず、本番前は比較モードで確かめる。
- アプリ内の応答の遅れは、端末が重い（ヘッドレス撮影の Edge の残りなど）と数倍になる。内訳（base64 化・チケット・通信）をログに出して切り分ける。

## 測り方

`scripts/test/compare-stt.mjs`（台本の WAV と正解で、リアルタイム・Fast・MAI 全体・MAI 確定文ごとの CER・番号・数値・時間）と、
疑似マイク（`--use-file-for-fake-audio-capture`）で比較モードを通しで動かす E2E。疑似マイクの E2E は Function の CORS が許すポート（例: 4173）で配信する。
