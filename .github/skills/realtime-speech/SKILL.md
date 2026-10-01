---
name: realtime-speech
description: "Code Apps などのブラウザ アプリで、Azure AI Speech のストリーミング文字起こしと録音を実装する。ブラウザから Speech へ WebSocket で直結し、短期トークンは Managed Identity の Function からカスタム コネクタ経由で受け取る。Code Apps の CSP・iframe・メインスレッドの制約に合わせた音声経路（同一オリジン AudioWorklet、Push ストリーム、Worker タイマー無効）と、端末・ホスト再現・実機の 3 段階の検証を提供する。"
category: ai
triggers:
  - "文字起こし"
  - "リアルタイム文字起こし"
  - "音声認識"
  - "ストリーミング認識"
  - "Azure AI Speech"
  - "Speech SDK"
  - "マイク 録音"
  - "議事録 リアルタイム"
  - "音声 Code Apps"
  - "stt.speech.microsoft.com"
  - "WebWorkerLoadType"
  - "文字起こしが止まる"
---

# リアルタイム音声文字起こしスキル

ブラウザ アプリ（主に Code Apps）で、話している内容を**その場で文字にしながら録音する**機能を作る。

```
マイク ─▶ AudioContext ─▶ AudioWorklet（同一オリジン）─▶ 16 kHz PCM ─▶ Push ストリーム ─▶ Speech SDK ─(WebSocket)─▶ Azure AI Speech
   └────▶ MediaRecorder（録音・opus）                                                              ▲ 短期トークン
Code Apps ─(カスタム コネクタ)─▶ トークン発行 Function（Managed Identity）────────────────────────────┘
```

| 判断 | 理由 |
|---|---|
| ブラウザから Speech へ直結する | 途中結果を 0.2〜0.4 秒間隔で受け取れる。サーバー中継は遅延と運用が増える |
| トークンはコネクタ経由の Function から受け取る | キーをブラウザに置かない（キー認証が無効なテナントでも動く）。コネクタ呼び出しは CSP の追加が不要 |
| 音声は自前で PCM にして Push ストリームで渡す | SDK にマイクを直接渡すと、Code Apps では音声が SDK に届かない |

リファレンス: [認証とロール](references/auth.md) / [遅延と精度](references/latency-accuracy.md) /
[異常系](references/troubleshooting.md) / [パラメータ](references/.env.example)

## Step 0: 事前確認（会話の最初に 1 回だけ）

[standard の共通契約](../standard/SKILL.md#共通の事前確認契約会話の最初に-1-回だけ)に加え、1 回の AskUserQuestion で確認する。

| # | 質問 | 合格条件 |
|---|---|---|
| 1 | Speech リソースのサブスクリプション・リージョン・既存リソースの有無 | リージョンが決まり、**カスタム サブドメイン**を付けられる |
| 2 | 環境の CSP に `connect-src wss://<region>.stt.speech.microsoft.com` を追加してよいか | CSP は**環境全体**に効く。変更の承認者が決まっている |
| 3 | ロール付与・コネクタ作成・DLP 分類の担当者 | Azure RBAC、Power Platform のコネクタ、DLP の担当が分かれて記録されている |
| 4 | 音声と文字起こしのデータ分類・保存期間・保存先 | 録音を扱ってよい根拠と保存先が決まっている |
| 5 | 利用端末と会場（マイク、ブラウザ、ほかに動かすアプリ） | 端末の負荷とマイクの経路（ミキサー等）が分かっている |

## Step 1: Speech リソースと権限を用意する

1. Speech リソース（`kind=SpeechServices`）を**カスタム サブドメイン付き**で作る。キー認証が無効でもよい（Entra ID で認証する）
2. 開発者とトークン発行 Function の Managed Identity に **Foundry User** を付ける。Managed Identity は**リソース グループの範囲**で付ける
   （実測で数秒〜2 分で反映。リソース範囲は反映に約 12 分かかった。通らなかったロールは [認証とロール](references/auth.md)）

## Step 2: 端末で往復検証する

アプリを作る前に、リソース・権限・リージョンが正しいことを端末だけで確かめる。
Speech SDK を入れたプロジェクトのフォルダーで実行する。

```powershell
$env:SPEECH_TOKEN = (powershell -File .github/skills/realtime-speech/scripts/get_speech_token.ps1 -Raw)
node .github/skills/realtime-speech/scripts/verify_speech_roundtrip.mjs --out samples/question.wav --phrase <専門用語>
node .github/skills/realtime-speech/scripts/verify_push_stream.mjs --wav samples/question.wav
```

1 本目は音声合成で質問音声を作って認識する（作った WAV は後の疑似マイクに使う）。
2 本目はブラウザと同じ変換経路（48 kHz → 16 kHz → Push ストリーム）で認識する。両方で確定文が出れば次へ進む。

## Step 3: トークン発行 Function とコネクタを用意する

構成は [azure-infra のトークン ブローカー パターン](../azure-infra/references/token-broker.md) に従い、実装はテンプレートから生成する。

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/realtime-speech/templates/speech-token-broker --target <出力先> --dry-run
```

生成後は `scaffold.json` の手順（ビルド → `deploy_mcp_function.py`）で Function をデプロイし、
コネクタと接続は [custom-connector スキル](../custom-connector/SKILL.md) の Step 1〜7 で作る
（`deploy_connector.py --connector-dir <出力先>/connector` → `create_connection.py plan / apply / invoke --path /speech/token`）。
コネクタのテンプレートは on-behalf-of が有効なので、接続はブラウザ操作なしで、スクリプトを実行したサインイン ユーザーの権限で作られる。
Function はコネクタのトークン（`scp=User.Read`、`appid`=API アプリ）を信頼クライアントとして受け付ける（`authorizeClaims()`）。

## Step 4: Code Apps の CSP を設定する

```powershell
python .github/skills/code-apps/scripts/configure_code_app_csp.py --directive Connect-Src --source wss://<region>.stt.speech.microsoft.com --apply
python .github/skills/code-apps/scripts/configure_code_app_csp.py --directive Connect-Src --source wss://<region>.stt.speech.microsoft.com --assert
```

`worker-src` や `script-src` に `data:` / `blob:` は**追加しない**（Step 5 の部品はどちらも使わない）。

## Step 5: アドオンを生成してホストへ統合する

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/realtime-speech/templates/code-apps-addon --target <作業フォルダー> --dry-run
```

`public/` と `src/` をホストへ統合し、ホストで `npm install microsoft-cognitiveservices-speech-sdk` を実行する。
使い方は [アドオンの README](templates/code-apps-addon/README.md)。守ること:

- 開始は**ボタンのクリック**から呼ぶ（`AudioContext` の開始にユーザー操作が要る）
- 前提（トークン発行コネクタ）が欠けているときは開始ボタンを無効にし、理由を表示する
- 認識器は必ず `createRecognizer()` で作る（`WebWorkerLoadType=off` を設定する。外すと文字起こしが無言で止まる）

## Step 6: ホスト再現テストで確認する

[code-apps のホスト再現テスト](../code-apps/references/host-emulation-testing.md) で、Step 2 の WAV を疑似マイクにして動かす。

1. 正常系: 確定文と記録の保存まで進み、**CSP 違反が 0 件**
2. 停止耐性: 送信開始 5 秒以降にメインスレッドを 0.8 秒止めても、停止中・停止後の文が正しく確定する

## Step 7: 実機で確認する

Power Apps で開き、DevTools の Console をログの接頭辞（例: `[APP`）で絞り込んで、次の順に出ることを確認する。

`マイク取得` → `AudioContext {"state":"running"}` → `音声の取り込み方式 {"mode":"worklet"}` → `Speech トークンを取得` →
`WebSocket 接続確立` → `発話開始を検知` → `最初の途中結果` → `確定` → `記録を保存しました`

`CSP 違反` が 1 件でも出たら [異常系](references/troubleshooting.md) を見る。

## 検証チェックリスト

- [ ] Step 0 を 1 回の質問で確認し、CSP 変更と録音の扱いの承認を得た
- [ ] Speech リソースにカスタム サブドメインがあり、Function の Managed Identity に Foundry User を付けた
- [ ] Step 2 の 2 本のスクリプトで確定文が出た
- [ ] Function が認証なしで 401、委任トークンで 200 を返す
- [ ] CSP の `--assert` が通り、`data:` / `blob:` を追加していない
- [ ] 認識器は `createRecognizer()` で作り、取り込み方式は `worklet` になっている
- [ ] ホスト再現テストで CSP 違反 0 件、メインスレッド停止後も文が欠けない
- [ ] 実機の Console で Step 7 の順にログが出た
