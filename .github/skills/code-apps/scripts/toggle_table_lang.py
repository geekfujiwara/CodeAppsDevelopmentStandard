"""
テーブル表示名を英語⇔日本語で切り替えるユーティリティ。
pac code add-data-source の日本語サニタイズ問題の回避用。

使い方:
  python scripts/toggle_table_lang.py en   # 英語に切替
  pac code add-data-source -a dataverse -t {table}
  python scripts/toggle_table_lang.py jp   # 日本語に復元

前提:
  - auth_helper.py が参照可能なこと（標準は .github/skills/standard/scripts/auth_helper.py。
    プロジェクトルート直下に置いている場合も自動でフォールバック解決する）
  - .env に PUBLISHER_PREFIX, DATAVERSE_URL が設定されていること

カスタマイズ:
  TABLES リストをプロジェクトのテーブルに合わせて編集する。
  各行は (論理名, 英語DisplayName, 英語Plural, 日本語DisplayName, 日本語Plural) のタプル。
"""
import os
import sys
from pathlib import Path

# auth_helper.py を解決: 標準（standard スキル）→ プロジェクトルートの順に探す
_ROOT = Path(__file__).resolve().parent.parent
for _cand in (
    _ROOT / ".github" / "skills" / "standard" / "scripts",
    _ROOT,
):
    if (_cand / "auth_helper.py").exists():
        sys.path.insert(0, str(_cand))
        break

from dotenv import load_dotenv
from auth_helper import api_get, api_request

load_dotenv(_ROOT / ".env")

PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX:
    raise SystemExit(
        "PUBLISHER_PREFIX が .env に設定されていません。"
    )

# ── プロジェクト固有: テーブル定義 ──
# (論理名, 英語DisplayName, 英語Plural, 日本語DisplayName, 日本語Plural)
# ↓ プロジェクトのテーブルに合わせて編集する
TABLES = [
    # (f"{PREFIX}_customer", "Customer", "Customers", "顧客", "顧客一覧"),
    # (f"{PREFIX}_opportunity", "Opportunity", "Opportunities", "商談", "商談一覧"),
]


def label_en(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1033}]}


def label_jp(text):
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def set_display_names(to_english=True):
    for logical, en_disp, en_plural, jp_disp, jp_plural in TABLES:
        data = api_get(
            f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId"
        )
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
