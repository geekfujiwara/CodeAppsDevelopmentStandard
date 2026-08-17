# Code Apps テレメトリ / 可観測性パターン

Power Apps SDK（`@microsoft/power-apps@1.2.7` 以降、現行テンプレート `1.2.13` で再検証）の `telemetry` サブパスは、
アプリのロード性能とネットワーク要求の**構造化メトリクス**を公開している。
「遅い」「たまに落ちる」といった曖昧な報告を、計測値に基づいて切り分けるために導入する。

> **参考**: `dist/telemetry/index.d.ts` / `dist/telemetry/LoggerManager.d.ts` / `dist/telemetry/Metrics.types.d.ts` / `dist/telemetry/Performance.d.ts`

## SDK エクスポート一覧

```ts
// @microsoft/power-apps/telemetry
export type { ILogger } from './Logger.types';
export { initializeLogger } from './LoggerManager';
export type {
  AppLoadNonOptimalReason, AppLoadResult, Metric,
  NetworkRequestMetric, NetworkRequestMetricData,
  SessionLoadSummaryMetric, SessionLoadSummaryMetricData,
} from './Metrics.types';

// @microsoft/power-apps/telemetry（Performance.d.ts）
export declare function getAppLoadedPerformanceData(): object;

// @microsoft/power-apps/telemetry（LoggerManager.d.ts）
export declare function initializeLogger(logger: ILogger): Promise<void>;

// @microsoft/power-apps/app（Config.d.ts）
export declare function setConfig(config: { logger?: ILogger }): void;
```

`setConfig({ logger })` も利用できるが、内部で `initializeLogger(logger)` を待機せずに呼び出す簡略 API。
初期化完了や失敗を扱う場合は、`@microsoft/power-apps/telemetry` の `initializeLogger` を直接 `await` する。

## 受け口の実装（`ILogger.logMetric` を判別共用体で分岐）

`Metric` は `SessionLoadSummaryMetric` と `NetworkRequestMetric` の判別共用体。
`ILogger.logMetric` 実装内で種別を分岐し、それぞれの `xxxMetricData` を扱う。

```typescript
// src/lib/telemetry.ts（完全な実装は下記 generic-base を参照）
import { initializeLogger } from "@microsoft/power-apps/telemetry";
import type { Metric } from "@microsoft/power-apps/telemetry";

function handleMetric(metric: Metric): void {
  switch (metric.type) {
    case "sessionLoadSummary": {
      const { successfulAppLaunch, timeToAppInteractive, appLoadResult, appLoadNonOptimalReason } =
        metric.data;
      // SLI として記録: 起動成功可否・起動所要時間・非最適理由
      recordSli({ successfulAppLaunch, timeToAppInteractive, appLoadResult, appLoadNonOptimalReason });
      break;
    }
    case "networkRequest": {
      const { url, method, statusCode, duration, responseSize } = metric.data;
      recordNetworkRequest({ url: sanitizeUrl(url), method, statusCode, duration, responseSize });
      break;
    }
    default:
      break;
  }
}

export async function initializeTelemetry(): Promise<void> {
  await initializeLogger({ logMetric: (metric: Metric) => handleMetric(metric) });
}
```

完全な実装は [generic-base のテレメトリ雛形](../templates/generic-base/src/lib/telemetry.ts) を正とする。
`initializeTelemetry()` はアプリのエントリーポイント（`main.tsx` 等）で 1 回だけ呼び出す。
テレメトリ初期化の失敗で UI 描画を止めない場合は `void initializeTelemetry().catch(...)` とし、失敗を別経路で記録する。
汎用ベーステンプレートは、外部送信を行わず、サニタイズ済みメトリクスを `code-apps:telemetry` の
`CustomEvent` として公開する。転送先を実装するときは custom sink に差し替える。

## SLI（Service Level Indicator）としての `sessionLoadSummary`

`sessionLoadSummary` は起動性能の SLI として扱う。

| フィールド | 用途 |
|---|---|
| `successfulAppLaunch` | 起動成功可否。`false` が続く場合はアラート対象 |
| `timeToAppInteractive` | 起動から操作可能になるまでの時間（ms）。閾値超過を監視 |
| `appLoadResult` | `'optimal'` / `'other'`。`'other'` が多い場合は原因調査 |
| `appLoadNonOptimalReason` | `'interactionRequired'` / `'throttled'` / `'screenNavigatedAway'` / `'other'` |

`getAppLoadedPerformanceData()`（`@microsoft/power-apps/telemetry`）は補助的なロード性能データの取得に使う。

## `networkRequest` メトリクスからのスロークエリ検出

`NetworkRequestMetricData` の `duration`（ms）を閾値で判定し、遅い呼び出しを検出する。

| 閾値の目安 | 対応 |
|---|---|
| `duration > 3000` | 警告としてログ・要調査候補 |
| `duration > 8000` | エラー相当。タイムアウト設定やページング条件を見直す |
| `statusCode >= 400` | エラーとして個別に記録（`duration` に関わらず） |

Dataverse 呼び出し（`retrieveMultipleRecordsAsync` 等）は内部的に `networkRequest` として計測されるため、
一覧画面のフィルタ条件やページサイズ起因の遅延切り分けに使える。

## PII サニタイズ規約（必須）

`NetworkRequestMetricData.url` には OData のクエリ文字列（`$filter` / `$select` 等）がそのまま含まれ、
レコード ID・メールアドレス・氏名などの PII が露出する可能性がある。**送信前に必ずマスクする。**

```typescript
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    // クエリ文字列は丸ごと除去（$filter・$select 等に PII が含まれ得るため）
    parsed.search = "";
    parsed.hash = "";
    parsed.pathname = parsed.pathname
      .replace(/\([^/)]+\)/g, "([id])")
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "[id]",
      );
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}
```

- **クエリ文字列（`?...`）は送信しない**。`$filter=emailaddress1 eq 'user@example.com'` のようにメールアドレスや
  レコード ID（GUID）がそのまま載るため。
- パス部分の OData キー（GUID、代替キー等。例: `/api/data/v9.2/contacts(key)`）も、sink 到達前に `[id]` へマスクする。
- `sessionLoadSummary` にはユーザー識別情報は含まれないが、独自にログへユーザー ID を付加する場合は
  [ユーザー識別](user-identity.md) の `systemuserid` をそのまま送らず、ハッシュ化するなど別途検討する。

## Application Insights / Log Analytics への転送と CSP

収集したメトリクスを Application Insights / Log Analytics Workspace へ転送する場合、
Code Apps は `fetch`/XHR を **CSP の `connect-src`** で制御しているため、送信先ドメインの許可が必要になる。

- Application Insights Ingestion Endpoint（例: `https://dc.services.visualstudio.com`）または
  Log Analytics のカスタムログ収集エンドポイントを `connect-src` に追加する。
- 設定方法・ディレクティブの詳細は [CSP 構成](csp.md) を参照。CSP 未設定のまま `fetch` すると
  `Refused to connect to '...'` エラーでブロックされる。
- 転送処理自体は Power Automate 経由（HTTP アクション）にすると、フロント側の `connect-src` 追加が
  不要になる場合がある（→ [フロー連携](flow-integration.md)）。
