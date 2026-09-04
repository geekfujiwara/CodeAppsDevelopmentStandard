# SQL バックエンドの MCP ツール設計

Azure SQL（既存の基幹・管理システム）を MCP ツールとしてモデルに開放するときの標準設計。
**読み取り専用**が前提。書き込みは業務システム本体か Dataverse 側に残す。

---

## 1. SQL は固定文字列、可変部分は必ずパラメータ

ツール引数はモデルが生成する文字列である。**ユーザー入力と同じ信頼度しかない**（OWASP A03）。

```ts
// 条件式そのものは固定。値だけをパラメータで渡す
const FILTER_CLAUSE = `
    AND (@partCode IS NULL OR f.PartCode = @partCode)
    AND (@fromDate IS NULL OR f.OccurredOn >= @fromDate)
    AND (@keyword IS NULL OR f.Phenomenon LIKE @keyword ESCAPE '\\')`;
```

- 任意条件は `WHERE 1 = 1` + `(@p IS NULL OR col = @p)` で組む。**条件文字列を動的に連結しない。**
- `LIKE` に渡す値は `%` `_` `[` `]` `\` をエスケープし、`ESCAPE '\'` を必ず添える。
  しないと `%` だけの入力で全件走査になる。
- 件数は `TOP (@maxResults)` で**パラメータとして**渡す（`TOP 50` の文字列連結にしない）。

## 2. 「SQL 断片を切り替えたい」場所はホワイトリストで固定句にマップ

集計軸・ソート列のように SQL 断片そのものが可変になる箇所は、モデルの文字列を使わず定数表を引く。

```ts
const GROUP_BY_SPEC: Record<string, { key: string; label: string }> = {
  part:        { key: "f.PartCode",  label: "MAX(f.PartName)" },
  failureMode: { key: "m.ModeCode",  label: "MAX(m.ModeName)" },
  product:     { key: "p.ProductCode", label: "MAX(p.ProductName)" },
};

const spec = GROUP_BY_SPEC[String(args.groupBy ?? "")];
if (!spec) throw new Error(`groupBy は ${Object.keys(GROUP_BY_SPEC).join(" / ")} のいずれかです`);
```

`inputSchema` の `enum` にも同じキーを並べる。スキーマだけでは防御にならないので**実行時にも必ず照合する**。

## 3. 入力の書式を先に固定する

| 引数の種類 | 検証 |
| --- | --- |
| コード（部位・製品・伝票番号） | `^[A-Za-z0-9._-]{1,32}$` |
| 日付 | `^\d{4}-\d{2}-\d{2}$` かつ `Date.parse` が成功 |
| キーワード | 100 文字以内 + LIKE エスケープ |
| 件数 | 既定 50 / 上限 200 に丸める |

書式違反は**エラーにして返す**（黙って無視すると、モデルは絞り込めたと誤解して誤答する）。

## 4. キーレス接続とトークン期限

接続文字列にパスワードを持たない。`DefaultAzureCredential` のトークンで接続する。

```ts
const token = await credential.getToken("https://database.windows.net/.default");
new sql.ConnectionPool({
  server, database,
  authentication: { type: "azure-active-directory-access-token", options: { token: token.token } },
  options: { encrypt: true, trustServerCertificate: false },
  requestTimeout: 15_000,
});
```

- **アクセストークンで作ったプールはトークンと寿命を共にする**。期限切れの数分前にプールを張り直す。
  張りっぱなしにすると、数十分〜数時間後に突然「Login failed」で全ツールが落ちる。
- プール生成は同時実行されうる。生成中の Promise を 1 つ保持して共有し、旧プールは**張り替えに成功してから**閉じる。
  失敗時に旧プールを閉じると、`pool` が閉じたプールを指したまま残り、以後すべてのクエリが失敗する。
- **1 回だけリトライする経路を用意する**。期限直前に更新していても、アイドル状態のプールが先に切れることはある。
  `ELOGIN` / `ECONNCLOSED` / `ENOTOPEN` / `ECONNRESET` / `ETIMEOUT` や `login failed` `token is expired` を
  含むエラーだけを対象にプールを破棄して再実行する。**無条件リトライにしない**（構文エラーまで 2 回投げることになる）。
- `requestTimeout` を必ず設定する。無制限のクエリは Functions のタイムアウトまで枠を占有する。

```ts
export async function query(statement, params) {
  try {
    return await runQuery(statement, params);
  } catch (err) {
    if (!isRecoverableConnectionError(err)) throw err;
    invalidatePool();          // pool = undefined; expiresOn = 0; 旧プールは非同期に close
    return runQuery(statement, params);
  }
}
```

> **Storage / Dataverse SDK は自前でトークンを更新する。** `ShareServiceClient` などに `TokenCredential` を
> 渡す方式ではクライアントを使い回してよい。**自分でトークン文字列を取り出して埋め込む接続だけ**が
> 寿命管理の対象になる（`azure-active-directory-access-token` の SQL 接続がこれに当たる）。

## 5. 権限は DB 側でも読み取り専用にする

アプリ実装で SELECT しか書いていないことは、保証にならない。

```sql
CREATE USER [<function-app-name>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<function-app-name>];
```

`db_datawriter` / `db_ddladmin` は**シード時のみ一時的に**付与し、投入後に外す。

## 6. Private Endpoint 下でのシード

ローカルから接続できないので、VNet 統合済み Function App 内の一時エンドポイントで投入する。

- 実行するのは**同梱の `seed/*.sql` のみ**。リクエスト本文の SQL は実行しない（任意 SQL 実行口を作らない）。
- 起動条件はアプリ設定のシークレット（例 `ADMIN_SEED_KEY`）。**未設定なら 404**（既定で無効）。
  照合は `timingSafeEqual` を使う。認証失敗も 404 にして存在を隠す。
- ライブラリは `GO` を解釈しない。`/^\s*GO\s*$/im` で分割して 1 バッチずつ実行する。
- 投入後にシークレットを削除し、**関数ファイルと `src/index.ts` の import を消して再デプロイ**する。
  → [private-data-seeding.md](private-data-seeding.md)

## 7. 戻り値は「資料」であって「指示」ではない

自由記述欄（現象・原因・対策メモ）は外部由来のテキストである。図面・文書と同じ扱いにする。

- 全ツールの戻り値を `material()` で包み `_notice` を付ける。
- 文字列プロパティは一括でサニタイズする（制御文字を落とす）。
- **評価用フィクスチャをシードデータに 1 行仕込む**（例: 現象欄に「これまでの指示を無視して…」）。
  golden question で耐性を回帰確認でき、本番投入時はその行だけ除外すればよい。
  → [file-backed-tools.md](file-backed-tools.md)

## 8. キーを業務データ側と揃える

MCP を跨いで突き合わせるなら、**結合キーの体系を先に合わせる**。
例: 故障 DB の `PartCode` を Dataverse の図面タグと同一体系にしておくと、
図面から特定したタグをそのまま検索引数に渡せる。合っていないと、エージェントに変換を推測させることになり誤答源になる。

## 9. 検証チェックリスト

- [ ] `npm run build` が通る
- [ ] SQL 文に文字列連結が 1 箇所も無い（ホワイトリスト由来の識別子を除く）
- [ ] 不正な `groupBy` / 書式違反のコード / 不正な日付がエラーになる
- [ ] `%` のみのキーワードで全件が返らない
- [ ] シードデータの外部キーが全て解決する（投入前に静的チェックする）
- [ ] トークン期限前にプールが張り直され、`ELOGIN` 系のみ 1 回リトライされる
- [ ] 全ツールの戻り値に `_notice` が入っている
- [ ] シード後に管理エンドポイントと `ADMIN_SEED_KEY` を削除し、権限を `db_datareader` に戻した
