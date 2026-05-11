# Code Apps — Copilot Studio チャット UI パターン

Copilot Studio エージェントを Code Apps に統合し、フルスクリーンチャット UI を提供するデザインテンプレート。
Power Automate フローを介さず、`MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2` で直接対話する。

> **前提**: Copilot Studio コネクタの接続設定は [copilot-studio-connector.md](copilot-studio-connector.md) を参照。

## アーキテクチャ概要

```
┌─────────────────────────────┐
│     Code Apps (React UI)    │
│  ┌───────────────────────┐  │
│  │   CopilotChatPage     │  │
│  │  ┌─────────────────┐  │  │
│  │  │ ヘッダー(操作)   │  │  │
│  │  ├─────────────────┤  │  │
│  │  │ チャット領域     │  │  │
│  │  │ (メッセージ一覧) │  │  │
│  │  ├─────────────────┤  │  │
│  │  │ 入力フォーム     │  │  │
│  │  └─────────────────┘  │  │
│  └───────────────────────┘  │
└───────────┬─────────────────┘
            │ ExecuteCopilotAsyncV2
            ▼
┌─────────────────────────────┐
│    Copilot Studio Agent     │
│  (Generative Orchestration) │
│  ナレッジ / MCP / ツール     │
└─────────────────────────────┘
```

## 画面構成

| 領域 | 内容 |
|------|------|
| ヘッダー | リセットボタン、追加アクションボタン（一覧表示・作成等） |
| チャット領域 | メッセージ一覧（ユーザー/アシスタント）、思考中インジケーター |
| 初期画面 | Bot アイコン + 説明テキスト + クイックアクションボタン |
| 入力フォーム | 検索アイコン付き Input + 送信ボタン |

## コンポーネント構成

```
CopilotChatPage (ページコンポーネント)
├── ヘッダー (shrink-0, border-b)
│   ├── Bot アイコン + タイトル
│   ├── リセットボタン (会話あるときのみ表示)
│   └── 追加アクションボタン群
├── チャット領域 (flex-1, overflow-y-auto)
│   ├── 初期画面 (会話なし時)
│   │   ├── Bot アイコン (opacity-20)
│   │   ├── タイトル + 説明
│   │   └── クイックアクションボタン群
│   ├── メッセージバブル群
│   │   ├── ユーザーメッセージ (右寄せ, bg-primary)
│   │   └── アシスタントメッセージ (左寄せ, bg-muted, Markdown)
│   └── 思考中インジケーター
└── 入力フォーム (shrink-0, border-t)
    ├── Search アイコン付き Input
    └── Send ボタン
```

## 完全なテンプレートコード

### 型定義

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  format?: "plain" | "markdown";
  timestamp: Date;
}
```

### 思考中インジケーター

```tsx
const THINKING_MESSAGES = [
  "分析中...",
  "情報を検索しています...",
  "最適な回答を検討中...",
  "回答をまとめています...",
];

function ThinkingIndicator() {
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setMsgIndex((p) => (p + 1) % THINKING_MESSAGES.length),
      2500,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {/* AI グラデーションバー */}
      <div className="w-full h-1 rounded-full overflow-hidden bg-muted">
        <div
          className="h-full w-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 via-cyan-400 to-violet-500 animate-[gradient-shift_2s_linear_infinite] bg-[length:200%_100%]"
        />
      </div>
      <p
        className="text-xs text-muted-foreground animate-[fade-in_0.3s_ease-out]"
        key={msgIndex}
      >
        {THINKING_MESSAGES[msgIndex]}
      </p>
    </div>
  );
}
```

### Copilot レスポンスパーサー

```typescript
function parseCopilotResponse(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    if (typeof parsed === "string") return parsed;
  } catch {
    /* raw string */
  }
  return raw;
}
```

### Markdown レンダラー

Copilot Studio の応答は Markdown 形式で返されるため、レンダラーが必要。

```tsx
// src/components/markdown-renderer.tsx — 軽量版
// 対応: 見出し(##), 太字(**), リスト(-), リンク([text](url)), コードブロック(```)
// ★ 外部ライブラリ不要。正規表現ベースのシンプルなレンダラー。

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        // 見出し
        if (line.startsWith("### "))
          return <h4 key={i} className="font-semibold text-sm mt-2">{renderInline(line.slice(4))}</h4>;
        if (line.startsWith("## "))
          return <h3 key={i} className="font-semibold text-base mt-3">{renderInline(line.slice(3))}</h3>;
        // リスト
        if (/^[-*]\s/.test(line))
          return <p key={i} className="pl-3">• {renderInline(line.replace(/^[-*]\s+/, ""))}</p>;
        if (/^\d+\.\s/.test(line))
          return <p key={i} className="pl-3">{renderInline(line)}</p>;
        // 空行
        if (!line.trim()) return <div key={i} className="h-1" />;
        // 通常テキスト
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  // **bold** → <strong>
  // [text](url) → <a>
  // `code` → <code>
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    // Code
    const codeMatch = remaining.match(/`([^`]+)`/);

    // 最も早い位置のマッチを処理
    const matches = [
      boldMatch && { type: "bold", index: boldMatch.index!, match: boldMatch },
      linkMatch && { type: "link", index: linkMatch.index!, match: linkMatch },
      codeMatch && { type: "code", index: codeMatch.index!, match: codeMatch },
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) parts.push(remaining.slice(0, first.index));

    if (first.type === "bold") {
      parts.push(<strong key={key++}>{first.match[1]}</strong>);
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === "link") {
      parts.push(
        <a key={key++} href={first.match[2]} target="_blank" rel="noopener noreferrer"
           className="text-primary underline hover:opacity-80">
          {first.match[1]}
        </a>
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    } else if (first.type === "code") {
      parts.push(
        <code key={key++} className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
          {first.match[1]}
        </code>
      );
      remaining = remaining.slice(first.index + first.match[0].length);
    }
  }
  return <>{parts}</>;
}
```

### メインページ — CopilotChatPage

```tsx
import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Send, Bot, RotateCcw } from "lucide-react";
// ★ MarkdownRenderer は上記の軽量版 or 独自実装を使用
import { MarkdownRenderer } from "@/components/markdown-renderer";

// ★ エージェントスキーマ名をここで定義
const AGENT_NAME = "cr377_agent"; // ← 環境に合わせて変更

// ★ クイックアクションの定義（業務に合わせてカスタマイズ）
const QUICK_ACTIONS = ["紙詰まり", "搬送", "トナー", "SC コード"];

export default function CopilotChatPage() {
  // チャット状態
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 会話 ID（連続対話）
  const conversationIdRef = useRef<string | undefined>(undefined);

  // スクロール
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isThinking]);

  // --- Copilot Studio 直接呼び出し ---
  const callCopilot = useCallback(async (q: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: q,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    let answer = "";
    let format: "plain" | "markdown" = "plain";

    try {
      const { MicrosoftCopilotStudioService } = await import(
        "@/generated/services/MicrosoftCopilotStudioService"
      );

      const body = {
        message: q,
        notificationUrl: "https://notificationurlplaceholder",
      };

      const result = await MicrosoftCopilotStudioService.ExecuteCopilotAsyncV2(
        AGENT_NAME,
        body,
        conversationIdRef.current,
      );

      // レスポンス解析 — IOperationResult<void> のため型アサーション
      const fullResult = result as unknown as Record<string, unknown>;
      const data = (fullResult.data ?? fullResult) as Record<string, unknown>;

      // conversationId 保持
      const convId =
        (data?.conversationId ?? data?.ConversationId) as string | undefined;
      const nestedBody = data?.body as Record<string, unknown> | undefined;
      const nestedConvId =
        (nestedBody?.conversationId ?? nestedBody?.ConversationId) as
          | string
          | undefined;
      if (convId || nestedConvId) {
        conversationIdRef.current = convId || nestedConvId;
      }

      // テキスト応答取得（優先順位順）
      let responseText = "";
      if (data?.lastResponse) responseText = String(data.lastResponse);
      else if (Array.isArray(data?.responses) && data.responses.length > 0)
        responseText = (data.responses as string[]).join("\n\n");
      else if (data?.text) responseText = String(data.text);
      else if (data?.message) responseText = String(data.message);
      else if (data?.response) responseText = String(data.response);

      if (responseText) {
        answer = parseCopilotResponse(responseText);
        format = "markdown";
      } else {
        throw new Error("Empty response from Copilot Studio agent");
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[CopilotChat] Call FAILED:", errMsg, err);
      answer = `**⚠️ エラー**: ${errMsg}`;
      format = "markdown";
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: answer,
      format,
      timestamp: new Date(),
    };
    setChatMessages((prev) => [...prev, assistantMsg]);
    setIsThinking(false);
  }, []);

  const handleSend = useCallback(() => {
    const q = chatInput.trim();
    if (!q || isThinking) return;
    setChatInput("");
    callCopilot(q);
  }, [chatInput, isThinking, callCopilot]);

  const handleQuickSend = useCallback(
    (text: string) => {
      if (isThinking) return;
      callCopilot(text);
    },
    [isThinking, callCopilot],
  );

  const handleResetChat = useCallback(() => {
    setChatMessages([]);
    setChatInput("");
    conversationIdRef.current = undefined;
  }, []);

  const hasChat = chatMessages.length > 0;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ height: "calc(100dvh - 64px - 2rem)", minHeight: 400 }}
    >
      {/* ヘッダー */}
      <div className="px-4 pt-3 pb-2 border-b bg-background shrink-0">
        <div className="flex items-center justify-end gap-2">
          {hasChat && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetChat}
              className="gap-1 text-xs h-7"
            >
              <RotateCcw className="h-3 w-3" />
              リセット
            </Button>
          )}
          {/* ★ 追加アクションボタン（業務に合わせて配置） */}
        </div>
        <div className="flex items-center gap-1.5 mt-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Copilot</span>
        </div>
      </div>

      {/* チャット領域 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {/* 初期画面 */}
            {!hasChat && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Bot className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Copilot</p>
                <p className="text-xs mt-1 text-center">
                  {/* ★ 業務に合わせた説明テキスト */}
                  質問を入力してください。
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
                  {QUICK_ACTIONS.map((q) => (
                    <Button
                      key={q}
                      variant="outline"
                      size="sm"
                      className="text-xs rounded-full h-7"
                      onClick={() => handleQuickSend(q)}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* メッセージ一覧 */}
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted rounded-bl-md"
                  }`}
                >
                  {msg.format === "markdown" ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {/* 思考中 */}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2">
                  <ThinkingIndicator />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* 入力フォーム */}
          <div className="px-4 py-3 border-t bg-background shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="質問を入力..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="pl-10 text-sm"
                  disabled={isThinking}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!chatInput.trim() || isThinking}
                className="h-9 w-9 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
```

## カスタマイズポイント

### 1. エージェント名

```typescript
const AGENT_NAME = "cr377_agent"; // ← Copilot Studio のスキーマ名に変更
```

### 2. クイックアクション

初期画面のボタン。業務ドメインに合わせて変更:

```typescript
// ナレッジ検索
const QUICK_ACTIONS = ["紙詰まり", "搬送", "トナー", "SC コード"];

// ヘルプデスク
const QUICK_ACTIONS = ["パスワードリセット", "VPN 接続", "メール設定", "PC トラブル"];

// 営業支援
const QUICK_ACTIONS = ["見積作成", "顧客情報", "在庫確認", "納期回答"];
```

### 3. 思考中メッセージ

```typescript
const THINKING_MESSAGES = [
  "分析中...",
  "ナレッジベースを検索しています...",
  "修理事例を照合しています...",
  "回答をまとめています...",
];
```

### 4. 高さ調整

MDA iframe 内での高さ計算。64px はナビゲーションバー、2rem はパディング:

```typescript
style={{ height: "calc(100dvh - 64px - 2rem)", minHeight: 400 }}
```

### 5. ヘッダーに追加アクションボタン

```tsx
{/* ナレッジ一覧ボタンの例 */}
<Button variant="outline" size="sm" onClick={() => setShowListModal(true)} className="gap-1 h-7 text-xs">
  <BookOpen className="h-3 w-3" />
  ナレッジ一覧
</Button>
```

### 6. タイピングアニメーション（オプション）

アシスタントメッセージを文字ごとに表示する演出:

```tsx
function TypingMarkdown({
  text,
  skip,
  onComplete,
}: {
  text: string;
  skip?: boolean;
  onComplete?: () => void;
}) {
  const [displayedLen, setDisplayedLen] = useState(skip ? text.length : 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (skip) { setDisplayedLen(text.length); onComplete?.(); return; }
    setDisplayedLen(0);
    intervalRef.current = setInterval(() => {
      setDisplayedLen((prev) => {
        const next = Math.min(prev + 3, text.length);
        if (next >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onComplete?.();
        }
        return next;
      });
    }, 6);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [text, skip]);

  return (
    <div className="relative">
      <MarkdownRenderer content={text.slice(0, displayedLen)} />
      {displayedLen < text.length && (
        <span className="inline-block w-0.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}
```

使用時:

```tsx
{msg.role === "assistant" ? (
  <TypingMarkdown text={msg.content} skip={alreadyAnimated} onComplete={markAnimated} />
) : (
  <p className="text-sm">{msg.content}</p>
)}
```

### 7. ローカルフォールバック検索（オプション）

Copilot Studio 呼び出し失敗時にローカルデータで代替回答:

```typescript
} catch (err) {
  // ローカルフォールバック
  const matched = localSearch(allRecords, extractKeywords(q));
  if (matched.length > 0) {
    answer = `**ローカル検索結果（${matched.length}件）:**\n\n` +
      matched.slice(0, 3).map((r, i) =>
        `**${i + 1}. ${r.name}**\n- ${r.summary}`
      ).join("\n\n");
    format = "markdown";
  } else {
    answer = `**⚠️ エラー**: ${errMsg}`;
    format = "markdown";
  }
}
```

## 必要な CSS keyframes

テンプレートで使用する CSS アニメーション。グローバル CSS または `<style>` タグで定義:

```css
@keyframes gradient-shift {
  0% { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* オプション: メッセージ到着時のグラデーションリング */
@keyframes gradient-ring {
  0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.5); }
  60% { box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15); }
  100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
}
```

## 前提条件チェックリスト

| # | 項目 | 確認方法 |
|---|------|---------|
| 1 | Copilot Studio エージェントが公開済み | Copilot Studio UI でステータス確認 |
| 2 | `shared_microsoftcopilotstudio` コネクタの接続が環境内に存在 | Power Platform 管理センター → 接続 |
| 3 | `npx power-apps add-data-source` でコネクタ追加済み | `src/generated/services/MicrosoftCopilotStudioService.ts` が存在 |
| 4 | `dataSourcesInfo` 統合版を使用 | `src/lib/dataSourcesInfo.ts` で `.power` と `generated` をマージ |
| 5 | 生成サービスのインポートパスが統合版を参照 | `MicrosoftCopilotStudioService.ts` 内の import を確認 |

## 使用コンポーネント

| コンポーネント | shadcn/ui | 用途 |
|-------------|-----------|------|
| `Button` | ✅ | リセット、送信、クイックアクション |
| `Input` | ✅ | チャット入力 |
| `Skeleton` | ✅ | ローディング表示 |
| `Bot` | lucide-react | Bot アイコン |
| `Search` | lucide-react | 入力欄アイコン |
| `Send` | lucide-react | 送信ボタンアイコン |
| `RotateCcw` | lucide-react | リセットボタンアイコン |
| `MarkdownRenderer` | カスタム | Markdown 応答のレンダリング |
| `ThinkingIndicator` | カスタム | 思考中アニメーション |

## レスポンシブ対応

- `100dvh` を使用（モバイル Safari のアドレスバー対応）
- `max-w-[85%]` でメッセージバブルの最大幅を制限
- クイックアクションは `flex-wrap` で折り返し
- 入力フォームは `shrink-0` で常に表示
