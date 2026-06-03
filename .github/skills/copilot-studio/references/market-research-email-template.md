# ニュースエージェント HTML メールテンプレートリファレンス

### 2.5. メール HTML テンプレート仕様

Step5 でメール送信する際、エージェントは以下の HTML テンプレート構造に従ってリッチな HTML メールを生成する。
Instructions にこのテンプレート仕様を含め、エージェントが自律的に HTML を組み立てられるようにする。

#### Instructions に追加するメールテンプレート指示

```
## メール本文の HTML テンプレート仕様

メール本文は以下の HTML 構造で作成すること。インラインスタイルを使用し、外部 CSS は使わない。

### 全体レイアウト
- 最大幅 680px、中央寄せ、背景色 #f0f4f8
- フォント: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif
- 本文テキスト色: #1e293b

### セクション構成（上から順に）

1. ヘッダー（単色背景 — グラデーション禁止）
   - 背景: #1e3a5f（単色。グラデーションはメールクライアント非対応のため禁止）
   - タイトル: ニュース内容を反映した動的見出し（例: 「AI規制強化とクラウドセキュリティの最新動向」）、白文字(#ffffff)、24px
   - ★ 「📊 AI ニュースレポート」等の汎用タイトルは使わない。必ず内容を反映させる
   - サブタイトル: 日付と業界名、#93c5fd 色、14px

2. エグゼクティブサマリー（青枠カード）
   - 左ボーダー 4px #2563eb
   - 背景: #eff6ff
   - 見出し: 「📋 エグゼクティブサマリー」16px 太字
   - 本文: 全体の総括（3〜5 文）

3. 注目記事カード（記事ごとに繰り返し）
   各記事を白背景カードで表示。カード構成:

   a. 記事番号バッジ + タイトル
      - バッジ: 白文字、背景 #2563eb、角丸、inline-block
      - タイトル: 18px 太字、#0f172a

   b. 記事 URL リンク
      - 「🔗 元記事を読む」リンク、色 #2563eb、14px

   c. 📝 要約セクション
      - ラベル背景: #f1f5f9、角丸、パディング 12px
      - 本文の要約（3〜5 文）

   d. 🎯 選定理由セクション
      - ラベル背景: #fef3c7（黄系）
      - なぜこの記事を選んだか（業界・役割との関連性）

   e. 💡 推奨アクション セクション
      - ラベル背景: #dcfce7（緑系）
      - 箇条書き（ul/li）で具体的なアクションを 2〜3 個

   f. 記事間の区切り線（1px #e2e8f0、最後の記事には不要）

4. フッター
   - 背景: #f8fafc
   - テキスト: 「このレポートは AI エージェントにより自動生成されました」
   - 色: #64748b、12px
```

#### HTML テンプレートサンプル（エージェントの参考用）

以下は Instructions 内にそのまま含めるか、エージェントの参考として保持する HTML テンプレート。
エージェントはこの構造を基に、実際の記事データで HTML を組み立てる。

```html
<div
  style="background-color:#f0f4f8;padding:32px 0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;"
>
  <div
    style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"
  >
    <!-- ヘッダー -->
    <!-- ★ 背景は単色 #1e3a5f。グラデーションはメールクライアント非対応 -->
    <div style="background:#1e3a5f;padding:32px 36px;">
      <!-- ★ タイトルはニュース内容を反映した動的見出しにする。「AI ニュースレポート」等の固定タイトル禁止 -->
      <h1
        style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;"
      >
        AI規制強化とクラウドセキュリティの最新動向
      </h1>
      <p style="margin:8px 0 0;color:#93c5fd;font-size:14px;">
        2026年4月13日 ｜ 自動車産業の最新動向
      </p>
    </div>

    <div style="padding:28px 36px;">
      <!-- エグゼクティブサマリー -->
      <div
        style="border-left:4px solid #2563eb;background:#eff6ff;border-radius:0 12px 12px 0;padding:20px 24px;margin-bottom:32px;"
      >
        <h2
          style="margin:0 0 12px;font-size:16px;color:#1e40af;font-weight:700;"
        >
          📋 エグゼクティブサマリー
        </h2>
        <p style="margin:0;font-size:14px;color:#334155;line-height:1.8;">
          本日のニュースでは、米国の対中関税政策の新展開、EV
          サプライチェーンの再編動向、
          および自動運転技術の規制緩和に関する重要な進展が確認されました。
          特に関税リスクへの対応が経営企画部門にとって喫緊の課題となっています。
        </p>
      </div>

      <!-- 記事カード 1 -->
      <div style="margin-bottom:28px;">
        <div style="margin-bottom:16px;">
          <span
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-right:8px;"
            >01</span
          >
          <span style="font-size:18px;font-weight:700;color:#0f172a;"
            >米国、EV 部品への追加関税を発表</span
          >
        </div>
        <p style="margin:0 0 16px;font-size:13px;">
          <a
            href="https://example.com/article1"
            style="color:#2563eb;text-decoration:none;"
            >🔗 元記事を読む ↗</a
          >
        </p>

        <!-- 要約 -->
        <div
          style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;"
          >
            📝 要約
          </p>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
            米国政府は中国製 EV 部品に対する追加関税（25%→45%）を発表。
            バッテリーセル・モーター・インバーターが対象。
            日本の完成車メーカーにもサプライチェーン経由で影響が及ぶ見通し。
          </p>
        </div>

        <!-- 選定理由 -->
        <div
          style="background:#fef3c7;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;"
          >
            🎯 選定理由
          </p>
          <p style="margin:0;font-size:14px;color:#451a03;line-height:1.7;">
            自動車産業の経営企画として、関税政策変更はサプライチェーンコスト・調達戦略に直結する最重要リスク要因です。
          </p>
        </div>

        <!-- 推奨アクション -->
        <div style="background:#dcfce7;border-radius:10px;padding:16px 20px;">
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;"
          >
            💡 推奨アクション
          </p>
          <ul
            style="margin:0;padding-left:20px;font-size:14px;color:#14532d;line-height:2;"
          >
            <li>調達部門と連携し、中国製部品の依存度を緊急調査</li>
            <li>代替サプライヤー（ASEAN・インド）の候補リストを作成</li>
            <li>関税影響のコストシミュレーションを経営会議に上程</li>
          </ul>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px;" />

      <!-- 記事カード 2（同じ構造を繰り返し） -->
      <div style="margin-bottom:28px;">
        <div style="margin-bottom:16px;">
          <span
            style="display:inline-block;background:#2563eb;color:#ffffff;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-right:8px;"
            >02</span
          >
          <span style="font-size:18px;font-weight:700;color:#0f172a;"
            >トヨタ、全固体電池の量産前倒しを発表</span
          >
        </div>
        <p style="margin:0 0 16px;font-size:13px;">
          <a
            href="https://example.com/article2"
            style="color:#2563eb;text-decoration:none;"
            >🔗 元記事を読む ↗</a
          >
        </p>
        <div
          style="background:#f1f5f9;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;"
          >
            📝 要約
          </p>
          <p style="margin:0;font-size:14px;color:#334155;line-height:1.7;">
            トヨタ自動車が全固体電池の量産開始を2027年から2026年後半に前倒しすると発表。
            航続距離1,200kmを実現し、充電時間は従来比60%短縮。 業界全体の EV
            技術競争が加速する見通し。
          </p>
        </div>
        <div
          style="background:#fef3c7;border-radius:10px;padding:16px 20px;margin-bottom:12px;"
        >
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;"
          >
            🎯 選定理由
          </p>
          <p style="margin:0;font-size:14px;color:#451a03;line-height:1.7;">
            競合他社の技術ロードマップ変更は中長期の経営戦略策定に直結。 自社の
            EV 戦略・投資計画の見直しが必要になる可能性があります。
          </p>
        </div>
        <div style="background:#dcfce7;border-radius:10px;padding:16px 20px;">
          <p
            style="margin:0 0 6px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:1px;"
          >
            💡 推奨アクション
          </p>
          <ul
            style="margin:0;padding-left:20px;font-size:14px;color:#14532d;line-height:2;"
          >
            <li>技術部門に全固体電池の技術動向レビューを依頼</li>
            <li>自社 EV ロードマップとの差分分析を実施</li>
          </ul>
        </div>
      </div>

      <!-- ★ 記事カードは 3〜5 件繰り返す。最後の記事には hr 区切り線を入れない -->
    </div>

    <!-- フッター -->
    <div
      style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;"
    >
      <p style="margin:0;font-size:12px;color:#64748b;">
        このレポートは AI エージェントにより自動生成されました ｜ Powered by
        Copilot Studio
      </p>
    </div>
  </div>
</div>
```

#### Instructions への組み込み方

HTML テンプレート仕様は Instructions の末尾に追加する。
全文を Instructions に含めると長くなるため、**構造指示（セクション構成 + スタイル要件）** のみ含め、
サンプル HTML は含めない方針を推奨する。

```
## メール HTML テンプレート仕様（Step5 で使用）

メール本文は HTML 形式で作成する。インラインスタイルのみ使用。

### 構成
1. ヘッダー: 単色背景 #1e3a5f（グラデーション禁止）、白文字タイトル（ニュース内容を反映した動的見出し）、日付
2. エグゼクティブサマリー: 左青ボーダー、薄青背景(#eff6ff)の総括カード
3. 記事カード（各記事）:
   - 番号バッジ(青丸) + タイトル(18px 太字)
   - 🔗 元記事リンク
   - 📝 要約（灰背景 #f1f5f9）本文 3〜5 文
   - 🎯 選定理由（黄背景 #fef3c7）なぜこの記事が重要か
   - 💡 推奨アクション（緑背景 #dcfce7）箇条書き 2〜3 個
4. フッター: 自動生成の注記

### スタイル要件
- 最大幅 680px、角丸 16px、白背景カード
- フォント: Segoe UI, Helvetica Neue, Arial, sans-serif
- 各セクションは角丸 10px カードで視覚的に区切る
- 記事間は 1px の区切り線(#e2e8f0)、最後の記事には不要
```

> **エージェントの LLM は HTML テンプレート仕様から自律的にリッチな HTML を生成する。**
> サンプル HTML を逐語的に再現するのではなく、仕様に基づいて記事データを動的に組み込む。
