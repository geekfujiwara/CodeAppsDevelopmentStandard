# SDK とデータ接続の使い方

アプリのコードは `@microsoft/managed-apps` の SDK と、CLI が `generated/` に生成する
型付きサービスだけを使ってホストと通信する。

## SDK のサブパス

パッケージにはルートの入口が無い。必ずサブパスから import する。

| サブパス | 主な API | 用途 |
|---|---|---|
| `@microsoft/managed-apps/app` | `getContext`, `setConfig` | アプリのコンテキスト・設定 |
| `@microsoft/managed-apps/auth` | `getUser` | サインイン中ユーザー（`fullName` / `objectId` / `tenantId`） |
| `@microsoft/managed-apps/data` | `getClient`, `DataClient` | Dataverse / コネクタの型付きデータ クライアント |
| `@microsoft/managed-apps/telemetry` | `initializeLogger` | 開発者向けテレメトリ |

```typescript
import { getUser } from '@microsoft/managed-apps/auth';

const user = await getUser();
```

## コネクタの呼び出し

1. `ms connector list --search <語>` で候補を探す。出力の DLP / ACP 状態で、ブロックされていないことを確認する。
2. `ms connector list-actions --connector <id>` で操作ごとの可否を確認する。
3. `ms app add data-source` で追加する（非対話では `--as table|action` が必要）。
4. 生成されたサービスを import して呼ぶ。戻り値は共通の `IOperationResult<T>`。

```typescript
import { Office365UsersService } from '../generated/services/Office365UsersService';

const result = await Office365UsersService.MyProfile_V2('id,displayName');
if (!result.success) {
  throw new Error(result.error?.message ?? 'プロフィールを取得できませんでした');
}
```

- データソース名は `generated/dataSources.ts` のトップレベルのキー。
- スキーマ変更後は `ms app refresh data-source [--name <name>]` で再生成する。
- `generated/` は CLI 所有。手で編集しない。

## 守ること

| ルール | 理由 |
|---|---|
| `fetch` / `axios` / Graph API を直接呼ばない。コネクタを追加して `generated/` 経由で呼ぶ | 既定 CSP が `connect-src 'self'` で外部通信を遮断する。認証とガバナンスはホスト経由の呼び出しにだけ適用される |
| `ms.config.json` を手で編集しない（下の例外を除く） | CLI・SDK とプラットフォームの状態がずれる。設定は `ms app set-setting` 等で変える |
| 外部の CDN・フォント・画像を読み込まない | 既定 CSP で遮断される。必要なら管理者に該当ディレクティブの追加を依頼する |
| 画像バイナリは `data:` URL に変換して表示する | デプロイ後の CSP で `blob:` URL が遮断される場合がある |

`validate_project.py` は直接通信と外部 script / stylesheet を WARN で検出する。

## 共有接続の allowedActions（唯一の手編集）

`ms app add data-source` は、共有可能な認証方式のコネクタに `sharedConnectionId` を自動で書き込む。
共有接続はアプリが使う操作を `allowedActions` で宣言しないと、`ms app pack` / `ms app deploy` が失敗する
（`ms app dev` では検証されない）。現時点で CLI コマンドは無く、`ms.config.json` に直接書く。

| 参照の形 | 宣言する場所 | 値 |
|---|---|---|
| テーブルあり（`dataSets[*].dataSources[*]`） | 各テーブル | `get` / `post` / `patch` / `delete` のみ |
| テーブルなし（アクション コネクタ） | 接続単位 | `ms connector list-actions --connector <id> --json` の `behavior: Allow` の `id` |

```jsonc
"connectionReferences": {
  "shared_office365": {
    "sharedConnectionId": "<自動で書き込まれる値>",
    "allowedActions": ["SendEmailV2"]
  }
}
```

- アプリが実際に呼ぶ操作だけを宣言する（全操作を並べると制限の意味がない）。
- 画面を作る前は宣言を保留し、実装後に `src/` の呼び出しから決めてユーザーに確認する。
- 失敗を回避するために `sharedConnectionId` を消さない。
- `validate_project.py --stage deploy` が同じ規則で検証する。

## ローカル開発

- `ms app dev` が唯一のローカル起動コマンド。`npm run dev` を直接使わない。
- 表示された Local Play URL は、テナントにサインインしているのと同じブラウザー プロファイルで開く。
- Edge / Chrome は公開オリジンから localhost への通信を既定で制限する。許可を求められたら許可する。
- ローカル実行でも実際の接続を使うため、ブラウザーの Network タブで要求と応答を確認できる。
  403 は多くの場合 DLP / ACP による拒否。

## 出典

- [Connect to data](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/connect-to-data?view=o365-worldwide)
- [Content security policy](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/content-security-policy?view=o365-worldwide)
- [Architecture](https://learn.microsoft.com/en-us/microsoft-365/managed-apps/developer/architecture?view=o365-worldwide)
- [`@microsoft/managed-apps` README](https://www.npmjs.com/package/@microsoft/managed-apps)
- [公式 plugin の allowed-actions](https://github.com/microsoft/managed-apps/blob/main/plugins/microsoft-managed-apps/shared/allowed-actions.md)
