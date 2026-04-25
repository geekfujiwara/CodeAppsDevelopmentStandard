# HTML メールテンプレート コンポーネントリファレンス

## セクションコンポーネント

### サマリーカード（青枠）

概要・エグゼクティブサマリー・ハイライト等の冒頭セクションに使用。

```html
<div
  style="border-left:4px solid #2563eb;background:#eff6ff;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:32px;"
>
  <h2 style="margin:0 0 12px;font-size:16px;color:#1e40af;font-weight:700;">
    📋 エグゼクティブサマリー
  </h2>
  <p style="margin:0;font-size:14px;color:#334155;line-height:1.8;">
    サマリーテキストをここに記載する。
  </p>
</div>
```

### 番号バッジ付きタイトル

記事・項目のタイトル行に使用。

```html
<div style="margin-bottom:16px;">
  <span
    style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-right:8px;"
    >01</span
  >
  <span style="font-size:18px;font-weight:700;color:#0f172a;"
    >項目タイトル</span
  >
</div>
```

### リンク

```html
<p style="margin:0 0 16px;font-size:13px;">
  <a href="https://example.com" style="color:#2563eb;text-decoration:none;"
    >🔗 元記事を読む ↗</a
  >
</p>
```

### 情報カード（灰背景 — 要約・説明）

```html
<div
  style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
>
  <p
    style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;"
  >
    📝 要約
  </p>
  <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
    説明テキストをここに記載する。
  </p>
</div>
```

### 注意カード（黄背景 — 理由・警告）

```html
<div
  style="background:#fef3c7;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
>
  <p
    style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;"
  >
    🎯 選定理由
  </p>
  <p style="margin:0;font-size:14px;color:#451a03;line-height:1.7;">
    理由・注意事項をここに記載する。
  </p>
</div>
```

### アクションカード（緑背景 — 推奨アクション・成功）

```html
<div style="background:#dcfce7;border-radius:10px;padding:16px 20px;">
  <p
    style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;"
  >
    💡 推奨アクション
  </p>
  <ul
    style="margin:0;padding-left:20px;font-size:14px;color:#14532d;line-height:2;"
  >
    <li>アクション 1</li>
    <li>アクション 2</li>
    <li>アクション 3</li>
  </ul>
</div>
```

### エラーカード（赤背景 — エラー・緊急）

```html
<div
  style="background:#fee2e2;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
>
  <p
    style="margin:0 0 6px;font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:1px;"
  >
    ⚠️ 緊急対応
  </p>
  <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.7;">
    エラー内容・緊急事項をここに記載する。
  </p>
</div>
```

### 区切り線（記事間・セクション間）

```html
<hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px;" />
```

> **最後の記事・セクションには区切り線を入れない。**

## 用途別テンプレートパターン

### パターン A: ニュースレポート / 情報配信メール

**構成**: ヘッダー → サマリーカード → 記事カード × N → フッター

各記事カードは以下のセクションで構成:

1. 番号バッジ + タイトル
2. 元記事リンク
3. 📝 要約（情報カード）
4. 🎯 選定理由（注意カード）
5. 💡 推奨アクション（アクションカード）
6. 区切り線（最後以外）

```
## メール HTML テンプレート仕様

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 単色背景 #1e3a5f（グラデーション禁止）、白文字タイトル（内容を反映した動的見出し）、日付
2. エグゼクティブサマリー: 左青ボーダー 4px #2563eb、薄青背景(#eff6ff)の総括カード
3. 記事カード（各記事を繰り返し）:
   - 番号バッジ(白文字、青丸背景 #2563eb、角丸20px) + タイトル(18px 太字 #0f172a)
   - 🔗 元記事リンク（色 #2563eb、テキスト「🔗 元記事を読む ↗」）
   - 📝 要約（灰背景 #f1f5f9、角丸10px）本文 3〜5 文
   - 🎯 選定理由（黄背景 #fef3c7）なぜこの記事が重要か
   - 💡 推奨アクション（緑背景 #dcfce7）箇条書き(ul/li) 2〜3 個
   - 記事間は区切り線(1px #e2e8f0)、最後の記事には不要
4. フッター: 自動生成の注記

### スタイル要件
- 最大幅 680px、角丸 16px、白背景カード
- フォント: Segoe UI, Helvetica Neue, Arial, sans-serif
- 各セクションは角丸 10px カードで視覚的に区切る
```

### パターン B: ステータス通知メール（インシデント・タスク等）

**構成**: ヘッダー → ステータスサマリー → 詳細カード → アクション → フッター

```
## メール HTML テンプレート仕様

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 単色背景 #1e3a5f、白文字タイトル（「新規インシデント: {タイトル}」等）
2. ステータスカード: 左青ボーダー、薄青背景(#eff6ff)。ステータス・優先度・担当者を表形式で表示
3. 詳細カード: 灰背景(#f1f5f9)にインシデント説明・経緯
4. 対応アクション: 緑背景(#dcfce7)に推奨対応ステップ
5. フッター: 自動生成の注記 + ダッシュボードリンク
```

### パターン C: 日次/週次サマリーメール

**構成**: ヘッダー → KPI ハイライト → カテゴリ別セクション → フッター

```
## メール HTML テンプレート仕様

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 単色背景 #1e3a5f、白文字タイトル（内容を反映した動的見出し）、対象期間
2. KPI ハイライト: 薄青背景(#eff6ff)、主要指標を inline-block カードで横並び表示
3. カテゴリ別セクション（繰り返し）:
   - カテゴリヘッダー(18px 太字) + バッジ(件数)
   - 各項目: 情報カード(灰背景 #f1f5f9)で概要表示
   - 注意事項があれば黄背景(#fef3c7)カード
4. 推奨ネクストアクション: 緑背景(#dcfce7)カード
5. フッター: 自動生成の注記
```

## エージェント Instructions への組み込み方

### 短縮版（推奨 — Instructions のトークン節約）

Instructions の末尾に以下の短縮版テンプレート仕様を追加する。
エージェントの LLM はこの仕様から自律的に HTML を生成できる。

```
## メール HTML テンプレート仕様

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。外部 CSS 禁止。グラデーション非対応のため単色背景のみ。

### 全体
- 最大幅 680px、中央寄せ、背景 #f0f4f8
- コンテンツは白カード(#ffffff)、角丸 16px、box-shadow
- フォント: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif

### ヘッダー
- 背景: #1e3a5f（単色のみ）、パディング 32px 36px
- タイトル: 内容を反映した動的見出し（汎用タイトル禁止）、#ffffff、24px 太字
- サブタイトル: 日付・カテゴリ、#93c5fd、14px

### セクション別カード（角丸 10px、パディング 16px 20px）
- 📋 サマリー: 左ボーダー 4px #2563eb、背景 #eff6ff
- 📝 情報/要約: 背景 #f1f5f9、テキスト #334155
- 🎯 注意/理由: 背景 #fef3c7、テキスト #451a03
- 💡 アクション: 背景 #dcfce7、テキスト #14532d
- ⚠️ エラー/緊急: 背景 #fee2e2、テキスト #7f1d1d

### 番号バッジ
- 背景 #2563eb、白文字、12px 太字、角丸 20px、パディング 4px 12px

### リンク
- 色 #2563eb、装飾なし

### フッター
- 背景 #f8fafc、テキスト #64748b、12px、中央寄せ
```

### フル版（サンプル HTML 付き）

Instructions に十分なトークン余裕がある場合、セクションコンポーネントの HTML サンプルも含める。
上記「セクションコンポーネント」セクションの HTML コードブロックを Instructions に転記する。

## 他のスキルからの参照方法

### copilot-studio（market-research-report）から

リサーチレポートメールは **パターン A** を使用。Instructions の `Step5` に上記短縮版テンプレート仕様を追加する。

### copilot-studio（trigger）から

メールトリガーで受信したメールの処理結果を返信する場合、**パターン B** を使用。

### power-automate スキルから

フロー内で直接 HTML メールを送信する場合（例: Outlook コネクタの `SendEmailV2`）、
フロー定義の `body/Body` に上記テンプレート構造の HTML を設定する。

### deploy_news_agent.py との関係

`deploy_news_agent.py` の `GPT_INSTRUCTIONS` 変数にはこのデザインシステムの
パターン A 短縮版が組み込まれている。テンプレートを変更する場合は本スキルを更新し、
スクリプト側の Instructions も同期させる。
