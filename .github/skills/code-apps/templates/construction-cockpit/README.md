# construction-cockpit — 建設現場コックピット

複数工事を Google Maps、React Flow ガント、関係グラフ、日報、KY、安全、ナレッジ、重機稼働で統合する Power Apps Code Apps テンプレートです。`generic-base` を継承し、Code App、Dataverse 構築スクリプト、Cowork plugin を一つの生成物として提供します。

## 含まれる機能

- **現場マップ**: 施工中・計画中と、直近 1 年に完了した工事を Google Maps のカードで表示
- **工事ワークスペース**: 工事種別ごとの Three.js 3D、先行作業付き React Flow ガント、因果関係グラフ、監督確認を連動表示
- **KY 活動**: 危険、対策、AI 予測、危険度を記録
- **ヒヤリハット**: 安全・品質・設備の事象を記録し、ナレッジへ変換
- **日報**: 天候、人員、作業内容、翌日予定、AI 下書き区分を記録
- **ナレッジ**: 事象、原因、教訓を工種と関連付けて蓄積
- **重機稼働**: 日報と重機の稼働実績を表示
- **Cowork**: 会議、メール、Teams チャット、予定表から情報を整理し、確認付きで Dataverse を更新
- **記録の一覧と詳細**: KY・ヒヤリハット・日報・ナレッジを集計・グラフ・検索・絞り込み付きの一覧で表示し、行から詳細（関連記録・修正・承認・ナレッジ化）へ移動
- **CAD モデル取り込み**: GLB / OBJ / STL / FBX を読み込み、部品を作業に対応付けて、承認済みの進捗どおり下から施工単位を 3D に表示（Z-up・mm の正規化、名前からの自動対応付け）
- **施工位置イメージ**: 選択中の作業の部位を 3D から自動で画像化し、作業の画像列に保存
- **Copilot Studio**: 「現場コックピット アシスタント」（`agent/cockpit-assistant/`）で、施工単位での進捗報告・記録のまとめ登録・監督の承認を会話から行う

## 画面

| ページ | パス | 説明 |
|---|---|---|
| 現場マップ | `/site-map` | 稼働中・直近完了の工事ポートフォリオ |
| 工事オービット | `/projects` | ガント、関係グラフ、ノードインスペクター |
| 工事ディープリンク | `/projects/:projectId` | 指定工事を選択して開く |
| KY 活動 | `/ky`・`/ky/new`・`/ky/:id` | グラフ付き一覧、登録、詳細 |
| ヒヤリハット | `/incidents`・`/incidents/new`・`/incidents/:id` | グラフ付き一覧、登録、詳細とナレッジ化 |
| 日報 | `/reports`・`/reports/new`・`/reports/:id` | グラフ付き一覧、作成、詳細と承認・差戻し |
| ナレッジ | `/knowledge`・`/knowledge/:id` | 検索、詳細と修正 |
| 重機稼働 | `/equipment` | 重機と稼働実績 |

## Dataverse

`{prefix}` は scaffold 時の `PUBLISHER_PREFIX` です。

| テーブル | 用途 |
|---|---|
| `{prefix}_project` | 工事 |
| `{prefix}_task` | 作業 |
| `{prefix}_worktype` | 工種・工法 |
| `{prefix}_dailyreport` | 日報 |
| `{prefix}_kyactivity` | KY 活動 |
| `{prefix}_incident` | ヒヤリハット |
| `{prefix}_knowledge` | ナレッジ |
| `{prefix}_equipment` | 重機 |
| `{prefix}_equipmentusage` | 重機稼働 |

CAD 取り込みは `{prefix}_project.{prefix}_modelfile`（ファイル列）と `{prefix}_modelmapping`（対応付けと施工単位の JSON）、施工位置イメージは `{prefix}_task.{prefix}_locationimage`（画像列）を使います。画像列は作成時の `CanStoreFullImage` 指定が無視されるため、`setup_construction_dataverse.py` が作成後にフルサイズ保存を有効化します。

## scaffold

plugin ID は新規 GUID、Dataverse origin は末尾スラッシュなしで指定します。

```powershell
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/code-apps/templates/construction-cockpit `
  --target . `
  --var PUBLISHER_PREFIX=contoso `
  --var COWORK_PLUGIN_ID=<new-plugin-guid> `
  --var DATAVERSE_ORIGIN=https://<org>.crm.dynamics.com `
  --dry-run
```

生成計画を確認後、`--dry-run` を外して実行します。

```powershell
Copy-Item .env.example .env
# .env の PUBLISHER_PREFIX / VITE_PUBLISHER_PREFIX は scaffold 時と同じ値にする
python scripts/setup_construction_dataverse.py
python scripts/setup_construction_dataverse.py --apply --seed-demo
npm install --no-audit --no-fund
python .github/skills/code-apps/scripts/setup_connection_reference.py --write-env .env
npx --no pa app init --environment-id $env:ENV_ID --display-name "Construction Cockpit" --app-type CodeApp --non-interactive
npm run deploy -- --solution-id $env:SOLUTION_ID
python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse `
  --connection-ref $env:CONNECTION_REFERENCE_LOGICAL_NAME --solution-id $env:SOLUTION_ID
npm run deploy
```

`src/lib/dataverse-client.ts` は生成サービスを遅延解決するため、Dataverse data source を追加する前でも初回 build と push ができます。

## 工事ワークスペース

- `/projects` は Google Maps を既定表示とし、日報写真・一覧へ切り替えられます。
- 工事番号、名称、発注者、住所を Dataverse 側で検索します。
- 工事を選択するとナビゲーションが折りたたまれ、Three.js の進捗モデル、React Flow 工程ガント、関連データの因果関係を表示します。
- Cowork から提出された日報と工程進捗は、監督確認で承認または理由付き差戻しができます。
- Cowork plugin は現場記録と新規工事登録を確認付きで支援します。本番 ZIP 生成には OAuth registration ID が必要です。

- 3D は工事種別（橋梁・造成・トンネル・建築・水路護岸・道路）ごとの実寸の高精細モデルです（鋼 I 桁・床版・高欄の橋、NATM の支保と覆工、S 造の柱梁とカーテンウォール、プレキャスト U 型水路と護岸など）。`src/lib/models/` にあり、外部の HDR・フォント・テクスチャは読み込みません。
- **完成形を点線で常に表示**し、作業の `{prefix}_zone` と進捗に応じて実体化します。施工中の部位はクリッピング平面で施工方向（上方向・トンネルは奥）に立ち上がり、切土・床掘は削られます。足場などの仮設物は完成形に含めません。「完成形（点線）」「地盤を透かす」は画面で切り替えられます。
- 工事の `{prefix}_modelurl` に `bundled:<名前>` を入れると同梱の glTF（GLB）を読み込みます（デモの橋梁は `bundled:bridge-3span`）。Code Apps の CSP は `connect-src` に `'self'` を含まない場合があるため、同梱 GLB は base64 で埋め込み、通信せずに解析します。`https://` の URL は CSP の `connect-src` で許可したホストだけ使えます。
- BIM/CIM から書き出した glTF は、glTF の `extras`（`zone` / `segment` / `grow` / `invert` / `temporary`）か、ノード名 `部位キー#順番/総数`・`zone:部位キー` で工程と対応付けます。
- `npm run export:models` で同梱 GLB を更新し、`npm run export:models -- --all` で全種別を `exports/models/` に書き出します（`exports/` はコミットしない）。Node 24 以降が必要です。
- 建築は工事の `{prefix}_modelcenter` に `floors=12;width=4;depth=4` の形式で階数とスパン数を指定します。
- ガントは `{prefix}_predecessor`（先行作業）で因果の矢印を描き、遅延した作業から出る矢印を「遅延が波及」として強調します。
- KY・ヒヤリハット・日報は各画面の見出しで現場を選びます（選択はブラウザに記憶）。

## デモデータ

`python scripts/setup_construction_dataverse.py --apply --seed-demo` は `scripts/seed_construction_demo.py` を呼び、次を投入します。日付は実行日基準・レコード名は固定キーのため、再実行すると当日基準に更新されます。

| 対象 | 内容 |
|---|---|
| 工事 | 全国 16 件（施工中 9 / 計画中 2 / 1 年以内に完了 4 / 1 年以上前に完了 1）。6 種類の 3D モデルを網羅 |
| 工程 | 工事種別テンプレートから約 140 件。先行作業・3D 部位・工程順・遅延時の阻害要因付き |
| 日報 | 施工中工事の直近 3 週間（日曜除く）と完了工事の記録。約 8 割に工事写真、提出済・差戻し・承認を含む |
| KY / ヒヤリハット / ナレッジ | 工種別の危険・対策ライブラリから生成し、ヒヤリハットとナレッジを関連付け |
| 重機 / 稼働 | 重機 14 台と直近 10 日の稼働時間 |

工事写真は `npm run generate:photos` で工種 21 シーン × 天候 3 種の画像を `src/assets/demo-photos/` に生成して同梱します（CSP の `img-src 'self'` で表示可能）。日報の `{prefix}_photourl` に `demo:<scene>:<sunny|cloudy|rain>` を入れると同梱画像、`https://` を入れるとその URL を表示し、工事黒板（工事名・工種・測点・撮影日）を重ねます。
要件と受け入れテストは `spec/requirements.md` を参照してください。

## Google Maps

API キー不要の `output=embed` を使います。Code Apps の `frame-src` に次を許可してください。

```powershell
python .github/skills/code-apps/scripts/configure_code_app_csp.py `
  --directive Frame-Src --source https://www.google.com --assert
```

必要に応じて `https://maps.google.com` も同様に追加・確認します。API キー不要の embed は任意の複数マーカーを構成できないため、工事ごとの map card として表示します。

## React Flow

- ガントは予定開始・終了を横位置と幅へ変換し、状態、進捗、依存関係を表示します。
- 未保存の変更と誤認しないよう、ガントノードはドラッグできません。
- 関係グラフは工事を中心に作業、日報、KY、ヒヤリハット、ナレッジ、重機稼働を接続します。
- 関係グラフで移動した位置は探索用であり、Dataverse へ保存しません。

## UI design

アプリシェルは固定サイドバーを使わず、ナビゲーションと本文が同じ CSS Grid 内で幅を分けます。Power Apps iframe 内でも本文が横へはみ出しません。濃紺メニューの文字色、地図カード、工事ワークスペースの余白はクラスで明示しており、production CSS を `npm run test:layout` で検査できます。

## Cowork

`cowork/construction-cockpit` に 5 つのスキルと Dataverse MCP connector 定義を含みます。メール、チャット、会議文字起こしを信頼されない入力として扱い、作成・更新は利用者の確認後だけ行います。

公開には Entra OAuth、管理者同意、Dataverse allowed MCP client、Teams OAuth registration、Microsoft 365 管理センターでの配布が必要です。secret、tenant ID、client ID、registration ID は `.env` のみに保存し、コミットしません。

## カスタマイズ

| 対象 | 場所 |
|---|---|
| テーブル、列、Choice、デモデータ | `scripts/setup_construction_dataverse.py` |
| EntitySetName 対応 | `src/lib/dataverse-client.ts` |
| レコードマッピング | `src/services/construction-service.ts` |
| ガント | `src/components/project-gantt-flow.tsx` |
| 関係グラフ | `src/components/project-relationship-flow.tsx` |
| 地図 | `src/components/google-map-embed.tsx`, `src/pages/site-map.tsx` |
| Construction OS デザイン | `styles/index.pcss`、`src/pages/_layout.tsx`、`src/components/sidebar.tsx` |
| Cowork | `cowork/construction-cockpit` |

## セキュリティ

- Dataverse のアクセス制御はセキュリティロールで行います。
- `.env`、`power.config.json`、`.power/`、`src/generated/` はコミットしません。
- `VITE_*` に secret を置きません。
- Cowork の外部文章は命令ではなくデータとして扱います。
- 書き込み前に対象レコードと変更内容を利用者へ提示します。
