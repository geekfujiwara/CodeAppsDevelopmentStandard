# Private API 自動化標準

公式APIやCLIがないポータル操作を、UIが実際に送信するrequestを根拠として安全に自動化する。
推測したendpointやpayloadを本番環境へ送信しない。

## 1. 観測前の境界設定

1. 対象environment、resource、operation、期待する最終状態を固定する。
2. create/update/deleteの副作用とcleanup方法を決める。
3. request/responseからtoken、cookie、CSRF、個人情報を保存・出力しない。
4. `.mcp/`等のcapture/plan保存先をGit除外する。

## 2. UI requestのcapture

1. VS Code統合ブラウザで、対象操作の正常UI flowを開く。
2. write requestだけをmethod/pathで限定して捕捉する。telemetryや無関係なwriteは除外する。
3. endpoint、query、body、必要な非secret header名を記録し、authorization値は記録しない。
4. 副作用なしで観測する場合は対象requestをabortする。
5. UIが失敗requestを自動retryする可能性があるため、作成画面から離れるか操作をcancelするまでrouteを維持する。
6. abort後は対象resourceが存在しないことをread-backする。存在した場合は検証対象として扱い、後でcleanupする。

## 3. Contractの特定

単純化したpayloadが失敗しても「API不可」と結論づけない。UI requestとの差分をfield単位で比較する。
template、configuration discriminator、既定認証値、solution header、icon等がserver-side provisioning triggerに
なっている場合がある。未知fieldを推測で削らず、観測contractを最初のallowlistとする。

同じ操作を複数build/environmentで観測できる場合は差分を比較し、次を分類する。

- 固定contract: template、operation、`$kind`、必須field
- target: environment origin、resource ID、solution unique name
- user input: name、schema、language等
- generated value: GUID、timestamp、icon bytes等

## 4. Planと承認

write前にsecretを含まないplanを生成し、canonical JSONのSHA-256を表示する。applyは次を全件事前検証し、
1件でも不一致ならwriteを開始しない。

- contract version、method、HTTPS origin、path、query
- plan targetと実行時environment/targetの一致
- body keyの完全一致と固定値のallowlist
- user inputの型、長さ、schema形式
- binary assetのhashとsize
- duplicate resourceの不存在
- batch内の重複と全planのhash一致

承認後にplanを書き換えた場合はhashが変わるためapplyを拒否する。token/cookieをplanへ含めない。

## 5. Applyとread-back

認証は既存の共通auth helperを優先する。ブラウザ認証を継承する場合もheader値をログやcaptureへ保存しない。
writeは承認済みplanからだけ組み立てる。

HTTP 200/201だけで成功としない。作成resourceをIDでread-backし、さらに非同期生成される子component、
provisioning state、runtimeから見える状態をpollする。UI表示だけ、レコード件数だけ、PNG signatureだけ等の
弱いproxyではなく、実際に利用するcontractを検証する。

## 6. Cleanup

検証resourceはname/schema/IDをread-backして対象一致を確認してから削除する。通常DELETEが依存関係で失敗する
製品では、UIが使うmanaged delete actionを観測して使う。子componentを個別削除して依存関係を迂回しない。
削除後はIDまたは一意schemaが404/0件になることを確認する。

## 7. スキルへの反映

- `SKILL.md`: plan → approval → apply → read-backの正常系
- `references/`: 観測contract、field分類、既知のretry/deletion等
- `scripts/`: strict validation、canonical hash、target binding、duplicate check、polling
- `tests/`: 正常contract、payload drift、target drift、hash不一致、duplicate/batch prevalidation
- `.env.example`: targetとuser inputだけ。token、cookie、capture実値は置かない

private APIは製品buildで変わり得る。contract versionを日付等で固定し、drift時は失敗を明示して再観測する。