"""テーブル表示名を英語⇔日本語で切り替えるユーティリティ。

pac code add-data-source は日本語 DisplayName をサニタイズできず失敗するため、
データソース追加の前に en へ切り替え、追加後に jp へ復元する。
"""
import os, sys
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, os.path.join(_ROOT, ".github", "skills", "standard", "scripts"))
from dotenv import load_dotenv
from auth_helper import api_get, api_request
load_dotenv(os.path.join(_ROOT, ".env"))
PREFIX = os.environ.get("PUBLISHER_PREFIX", "").strip()
if not PREFIX: raise SystemExit("PUBLISHER_PREFIX が .env に設定されていません。")
TABLES = [
    (f"{PREFIX}_customer",             "Customer",             "Customers",             "顧客",                 "顧客一覧"),
    (f"{PREFIX}_engineer",             "Customer Engineer",    "Customer Engineers",    "カスタマーエンジニア", "カスタマーエンジニア一覧"),
    (f"{PREFIX}_equipment",            "Equipment",            "Equipment",             "機器情報",             "機器情報一覧"),
    (f"{PREFIX}_maintenancecontract",  "Maintenance Contract", "Maintenance Contracts", "保守契約",             "保守契約一覧"),
    (f"{PREFIX}_call",                 "Call",                 "Calls",                 "コール",               "コール一覧"),
    (f"{PREFIX}_workorder",            "Work Order",           "Work Orders",           "作業オーダー",         "作業オーダー一覧"),
    (f"{PREFIX}_maintenancereport",    "Maintenance Report",   "Maintenance Reports",   "保守レポート",         "保守レポート一覧"),
    (f"{PREFIX}_consumptionrecord",    "Consumption Record",   "Consumption Records",   "消費実績",             "消費実績一覧"),
    (f"{PREFIX}_annualkpi",            "Annual KPI",           "Annual KPIs",           "年間KPI",              "年間KPI一覧"),
    (f"{PREFIX}_recommendation",       "Recommendation",       "Recommendations",       "改善提案",             "改善提案一覧"),
    (f"{PREFIX}_dailyreport",          "Daily Report",         "Daily Reports",         "日報",                 "日報一覧"),
]
def label_en(t): return {"LocalizedLabels": [{"Label": t, "LanguageCode": 1033}]}
def label_jp(t): return {"LocalizedLabels": [{"Label": t, "LanguageCode": 1041}]}
def set_display_names(to_english=True):
    for logical, en_d, en_p, jp_d, jp_p in TABLES:
        mid = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=MetadataId")["MetadataId"]
        lbl = label_en if to_english else label_jp
        api_request(f"EntityDefinitions({mid})", {"@odata.type":"#Microsoft.Dynamics.CRM.EntityMetadata","MetadataId":mid,
            "DisplayName":lbl(en_d if to_english else jp_d),"DisplayCollectionName":lbl(en_p if to_english else jp_p)}, method="PUT")
        print(f"  {logical} → {en_d if to_english else jp_d}")
if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "en"
    if mode == "en": print("=== テーブル表示名を英語に変更 ==="); set_display_names(True)
    elif mode == "jp": print("=== テーブル表示名を日本語に復元 ==="); set_display_names(False)
    else: print("Usage: python toggle_table_lang.py [en|jp]")
