# Native Mobile Code Apps 構築リファレンス

## 前提と生成順

1. `scaffold_mobile_app.py --preview-approved --install` で pinned 公式 template を生成
2. `power-apps init -t MobileApp` で `power.config.json` を生成
3. Power Apps Wrap で app registration を作成し、`auth.config.json` を設定
4. `power-apps add-data-source` で `src/generated/` を生成
5. React Native 画面、native wrapper、navigation を実装
6. type-check、実機 preview、build、push

`power.config.json`、`src/generated/`、connector schema は生成物なので手動作成しない。

## 認証

Wrap の環境別 URL:

```text
https://make.powerapps.com/environments/{ENVIRONMENT_ID}/wraps#create-app-registration
```

作成された Application (client) ID と、環境の tenant ID を設定する。

```json
{
  "msal": {
    "clientId": "{APPLICATION_CLIENT_ID}",
    "tenantId": "{TENANT_ID}"
  }
}
```

これは public client の識別子であり client secret ではない。secret、token、ユーザー情報を
`auth.config.json` に保存しない。`PowerAppsProvider` が `auth.config.json`、`power.config.json`、
generated connector schema を受け取り、`useAuth` が sign-in state を提供する。

## Dataverse と connector

connector-first を標準とし、`fetch` / `axios` で Power Platform API を直接呼ばない。
`add-data-source` の引数は connector ごとに [`code-apps` の CLI リファレンス](../../code-apps/references/cli-reference.md)を参照する。

生成後は画面から `src/generated/services` を直接散在呼び出しせず、hook に閉じる。

```typescript
// src/hooks/useCustomers.ts
import { useQuery } from "@tanstack/react-query"
import { CustomersService } from "../generated/services/CustomersService"

export function useCustomers(skipToken?: string) {
  return useQuery({
    queryKey: ["customers", skipToken],
    queryFn: async () => {
      const result = await CustomersService.getAll({ maxPageSize: 25, skipToken })
      if (!result.success) throw result.error
      return { rows: result.data ?? [], nextSkipToken: result.skipToken }
    },
  })
}
```

生成される class、method、options は connector と CLI バージョンにより異なる。上記を固定 API とみなさず、
実際の `src/generated/services/*Service.ts` の signature に合わせる。生成コードは編集しない。

## Preview

```powershell
npm run dev
```

Power Apps Developer app で Metro の QR を読み取る。確認項目:

- sign-in／sign-out と OAuth callback
- iOS／Android の safe area、keyboard、font scaling
- camera／location 等の許可、拒否、再試行
- loading／empty／error／retry／refresh
- cursor paging と connector error

## Build と deploy

公式 template の scripts を正とする。同期時点では `build:android` / `build:ios` が Wrap build、
`bundle:android` / `bundle:ios` が JS bundle を担当する。汎用 `npm run build` が upstream で提供される場合のみ使い、
存在しない script を作ったことにしない。

```powershell
npm run type-check
npm run build:android   # 対象 OS のみ
npx --yes --package @microsoft/power-apps-cli@0.15.3 power-apps push
```

ローカル `expo run:ios` / `expo run:android`、store 配布は v0 の対応範囲外。
