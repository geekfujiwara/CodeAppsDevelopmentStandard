# Drawing Communication Addon（図面コミュニケーション アドオン）

既存の Code Apps プロジェクトへ組み込む **アドオン** です。scaffold（プロジェクトの雛形）ではありません。
新規アプリは [generic-base](../generic-base/README.md) で初期化し、そこへ以下のモジュールを取り込みます。
環境 ID・組織 URL・接続定義・生成済みサービス・業務レコードは含みません。

実際に組み込んだ動作例は [samples/drawing-communication-poc](../../samples/drawing-communication-poc/README.md) を参照してください。

## 含まれるもの

| 資産 | 役割 |
|---|---|
| `src/drawing/drawing-schema.ts` | 版付き図面 JSON の型・厳密な検証器（未知キー拒否・範囲・件数・サイズ上限）・正規化 JSON・相関用ハッシュ |
| `src/drawing/drawing-templates.ts` | 3 テンプレート（ノート PC 外観図 / 横形ポンプ総組立図 / 汎用機器配置図）の寸法パラメーター定義と図形生成 |
| `src/drawing/drawing-scene.ts` | 図形プリミティブ・線種・寸法線・SVG 文字列化（React 非依存） |
| `src/drawing/drawing-renderer.ts` | 図枠・表題欄・注釈マーカーを重ねたシーン生成 |
| `src/drawing/drawing-diff.ts` | 候補 JSON と現行図面の差分（寸法・表題欄・注釈を日本語ラベル付きで列挙） |
| `src/drawing/drawing-export.ts` | ブラウザ内の SVG / PDF 出力（PDF は A3 1 ページのラスター） |
| `src/drawing/drawing-factory.ts` | 図面・注釈の生成ヘルパー |
| `src/conversation/conversation-contract.ts` | 非同期会話の相関コントラクト（重複ターン拒否・スコープ一致・終端判定） |
| `src/conversation/conversation-transport.ts` | 差し替え可能なトランスポート境界と「未構成」実装 |
| `src/conversation/demo-worker.ts` | DEMO ワーカー（ローカル寸法規則。AI 応答ではない） |
| `agent-skill/` | Copilot Studio 用のフラット Python バンドル（検証 + A3 PDF/SVG + 注釈生成） |
| `tests/` | 図面スキーマ・相関・重複・差分・Python/TypeScript ハッシュ相互運用の回帰テスト |

図形は JSON に保存せず寸法パラメーターから生成します。CAD ではなく、**レビュー用の作図**です。
干渉・強度・熱・流体・法規・公差は評価しません。

## Step 1: アドオン単体の検査

Node.js 22.18 以上、Python 3.10 以上。このディレクトリで実行します。

```powershell
npm install
python -m pip install -r agent-skill/requirements.txt
npm run typecheck
npm test
npm run test:skill
```

## Step 2: Code Apps へ組み込む

1. `src/drawing/` と `src/conversation/` を対象プロジェクトの `src/` 配下へコピーします。追加の npm 依存はありません。
2. 画面は `buildScene(drawing)` の返すプリミティブを SVG として描画します。用紙は A3 固定（`viewBox="0 0 420 297"`）で、
   クリック座標は `viewBox` 上の mm に変換してから注釈を作成します。
3. 外部から来た JSON（取り込み・候補・貼り付け）は必ず `parseDrawing` を通します。`JSON.parse` の結果を直接状態へ入れないでください。
4. 候補の採用前に `diffDrawings` の結果を必ず表示し、採用は 1 操作 = 1 Undo エントリにします。
5. 共有保存・改訂確定は明示操作に限定します。自動保存しません。

## Step 3: 会話ワーカーを差し替える

`ConversationTransport` だけが画面との境界です。Dataverse の要求 / 結果テーブルに接続するときは、
`pa app add data-source` で生成されたサービスを包む実装を注入します（画面コードは変更しません）。

- 送信前: `validateRequest` で編集バージョンと基準ハッシュを突き合わせる
- 送信時: `assertNewTurn` で重複ターンを拒否する（再送ではなく既存の受付を再開する）
- 受領時: `acceptResult` で会話 ID・ターン ID・バージョン・基準ハッシュの一致と終端状態を確認する
- 未構成時: `createNotConfiguredTransport` を使い、成功を装わない

DEMO ワーカーは **ローカルの寸法規則**であり、AI の応答ではありません。UI には `transport.label` と
`transport.caution` を必ず表示してください。サーバー側の所有者確認・行権限・代替キーはアプリ側のガードでは代替できません。
要求 / 結果テーブルと権限の設計は [conversation-worker.md](../../../agent-flows/references/conversation-worker.md) に従います。

## Step 4: Python スキルを添付する

`agent-skill/` は Copilot Studio v2 のスキル添付手順（[copilot-studio-v2](../../../copilot-studio-v2/SKILL.md)）で
そのまま添付できるフラット構成です。スキル名は環境ごとに一意にしてください。

```powershell
python -X utf8 agent-skill/renderer.py --input agent-skill/sample.json --validate
python -X utf8 agent-skill/renderer.py --input agent-skill/sample.json --pdf review-UNIQUE.pdf
```

`schema.json` は TypeScript 側の検証器と同じ契約（A3 固定・テンプレートごとの寸法範囲・注釈 60 件・200 KB）を持ちます。
`hash_drawing` は TypeScript の `hashDrawing` と同じ 64bit FNV-1a で、`tests/` に相互運用テストがあります。
契約を変えるときは **両方の実装とテスト定数**を同時に更新してください。

## 検証の範囲

テストは構造・範囲・差分・相関・重複・出力の生成可否を検査します。ブラウザは起動しません。
PDF/SVG の見た目、実エージェント応答、Dataverse の権限、共有保存の競合は導入先で別途確認してください。
ブラウザ内 PDF はラスター（JPEG 埋め込み）で、文字検索も寸法の再計測もできません。
配布用のベクター PDF と注釈一覧は `agent-skill/renderer.py`（ReportLab / PyMuPDF）で生成します。
