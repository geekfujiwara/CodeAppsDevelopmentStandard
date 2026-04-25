---
name: icon-creation
description: "Power Platform のアイコンを Pillow で PNG/SVG 生成し API 登録する。Copilot Studio エージェント・Dataverse テーブル・モデル駆動型アプリで共通利用。"
category: shared
triggers:
  - "アイコン作成"
  - "アイコン生成"
  - "icon"
  - "PNG"
  - "SVG"
  - "Pillow"
  - "iconbase64"
  - "colorIcon"
  - "outlineIcon"
  - "WebResource"
  - "IconVectorName"
  - "テーブルアイコン"
  - "エージェントアイコン"
  - "アプリアイコン"
---

# アイコン作成スキル

Power Platform の各コンポーネント（Copilot Studio エージェント・Dataverse テーブル・モデル駆動型アプリ）で使用するアイコンを **Pillow で生成し API で登録** する。

> **このスキルの位置づけ**: アイコンが必要なフェーズ（エージェント構築・テーブル構築・アプリ構築）から参照される共通スキル。アイコンの設計・生成・登録パターンを統一する。

## 前提

### 共通認証: auth_helper.py

`power-platform-standard` スキルの `auth_helper.py` をプロジェクトルートにコピーして使用する。

| 関数 | 用途 |
|------|------|
| `api_get(path)` | 既存リソース取得 |
| `api_post(path, body, solution=)` | WebResource・PublishXml 等の作成 |
| `api_patch(path, body)` | bots / applicationmanifestinformation の更新 |
| `api_request(path, body, method="PUT")` | EntityMetadata 更新（`MergeLabels: true` 自動付与） |

### 依存パッケージ

```
pip install Pillow azure-identity requests python-dotenv
```

## アイコン画像提案フロー（全用途共通）

アイコンが必要なコンポーネントの設計が承認されたら、**構築前にアイコン画像を提案**する。

### 提案方法

1. コンポーネントの目的・役割に合ったアイコンを **3〜4 パターン** テキストで提案
2. 各パターンに簡単な説明を付けて提示
3. ユーザーに選択してもらう
4. **選択されたパターンを Pillow で生成 → 用途に応じた形式で API 登録**

### アイコン設計ガイドライン

- **スタイル**: シンプルで視認性の高いデザイン。フラット or モダン
- **背景**: 角丸正方形（`rx="48" ry="48"`）。ブランドカラー推奨
- **モチーフ**: コンポーネントの目的を象徴するアイコン（例: インシデント管理 → 盾・ライトニング・レンチ）
- **バリエーション例**:
  - パターン A: 目的を象徴するアイコン + 企業カラー背景
  - パターン B: ロボット / AI エージェント風 + グラデーション
  - パターン C: ミニマル・モノライン + モダン
  - パターン D: キャラクター風 / 親しみやすいデザイン

## 用途別の形式・サイズ要件

| 用途 | 形式 | サイズ | 登録先 |
|------|------|--------|--------|
| Copilot Studio エージェント (メイン) | PNG | 240x240 | `bots.iconbase64` |
| Copilot Studio Teams colorIcon | PNG | 192x192 | `applicationmanifestinformation.teams.colorIcon` |
| Copilot Studio Teams outlineIcon | PNG (白い透明背景) | 32x32 | `applicationmanifestinformation.teams.outlineIcon` |
| Dataverse テーブルアイコン | SVG | 任意 | WebResource (type=11) → `EntityMetadata.IconVectorName` |
| モデル駆動型アプリアイコン | — | — | `appmodules.webresourceid`（デフォルト: `953b9fac-1e5e-e611-80d6-00155ded156f`） |

## 共通: Pillow PNG 生成コード

```python
from PIL import Image, ImageDraw, ImageFont
import io, base64

def draw_icon(size, transparent_bg=False, outline_only=False):
    """PNG アイコンを Pillow で描画する"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if not transparent_bg:
        # 角丸正方形の背景（ブランドカラーに変更する）
        radius = int(size * 0.2)
        draw.rounded_rectangle(
            [0, 0, size - 1, size - 1],
            radius=radius,
            fill=(30, 41, 59, 255),  # slate-800 — プロジェクトに合わせて変更
        )

    # ★ ここにモチーフを描画（シールド、歯車、ライトニング等）
    # draw.polygon(...)  # シールド形状
    # draw.line(...)     # ライトニング
    # draw.ellipse(...)  # 円形要素

    if outline_only:
        # outlineIcon: 白い線画のみ（背景透明）
        pass

    return img


def to_base64(img):
    """PIL Image → 生 Base64 PNG 文字列（data: prefix なし）"""
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')
```

## 用途別: Copilot Studio エージェントアイコン

### 要件

- **iconbase64**: `data:` prefix なしの生 Base64 PNG（任意サイズ、推奨 240x240）
- **colorIcon**: 192x192 PNG, < 100KB
- **outlineIcon**: 32x32 PNG, 白い透明背景
- 参照: https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/apps-package#app-icons

### 3 サイズ生成

```python
# 3 サイズ生成
icon_main = draw_icon(240)                                    # iconbase64 用
icon_color = draw_icon(192)                                   # colorIcon 用
icon_outline = draw_icon(32, transparent_bg=True, outline_only=True)  # outlineIcon 用
```

### API 登録

```python
import json
from auth_helper import api_get, api_patch

# ★ iconbase64 は data: prefix なしの生 Base64 PNG
icon_b64 = to_base64(icon_main)

# ★ bots PATCH には name フィールドが必須（省略すると 0x80040265 エラー）
bot_info = api_get(f"bots({bot_id})?$select=name")
api_patch(f"bots({bot_id})", {"name": bot_info["name"], "iconbase64": icon_b64})

# Teams マニフェストの colorIcon / outlineIcon を専用サイズで設定
bot_data = api_get(f"bots({bot_id})?$select=name,applicationmanifestinformation")
ami = json.loads(bot_data.get("applicationmanifestinformation", "{}") or "{}")
ami.setdefault("teams", {})["colorIcon"] = to_base64(icon_color)    # 192x192
ami["teams"]["outlineIcon"] = to_base64(icon_outline)                # 32x32
api_patch(f"bots({bot_id})", {
    "name": bot_info["name"],
    "applicationmanifestinformation": json.dumps(ami),
})
```

### エラーパターン

```
❌ SVG で登録 → Teams チャネルのアイコンが表示されない
❌ data:image/svg+xml;base64,... 形式 → Teams が受け付けない
❌ data:image/png;base64,... 形式 → PVA が受け付けない
❌ colorIcon と outlineIcon を同じ画像で登録 → outlineIcon は 32x32 白い透明背景が必要
❌ bots PATCH で name を省略 → "Empty or null bot name" エラー (0x80040265)
✅ PNG 形式で 3 サイズ生成（240, 192, 32）
✅ data: prefix なしの生 Base64 PNG で登録
✅ outlineIcon は白い透明背景の 32x32 PNG
✅ PATCH 時は必ず name フィールドを含める
```

## 用途別: Dataverse テーブルアイコン

テーブルアイコンは **SVG 形式** で WebResource として登録し、`EntityMetadata.IconVectorName` で参照する。

### SVG WebResource 作成

```python
import base64
from auth_helper import api_get, api_post, api_request
from dotenv import load_dotenv
import os

load_dotenv()
SOLUTION_NAME = os.getenv("SOLUTION_NAME")
PREFIX = os.getenv("PUBLISHER_PREFIX")

def create_svg_webresource(name, display_name, svg_content):
    """SVG を WebResource として作成し ID を返す"""
    # WebResource 名は publisher prefix + "/" + ファイル名
    wr_name = f"{PREFIX}_/icons/{name}.svg"

    # 既存チェック（べき等）
    existing = api_get(
        f"webresourceset?$filter=name eq '{wr_name}'&$select=webresourceid"
    )
    if existing.get("value"):
        wr_id = existing["value"][0]["webresourceid"]
        print(f"  既存 WebResource '{wr_name}' → {wr_id}")
        return wr_id

    svg_b64 = base64.b64encode(svg_content.encode("utf-8")).decode("ascii")
    body = {
        "name": wr_name,
        "displayname": display_name,
        "webresourcetype": 11,  # SVG
        "content": svg_b64,
    }
    wr_id = api_post("webresourceset", body, solution=SOLUTION_NAME)
    print(f"  WebResource '{wr_name}' 作成完了 → {wr_id}")
    return wr_id
```

### IconVectorName 設定（PUT + MergeLabels）

```python
def set_table_icon(table_logical, webresource_name):
    """テーブルの IconVectorName を設定する"""
    # EntityMetadata を取得
    data = api_get(
        f"EntityDefinitions(LogicalName='{table_logical}')"
        f"?$select=MetadataId,IconVectorName"
    )
    mid = data["MetadataId"]

    # PUT で更新（api_request は MergeLabels: true ヘッダーを自動付与）
    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "MetadataId": mid,
        "IconVectorName": webresource_name,  # WebResource の name（prefix_/icons/xxx.svg）
    }
    api_request(f"EntityDefinitions({mid})", body, method="PUT")
    print(f"  テーブル '{table_logical}' に IconVectorName='{webresource_name}' 設定完了")

    # テーブル単位で公開
    publish_xml = (
        '<importexportxml>'
        f'<entities><entity>{table_logical}</entity></entities>'
        '</importexportxml>'
    )
    api_post("PublishXml", {"ParameterXml": publish_xml})
```

### SVG デザインテンプレート

```python
# 角丸正方形背景 + シンプルモチーフの SVG テンプレート
def generate_table_svg(bg_color="#1e293b", icon_path_d="", viewbox_size=48):
    """テーブルアイコン用 SVG を生成する"""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {viewbox_size} {viewbox_size}">
  <rect width="{viewbox_size}" height="{viewbox_size}" rx="8" fill="{bg_color}"/>
  <path d="{icon_path_d}" fill="white"/>
</svg>'''

# 例: 歯車アイコン（設備管理テーブル）
gear_svg = generate_table_svg(
    bg_color="#0f766e",
    icon_path_d="M24 14.4l-1.2-.4c-.2-.6-.4-1.2-.8-1.8l.6-1-1.8-1.8-1 .6c-.6-.4-1.2-.6-1.8-.8L17.6 8h-2.4l-.4 1.2c-.6.2-1.2.4-1.8.8l-1-.6-1.8 1.8.6 1c-.4.6-.6 1.2-.8 1.8L8 14.4v2.4l1.2.4c.2.6.4 1.2.8 1.8l-.6 1 1.8 1.8 1-.6c.6.4 1.2.6 1.8.8l.4 1.2h2.4l.4-1.2c.6-.2 1.2-.4 1.8-.8l1 .6 1.8-1.8-.6-1c.4-.6.6-1.2.8-1.8l1.2-.4v-2.4zM16 19.2c-1.8 0-3.2-1.4-3.2-3.2s1.4-3.2 3.2-3.2 3.2 1.4 3.2 3.2-1.4 3.2-3.2 3.2z"
)
```

### エラーパターン

```
❌ webresourcetype を 11 以外にする → SVG として認識されない
❌ IconVectorName を PATCH で設定 → 反映されないケースがある
❌ WebResource 名に prefix なし → ソリューションに含まれない
✅ webresourcetype=11 (SVG)
✅ IconVectorName は PUT + MergeLabels で設定
✅ WebResource 名は {prefix}_/icons/{name}.svg 形式
✅ 設定後にテーブル単位で PublishXml
```

## 用途別: モデル駆動型アプリアイコン

### AppModule のアイコン

AppModule 作成時に `webresourceid` でアイコンを指定する。

```python
# システムデフォルトアイコン（カスタムアイコンが不要な場合）
DEFAULT_APP_ICON = "953b9fac-1e5e-e611-80d6-00155ded156f"

# カスタムアイコンを使う場合: SVG WebResource を作成して ID を指定
wr_id = create_svg_webresource("myapp_icon", "マイアプリアイコン", app_svg_content)

body = {
    "name": "マイアプリ",
    "uniquename": "MyApp",
    "clienttype": 4,
    "webresourceid": wr_id or DEFAULT_APP_ICON,
}
api_post("appmodules", body, solution=SOLUTION_NAME)
```

## 用途別: SiteMap VectorIcon（Generative Page 等）

SiteMap の SubArea には `VectorIcon` 属性でシステム SVG パスを指定できる。**カスタムアイコンの作成は不要**で、Fluent V9 の組み込みアイコンを参照する。

### 組み込みアイコンパス形式

```
/_imgs/TableIconsFluentV9/{icon_name}.svg
```

### よく使うアイコン例

| アイコン名 | 用途 |
|------------|------|
| `document_one_page_sparkle` | Generative Page |
| `home` | ホーム / ダッシュボード |
| `people` | ユーザー / チーム |
| `settings` | 設定 |
| `clipboard_task_list` | タスク管理 |
| `alert` | アラート / 通知 |
| `wrench` | メンテナンス / 設備 |
| `shield_checkmark` | セキュリティ / 品質 |

### SiteMap XML での使用例

```xml
<SubArea Id="sub_dashboard" GenPageId="{page-id}"
         VectorIcon="/_imgs/TableIconsFluentV9/document_one_page_sparkle.svg"
         AvailableOffline="true">
  <Titles>
    <Title LCID="1041" Title="ダッシュボード" />
  </Titles>
</SubArea>
```

## 絶対遵守ルール

| ルール | 理由 |
|--------|------|
| **Copilot Studio アイコンは PNG 形式** | SVG は Teams チャネルで表示されない |
| **Dataverse テーブルアイコンは SVG 形式** | `IconVectorName` は WebResource (type=11) を参照 |
| **`data:` prefix を付けない** | `bots.iconbase64` は生 Base64 PNG のみ受付 |
| **bots PATCH には name フィールド必須** | 省略すると 0x80040265 エラー |
| **outlineIcon は白い透明背景の 32x32 PNG** | Teams マニフェスト要件 |
| **IconVectorName は PUT で設定** | PATCH では反映されないケースあり。`MergeLabels: true` 必須 |
| **WebResource 名は `{prefix}_/icons/{name}.svg`** | ソリューション含有のため prefix 必須 |
| **テーブルアイコン設定後に PublishXml** | 公開しないと UI に反映されない |
| **アイコン提案は構築前に実施** | ユーザーに選択してもらってから生成 |
