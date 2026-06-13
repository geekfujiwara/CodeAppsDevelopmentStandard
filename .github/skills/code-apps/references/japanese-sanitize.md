# 日本語 DisplayName サニタイズエラーの回避

## 問題

テーブルの日本語表示名で `Failed to sanitize string 会話サマリー` エラーが発生する。

| ツール | 原因 | 回避策 |
|---|---|---|
| `npx power-apps add-data-source` | `nameUtils.js` が ASCII のみ許容 | `patch-nameutils.cjs` で CJK 許容パッチ |
| `pac code add-data-source` | PAC CLI .NET 内蔵ランタイム（パッチ不可） | `toggle_table_lang.py` で英語切替 |

## 推奨手順（pac code add-data-source 使用時）

```bash
# 1. テーブル表示名を英語に切替
python scripts/toggle_table_lang.py en

# 2. データソース追加
pac code add-data-source -a dataverse -t {table_logical_name}

# 3. テーブル表示名を日本語に復元
python scripts/toggle_table_lang.py jp
```

テンプレートスクリプトは `.github/skills/code-apps/scripts/toggle_table_lang.py` に配置。
プロジェクト初期化時に `scripts/toggle_table_lang.py` にコピーし、TABLES リストを編集する。

## toggle_table_lang.py テンプレート

```python
"""
テーブル表示名を英語⇔日本語で切り替えるユーティリティ。
pac code add-data-source の日本語サニタイズ問題の回避用。
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
from auth_helper import api_get, api_request
load_dotenv()

PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX:
    raise SystemExit("PUBLISHER_PREFIX が .env に設定されていません。")

# ── プロジェクト固有: テーブル定義 ──
# (論理名, 英語DisplayName, 英語Plural, 日本語DisplayName, 日本語Plural)
TABLES = [
    # (f"{PREFIX}_customer", "Customer", "Customers", "顧客", "顧客一覧"),
]

def label_en(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1033}]}

def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}

def set_display_names(to_english=True):
    for logical, en_disp, en_plural, jp_disp, jp_plural in TABLES:
        data = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")
        mid = data["MetadataId"]
        lbl = label_en if to_english else label_jp
        disp = en_disp if to_english else jp_disp
        plural = en_plural if to_english else jp_plural
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
            "MetadataId": mid,
            "DisplayName": lbl(disp),
            "DisplayCollectionName": lbl(plural),
        }
        api_request(f"EntityDefinitions({mid})", body, method="PUT")
        print(f"  {logical} → {disp} / {plural}")

if __name__ == "__main__":
    if not TABLES:
        print("TABLES が空です。スクリプト内のテーブル定義を編集してください。")
        sys.exit(1)
    mode = sys.argv[1] if len(sys.argv) > 1 else "en"
    if mode == "en":
        print("=== テーブル表示名を英語に変更 ===")
        set_display_names(to_english=True)
    elif mode == "jp":
        print("=== テーブル表示名を日本語に復元 ===")
        set_display_names(to_english=False)
    else:
        print("Usage: python scripts/toggle_table_lang.py [en|jp]")
```

## フォールバック: npx power-apps add-data-source 用パッチ

`npx power-apps add-data-source` を使う場合は、このスキル同梱の [`patch-nameutils.cjs`](patch-nameutils.cjs) で Node.js パッチを適用する。
`node_modules/@microsoft/power-apps-actions/.../nameUtils.js` の文字許容パターンに CJK 等を追加する。

```bash
# プロジェクトルート（node_modules がある場所）で実行する
node .github/skills/code-apps/references/patch-nameutils.cjs
```

> `npm install` 後に毎回 `node .github/skills/code-apps/references/patch-nameutils.cjs` を実行する必要がある
> （`node_modules` が再生成されパッチが消えるため）。スクリプト実体はこのスキルに同梱され、`.github/` 同期でテーマに配布される。

## スキーマ名は英語のみ

```
✅ テーブル: {prefix}_yourtable  列: {prefix}_description
❌ テーブル: {prefix}_テーブル名  列: {prefix}_説明
→ 日本語スキーマ名は pac code add-data-source で失敗する
```
