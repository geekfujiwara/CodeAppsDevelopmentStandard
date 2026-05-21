# メール・Teams 通知デザインテンプレート

フロー設計時、通知メールや Teams 投稿の HTML は本ファイルのテンプレートを**デフォルトで適用する**。
ユーザーから特別な指定がない限り、このデザインを使う。

## 設計原則

```
✅ テーブルレイアウト（email クライアント互換性）
✅ インラインスタイルのみ（<style> ブロックは Gmail 等で除去される）
✅ システムフォント（-apple-system, 'Segoe UI', sans-serif）
✅ 最大幅 600px + 中央寄せ（モバイル対応）
✅ ソリッドカラー + ボーダー（確実に描画される）
✅ ダークモード考慮（背景白 #ffffff、テキスト黒 #1f2937）

❌ CSS グラデーション（Outlook/Gmail で描画されない）
❌ flexbox / grid（メールクライアント非対応）
❌ 外部 CSS / <style> タグ（除去されるリスク）
❌ 外部画像（ブロックされるリスク）
❌ rem / em 単位（px のみ使用）
```

---

## メール通知テンプレート（標準）

レコード変更通知・登録通知・ステータス変更通知など汎用。

```python
# Python f-string 内で Power Automate 式を使う場合:
#   @{...} の {} は f-string の {{}} でエスケープ
#   PREFIX 変数部分だけ f-string で展開

EMAIL_BODY = (
    '<html>'
    '<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,\'Segoe UI\',sans-serif;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">'
    '<tr><td align="center" style="padding:32px 16px;">'
    # ── メインカード ──
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; border:1px solid #e5e7eb; max-width:600px; width:100%;">'
    # ── ヘッダー ──
    '<tr>'
    '<td style="padding:24px 32px 16px 32px; border-bottom:2px solid #2563eb;">'
    '<h1 style="margin:0; font-size:20px; font-weight:700; color:#1e40af;">'
    '📋 {title}'
    '</h1>'
    '</td>'
    '</tr>'
    # ── サブタイトル ──
    '<tr>'
    '<td style="padding:16px 32px 8px 32px;">'
    '<p style="margin:0; font-size:14px; color:#6b7280;">{subtitle}</p>'
    '</td>'
    '</tr>'
    # ── データテーブル ──
    '<tr>'
    '<td style="padding:8px 32px 24px 32px;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:6px; border-collapse:separate; overflow:hidden;">'
    '{table_rows}'
    '</table>'
    '</td>'
    '</tr>'
    # ── フッター ──
    '<tr>'
    '<td style="padding:16px 32px 24px 32px; border-top:1px solid #f3f4f6;">'
    '<p style="margin:0; font-size:12px; color:#9ca3af;">このメールは Power Automate から自動送信されています。</p>'
    '</td>'
    '</tr>'
    '</table>'
    # ── /メインカード ──
    '</td></tr>'
    '</table>'
    '</body>'
    '</html>'
)
```

### テーブル行テンプレート

```python
# 各行のテンプレート（偶数行に薄いグレー背景）
def table_row(label: str, value: str, is_even: bool = False) -> str:
    bg = "#f9fafb" if is_even else "#ffffff"
    return (
        f'<tr>'
        f'<td style="padding:12px 16px; background-color:{bg}; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
        f'<span style="font-size:13px; font-weight:600; color:#374151;">{label}</span>'
        f'</td>'
        f'<td style="padding:12px 16px; background-color:{bg}; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
        f'<span style="font-size:14px; color:#1f2937;">{value}</span>'
        f'</td>'
        f'</tr>'
    )
```

### 完成例（商談登録通知）

```python
# Power Automate フロー定義内での使用例
email_body = (
    '<html>'
    '<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,\'Segoe UI\',sans-serif;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">'
    '<tr><td align="center" style="padding:32px 16px;">'
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; border:1px solid #e5e7eb; max-width:600px; width:100%;">'
    # ヘッダー
    '<tr>'
    '<td style="padding:24px 32px 16px 32px; border-bottom:2px solid #2563eb;">'
    '<h1 style="margin:0; font-size:20px; font-weight:700; color:#1e40af;">📋 新規商談が登録されました</h1>'
    '</td>'
    '</tr>'
    # サブタイトル
    '<tr>'
    '<td style="padding:16px 32px 8px 32px;">'
    '<p style="margin:0; font-size:14px; color:#6b7280;">以下の商談が新たに登録されました。内容を確認してください。</p>'
    '</td>'
    '</tr>'
    # データテーブル
    '<tr>'
    '<td style="padding:8px 32px 24px 32px;">'
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:6px; border-collapse:separate; overflow:hidden;">'
    # 行 1（白背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">商談名</span></td>'
    f'<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6;">'
    f'<span style="font-size:14px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_name\']}}</span></td>'
    '</tr>'
    # 行 2（グレー背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">顧客</span></td>'
    f'<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6;">'
    f'<span style="font-size:14px; color:#1f2937;">@{{outputs(\'Get_Customer\')?[\'body/{PREFIX}_name\']}}</span></td>'
    '</tr>'
    # 行 3（白背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">フェーズ</span></td>'
    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6;">'
    '<span style="font-size:14px; color:#1f2937;">@{outputs(\'Compose_Stage\')}</span></td>'
    '</tr>'
    # 行 4（グレー背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">金額</span></td>'
    f'<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6;">'
    f'<span style="font-size:14px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_amount\']}} 円</span></td>'
    '</tr>'
    # 行 5（白背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">確度</span></td>'
    f'<td style="padding:12px 16px; background-color:#ffffff; border-bottom:1px solid #f3f4f6;">'
    f'<span style="font-size:14px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_probability\']}}%</span></td>'
    '</tr>'
    # 行 6（グレー背景）
    '<tr>'
    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6; width:140px;">'
    '<span style="font-size:13px; font-weight:600; color:#374151;">登録者</span></td>'
    '<td style="padding:12px 16px; background-color:#f9fafb; border-bottom:1px solid #f3f4f6;">'
    '<span style="font-size:14px; color:#1f2937;">@{outputs(\'Get_Creator\')?[\'body/fullname\']}</span></td>'
    '</tr>'
    '</table>'
    '</td>'
    '</tr>'
    # フッター
    '<tr>'
    '<td style="padding:16px 32px 24px 32px; border-top:1px solid #f3f4f6;">'
    '<p style="margin:0; font-size:12px; color:#9ca3af;">このメールは Power Automate から自動送信されています。</p>'
    '</td>'
    '</tr>'
    '</table>'
    '</td></tr>'
    '</table>'
    '</body>'
    '</html>'
)
```

---

## メール通知テンプレート（アラート / 警告）

期限切れ通知・リスクアラート・エスカレーション等、注意を引く必要がある場合。

```python
# ヘッダー部分のカラーを変更するだけでアラート感を出す
# border-bottom と h1 の color を変更

# ── 通常（青系）──
# border-bottom: 2px solid #2563eb
# color: #1e40af
# アイコン: 📋

# ── 警告（オレンジ系）──
# border-bottom: 2px solid #ea580c
# color: #c2410c
# アイコン: ⚠️

# ── 緊急（赤系）──
# border-bottom: 2px solid #dc2626
# color: #b91c1c
# アイコン: 🚨

# ── 成功（緑系）──
# border-bottom: 2px solid #16a34a
# color: #15803d
# アイコン: ✅
```

### カラーバリエーション早見表

| 種別   | border-bottom    | h1 color  | アイコン | 用途                           |
| ------ | ---------------- | --------- | -------- | ------------------------------ |
| 通常   | `#2563eb` (blue) | `#1e40af` | 📋       | レコード作成・変更通知         |
| 情報   | `#7c3aed` (紫)   | `#6d28d9` | 💡       | AI分析結果・レポート通知       |
| 成功   | `#16a34a` (緑)   | `#15803d` | ✅       | 完了通知・承認完了             |
| 警告   | `#ea580c` (橙)   | `#c2410c` | ⚠️       | 期限接近・リスク検知           |
| 緊急   | `#dc2626` (赤)   | `#b91c1c` | 🚨       | SLA違反・緊急エスカレーション |

---

## メール通知テンプレート（ステータスバッジ付き）

ステータス変更通知など、値に色付きバッジを表示したい場合。

```python
# バッジ生成ヘルパー
def status_badge(label: str, color: str) -> str:
    """インラインバッジ（メールクライアント互換）"""
    colors = {
        "blue":   ("background-color:#dbeafe; color:#1e40af; border:1px solid #93c5fd;"),
        "green":  ("background-color:#dcfce7; color:#15803d; border:1px solid #86efac;"),
        "yellow": ("background-color:#fef9c3; color:#a16207; border:1px solid #fde047;"),
        "red":    ("background-color:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;"),
        "gray":   ("background-color:#f3f4f6; color:#374151; border:1px solid #d1d5db;"),
        "purple": ("background-color:#f3e8ff; color:#6b21a8; border:1px solid #c4b5fd;"),
    }
    style = colors.get(color, colors["gray"])
    return (
        f'<span style="display:inline-block; padding:4px 12px; border-radius:12px; '
        f'font-size:12px; font-weight:600; {style}">{label}</span>'
    )

# Power Automate 式での動的バッジ（if 式で色分け）
# → Compose アクションで HTML バッジを構築し、メール本文に埋め込む
```

### ステータスバッジの Power Automate 式パターン

```
フロー内で Compose アクションを使い、ステータス値に応じたバッジ HTML を生成する:

Compose_Status_Badge:
  @if(equals(triggerOutputs()?['body/prefix_status'],100000000),
    '<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background-color:#dbeafe;color:#1e40af;border:1px solid #93c5fd;">新規</span>',
  if(equals(triggerOutputs()?['body/prefix_status'],100000001),
    '<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background-color:#fef9c3;color:#a16207;border:1px solid #fde047;">対応中</span>',
  if(equals(triggerOutputs()?['body/prefix_status'],100000002),
    '<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background-color:#dcfce7;color:#15803d;border:1px solid #86efac;">完了</span>',
    '<span style="display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;background-color:#f3f4f6;color:#374151;border:1px solid #d1d5db;">不明</span>')))

メール本文のテーブル行内に挿入:
  <span style="font-size:14px; color:#1f2937;">@{outputs('Compose_Status_Badge')}</span>
```

---

## Teams チャネル通知テンプレート

Teams の `messageBody` は制限的な HTML サブセットのみ対応。
複雑なテーブルスタイルは無視されるため、シンプルに保つ。

```python
# Teams で確実に描画される要素:
#   h1-h3, p, b, i, a, br, hr, table, tr, td, th, ul, li, img
#   ※ style 属性は一部のみ対応（color, background-color 程度）

TEAMS_BODY = (
    '<h3 style="color:#1e40af;">📋 {title}</h3>'
    '<p style="color:#6b7280; font-size:14px;">{subtitle}</p>'
    '<hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0;">'
    '<table style="border-collapse:collapse; width:100%;">'
    '{table_rows}'
    '</table>'
    '<br>'
    '<p style="color:#9ca3af; font-size:12px;">Power Automate 自動通知</p>'
)
```

### Teams テーブル行テンプレート

```python
def teams_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:6px 8px; color:#374151;"><b>{label}</b></td>'
        f'<td style="padding:6px 8px; color:#1f2937;">{value}</td>'
        f'</tr>'
    )
```

### 完成例（Teams チャネル通知）

```python
teams_body = (
    '<h3 style="color:#1e40af;">📋 新規商談が登録されました</h3>'
    '<p style="color:#6b7280; font-size:14px;">以下の商談が新たに登録されました。</p>'
    '<hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0;">'
    '<table style="border-collapse:collapse; width:100%;">'
    f'<tr><td style="padding:6px 8px; color:#374151;"><b>商談名</b></td>'
    f'<td style="padding:6px 8px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_name\']}}</td></tr>'
    f'<tr><td style="padding:6px 8px; color:#374151;"><b>顧客</b></td>'
    f'<td style="padding:6px 8px; color:#1f2937;">@{{outputs(\'Get_Customer\')?[\'body/{PREFIX}_name\']}}</td></tr>'
    '<tr><td style="padding:6px 8px; color:#374151;"><b>フェーズ</b></td>'
    '<td style="padding:6px 8px; color:#1f2937;">@{outputs(\'Compose_Stage\')}</td></tr>'
    f'<tr><td style="padding:6px 8px; color:#374151;"><b>金額</b></td>'
    f'<td style="padding:6px 8px; color:#1f2937;">@{{triggerOutputs()?[\'body/{PREFIX}_amount\']}} 円</td></tr>'
    '</table>'
    '<br>'
    '<p style="color:#9ca3af; font-size:12px;">Power Automate 自動通知</p>'
)
```

---

## Teams 1:1 チャット通知テンプレート

Teams の 1:1 チャット（Chat with Flow bot）用。チャネルと同じ HTML サブセット。

```python
TEAMS_CHAT_BODY = (
    '<h3 style="color:#1e40af;">🔔 {title}</h3>'
    '<p>{message}</p>'
    '<hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0;">'
    '<table style="border-collapse:collapse; width:100%;">'
    '{table_rows}'
    '</table>'
)
```

---

## デプロイスクリプトでの使い方

```python
def build_email_body(title: str, subtitle: str, rows: list[tuple[str, str]], variant: str = "normal") -> str:
    """通知メール HTML を生成する汎用ヘルパー

    Args:
        title: ヘッダータイトル（アイコン含む）
        subtitle: サブタイトル（説明文）
        rows: [(ラベル, 値), ...] のリスト
        variant: "normal" | "warning" | "urgent" | "success" | "info"
    """
    VARIANTS = {
        "normal":  {"border": "#2563eb", "color": "#1e40af"},
        "info":    {"border": "#7c3aed", "color": "#6d28d9"},
        "success": {"border": "#16a34a", "color": "#15803d"},
        "warning": {"border": "#ea580c", "color": "#c2410c"},
        "urgent":  {"border": "#dc2626", "color": "#b91c1c"},
    }
    v = VARIANTS.get(variant, VARIANTS["normal"])

    # テーブル行を構築
    table_html = ""
    for i, (label, value) in enumerate(rows):
        bg = "#f9fafb" if i % 2 == 1 else "#ffffff"
        table_html += (
            f'<tr>'
            f'<td style="padding:12px 16px; background-color:{bg}; border-bottom:1px solid #f3f4f6; width:140px; vertical-align:top;">'
            f'<span style="font-size:13px; font-weight:600; color:#374151;">{label}</span></td>'
            f'<td style="padding:12px 16px; background-color:{bg}; border-bottom:1px solid #f3f4f6; vertical-align:top;">'
            f'<span style="font-size:14px; color:#1f2937;">{value}</span></td>'
            f'</tr>'
        )

    return (
        '<html>'
        '<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,\'Segoe UI\',sans-serif;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">'
        '<tr><td align="center" style="padding:32px 16px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; border:1px solid #e5e7eb; max-width:600px; width:100%;">'
        f'<tr><td style="padding:24px 32px 16px 32px; border-bottom:2px solid {v["border"]};">'
        f'<h1 style="margin:0; font-size:20px; font-weight:700; color:{v["color"]};">{title}</h1>'
        '</td></tr>'
        '<tr><td style="padding:16px 32px 8px 32px;">'
        f'<p style="margin:0; font-size:14px; color:#6b7280;">{subtitle}</p>'
        '</td></tr>'
        '<tr><td style="padding:8px 32px 24px 32px;">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:6px; border-collapse:separate; overflow:hidden;">'
        f'{table_html}'
        '</table>'
        '</td></tr>'
        '<tr><td style="padding:16px 32px 24px 32px; border-top:1px solid #f3f4f6;">'
        '<p style="margin:0; font-size:12px; color:#9ca3af;">このメールは Power Automate から自動送信されています。</p>'
        '</td></tr>'
        '</table>'
        '</td></tr>'
        '</table>'
        '</body>'
        '</html>'
    )


def build_teams_body(title: str, subtitle: str, rows: list[tuple[str, str]]) -> str:
    """Teams チャネル/チャット通知 HTML を生成する汎用ヘルパー"""
    table_html = ""
    for label, value in rows:
        table_html += (
            f'<tr><td style="padding:6px 8px; color:#374151;"><b>{label}</b></td>'
            f'<td style="padding:6px 8px; color:#1f2937;">{value}</td></tr>'
        )

    return (
        f'<h3 style="color:#1e40af;">{title}</h3>'
        f'<p style="color:#6b7280; font-size:14px;">{subtitle}</p>'
        '<hr style="border:none; border-top:1px solid #e5e7eb; margin:8px 0;">'
        '<table style="border-collapse:collapse; width:100%;">'
        f'{table_html}'
        '</table>'
        '<br>'
        '<p style="color:#9ca3af; font-size:12px;">Power Automate 自動通知</p>'
    )
```

---

## AI がフロー設計書を作成する際の適用ルール

```
1. メール通知アクションが含まれるフローでは、必ず本テンプレートのデザインを適用する
2. ユーザーから「シンプルにしてほしい」等の指定がない限り、標準テンプレート（テーブル行付き）を使う
3. variant（通常/警告/緊急/成功）はフローの目的から自動判定:
   - レコード作成/変更通知 → "normal"（青）
   - AI 分析結果/レポート → "info"（紫）
   - 完了/承認通知 → "success"（緑）
   - 期限接近/リスク → "warning"（橙）
   - SLA 違反/エスカレーション → "urgent"（赤）
4. Teams 通知は Teams テンプレートを使う（Email テンプレートは使わない）
5. フロー定義の Python コード内で build_email_body() / build_teams_body() ヘルパーを使える
   が、最終的にフロー定義の JSON に埋め込む文字列は Power Automate 式 (@{...}) を含む
   ため、ヘルパーの出力をテンプレートとして使い、動的値の部分を式に置き換える
```
