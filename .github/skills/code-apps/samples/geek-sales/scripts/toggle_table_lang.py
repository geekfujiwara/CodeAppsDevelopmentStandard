"""
テーブル表示名を英語⇔日本語で切り替えるユーティリティ。
pac code add-data-source の日本語サニタイズ問題の回避用。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
from auth_helper import api_get, api_request

load_dotenv()

PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX:
    raise SystemExit(
        "PUBLISHER_PREFIX が .env に設定されていません。"
    )

# (論理名, 英語DisplayName, 英語DisplayCollectionName, 日本語DisplayName, 日本語DisplayCollectionName)
TABLES = [
    (f"{PREFIX}_conversationsummary", "Conversation Summary", "Conversation Summaries", "会話サマリー", "会話サマリー一覧"),
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
    mode = sys.argv[1] if len(sys.argv) > 1 else "en"
    if mode == "en":
        print("=== テーブル表示名を英語に変更 ===")
        set_display_names(to_english=True)
    elif mode == "jp":
        print("=== テーブル表示名を日本語に復元 ===")
        set_display_names(to_english=False)
    else:
        print("Usage: python toggle_table_lang.py [en|jp]")
