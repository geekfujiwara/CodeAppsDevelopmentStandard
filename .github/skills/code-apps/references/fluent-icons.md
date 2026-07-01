# Fluent UI v2 アイコン（@fluentui/react-icons）

Code Apps で **Fluent UI v2（Fluent 2 / Fluent System Icons）** のアイコンを使うための導入・使用・検索方法。
Microsoft 製品と揃った見た目にしたいときに使う。

> **標準は lucide-react**: shadcn/ui の内部（`src/components/ui/*`）は lucide-react に依存しているため **そのまま残す**。
> Fluent アイコンは**アプリ側の UI（ナビ・ボタン・ヘッダー・カード等）で lucide と共存**させる。丸ごと置き換えない。

---

## 1. インストール

```bash
npm i @fluentui/react-icons
```

- **CSP 安全**: 各アイコンは npm でバンドルされる React 製 SVG コンポーネント。外部 fetch は発生しない（Google Fonts のような外部通信なし）。
- **必ず名前指定 import**（tree-shaking）: `import * as Icons from ...` は禁止。バンドルが数 MB に膨らむ。

---

## 2. アイコン名の規則

Fluent のアイコン名は **`{Name}{Size}{Variant}`** で構成される。

| 要素 | 値 |
|---|---|
| Name | 機能名（`Add` / `Delete` / `Person` / `Home` / `Search` …、英語） |
| Size | `16` / `20` / `24` / `28` / `32` / `48`（デザイン基準サイズ） |
| Variant | `Regular`（既定）/ `Filled`（選択・アクティブ状態向け） |

例: `Add24Regular`、`Delete20Regular`、`Home24Filled`

- **既定は 24 + Regular**。小さめの行内アイコンは 20、大きな見出しは 32。
- **Filled は「選択中／アクティブ」状態**に使い分ける（通常は Regular）。

---

## 3. 使い方

```tsx
import { Add24Regular, Search20Regular } from "@fluentui/react-icons";

export function Toolbar() {
  return (
    <div className="flex items-center gap-2">
      <button className="inline-flex items-center gap-1">
        <Add24Regular />
        追加
      </button>
      <Search20Regular className="text-muted-foreground" />
    </div>
  );
}
```

### サイズと色

- **色**: 既定で `fill="currentColor"`。親の `text-*`（Tailwind）や CSS の `color` がそのまま反映される → **色はハードコードしない**。
- **サイズ**: 基本は名前のサイズ（例 `24`）で決まる。微調整したいときは `className` / `style` で `width`/`height` を上書きできる。
  ```tsx
  <Add24Regular style={{ width: 18, height: 18 }} />
  ```
- **primaryFill prop**: 明示的に色を変えたいときは `<Add24Regular primaryFill="var(--primary)" />`（原則は currentColor 推奨）。

### shadcn ボタンと組み合わせる

```tsx
import { Button } from "@/components/ui/button";
import { Add24Regular } from "@fluentui/react-icons";

<Button size="sm"><Add24Regular className="mr-1 size-4" />新規作成</Button>
```

> `size-4`（=16px）等で lucide アイコンと視覚的な大きさを揃えると混在しても違和感が出ない。

---

## 4. 適切なアイコンを探す（検索スキル）

### 方法 A: 検索スクリプト（推奨・インストール済みバージョンに一致）

キーワード（英語）から、インストール済みの `@fluentui/react-icons` に存在するアイコン名を検索する。

```bash
node .github/skills/code-apps/scripts/find_fluent_icon.mjs <keyword> [--size 24] [--variant Regular|Filled] [--limit 40]
```

例:

```bash
node .github/skills/code-apps/scripts/find_fluent_icon.mjs add
node .github/skills/code-apps/scripts/find_fluent_icon.mjs delete --size 20 --variant Regular
node .github/skills/code-apps/scripts/find_fluent_icon.mjs person
```

出力は base 名ごとに「利用可能なサイズ／バリアント」と、そのまま貼れる import 文を表示する:

```
● Add  (size: 16, 20, 24, 28, 32, 48 / Regular/Filled)
   import { Add24Regular } from "@fluentui/react-icons";
```

> **前提**: プロジェクトに `@fluentui/react-icons` がインストール済みであること（手順 1）。
> インストール済みパッケージを走査するため、**バージョンに存在するアイコンだけ**が返る（存在しない名前を import してビルドエラーになる事故を防げる）。

### 方法 B: 公式カタログ（ブラウザ）

- 公式アイコンカタログ: https://react.fluentui.dev/?path=/docs/icons-catalog--docs
- Fluent System Icons リポジトリ: https://github.com/microsoft/fluentui-system-icons

キーワードで検索 → 名前をコピー（例 `Add`）→ 手順 2 の規則でサイズ・バリアントを付ける。

### アイコン選定のガイド

| 用途 | 候補（英語キーワード） |
|---|---|
| 追加・新規 | `Add` |
| 編集 | `Edit` |
| 削除 | `Delete` |
| 検索 | `Search` |
| 更新・再読込 | `ArrowClockwise` |
| 設定 | `Settings` |
| ユーザー | `Person` / `People` |
| ホーム | `Home` |
| ダッシュボード | `Board` / `DataBarVertical` |
| ドキュメント | `Document` |
| 通知 | `Alert` |
| フィルタ | `Filter` |
| メニュー | `Navigation`（ハンバーガー） |

迷ったら **方法 A のスクリプトでキーワード検索**して、実在する名前から選ぶ。

---

## 5. 注意点

- **shadcn 内部を Fluent に置換しない**: `src/components/ui/*` の lucide import はそのまま。壊すとコンポーネントが動かない。
- **import は個別指定のみ**（`import * as` 禁止）。バンドルサイズと CSP（外部通信なし）の両面で重要。
- **色は currentColor 基調**: `--primary` 等のパレット変数と `text-*` で色を当て、[カラーパレット集](color-palettes.md) と整合させる。
- **サイズを揃える**: lucide（既定 24、`size-4` 等）と混在するときは `className="size-4"` 等で見た目を統一する。
