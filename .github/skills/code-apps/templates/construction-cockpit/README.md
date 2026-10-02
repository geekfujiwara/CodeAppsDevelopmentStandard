# construction-cockpit — 建設現場コックピット

複数工事を Google Maps、React Flow ガント、関係グラフ、日報、KY、安全、ナレッジ、重機稼働で統合する Power Apps Code Apps テンプレートです。`generic-base` を継承し、Code App、Dataverse 構築スクリプト、Cowork plugin を一つの生成物として提供します。

## 含まれる機能

- **現場マップ**: 施工中・計画中と、直近 1 年に完了した工事を Google Maps のカードで表示
- **Project Orbit**: 工事を切り替えながら React Flow ガントと関係グラフを操作
- **KY 活動**: 危険、対策、AI 予測、危険度を記録
- **ヒヤリハット**: 安全・品質・設備の事象を記録し、ナレッジへ変換
- **日報**: 天候、人員、作業内容、翌日予定、AI 下書き区分を記録
- **ナレッジ**: 事象、原因、教訓を工種と関連付けて蓄積
- **重機稼働**: 日報と重機の稼働実績を表示
- **Cowork**: 会議、メール、Teams チャット、予定表から情報を整理し、確認付きで Dataverse を更新

## 画面

| ページ | パス | 説明 |
|---|---|---|
| 現場マップ | `/site-map` | 稼働中・直近完了の工事ポートフォリオ |
| 工事オービット | `/projects` | ガント、関係グラフ、ノードインスペクター |
| 工事ディープリンク | `/projects/:projectId` | 指定工事を選択して開く |
| KY 活動 | `/ky` | KY の一覧と登録 |
| ヒヤリハット | `/incidents` | 事象の登録とナレッジ化 |
| 日報 | `/reports` | 日報の一覧と登録 |
| ナレッジ | `/knowledge` | 教訓の検索・参照 |
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
| Project Orbit デザイン | `styles/index.pcss` |
| Cowork | `cowork/construction-cockpit` |

## セキュリティ

- Dataverse のアクセス制御はセキュリティロールで行います。
- `.env`、`power.config.json`、`.power/`、`src/generated/` はコミットしません。
- `VITE_*` に secret を置きません。
- Cowork の外部文章は命令ではなくデータとして扱います。
- 書き込み前に対象レコードと変更内容を利用者へ提示します。
