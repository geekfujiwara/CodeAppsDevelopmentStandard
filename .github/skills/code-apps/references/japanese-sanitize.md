# 日本語 DisplayName サニタイズエラーの回避

## 問題

テーブルの日本語表示名で `Failed to sanitize string 会話サマリー` エラーが発生する。

| ツール | 原因 | 回避策 |
|---|---|---|
| `npx power-apps add-data-source` | `nameUtils.js` が ASCII のみ許容 | `patch-nameutils.cjs` で CJK 許容パッチ |
| `pac code add-data-source` | PAC CLI .NET 内蔵ランタイム（パッチ不可） | `toggle_table_lang.py` で英語切替 |

> **正常系は常に `pac code add-data-source` + `toggle_table_lang.py`**。`npx power-apps add-data-source` は
> PAC CLI と独立した認証トークンキャッシュを持ち、正しいテナントに `pac auth create` 済みでも別テナント扱いで
> `403` エラーになる事故がある（[トラブルシューティング #12](troubleshooting.md#12-npx-power-apps-add-data-source-がテナント不一致で-403-エラー)）。
> 下記「フォールバック」の npx パッチは、`pac code add-data-source` 自体が使えない例外的な状況でのみ検討する。

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

## より堅牢な方法: 表示名を退避＆復元する（推奨・検証済 2026-06-15）

上記テンプレートは TABLES に**日本語表示名をハードコード**する必要があり、テーブルが増えるたびに保守が必要。
また「日本語に復元」する際、現在の表示名を `UserLocalizedLabel` から読むと、
**英語に切替済みの状態では英語ラベルを拾ってしまい**、元の日本語名が失われる事故が起きる。

これを避けるには、英語化の直前に**現在の表示名をファイルに退避**し、復元時はそのバックアップから書き戻す。
言語コードは `UserLocalizedLabel` ではなく `LocalizedLabels` の **1041（日本語）を明示的に**読む。

```python
"""テーブル表示名を英語化／日本語復元する（退避＆復元方式）。

usage:
  python toggle_lang.py en   # 現在の日本語名を .lang_backup.json に退避し英語化
  python toggle_lang.py jp   # .lang_backup.json から日本語名を復元
"""
import json, os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
# auth_helper.py のあるパスを通す（プロジェクト構成に合わせて調整）
sys.path.insert(0, os.path.join(".github", "skills", "standard", "scripts"))
from auth_helper import api_get, api_request

PREFIX = os.environ["PUBLISHER_PREFIX"].strip()
# ── プロジェクト固有: (論理名サフィックス, 英語DisplayName, 英語Plural) のみ定義 ──
# 日本語名はハードコードしない（退避ファイルから復元するため）
EN = {
    "customer": ("Customer", "Customers"),
    # "engineer": ("Engineer", "Engineers"), ...
}
BACKUP = Path(".lang_backup.json")


def label(text, code):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": code}]}


def get_meta(logical):
    return api_get(
        f"EntityDefinitions(LogicalName='{logical}')"
        "?$select=MetadataId,DisplayName,DisplayCollectionName"
    )


def put_names(mid, disp, coll, code):
    api_request(f"EntityDefinitions({mid})", {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "MetadataId": mid,
        "DisplayName": label(disp, code),
        "DisplayCollectionName": label(coll, code),
    }, method="PUT")


def to_english():
    backup = {}
    for suffix, (en_d, en_p) in EN.items():
        logical = f"{PREFIX}_{suffix}"
        m = get_meta(logical)
        # ✅ 1041（日本語）を明示的に拾う。UserLocalizedLabel は UI 言語に依存し不確実
        jp = next((l for l in m["DisplayName"]["LocalizedLabels"] if l["LanguageCode"] == 1041), None)
        jpc = next((l for l in m["DisplayCollectionName"]["LocalizedLabels"] if l["LanguageCode"] == 1041), None)
        if jp:
            backup[logical] = {"disp": jp["Label"], "coll": jpc["Label"]}
        put_names(m["MetadataId"], en_d, en_p, 1033)
        print(f"  {logical} → {en_d}")
    BACKUP.write_text(json.dumps(backup, ensure_ascii=False, indent=2), encoding="utf-8")


def to_japanese():
    backup = json.loads(BACKUP.read_text(encoding="utf-8"))
    for logical, v in backup.items():
        put_names(get_meta(logical)["MetadataId"], v["disp"], v["coll"], 1041)
        print(f"  {logical} → {v['disp']}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "en"
    (to_english if mode == "en" else to_japanese)()
```

> **メリット**: 日本語名を二重管理しない／復元漏れが起きない。
> 英語化は 1033、復元は退避済みの 1041 ラベルを書き戻すため、UI 言語設定に左右されない。

## スキーマ名は英語のみ

```
✅ テーブル: {prefix}_yourtable  列: {prefix}_description
❌ テーブル: {prefix}_テーブル名  列: {prefix}_説明
→ 日本語スキーマ名は pac code add-data-source で失敗する
```
