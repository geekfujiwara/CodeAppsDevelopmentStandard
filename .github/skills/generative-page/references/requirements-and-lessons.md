# Generative Page 必須要件（詳細・教訓 13〜35）

[SKILL.md](../SKILL.md) の「## 必須要件」要点（1〜12）に続く実装詳細ルールと教訓。
Lookup 名前解決・SiteMap・D3 チャート・OData アノテーション・タイムアウト対策などをコード例つきでまとめる。

13. **Lookup 展開フィールドを `select` に含めない** — `em_equipmentname` 等の Lookup 先の名前フィールドは DataAPI の `select` に指定すると `Could not find a property` エラーになる。`_xxx_value`（FK ID）のみを select し、別テーブルから取得した名前を `useMemo` Map でクライアントサイド名前解決する
14. **`--add-to-sitemap` を使わない** — PAC CLI の `--add-to-sitemap` はタイトルなしの SubArea（「新しいサブエリア」と表示される）を追加してしまう。SiteMap は API で `Url` 属性 + `<Titles>` 付きの SubArea を自前で管理する（教訓 #30 参照）
15. **レコード編集は常にモーダル（初回デプロイ必須）** — 新しいタブやページ遷移ではなく、Fluent UI `Dialog` でモーダル編集フォームを表示。「詳細を開く」ボタンで同タブのレコードフォームへ遷移するオプションも提供。**モーダル・トースト・ボタン式 Choice は「段階的改善」ではなく初回デプロイのファイルに必ず含める**。実装詳細は code-patterns.md §15 参照
16. **Choice フィールドはボタン式トグル** — Dropdown ではなく、カラー付きトグルボタンで実装。選択中はボタンが塗りつぶされ、未選択はアウトラインのみ
17. **保存後にトースト通知** — 保存成功時は右上に緑色のトースト（3秒で自動消去）。`setSaving(false)` → `setSelectedItem(null)` → `setToast()` の順で state 更新。`finally { setSaving(false) }` は使わない（モーダル閉じと競合する）
18. **SiteMap 更新はデプロイの一部（省略禁止）** — `pac model genpage upload` を実行したら、同じ作業内で必ず SiteMap を API で更新する。ユーザーに「更新しますか？」と聞かず自動的に行う。既存 SiteMap を `PATCH sitemaps({id})` で更新し、`PublishXml` で公開する
19. **D3 チャートの SVG は明示的 width/height を設定** — `viewBox` 属性は使わない。`svg.attr("width", W).attr("height", H)` でピクセル指定する。`viewBox` + `height: "auto"` は Generative Pages ランタイムでチャートが表示されない原因になる。SVG を囲む `<div>` にも `height` を明示する
20. **KPI ダッシュボードは「チャート4枚 + データタブ」構成** — 初回表示はチャート4枚（2×2グリッド）+ KPI カード4枚。裏のデータ（DataGrid）は `TabList` で「データ」タブに切り替えて表示。チャートとデータを同一画面に詰め込まない
21. **D3 useEffect は `requestAnimationFrame` で描画を遅延する** — データ取得完了と同時に `loading=false` + データセットが行われる同一レンダーサイクルでは、SVG 要素が DOM に追加されてもブラウザのレイアウトが未完了。`requestAnimationFrame` でフレーム描画を次フレームに遅延し、クリーンアップで `cancelAnimationFrame` を返す。ref チェックは rAF コールバック内で行う
22. **ガントチャート等のギャラリー行は固定 height + border-box** — `minHeight` + padding の組み合わせは D3 側の行位置計算とズレる。ギャラリー側は `height: 36px` + `boxSizing: "border-box"` で固定し、D3 側は `scaleBand` ではなく `headerH + i * rowH` の手動ピクセル計算でアイテム位置を決定する
23. **DatePicker は使わず `<Input type="date">` を使う** — `@fluentui/react-datepicker-compat` の `DatePicker` は Generative Pages ランタイムでポップアップが透明になり背後のコンテンツと重なる。Portal 経由のレンダリングに背景色が適用されないため。Fluent UI `Input` に `type: "date"` を指定してブラウザネイティブの日付ピッカーを使う
24. **D3 チャートのツールチップは `position: absolute` + 親コンテナ基準** — `position: fixed` は Generative Pages ランタイムのコンテナ構造でマウスから大きく離れた位置に表示される。ルート div に `position: "relative"` を設定し、ツールチップ div は `position: "absolute"` + `pointerEvents: "none"` で配置。`getBoundingClientRect()` + `scrollLeft`/`scrollTop` でコンテナオフセットを計算し、マウスの右10px・上10pxに表示する。Fluent UI の `Tooltip` コンポーネントは D3 SVG 要素には使えないため、生の HTML div + `innerHTML` で実装する
25. **`pac model genpage upload` の新規ページ作成はタイムアウトしやすい** — 新規ページ（`--name` 指定）は既存ページ更新（`--page-id` 指定）より大幅に遅い。`--prompt` と `--agent-message` は **英語または最短の文字列** にすると成功率が上がる。日本語の長い文字列はサーバー側処理が重くなりタイムアウト（「タスクが取り消されました」）の原因になる。失敗したら英語の短い値でリトライする
26. **`PublishXml` API はタイムアウトすることがある** — 公開処理は環境やサーバー応答状況によって完了まで時間がかかり、`PublishXml` がタイムアウトする場合がある。タイムアウトしたら、フォールバックとして `pac solution publish` を使う。PAC CLI 側の公開処理のほうが成功率が高い場合がある
27. **SiteMap 更新処理の `PublishXml` がハングしたら `pac solution publish` で代替** — プロジェクト側で用意した SiteMap 更新スクリプト／手順で SiteMap XML PATCH が成功しても、最後の `PublishXml`（アプリ公開）でハングする場合がある。この場合、その処理を中断（Ctrl+C / kill）して `pac solution publish` を実行すれば公開される。SiteMap XML 更新自体は PATCH 時点で確定しているため、公開さえ通れば問題ない
28. **URL パラメータ渡しはハッシュフラグメント（`#`）を使う** — MDA（モデル駆動型アプリ）の URL にカスタムクエリパラメータ（`&date=2026-04-24` 等）を追加すると、MDA ルーティングが不明なパラメータとしてエラーを返しページが開けない。**ハッシュフラグメント（`#date=2026-04-24`）を使う**。ハッシュはサーバーに送信されないため MDA ルーティングに干渉しない。GenPage 側では `window.location.hash` で読み取る

```typescript
// ❌ NG: クエリパラメータ → MDA ルーティングエラー
// https://{org}.crm.dynamics.com/main.aspx?appid=...&pagetype=genux&id=...&date=2026-04-24

// ✅ OK: ハッシュフラグメント → MDA ルーティングに干渉しない
// https://{org}.crm.dynamics.com/main.aspx?appid=...&pagetype=genux&id=...#date=2026-04-24

function getInitialDate(): string {
  try {
    var hash = window.location.hash || "";
    var m = hash.match(/date=([\d]{4}-[\d]{2}-[\d]{2})/);
    if (m) {
      var parsed = new Date(m[1] + "T00:00:00");
      if (!isNaN(parsed.getTime())) return m[1];
    }
  } catch (e) { /* ignore */ }
  return todayStr();
}
```

> **メール通知等で URL を生成する場合**: `approvalUrl = baseUrl + "#date=" + dateIso` のようにハッシュで日付を渡す。Power Automate フローのメール本文にリンクボタンとして埋め込む

29. **MDA メニューの GenPage タイトル修正はアプリデザイナーで手動変更が確実** — `pac model genpage upload --add-to-sitemap` で追加された SubArea のタイトルは、内部名（`--name` パラメータの値）がそのまま表示される。SiteMap XML を API で `<Titles>` 付きに PATCH + `PublishXml` しても、MDA クライアントキャッシュやマネージドレイヤーの影響で古い名前が残り続けることがある。**最も確実な修正方法はアプリデザイナーでの手動変更**。ただし **新規追加時は教訓 #30 の `Url` 属性方式を使えばこの問題は発生しない**:

```
修正手順:
1. アプリデザイナーを直接 URL で開く（AI がユーザーに提示する）:
   https://make.powerapps.com/e/{environment-id}/s/00000001-0000-0000-0001-00000000009b/app/edit/{app-id}
   - {environment-id}: .env の ENVIRONMENT_ID
   - {app-id}: pac model list で取得したアプリ ID
2. 左側ナビゲーションツリーで問題の GenPage ページを選択
3. 右パネルで「タイトル」を正しい名前に変更
4. 「保存して公開」をクリック
```

> **AI からユーザーへの案内パターン**: タイトル修正が必要な場合、以下のように直接リンクを提示する:
> 「以下の URL でアプリデザイナーを開き、ナビゲーションの該当ページのタイトルを変更してください:
> `https://make.powerapps.com/e/{env-id}/s/00000001-0000-0000-0001-00000000009b/app/edit/{app-id}`」

> **補足**: `pac model genpage upload --page-id <id> --name "正しい名前"` で内部名を更新する方法も併用可能だが、MDA キャッシュが強いため即座に反映されないことがある。アプリデザイナーでの変更は unmanaged カスタマイズとして最優先で適用されるため確実。**新規ページ作成時は `--add-to-sitemap` を使わず、SiteMap API で `Url` 属性 + `<Titles>` 付き SubArea を追加する（教訓 #30）のが最善策**。

30. **SiteMap SubArea は `GenPageId` ではなく `Url` 属性を使う** — `GenPageId="{page-id}"` 属性で GenPage を SiteMap に追加すると、MDA メニューに「新しいサブエリア」と表示され `<Titles>` が反映されないことがある。**`Url="/main.aspx?pagetype=genux&amp;id={page-id}"` 属性を使うと `<Titles>` が正しく表示される**（2026-04-24 検証済み）。既存エンティティ SubArea の直後に挿入し、`PublishXml` でアプリを公開する

```xml
<!-- ❌ NG: GenPageId 属性 → 「新しいサブエリア」と表示されることがある -->
<SubArea Id="sub_page" GenPageId="{page-id}" AvailableOffline="true">
  <Titles><Title LCID="1041" Title="日報承認" /></Titles>
</SubArea>

<!-- ✅ OK: Url 属性 → <Titles> が正しく MDA メニューに反映される -->
<SubArea Id="sub_dailyreport_approval" GetStartedPanePath=""
  Url="/main.aspx?pagetype=genux&amp;id={page-id}"
  IntroducedVersion="7.0.0.0">
  <Titles>
    <Title LCID="1041" Title="日報承認" />
    <Title LCID="1033" Title="Daily Report Approval" />
  </Titles>
</SubArea>
```

> **実装パターン**: Python スクリプトで SiteMap XML を取得 → 正規表現で挿入位置を特定 → 新 SubArea を文字列結合で挿入 → `PATCH sitemaps({id})` → `PublishXml`。`yaml.dump()` や XML パーサーは不要（文字列操作で十分）

31. **OData アノテーション名を `select` に含めない** — `msdyn_workordertypename`、`msdyn_organizationalunitname` 等の `xxxname` フィールドは OData の `@OData.Community.Display.V1.FormattedValue` アノテーションであり、Dataverse の実カラムではない。DataAPI の `select` に指定すると 400 エラーが発生するが、GenPage ランタイムは try/catch でサイレントに失敗しデータが空配列になる。**対策**: 関連テーブル（`msdyn_workordertype` 等）を別クエリで取得し、`Map<string, string>` で FK ID → 名前のマッピングを構築する

```typescript
// ❌ NG: アノテーション名を select に含める → サイレント 400 エラー
var wos = await loadAllRows(api, "msdyn_workorder", {
  select: ["msdyn_workorderid", "msdyn_workordertypename"],  // ← 存在しないカラム
});

// ✅ OK: FK ID のみ select し、関連テーブルから名前マップを構築
var wos = await loadAllRows(api, "msdyn_workorder", {
  select: ["msdyn_workorderid", "_msdyn_workordertype_value"],
});
var woTypes = await loadAllRows(api, "msdyn_workordertype", {
  select: ["msdyn_workordertypeid", "msdyn_name"],
});
var typeNameMap = new Map<string, string>();
woTypes.forEach(function (t: any) { typeNameMap.set(fkId(t.msdyn_workordertypeid), t.msdyn_name || ""); });
```

> **見分け方**: カラム名が `_xxx_value` の形式なら FK ID（select 可能）。`xxxname` の形式なら OData アノテーション（select 不可）。確実に確認するには `RuntimeTypes.ts` を参照する。

32. **関連テーブルの集計は親レコードの日付を使う** — 子テーブル（WO Product 等）の `createdon` はデータ投入日であり実作業日ではない。期間別集計には、`_msdyn_workorder_value` で親 WO を参照し、WO の `createdon` や `msdyn_datewindowstart` で期間キーを生成する

```typescript
// ❌ NG: WO Product の createdon は投入日であり、実作業の月と一致しない
var period = product.createdon.substring(0, 7);  // "2026-05" (投入日)

// ✅ OK: 親 WO の createdon から期間を取得
var woDateMap = new Map<string, string>();
workorders.forEach(function (wo: any) {
  woDateMap.set(fkId(wo.msdyn_workorderid), wo.createdon ? wo.createdon.substring(0, 7) : "");
});
var woId = fkId(product._msdyn_workorder_value);
var period = woDateMap.get(woId) || "";  // "2026-04" (実作業月)
```

33. **スタック横棒は `d3.stack()` を使わず手動配置** — `d3.stack()` は全行で同一カテゴリセットを前提とし、カテゴリの欠落があるとバグが出やすい。単一ファイル構成の GenPage では、メンバーごとに `forEach` + `x0 += segWidth` で手動積み上げするほうがデバッグが容易で安全

34. **チャート3カラムレイアウトは `1fr 1fr auto`** — 左2列をデータ量に応じた均等幅にし、右列（ドーナツ等の固定幅チャート）を `auto` + `minWidth` で配置する。`repeat(3, 1fr)` だとドーナツの余白が大きくなりすぎる。`1fr auto` の2カラムから始め、チャートが増えたら `1fr 1fr auto` に拡張する

35. **D3 ツールチップは全チャートで1つの div を共有** — チャートごとに別の tooltip div を作ると、あるチャートのツールチップが別チャート領域に被ったときに消えない問題が起きる。`tooltipRef` を 1 つだけ作り、`showTip(html, ev)` / `moveTip(ev)` / `hideTip()` の 3 関数で全チャートの `mouseover` / `mousemove` / `mouseout` から呼び出す

## SiteMap への Generative Page 追加

`pac model genpage upload` の `--add-to-sitemap` は使わない。タイトルなしの「新しいサブエリア」が作成される。

**正しいパターン:** `deploy_model_app.py` の SiteMap XML に `GenPageId` + `<Titles>` 付き SubArea を追加。
SiteMap VectorIcon で使える組み込みアイコンの一覧は `standard` スキルの [アイコン作成リファレンス](../../standard/references/icon-creation.md) を参照。

```xml
<SubArea Id="sub_genpage" GenPageId="{page-id}" VectorIcon="/_imgs/TableIconsFluentV9/document_one_page_sparkle.svg" AvailableOffline="true">
  <Titles><Title LCID="1041" Title="ページ名" /><Title LCID="1033" Title="Page Name" /></Titles>
</SubArea>
```

`.env` に `GENPAGE_ID`, `GENPAGE_TITLE_JA`, `GENPAGE_TITLE_EN` を設定し、デプロイスクリプトから自動的に SiteMap に含める。
