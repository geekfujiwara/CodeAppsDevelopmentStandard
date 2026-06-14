"""テーブル表示名を英語⇔日本語で切り替えるユーティリティ。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
from auth_helper import api_get, api_request
load_dotenv()
PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX: raise SystemExit("PUBLISHER_PREFIX が .env に設定されていません。")
TABLES = [
    (f"{PREFIX}_purchase_request","Purchase Request","Purchase Requests","購買依頼","購買依頼一覧"),
    (f"{PREFIX}_vendor",          "Vendor",          "Vendors",          "仕入先",  "仕入先一覧"),
]
def label_en(t): return {"LocalizedLabels": [{"Label": t, "LanguageCode": 1033}]}
def label_jp(t): return {"LocalizedLabels": [{"Label": t, "LanguageCode": 1041}]}
def set_display_names(to_english=True):
    for logical, en_d, en_p, jp_d, jp_p in TABLES:
        mid = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")["MetadataId"]
        lbl = label_en if to_english else label_jp
        api_request(f"EntityDefinitions({mid})",{"@odata.type":"#Microsoft.Dynamics.CRM.EntityMetadata","MetadataId":mid,
            "DisplayName":lbl(en_d if to_english else jp_d),"DisplayCollectionName":lbl(en_p if to_english else jp_p)},method="PUT")
        print(f"  {logical} → {en_d if to_english else jp_d}")
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "en"
    if mode == "en": print("=== テーブル表示名を英語に変更 ==="); set_display_names(True)
    elif mode == "jp": print("=== テーブル表示名を日本語に復元 ==="); set_display_names(False)
    else: print("Usage: python toggle_table_lang.py [en|jp]")
