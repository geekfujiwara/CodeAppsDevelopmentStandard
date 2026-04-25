---
name: code-apps-mail
description: "Code Apps からの PDF メール添付送信。HTML→PDF 変換（html2canvas + jsPDF）、Power Automate フローの ContentBytes 二重エンコード回避、UTC→JST 時刻変換の検証済みパターン。"
category: integration
triggers:
  - "メール送信"
  - "PDF添付"
  - "PDF生成"
  - "htmlToPdfBase64"
  - "SendEmailV2"
  - "ContentBytes"
  - "base64"
  - "添付ファイル"
  - "メール添付"
  - "PDF破損"
  - "UTC"
  - "JST"
  - "タイムゾーン"
  - "html2canvas"
  - "jsPDF"
---

# Code Apps メール送信スキル（PDF 添付）

Code Apps から Power Automate フロー経由で **PDF 添付メール** を送信するための検証済みパターン。
HTML 帳票を PDF に変換し、Dataverse Memo フィールド経由でフローに渡す方式。

> **2026-04-24 検証済み**: 作業前確認書（A4 ランドスケープ 1100px）・保守レポート（A4 ポートレート 1000px）の
> 両方で PDF 添付メール送信に成功。

## アーキテクチャ

```
Code Apps                          Power Automate                    Outlook
───────                            ──────────                        ───────
1. HTML テンプレート生成
2. html2canvas + jsPDF で PDF base64
3. Dataverse Memo 列に JSON 書き込み
   (pdfBase64 含む)
                                   4. Dataverse トリガーで検知
                                   5. JSON パース
                                   6. base64ToBinary() でバイナリ変換
                                   7. SendEmailV2 で PDF 添付送信
                                                                    8. 受信者が PDF を開く
```

## 絶対遵守ルール（検証済み教訓）

### 1. HTML → PDF 変換: iframe を使わない（最重要）

**Code Apps はサンドボックス iframe 内で実行される。**
隠し iframe を追加で作成すると cross-origin 制約で html2canvas が正常動作しない。

```
❌ NG: iframe を作成して HTML を書き込み → html2canvas(iframe.body)
✅ OK: DOMParser + hidden div → html2canvas(container)
```

**正しいパターン（DOMParser + hidden div）:**

```typescript
const parser = new DOMParser();
const parsed = parser.parseFromString(html, "text/html");

const container = document.createElement("div");
container.style.position = "fixed";
container.style.left = "-9999px";
container.style.top = "0";
container.style.width = `${renderWidth}px`;
container.style.background = "#fff";
container.style.zIndex = "-9999";

// <style> タグをコピー
parsed.querySelectorAll("style").forEach((s) => {
  const clone = document.createElement("style");
  clone.textContent = s.textContent;
  container.appendChild(clone);
});

// <body> の中身をコピー
const bodyClone = document.createElement("div");
bodyClone.innerHTML = parsed.body.innerHTML;
container.appendChild(bodyClone);

document.body.appendChild(container);
```

### 2. HTML の幅に応じて iframe/div 幅を動的調整

HTML テンプレートのコンテナ幅（例: `.sheet { width: 1100px }`）が A4 デフォルト幅 (794px) を超える場合、
キャプチャ幅を合わせないとコンテンツが切れて破損 PDF になる。

```typescript
function detectContentWidth(html: string): number {
  const matches = [...html.matchAll(/width\s*:\s*(\d{3,4})px/g)];
  if (matches.length === 0) return 794;
  const maxWidth = Math.max(...matches.map((m) => parseInt(m[1], 10)));
  return maxWidth > 794 ? maxWidth + 40 : 794; // padding 分を加算
}
```

### 3. ランドスケープ/ポートレートの自動検出

`@page { size: A4 landscape }` を正規表現で検出し、jsPDF の orientation と寸法を切り替える。

```typescript
function detectLandscape(html: string): boolean {
  return /size\s*:\s*A4\s+landscape/i.test(html);
}

const isLandscape = detectLandscape(html);
const orientation = isLandscape ? "landscape" : "portrait";
const pageWidth = isLandscape ? 297 : 210;   // mm
const pageHeight = isLandscape ? 210 : 297;
```

### 4. html2canvas パラメータ

```typescript
const canvas = await html2canvas(container, {
  scale: 1.5,           // 2 だとファイルサイズが大きすぎる（Memo 1MB 制限）
  useCORS: true,
  allowTaint: true,
  logging: false,
  width: renderWidth,
  windowWidth: renderWidth,
  backgroundColor: "#ffffff",
});
```

| パラメータ | 値 | 理由 |
|---|---|---|
| `scale` | 1.5 | 2 だと PDF が ~500KB-1MB 超。1.5 で十分な品質 |
| `useCORS` | true | 外部画像（署名 data URL 等）を正しくキャプチャ |
| `allowTaint` | true | data: URL 画像のレンダリングを許可 |

### 5. base64 変換: Blob → FileReader（安全な方式）

`btoa()` は大きなバイナリ文字列でスタックオーバーフローする可能性がある。
`pdf.output("datauristring").split(",")[1]` も不安定。

**正しいパターン（Blob → FileReader）:**

```typescript
const blob = pdf.output("blob");
return new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const dataUrl = reader.result as string;
    const base64 = dataUrl.split(",")[1];
    if (!base64 || base64.length < 100) {
      reject(new Error("PDF base64 conversion failed"));
      return;
    }
    resolve(base64);
  };
  reader.onerror = () => reject(new Error("FileReader error"));
  reader.readAsDataURL(blob);
});
```

### 6. JPEG 品質は 0.7 で十分

```typescript
const imgData = canvas.toDataURL("image/jpeg", 0.7);
```

0.85 だとファイルサイズが大きくなりすぎる。0.7 で視認性に問題なし。

---

## Power Automate フロー側の教訓

### 7. ContentBytes は `base64ToBinary()` で渡す（最重要）

**SendEmailV2 の Attachments.ContentBytes に `@{...}` 文字列補間で base64 を渡すと二重エンコードされる。**
Power Automate は ContentBytes を「テキスト」と解釈し、さらに base64 エンコードしてしまう。
結果、受信者が開くと base64 テキスト文字列が見えるだけで PDF として認識されない。

```
❌ NG: "ContentBytes": "@{json(...)['pdfBase64']}"
         → 文字列補間 → PA が再 base64 → 二重エンコード → PDF 破損

✅ OK: "ContentBytes": "@base64ToBinary(json(...)['pdfBase64'])"
         → base64 をバイナリに変換 → PA がそのまま添付 → 正常な PDF
```

**Python フロー定義コード:**

```python
# ❌ NG
"ContentBytes": f"@{{{J}?['pdfBase64']}}",

# ✅ OK
"ContentBytes": f"@base64ToBinary({J}?['pdfBase64'])",
```

### 8. メール本文の時刻は JST（convertTimeZone 必須）

Power Automate の `utcNow()` は UTC を返す。日本のユーザー向けには JST に変換が必要。

```
❌ NG: @{utcNow('yyyy年MM月dd日 HH:mm')}
         → UTC 時刻が表示される（日本時間より 9 時間ずれる）

✅ OK: @{convertTimeZone(utcNow(),'UTC','Tokyo Standard Time','yyyy年MM月dd日 HH:mm')}
         → JST で正しい時刻が表示される
```

**Python フロー定義コード:**

```python
# ❌ NG
f"@{{utcNow('yyyy年MM月dd日 HH:mm')}}"

# ✅ OK
f"@{{convertTimeZone(utcNow(),'UTC','Tokyo Standard Time','yyyy年MM月dd日 HH:mm')}}"
```

> **注意**: `utcNow()` を Dataverse のタイムスタンプ列に書き込む場合は UTC のまま。
> Dataverse が自動的にユーザーのタイムゾーンで表示する。JST 変換が必要なのは **表示用テキスト** のみ。

### 9. Dataverse Memo フィールドの 1MB 制限

`rcwr_pendingemailjson` (Memo, MaxLength=1048576) に JSON を書き込む。
PDF base64 が含まれるため、`scale: 1.5` + `JPEG 0.7` でファイルサイズを抑制する必要がある。

**見積もり:**

| 帳票 | HTML 幅 | scale | JPEG 品質 | PDF base64 サイズ |
|---|---|---|---|---|
| 作業前確認書 (landscape) | 1100px | 1.5 | 0.7 | ~200-400KB |
| 保守レポート (portrait) | 1000px | 1.5 | 0.7 | ~150-300KB |
| JSON ヘッダー | - | - | - | ~1KB |

1MB 制限内に収まる。`scale: 2` + `JPEG 0.85` だと 500KB-1MB 超で危険。

---

## データフロー全体像

### Code Apps 側（sendEmail 関数）

```typescript
// 1. HTML テンプレート生成
const html = generatePreWorkConfirmationHtml({ ... });

// 2. PDF base64 変換
const pdfBase64 = await htmlToPdfBase64(html);

// 3. Dataverse Memo 列に JSON 書き込み（フローがトリガーされる）
await client.updateRecordAsync("bookableresourcebookings", bookingId, {
  rcwr_pendingemailjson: JSON.stringify({
    documentType: "prework",
    toEmail,
    subject: "作業前確認書 — WO-001",
    customerName: "株式会社○○",
    workOrderName: "WO-001",
    resourceName: "鈴木 正平",
    pdfBase64,
  }),
});
```

### Power Automate 側（Dataverse トリガーフロー）

```
トリガー: bookableresourcebooking.rcwr_pendingemailjson 更新時
  ↓
条件: pendingemailjson が空でない
  ↓
SendEmailV2:
  To: json(...)['toEmail']
  Subject: json(...)['subject']
  Body: HTML メールテンプレート
  Attachments:
    Name: 作業前確認書.pdf / 保守レポート.pdf（documentType で分岐）
    ContentBytes: @base64ToBinary(json(...)['pdfBase64'])   ← ★ 必須
  ↓
Dataverse Update: タイムスタンプ更新 + pendingemailjson をクリア
```

---

## トラブルシューティング

| 症状 | 原因 | 対策 |
|---|---|---|
| PDF が破損（開けない） | ContentBytes の二重 base64 エンコード | `@base64ToBinary()` を使う |
| PDF 内に base64 テキストが見える | 同上 | 同上 |
| PDF の右側が切れている | html2canvas のキャプチャ幅が HTML コンテナ幅より小さい | `detectContentWidth()` で動的調整 |
| PDF が空白ページ | iframe 内で html2canvas が失敗 | DOMParser + hidden div 方式に変更 |
| メール時刻が 9 時間ずれる | `utcNow()` が UTC | `convertTimeZone(...,'Tokyo Standard Time')` |
| PDF ファイルサイズが大きすぎる | scale=2, JPEG 0.85 | scale=1.5, JPEG 0.7 に下げる |
| Memo 列に書き込み失敗 | JSON が 1MB 超 | scale/JPEG 品質を下げる |

---

## 依存パッケージ

```json
{
  "jspdf": "^4.2.1",
  "html2canvas": "^1.4.1"
}
```
