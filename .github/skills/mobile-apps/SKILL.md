---
name: mobile-apps
description: "Power Apps Native Mobile Code Apps（Private Preview）を Microsoft 公式 Expo テンプレートから作成し、React Native UI、Power Platform 接続、ネイティブ機能、実機プレビュー、Wrap、デプロイまで実施する。"
category: ui
triggers:
  - "Native Mobile Code App"
  - "Power Apps Mobile Apps"
  - "MobileApp"
  - "power-apps-native-host"
  - "Expo Power Apps"
  - "React Native Power Apps"
  - "Power Apps Developer app"
  - "モバイルアプリを作りたい"
  - "カメラを使う Power Apps"
  - "バーコードを読む Power Apps"
  - "位置情報を使う Power Apps"
---

# Power Apps Native Mobile Code Apps 開発スキル

Microsoft 公式 `microsoft/power-platform-skills/plugins/mobile-apps` を upstream として、
Expo + React Native + TypeScript の Native Mobile Code App を作成する。

> [!CAUTION]
> **Private Preview であり、本番利用は禁止。** スキル開始時、計画承認時、最終結果でこの制約を明示する。
> ユーザーが Preview 利用を明示承認するまで scaffold、環境変更、Wrap 登録、push を開始しない。

## Web Code App との境界

「モバイル対応」の依頼では、最初にどちらを求めているか確認する。

| 選択肢 | ランタイム | 選ぶ条件 | スキル |
|---|---|---|---|
| レスポンシブ Web Code App | React + Vite、ブラウザ／Power Apps player | PC とモバイルで同じ Web UI、ネイティブ機能が不要 | [`code-apps`](../code-apps/SKILL.md) |
| Native Mobile Code App | Expo + React Native、Power Apps Developer app／Wrap | カメラ、バーコード、位置情報等の端末機能が必要 | 本スキル |

Native 経路は Preview 承認に加え、対象 OS、必要な端末機能、オンライン要件、実機テスト端末を確認する。

## ワークフロー

### Step 0: Preview 利用を確認する

次を説明し、明示承認を得る。

1. Private Preview で本番利用できない。
2. iOS / Android のローカル native build や App Store / Google Play 配布は v0 の対応範囲外。
3. 公式対応は Power Apps Developer app による実機 preview と、`power-apps push` 後の Wrap 導線まで。
4. Preview の破壊的変更に備え、upstream commit と依存セットを固定する。

承認がない場合は [`code-apps`](../code-apps/SKILL.md) のレスポンシブ Web 案を提示して停止する。
承認後の scaffold は `mobile-preview-approval.json` を生成する。検証器はこの記録がなく、または
`productionAllowed: true` のプロジェクトを拒否する。

### Step 1: 要件とネイティブ機能を設計する

対象 OS、画面、データ、コネクタ、認証、端末機能、オンライン／オフライン要件を整理する。
端末機能は公式テンプレートの `package.json` に存在する module だけを候補にする。

- Phase 1: Dataverse／connector、基本画面、camera／location／barcode、実機 preview、push
- Phase 2: PDF、pen／signature、File／Image、sharing、生体認証
- Phase 3: Offline Profile の authoring／assignment／drift check

オフライン runtime store／sync queue は upstream 対応を確認できるまで実装済みと扱わない。

### Step 2: 公式テンプレートを生成する

Windows PowerShell 7 で、記録済み upstream commit から生成する。

```powershell
python .github/skills/mobile-apps/scripts/scaffold_mobile_app.py `
  --target ./my-mobile-app `
  --preview-approved `
  --install
Set-Location ./my-mobile-app
```

依存は [upstream-template.json](references/upstream-template.json) の互換性セットを使う。
Expo、React Native、Tamagui、native host、Power Apps SDK を個別に `latest` へ上げない。

### Step 3: MobileApp として初期化する

公式 template は Power Apps CLI を依存に含まないため、検証済み CLI を明示して実行する。

```powershell
npx --yes --package @microsoft/power-apps-cli@0.15.3 power-apps init `
  -t MobileApp `
  --display-name "$env:MOBILE_APP_DISPLAY_NAME" `
  --environment-id "$env:ENVIRONMENT_ID" `
  --non-interactive
```

`power.config.json` は生成物であり、別アプリからコピーしない。

### Step 4: Wrap app registration を設定する

ブラウザを開く前に `AskUserQuestion` で使用する Microsoft Edge プロファイルを確認する。
回答後、VS Code 統合ブラウザで次を開く。

```text
https://make.powerapps.com/environments/{ENVIRONMENT_ID}/wraps#create-app-registration
```

Wrap で登録を作成し、Application (client) ID と environment の tenant ID を
`auth.config.json` の `msal.clientId` / `msal.tenantId` に設定する。client secret は不要で、保存しない。
Wrap が構成する redirect URI／API permission を手動で追加しない。

### Step 5: Power Platform データを接続する

外部 API への直接 `fetch` / `axios` ではなく connector-first とする。

```powershell
# Dataverse または Power Platform connector を CLI で追加し、src/generated/ を生成する
npx --yes --package @microsoft/power-apps-cli@0.15.3 power-apps add-data-source <options>
```

React Native 画面は `src/generated/services/*Service.ts` を service／hook 層から呼び出す。
ページから SDK や connector client を直接呼ばない。詳細は [build-reference.md](references/build-reference.md)。

### Step 6: allowlist 内のネイティブ機能を追加する

必要な module が生成済み `package.json` に存在することを確認してから、`src/native/` に typed wrapper を置く。
camera／barcode の標準契約は [native-capabilities.md](references/native-capabilities.md) を使う。

wrapper は permission の `granted` / `denied`、cancel、unsupported、success を判別可能な union で返し、
画面から Expo module を直接呼ばない。allowlist にない native package を追加したふりをしない。

### Step 7: モバイル UI を実装する

Expo Router の Stack／Tabs を要件に応じて選択し、次を品質ゲートにする。

- root を `SafeAreaProvider` で包み、各画面で safe area を確保
- 入力画面は `KeyboardAvoidingView` を使用
- touch target は原則 44 x 44 pt 以上
- screen reader label、font scaling、loading／empty／error／retry／refresh を実装
- 一覧は cursor paging を使い、総件数前提のページ番号 UI にしない

詳細は [mobile-ui.md](references/mobile-ui.md)。

### Step 8: 品質ゲートを実行する

```powershell
npm run type-check
python ../.github/skills/mobile-apps/scripts/validate_mobile_project.py .
```

失敗した状態で Metro、build、push へ進まない。

### Step 9: 実機 preview を確認する

```powershell
npm run dev
```

Metro の QR コードを Power Apps Developer app で読み取り、iOS／Android 実機で認証、safe area、keyboard、
権限拒否、camera／barcode 等を確認する。ストア配布用アプリの検証とは扱わない。

### Step 10: build、push、Wrap 導線を確認する

```powershell
npm run build:android   # 対象 OS に応じて build:ios を選択
npx --yes --package @microsoft/power-apps-cli@0.15.3 power-apps push
```

push 後は `power.config.json` の app ID と環境 ID を使い、次の Wrap URL を案内する。

```text
https://make.powerapps.com/environments/{ENVIRONMENT_ID}/wrap?appID={APP_ID}
```

最終結果に Private Preview／本番利用禁止、実機確認済み範囲、未検証 OS、offline runtime 未対応を明記する。

## リファレンス

| 文書 | 内容 |
|---|---|
| [build-reference.md](references/build-reference.md) | init、認証、connector、generated services、preview、push |
| [native-capabilities.md](references/native-capabilities.md) | allowlist と camera／barcode wrapper |
| [mobile-ui.md](references/mobile-ui.md) | Stack／Tabs、safe area、keyboard、accessibility |
| [offline.md](references/offline.md) | Offline Profile authoring と runtime の境界 |
| [upstream-template.json](references/upstream-template.json) | 公式同期元 commit、同期日、依存バージョン |
| [troubleshooting.md](references/troubleshooting.md) | Preview／Expo／Wrap／権限／Metro の異常系 |

## スクリプト

| スクリプト | 用途 |
|---|---|
| [scaffold_mobile_app.py](scripts/scaffold_mobile_app.py) | pinned upstream template を生成し、任意で install／MobileApp init／type-check |
| [validate_mobile_project.py](scripts/validate_mobile_project.py) | Preview ガード、依存セット、auth、UI、native wrapper、offline 境界を検証 |
| [test_validate_mobile_project.py](scripts/test_validate_mobile_project.py) | offline runtime 判定の false positive／false negative を回帰テスト |
| [check_upstream.py](scripts/check_upstream.py) | 公式 mobile-apps HEAD と同期済み commit の差分を検出 |