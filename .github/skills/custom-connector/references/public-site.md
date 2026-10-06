# 公開サイト・公開 API を Code Apps から読む（認証なしのコネクタ）

Code Apps の既定の CSP（`connect-src 'none'`）では、ブラウザから外部サイトを `fetch` できない（エラー画面にならず、データが来ないだけ）。
外部のページ・API はカスタム コネクタ（サーバー側）で取得し、Code Apps は生成サービスで呼ぶ。

```
Code Apps（生成サービス） ── 接続（認証なし） ── カスタム コネクタ（ホスト固定・GET だけ） ── 公開サイト
```

## 1. 作る

```powershell
# 定義を生成し、paths を取り込むページの形に書き換える
python .github/skills/update-skills/scripts/scaffold_from_template.py `
  --template .github/skills/custom-connector/templates/public-site --target <出力先>
# 作成（--secret-file は付けない。題名・https・GET だけを作成前に検査する）
python .github/skills/custom-connector/scripts/deploy_connector.py --connector-dir <出力先>/connector `
  --var API_HOST=<host> --var CONNECTOR_TITLE=<英数字の名前> --var PUBLISHER="<発行元>" --solution <solution>
# 接続（mode は noauth に自動判定。同意・ブラウザは不要）
python .github/skills/custom-connector/scripts/create_connection.py plan --connector <shared_…> --display-name "<表示名>"
python .github/skills/custom-connector/scripts/create_connection.py apply --plan .mcp/connection-plan.json --plan-hash <sha256>
# 1 回呼んで確かめる
python .github/skills/custom-connector/scripts/create_connection.py invoke --connector <shared_…> --connection-name <接続名> --path /items/<id>/
# Code Apps に追加（ALM では接続参照を使う）
python .github/skills/code-apps/scripts/add_data_source.py --connector <shared_…> --connection-ref <論理名> --as action
```

## 2. 設計の約束

| 観点 | 約束 |
|---|---|
| 取得先 | ホストを定義に固定し、パスは固定の部分とパス パラメーターだけにする（任意の URL を取りに行けるコネクタにしない）。アプリ側でも URL を検証してからパラメーターを渡す |
| 操作 | GET だけ（`deploy_connector.py` が検査）。書き込み・ログインの必要なページは対象にしない |
| 取得の単位 | 利用者の操作（ボタン）ごとに 1 ページ。一覧の巡回・画像の一括取得・定期実行はしない |
| 利用規約 | 取得先の利用規約・robots.txt を確かめ、記録に残す。取り込んだ値には取り込み元 URL と取得日を残す |
| 待ち時間 | 20〜30 秒かかることがある（troubleshooting #13）。時限（60 秒）と進み具合を表示する |
| 代わりの入力 | 取得に失敗したとき（掲載終了・構成変更・ホストの外で開いた）に、ページの内容を貼り付けて同じ解析にかけられるようにする |
| 動く場所 | コネクタは Power Apps のホスト経由でしか呼べない。ローカル開発・アプリの URL を直接開いたときは、貼り付けに切り替える旨を表示する |
| 受け取り | 応答は swagger で `"default"` だけにする（`"200"` で宣言すると SDK が JSON として読んで必ず失敗する。troubleshooting #15）。SDK は HTML を 1 バイト = 1 文字の文字列で返すので、バイト列に戻して charset で読み直す（下のコード） |
| 解析 | HTML と貼り付けた文字列の両方から同じ項目を取り出す。貼り付けでは、取り込まない見出しも値の終わりとして扱う（見出しの一覧を持つ） |
| 試験 | 実際のページはリポジトリに入れない。同じ構造の合成ページで試験し、実ページはローカルにあるときだけ動く試験にする |
| DLP | ホストは未分類だと既定のグループに入る（troubleshooting #14）。管理者に分類してもらう |

### 受け取り（Code Apps 側）

```ts
/** SDK が 1 バイト = 1 文字にした HTML を、ページの charset（無ければ UTF-8）で読み直す。既に正しい文字列ならそのまま */
export function decodeConnectorText(s: string): string {
  let high = false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c >= 0x80) high = true
  }
  if (!high) return s
  const bytes = Uint8Array.from(s, ch => ch.charCodeAt(0))
  const charset = (s.slice(0, 4096).match(/charset\s*=\s*["']?([A-Za-z0-9_-]+)/i)?.[1] ?? "utf-8").toLowerCase()
  const label = /^(shift[_-]?jis|sjis|x-sjis|windows-31j|cp932|ms932)$/.test(charset) ? "shift_jis" : /^euc-?jp$/.test(charset) ? "euc-jp" : "utf-8"
  try { return new TextDecoder(label).decode(bytes) } catch { return new TextDecoder("utf-8").decode(bytes) }
}

// 呼び出し: 生成サービスの戻り値（型は void になる）を文字列として受け取り、読み直してから解析する
const result = await ExampleService.GetPage(id)
const data: unknown = result.data
const html = decodeConnectorText(typeof data === "string" ? data : "")
```

試験では、合成した HTML を `TextEncoder` で UTF-8 にし、1 バイト = 1 文字の文字列にしてから読み直せることを確かめる（SDK と同じ経路）。

### 画像も取り込む

- 同じホストに画像の配信口（例: `/<path>/resizeImage?src=…`）があれば、ホストを増やさず GET の操作を足す（コネクタのホストは 1 つ。別ホストにすると接続・DLP の分類が増える）
- 操作の `produces` を `image/jpeg` などにし、応答は `"default"` だけで宣言する。SDK は `image/*` の応答を **base64 の文字列**で返すので、先頭（`/9j/` = JPEG、`iVBOR` = PNG）で種類を確かめて `data:` URL にする
- 取り込むパスは robots.txt で許可された範囲だけをアプリ側で受け付ける（例: `src` が許可されたディレクトリで始まるか）。1 回の操作で取得する枚数に上限を付ける
- 画像の一覧はページの HTML から読む（遅延読み込みの画像は `rel` / `data-src` に URL が入る）

### 画面から通しで試す（コネクタの差し替え）

コネクタは Power Apps のホスト経由でしか呼べないので、ローカルのプレビューでは画面の配線（取得 → 解析 → 保存）を試せない。
**明示的な検証用の URL（例: `?debug3d`）のときだけ**、`window` に置いた差し替えを生成サービスの代わりに使えるようにする。差し替えは、実際にコネクタから取得した応答を **SDK と同じ形**で返す（HTML は `atob(base64)` で 1 バイト = 1 文字の文字列、画像は base64）。

```ts
type Source = { page: (id: string) => Promise<{ success: boolean; data?: unknown }>; image: (src: string) => Promise<{ success: boolean; data?: unknown }> }
const connector: Source = { page: id => ExampleService.GetPage(id), image: src => ExampleService.GetImage(src) }
function source(): Source {
  const mock = /[?&]debug3d\b/.test(location.search + location.hash) ? (window as unknown as { __sourceMock?: Source }).__sourceMock : undefined
  return mock ?? connector
}
```
