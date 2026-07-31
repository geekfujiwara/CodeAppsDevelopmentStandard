# アクセススコープ設計（Self / Account）

[SKILL.md](../SKILL.md) Step 4 の背景と根拠。

## 1. Self と Account の比較

| 観点 | Self アクセス | Account アクセス |
|---|---|---|
| 見えるデータ | ログインユーザー本人のレコードのみ | 本人が所属する取引先企業（`account`）配下のレコード |
| 想定業態 | BtoC・個人向けポータル | BtoB 取引先ポータル（同僚と共有） |
| `contact` の scope | `756150004`（Self） | `756150004`（Self）※そのまま維持 |
| 業務テーブルの scope | `756150001`（Contact）＋ `contactrelationship` | `756150002`（Account）＋ `accountrelationship` |
| 事前準備 | 不要（サインインで contact が作られる） | **管理者が `contact.parentcustomerid` に account を設定** |
| 主なリスク | 少ない | 紐づけ誤りで他社データが見える |

> Self → Account への移行は追加で済むが、Account → Self は可視範囲が狭まるため利用者影響が大きい。
> 迷ったら Self から始める。

## 2. mspp_scope の値域

| 値 | スコープ | リレーション列 | 用途 |
|---|---|---|---|
| 756150000 | Global | なし | 全レコード（**本スキルでは使わない**） |
| 756150001 | Contact | `contactrelationship` | サインインユーザーの contact 配下 |
| 756150002 | Account | `accountrelationship`（`account` 自身は `null`） | 所属取引先企業の配下 |
| 756150003 | Parent | `parentrelationship` | 親権限に紐づくレコード（子アクセス許可） |
| 756150004 | Self | なし | 自分自身の contact レコード |

`scripts/setup_access_scope.py` の `assert_scope_value()` が、この値域以外を送信前に弾く。

## 3. Account アクセスの権限マトリクス（管理者への依頼テンプレート）

Design Studio で手動設定する場合は、この表をそのまま渡す。

| # | テーブル | アクセス種類 | リレーション | 読み取り | 書き込み | 作成 | 削除 | 追加 | 追加先 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 取引先企業（`account`） | Account | なし | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 2 | 業務テーブル | Account | account との 1:N スキーマ名 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 3 | 取引先担当者（`contact`） | Self | なし | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 4 | 紐づけ依頼テーブル | Contact | contact との 1:N スキーマ名 | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |

Web ロールは全件同じものを割り当てる（既定は **Authenticated Users**）。

### なぜ account は「読み取り＋追加先」なのか

- **読み取り**: プロファイル画面や一覧で会社名を表示するために必要。
- **追加先（AppendTo）**: 子レコードを作成するとき `"{prefix}_accountid@odata.bind": "/accounts({id})"`
  で参照するために必要。**レコードを書き換える権限ではない**ため、読み取り専用の要件と両立する。
  不足すると 403 / `90040106`（AppendTo permission missing）。
- **書き込み・削除は付けない**: 取引先企業マスタは社内の正本。ポータル利用者に編集させない。
  `scripts/setup_access_scope.py` の `assert_account_readonly()` が、誤って付けた場合に実行を中止する。

### なぜグローバルアクセスを使わないのか

`756150000`（Global）にすると、全ユーザーが**全社の取引先企業と全案件**を参照できてしまう。
「read だけだから安全」ではなく、他社の企業名・案件名が漏れる時点で事故になる。
Account スコープなら Dataverse 側のリレーションで自動的に自社分だけに絞られる。

## 4. リレーションはスキーマ名で指定する

`accountrelationship` / `contactrelationship` に入れるのは **リレーションのスキーマ名**であり、
表示名でも Lookup 列の論理名でもない。

```powershell
python .github/skills/power-pages/scripts/setup_access_scope.py --list-relationships
```

内部では次のメタデータを照合している（`verify_relationship()`）。

```
GET /api/data/v9.2/EntityDefinitions(LogicalName='account')/OneToManyRelationships
    ?$select=SchemaName,ReferencingEntity
```

## 5. 紐づけはアプリ管理者だけが行う（セキュリティ要件）

ポータル利用者が取引先企業を自分で選べる設計にすると、**他社を選ぶだけで他社データを参照できる**
（権限昇格）。したがって本スキルでは次を既定とする。

1. プロファイル画面の取引先企業は **読み取り専用表示**（入力欄にしない）。
2. `Webapi/contact/fields` に `parentcustomerid` を**含めない**運用にすると、
   仮にクライアントを改変されても PATCH がサーバー側で拒否される（多層防御）。
   ※ `_parentcustomerid_value` の **読み取り**だけを許可したい場合は
   `firstname,lastname,emailaddress1,fullname,parentcustomerid` のように列挙し、
   書き込みは #3 の contact 権限で制御する。
3. 紐づけの実行者は **アプリ管理者のみ**（モデル駆動型アプリ、または任意の Code Apps 管理画面）。
4. 未紐づけのユーザーには依頼ボタンだけを見せ、**依頼レコード経由**で管理者に通知する。

## 6. クライアント実装の要点

- 所属企業 ID は `contact` から取る: `/_api/contacts({contactId})?$select=_parentcustomerid_value`
- 作成時は **必ず** account への Lookup をバインドする。バインドが無いレコードは
  Account スコープでは作成できず 403 になる。
- `Webapi/{table}/fields` の許可リストに、クライアントが `$select` する列を漏れなく入れる
  （許可リスト外は 403 / `90040101`）。迷う場合は `*`。

## 7. 参考

- [Power Pages のテーブル権限 | Microsoft Learn](https://learn.microsoft.com/ja-jp/power-pages/security/table-permissions)
- [教訓 21（認証・認可・テーブル権限）](auth-authz.md)
