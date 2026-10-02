# システム構成（株主総会 Q&A アシスト）

最終更新: 2026-10-02

## 1. 全体像

```
                         ┌──────────────── Power Platform（USProd 環境・マネージド ソリューション ${SOLUTION_NAME}） ─────────────────┐
  マイク ──► ブラウザ（Code Apps: React + Vite、Power Apps プレイヤーの iframe 内）                                              │
             │  ① 音声 PCM ──(WebSocket wss)──────────────► Azure AI Speech（japaneast・連続認識・日本語）                    │
             │  ② 検索（BM25・ブラウザ内 1 ms 未満）  想定問答 45 件 / IR 抜粋 36 件は起動時に Dataverse から読み込み          │
             │  ③ 生成・照合（SSE / JSON, fetch 直結） ─► Azure Functions「${FUNCTION_APP_NAME}」─► Azure OpenAI gpt-5.4-mini │
             │  ④ Dataverse コネクタ ─► Dataverse（記録・名簿・総会・評価・LIVE）                                            │
             │  ⑤ SharePoint コネクタ ─► SharePoint「AGMRecordings」（録音 WAV・まとめ Markdown / CSV）                      │
             │  ⑥ カスタム コネクタ（OBO）─► Functions：Speech トークン / 生成チケットの発行                                 │
             └───────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

| 層 | 構成要素 | 役割 |
|---|---|---|
| 画面 | Power Apps **Code Apps**（React 19 / TypeScript / Tailwind / motion / recharts / React Flow） | 1 画面の質疑応答（① 文字起こし ② 質問カード ③ 回答案と根拠 ④ 記録）、想定問答、総会・集計、LIVE 視聴 |
| 音声認識 | **Azure AI Speech**（`${SPEECH_RESOURCE_NAME}`, SpeechServices, japaneast） | 連続認識・途中結果。ブラウザから WebSocket で直結（Entra ID トークン、キー不使用） |
| 中継 API | **Azure Functions**（`${FUNCTION_APP_NAME}`, Linux・Flex Consumption 相当、VNet 統合、ストレージは Private Endpoint） | `/speech/token`（Speech の Entra トークン）・`/answer/ticket`（生成用チケット）・`/answer/stream`（回答案の SSE）・`/shareholder/identify`（株主の照合）・`/transcribe`（MAI-Transcribe）・`/config`（設定の選択肢） |
| 生成 AI | **Azure OpenAI**（`${AOAI_RESOURCE_NAME}`, AIServices, japaneast）デプロイ **gpt-5.4-mini**（DataZoneStandard / APAC） | 回答案・要約のストリーム生成、株主の照合（構造化出力） |
| データ | **Dataverse**（7 テーブル） | 想定問答・IR 抜粋・株主名簿・総会・発言・質問・LIVE |
| ファイル | **SharePoint**（ドキュメント ライブラリ `AGMRecordings`） | 録音（株主番号ごとのフォルダー）、総会のまとめ |
| 接続 | 接続参照 3 つ | Dataverse / SharePoint / カスタム コネクタ「AGM Speech Token Broker」（OAuth・On-Behalf-Of） |

## 2. 利用モデルと設定

| 用途 | モデル / サービス | 設定 | 実測 |
|---|---|---|---|
| 文字起こし | Azure AI Speech（標準モデル・ja-JP・連続認識） | フレーズ リスト（「株主番号」+ 想定問答のキーワード最大 400）、途中結果あり、録音は 16 kHz PCM を発言ごとに WAV | 最初の途中結果 0.3〜3.5 秒 |
| 回答案・要約 | **gpt-5.4-mini**（Azure OpenAI v1 API `/openai/v1/chat/completions`） | `reasoning_effort: none`、`max_completion_tokens`、根拠（想定問答・IR）をフェンスで囲んで渡す、根拠 ID を本文に付ける | 最初の文字 0.8〜1.1 秒、完了 1.5〜2.4 秒 |
| 株主の照合 | **gpt-5.4-mini**（構造化出力 `json_schema`） | 名簿の候補（ブラウザで名前・フリガナ・番号の近さで最大 20 人に絞り込み）からだけ選ばせる。確からしさ 0.8 以上は自動適用、未満は候補を表示 | 評価セット 12/12 正解、中央値 0.84 秒 |
| 検索 | ブラウザ内 BM25（自前） | 想定問答の質問・言い換え・キーワード、IR 抜粋 | 1 回 1 ms 未満（Azure AI Search / Dataverse 検索との比較は `spec/search-comparison.md`） |

モデル比較（同じプロンプト）: gpt-5.4-mini を採用。gpt-5.4-nano・gpt-5.6-luna・gpt-4.1-mini は比較後に削除（`scripts/test/bench-models.mjs`）。

## 3. Dataverse のテーブル

| テーブル | 主な列 | 用途 |
|---|---|---|
| 想定問答 `${PUBLISHER_PREFIX}_agmqa` | 問答コード・分類・質問・言い換え・キーワード・回答・要点・回答者・根拠 ID・注意 | 検索と回答案の根拠 |
| IR 抜粋 `${PUBLISHER_PREFIX}_agmirexcerpt` | 資料名・章・ページ・本文 | 数値の根拠 |
| 株主名簿 `${PUBLISHER_PREFIX}_agmshareholder` | 株主番号・氏名・フリガナ・保有株式数・区分・メモ | 照合・過去の質問 |
| 株主総会 `${PUBLISHER_PREFIX}_agmmeeting` | 総会名・開催日・まとめの保存先 | 記録のまとまり |
| 株主発言 `${PUBLISHER_PREFIX}_agmturn` | 株主番号・氏名・開始・長さ・文字起こし・録音 URL・特定方法・聞き取った番号（原文）・保存状態 | 株主ごとの記録（総会・名簿に紐づけ） |
| 株主質問 `${PUBLISHER_PREFIX}_agmquestion` | 番号・分類・要旨・想定問答・回答案・AI 回答案・モデル・評価・コメント | 質問ごとの記録と評価 |
| LIVE 共有 `${PUBLISHER_PREFIX}_agmlive` | 状態（JSON・最大 1 MB）・更新番号・閲覧者・状態（live / ended） | 幹部への読み取り専用の配信（レコード単位で共有） |

## 4. 主な流れ

1. **連続録音**: 開始から終了まで 1 本で録り続け、議長の指名・名乗りで発言（ターン）を区切る。区切りが確定したら前の株主の WAV を切り出して保存する。
2. **株主の特定**: 名乗りが確定したら、番号が名簿にあり名前とも矛盾しなければそのまま確定。そうでなければ名簿の候補を AI で照合する（`/shareholder/identify`）。同じ名字で番号の近い候補がいれば、確からしさに関係なく自動では決めず候補を出す（`rivalsOf`）。担当者は株主情報の欄で番号を直接直せる（手入力が最優先）。
3. **質問の整理と回答案**: 質問の文が確定するとカードを作り、想定問答と IR を検索、カードごとに gpt-5.4-mini で回答案をストリーム生成（同時 2 件まで）。根拠 ID は押すと吹き出しで中身を確認できる。
4. **記録と修正**: 発言・質問・回答案・録音を Dataverse / SharePoint に保存。記録の行から株主番号を後から直せる（名簿を引き直して氏名と紐づけも更新）。
5. **総会・集計**: 総会ごとに KPI・分類別・時間帯別・一致率・評価分布を表示し、評価を保存。「まとめて保存」で Markdown / CSV を SharePoint に置き、保存先を総会に残す。
6. **想定問答の検索**: 検索結果の上位 3 件と関連する IR を根拠に回答案を生成し、回答案の各行と、その行が引用した根拠を React Flow の線で結ぶ（`source-flow.tsx`・`source-graph.ts`）。
7. **LIVE**: 担当者が LIVE を開始すると、画面の状態（株主・文字起こし・カード・回答案）を 1.2 秒ごとに LIVE レコードへ書く（変化があるときだけ）。閲覧者は 1.5 秒ごとに読む（遅れ 2〜3 秒）。より短い遅れが必要なら Azure Web PubSub に置き換える。

## 5. ネットワークと CSP

| 設定 | 値 |
|---|---|
| Code Apps の CSP `connect-src` | Speech の `wss://japaneast.stt.speech.microsoft.com`、Functions の `https://${FUNCTION_APP_NAME}.azurewebsites.net` |
| Functions の CORS | Code Apps のオリジン（`*.environment.api.powerplatformusercontent.com` の環境ホスト）。ローカル検証用に `http://localhost:4173` |
| Functions → Azure OpenAI / Speech | マネージド ID（キーなし。Azure OpenAI はローカル認証を無効化） |
| Functions のストレージ | Private Endpoint（blob / queue）、共有キー不使用 |

コネクタはストリーム応答を中継できないため、生成と照合は「コネクタでチケット（HMAC・15 分）を発行 → ブラウザから Functions へ直接 fetch」の 2 段にしている。

## 6. 検証用のスクリプト

| スクリプト | 内容 |
|---|---|
| `npm run test` | 区切り・番号・照合候補・集計などの単体テスト（36 件） |
| `azure/speech-token-broker: npm test` | Functions の単体テスト（16 件） |
| `node scripts/test/eval-identify.ts` | 照合の評価セットを実 API に流して正解率・遅延を測る |
| `node scripts/test/e2e-cockpit.mjs` | ホスト再現の CSP で画面を操作する E2E（22 項目） |
| `python scripts/test/probe_live_grant.py` | コネクタ経由の GrantAccess / RevokeAccess を実テナントで確認 |

## 7. 生成サービスの読み込みと scaffold

- 生成サービス（Dataverse・SharePoint・カスタム コネクタ）は `src/lib/agm/services.ts` が `import.meta.glob` で遅延解決する。
  データソースを追加する前でもビルドでき、未追加の操作は失敗の結果（追加手順つき）を返す。
- このアプリは開発標準の `code-apps/templates/agm-qa-assist` から scaffold できる（変数は AskUserQuestion で聞く）。
  テンプレートは `python scripts/export_template.py` で書き出し、`--check` で実値が残っていないかを確かめる。
- Azure 側のこのアプリ固有の設定は `python scripts/configure_azure.py`（計画 → `--apply`、冪等）。
## 8. 文字起こしのモデル（Azure Speech と MAI-Transcribe）・設定・Cowork

| 項目 | 内容 |
|---|---|
| MAI-Transcribe | Fast Transcription API の `enhancedMode`（`/speechtotext/transcriptions:transcribe?api-version=2025-10-15`）で呼ぶファイル単位のモデル。日本のリージョンでは未提供のため、**東南アジア（southeastasia）の Foundry リソース**（AIServices・キー認証無効）を使う。Function がマネージド ID で呼ぶ（`/transcribe`） |
| 使い方 | Azure Speech（リアルタイム）の確定文ごとに、その区間の録音（前後 200 ms）を MAI で認識し直す。方式は設定で「Azure Speech」「MAI-Transcribe（置き換え）」「比較（並べる）」。既定のモデルは **MAI-Transcribe-2**（1.5 も選べる） |
| 実測 | 台本の音声で CER: Azure リアルタイム 2.4% / MAI-2（確定文ごと）1.6%。アプリ内で確定から MAI の結果まで中央値 1.6 秒 |
| 設定 | 組織の既定は Dataverse の設定テーブル（`name=default` の JSON）、この端末だけの変更はブラウザに保存。選べる値は Function の `/config`（`AOAI_DEPLOYMENTS`・`STT_ENDPOINTS` の許可リスト。URL は返さない） |
| AI モデル | 回答案と株主照合で、デプロイ（gpt-5.4-mini / gpt-4.1-mini）・推論の強さ・最大トークンを選べる。gpt-4.1-mini は Standard（東日本で処理） |
| Cowork | プラグイン「株主総会 想定問答アシスタント」（`cowork/agm-qa-plugin`）が Dataverse MCP で想定問答・台本の**下書き**を作る。承認はアプリの想定問答の画面。検索に使うのは承認済みだけ |
| 追加テーブル | リハーサル台本 `${PUBLISHER_PREFIX}_agmscript`（行の JSON）、アプリの設定 `${PUBLISHER_PREFIX}_agmsetting`。想定問答に状態・作成元の列 |
