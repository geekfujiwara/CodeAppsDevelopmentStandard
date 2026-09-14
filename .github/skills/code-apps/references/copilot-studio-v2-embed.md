# Copilot Studio v2 Web App Iframe

Copilot Studio v2 の標準チャット UI を Code Apps 内に表示する場合は、Web app チャネルの iframe を
第一候補にする。`ExecuteCopilotAsyncV2` や WebChat SDK による直接呼び出しとは別の連携方式である。

## URL と実装

環境 ID と bot schema は公開可能な構成値として `VITE_` 環境変数から読み、GUID と schema の形式を
検証してから URL API で組み立てる。プロンプト、トークン、利用者 ID を URL に入れない。

```ts
const url = new URL(
  `https://copilotstudio.microsoft.com/environments/${environmentId}/bots/${botSchema}/webchat`,
)
url.searchParams.set("__version__", "2")
url.searchParams.set("enableFileAttachment", "false")
url.searchParams.set("cliAgent", "true")
```

```tsx
<iframe
  title="業務アシスタント"
  src={url.toString()}
  sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
  referrerPolicy="no-referrer"
/>
```

実装例は [plant-design-copilot.ts](../samples/plant-design-maintenance/src/lib/plant-design-copilot.ts) を参照する。
エージェント名、読み込み中、サインイン要求、利用不可、再読み込みを UI 状態として扱い、固定した高さと
モバイル向けの最小高さを定義する。

## CSP

Code Apps の `frame-src` に Copilot Studio の origin を追加し、デプロイ前に読み戻し検証する。

```powershell
python .github/skills/code-apps/scripts/configure_code_app_csp.py `
  --directive Frame-Src --source https://copilotstudio.microsoft.com --assert
```

不足時は計画を確認してから同じ引数に `--apply` を指定し、再度 `--assert` を実行する。
環境固有のリダイレクト先が発生した場合はブラウザーの失敗 origin を確認し、必要な origin だけを追加する。

## できること・できないこと

| 項目 | v2 iframe |
|---|---|
| Copilot Studio の標準チャット UI を表示 | 対応 |
| v2 のスキル/MCPを同じエージェントで利用 | 対応。公開後に実応答を確認する |
| 親アプリから任意メッセージを注入 | 契約なし。前提にしない |
| 応答イベントや conversation ID を親アプリで取得 | 契約なし。前提にしない |
| トークンストリーミングを独自 UI に描画 | 対象外 |
| Code Apps の利用者コンテキストを iframe 内へ自動委任 | 保証しない。実際のサインインと本人認可を検証する |

業務 UI から入力を渡し、結果を検証・保存する必要がある場合は
[agent-flows の要求/結果パターン](../../agent-flows/references/code-apps-integration.md)を使う。
WebChat SDK や `ExecuteCopilotAsyncV2` のプログラム制御が必須なら v1 を比較する。

## 受入

ローカル表示だけで完了にしない。公開した Code Apps を一般利用者で開き、iframe の読み込み、サインイン、
新規会話、同じ v2 のスキル/MCP実応答、権限外データの拒否、デスクトップ/モバイル、再読み込みを確認する。
iframe 表示成功は Agent flows の実行成功や、親アプリとのコンテキスト連携成功を意味しない。