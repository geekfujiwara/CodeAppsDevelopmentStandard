"""sales-crm テンプレートが使う Dataverse テーブルを確認・構築する。

既定は読み取り専用（--check）。不足があれば一覧を出して終了コード 1。
  python scripts/setup_crm_dataverse.py                 # 確認のみ
  python scripts/setup_crm_dataverse.py --apply         # 不足テーブル・列・参照を作成（既存は変更しない）
  python scripts/setup_crm_dataverse.py --apply --seed-demo   # 商談が 0 件のときだけデモデータを投入

前提: .env の DATAVERSE_URL / TENANT_ID / SOLUTION_NAME / PUBLISHER_PREFIX。
ソリューションとパブリッシャーは dataverse スキルの Step 0-1 で先に用意する。
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

from dotenv import load_dotenv

load_dotenv(Path.cwd() / ".env")


def _add_auth_helper_path() -> None:
    starts = [Path(__file__).resolve().parent, Path.cwd()]
    for start in starts:
        for base in [start, *start.parents]:
            candidate = base / ".github" / "skills" / "standard" / "scripts"
            if (candidate / "auth_helper.py").is_file():
                sys.path.insert(0, str(candidate))
                return
    sys.exit("auth_helper.py が見つかりません。.github/skills を含む作業ルートで実行してください。")


_add_auth_helper_path()
from auth_helper import api_get, api_post, retry_metadata  # noqa: E402

P = os.getenv("PUBLISHER_PREFIX", "").strip()
SOLUTION = os.getenv("SOLUTION_NAME", "").strip()
if not (P and SOLUTION and os.getenv("DATAVERSE_URL")):
    sys.exit(".env の DATAVERSE_URL / SOLUTION_NAME / PUBLISHER_PREFIX を設定してください。")


def c(name: str) -> str:
    return f"{P}_{name}"


def picklist(name: str, en: str, ja: str, options: list[tuple[str, str]]) -> dict:
    return {"name": c(name), "type": "Picklist", "en": en, "ja": ja, "options": options}


STAGES = [("Prospect", "見込み"), ("Proposal", "提案"), ("Negotiation", "交渉"), ("Won", "受注"), ("Lost", "失注")]

TABLES = [
    {"name": c("crmfiscalperiod"), "en": "CRM Fiscal Period", "ja": "会計期間", "columns": [
        {"name": c("startdate"), "type": "Date", "en": "Start Date", "ja": "開始日"},
        {"name": c("enddate"), "type": "Date", "en": "End Date", "ja": "終了日"},
        {"name": c("fiscalyear"), "type": "Integer", "en": "Fiscal Year", "ja": "年度", "min": 2000, "max": 2100},
        {"name": c("quarter"), "type": "Integer", "en": "Quarter", "ja": "四半期", "min": 1, "max": 4},
    ]},
    {"name": c("crmsalestarget"), "en": "CRM Sales Target", "ja": "売上目標", "columns": [
        {"name": c("targetamount"), "type": "Money", "en": "Target Amount", "ja": "目標金額"},
        {"name": c("fiscalyear"), "type": "Integer", "en": "Fiscal Year", "ja": "年度", "min": 2000, "max": 2100},
        {"name": c("quarter"), "type": "Integer", "en": "Quarter", "ja": "四半期", "min": 1, "max": 4},
        picklist("targettype", "Target Type", "種別", [("Individual", "個人"), ("Team", "チーム"), ("Department", "部門")]),
        {"name": c("department"), "type": "String", "en": "Department", "ja": "部門", "max": 100},
    ]},
    {"name": c("crmlead"), "en": "CRM Lead", "ja": "リード", "columns": [
        {"name": c("companyname"), "type": "String", "en": "Company Name", "ja": "会社名", "max": 200},
        {"name": c("email"), "type": "String", "en": "Email", "ja": "メール", "max": 100},
        {"name": c("phone"), "type": "String", "en": "Phone", "ja": "電話", "max": 50},
        {"name": c("jobtitle"), "type": "String", "en": "Job Title", "ja": "役職", "max": 100},
        picklist("status", "Status", "ステータス", [("New", "新規"), ("Contacted", "連絡済"), ("Qualified", "認定済"), ("Disqualified", "不認定"), ("Converted", "変換済")]),
        picklist("source", "Source", "ソース", [("Web", "Web"), ("Referral", "紹介"), ("Event", "イベント"), ("Advertising", "広告"), ("Other", "その他")]),
        picklist("rating", "Rating", "評価", [("Hot", "ホット"), ("Warm", "ウォーム"), ("Cold", "コールド")]),
        {"name": c("estimatedvalue"), "type": "Money", "en": "Estimated Value", "ja": "想定金額"},
        {"name": c("description"), "type": "Memo", "en": "Description", "ja": "説明"},
    ]},
    {"name": c("crmopportunity"), "en": "CRM Opportunity", "ja": "商談", "columns": [
        {"name": c("amount"), "type": "Money", "en": "Amount", "ja": "金額"},
        picklist("stage", "Stage", "ステージ", STAGES),
        {"name": c("probability"), "type": "Integer", "en": "Probability", "ja": "確度", "min": 0, "max": 100},
        {"name": c("estimatedclosedate"), "type": "Date", "en": "Estimated Close Date", "ja": "クローズ予定日"},
        {"name": c("actualclosedate"), "type": "Date", "en": "Actual Close Date", "ja": "実クローズ日"},
        {"name": c("nextstep"), "type": "String", "en": "Next Step", "ja": "次のアクション", "max": 500},
        {"name": c("description"), "type": "Memo", "en": "Description", "ja": "説明"},
    ]},
    {"name": c("crmactivity"), "en": "CRM Activity", "ja": "営業活動", "columns": [
        picklist("type", "Type", "種別", [("Task", "タスク"), ("Phone Call", "電話"), ("Email", "メール"), ("Meeting", "会議")]),
        {"name": c("duedate"), "type": "DateTime", "en": "Due Date", "ja": "期日"},
        picklist("status", "Status", "ステータス", [("Not Started", "未着手"), ("In Progress", "進行中"), ("Completed", "完了")]),
        picklist("priority", "Priority", "優先度", [("High", "高"), ("Normal", "中"), ("Low", "低")]),
        {"name": c("description"), "type": "Memo", "en": "Description", "ja": "内容"},
    ]},
]

# (参照元, 参照先, Lookup の SchemaName, 英語名, 日本語名)。SchemaName の大文字小文字がそのまま @odata.bind 名になる
LOOKUPS = [
    (c("crmsalestarget"), c("crmfiscalperiod"), f"{P}_FiscalPeriodId", "Fiscal Period", "会計期間"),
    (c("crmopportunity"), "account", c("accountid"), "Account", "取引先企業"),
    (c("crmopportunity"), "contact", c("contactid"), "Primary Contact", "主担当者"),
    (c("crmactivity"), "account", c("accountid"), "Account", "取引先企業"),
    (c("crmactivity"), "contact", c("contactid"), "Contact", "担当者"),
    (c("crmactivity"), c("crmopportunity"), c("opportunityid"), "Opportunity", "商談"),
    (c("crmactivity"), c("crmlead"), c("leadid"), "Lead", "リード"),
]


def languages() -> tuple[int, set[int]]:
    base = api_get("organizations?$select=languagecode")["value"][0]["languagecode"]
    provisioned = set(api_get("RetrieveProvisionedLanguages()").get("RetrieveProvisionedLanguages", []))
    return base, provisioned | {base}


BASE_LANG, LANGS = 1033, {1033}


def label(en: str, ja: str) -> dict:
    labels = [{"Label": ja if BASE_LANG == 1041 else en, "LanguageCode": BASE_LANG}]
    if 1041 in LANGS and BASE_LANG != 1041:
        labels.append({"Label": ja, "LanguageCode": 1041})
    return {"LocalizedLabels": labels}


def column_body(col: dict) -> dict:
    body = {"SchemaName": col["name"], "DisplayName": label(col["en"], col["ja"]), "RequiredLevel": {"Value": "None"}}
    kind = col["type"]
    if kind == "String":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata", "FormatName": {"Value": "Text"}, "MaxLength": col.get("max", 200)})
    elif kind == "Memo":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata", "Format": "Text", "MaxLength": 4000})
    elif kind == "Integer":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata", "Format": "None", "MinValue": col["min"], "MaxValue": col["max"]})
    elif kind == "Money":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.MoneyAttributeMetadata", "PrecisionSource": 2})
    elif kind in ("Date", "DateTime"):
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "Format": "DateOnly" if kind == "Date" else "DateAndTime"})
    elif kind == "Picklist":
        body.update({
            "@odata.type": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "OptionSet": {"@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata", "IsGlobal": False, "OptionSetType": "Picklist",
                          "Options": [{"Value": 100000000 + i, "Label": label(en, ja)} for i, (en, ja) in enumerate(col["options"])]},
        })
    return body


def table_exists(name: str) -> bool:
    try:
        api_get(f"EntityDefinitions(LogicalName='{name}')?$select=LogicalName")
        return True
    except Exception:
        return False


def attribute_names(table: str) -> set[str]:
    rows = api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes?$select=LogicalName").get("value", [])
    return {r["LogicalName"] for r in rows}


def entity_set(table: str) -> str:
    return api_get(f"EntityDefinitions(LogicalName='{table}')?$select=EntitySetName")["EntitySetName"]


def check() -> list[str]:
    missing: list[str] = []
    for table in TABLES:
        if not table_exists(table["name"]):
            missing.append(f"table {table['name']}")
            continue
        attrs = attribute_names(table["name"])
        missing += [f"column {table['name']}.{col['name']}" for col in table["columns"] if col["name"] not in attrs]
    for source, _target, schema, _en, _ja in LOOKUPS:
        if table_exists(source) and schema.lower() not in attribute_names(source):
            missing.append(f"lookup {source}.{schema.lower()}")
    return missing


def report_counts() -> None:
    for table in [t["name"] for t in TABLES] + ["account", "contact"]:
        if not table_exists(table):
            continue
        count = api_get(f"{entity_set(table)}?$count=true&$top=1&$select=createdon").get("@odata.count", "-")
        print(f"  {table:32} {count} 件")


def apply() -> None:
    if not api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid").get("value"):
        sys.exit(f"ソリューション {SOLUTION} がありません。dataverse スキルの Step 0-1 で作成してから再実行してください。")
    for table in TABLES:
        name = table["name"]
        if not table_exists(name):
            body = {
                "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata", "SchemaName": name,
                "DisplayName": label(table["en"], table["ja"]), "DisplayCollectionName": label(table["en"] + "s", table["ja"]),
                "OwnershipType": "UserOwned", "IsActivity": False, "HasActivities": False, "HasNotes": False,
                "PrimaryNameAttribute": c("name"),
                "Attributes": [{"@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata", "SchemaName": c("name"),
                                "DisplayName": label("Name", "名前"), "IsPrimaryName": True, "RequiredLevel": {"Value": "ApplicationRequired"},
                                "FormatName": {"Value": "Text"}, "MaxLength": 200}],
            }
            retry_metadata(lambda b=body: api_post("EntityDefinitions", b, solution=SOLUTION), f"テーブル {name}")
            print(f"  + table {name}")
            time.sleep(5)
        attrs = attribute_names(name)
        for col in table["columns"]:
            if col["name"] in attrs:
                continue
            retry_metadata(lambda n=name, b=column_body(col): api_post(f"EntityDefinitions(LogicalName='{n}')/Attributes", b, solution=SOLUTION), f"列 {col['name']}")
            print(f"  + column {name}.{col['name']}")
    for source, target, schema, en, ja in LOOKUPS:
        if schema.lower() in attribute_names(source):
            continue
        body = {
            "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
            "SchemaName": f"{source}_{schema.lower()}_{target}"[:100], "ReferencedEntity": target, "ReferencingEntity": source,
            "Lookup": {"@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata", "SchemaName": schema,
                       "DisplayName": label(en, ja), "RequiredLevel": {"Value": "None"}},
        }
        retry_metadata(lambda b=body: api_post("RelationshipDefinitions", b, solution=SOLUTION), f"参照 {schema}")
        print(f"  + lookup {source}.{schema}")
    retry_metadata(lambda: api_post("PublishAllXml", {}), "PublishAllXml")


def quarter_periods(today: date, start_month: int) -> list[tuple[int, int, date, date]]:
    fy = today.year if today.month >= start_month else today.year - 1
    periods = []
    for q in range(4):
        month = start_month + q * 3
        start = date(fy + (month - 1) // 12, (month - 1) % 12 + 1, 1)
        next_month = month + 3
        end = date(fy + (next_month - 1) // 12, (next_month - 1) % 12 + 1, 1) - timedelta(days=1)
        periods.append((fy, q + 1, start, end))
    return periods


def seed_demo(start_month: int) -> None:
    opp_set = entity_set(c("crmopportunity"))
    if api_get(f"{opp_set}?$count=true&$top=1&$select=createdon").get("@odata.count", 0):
        print("  商談が既にあるため、デモデータは投入しません。")
        return
    today = date.today()
    period_set, target_set, act_set = entity_set(c("crmfiscalperiod")), entity_set(c("crmsalestarget")), entity_set(c("crmactivity"))
    current = None
    for fy, q, start, end in quarter_periods(today, start_month):
        pid = api_post(period_set, {c("name"): f"FY{fy} Q{q}", c("startdate"): start.isoformat(), c("enddate"): end.isoformat(), c("fiscalyear"): fy, c("quarter"): q})
        for kind, amount, suffix in ((100000000, 30_000_000, "個人目標"), (100000002, 100_000_000, "部門目標")):
            api_post(target_set, {c("name"): f"FY{fy} Q{q} {suffix}", c("targetamount"): amount, c("fiscalyear"): fy, c("quarter"): q,
                                  c("targettype"): kind, f"{P}_FiscalPeriodId@odata.bind": f"/{period_set}({pid})"})
        if start <= today <= end:
            current = (start, end)
    start, end = current or (today, today + timedelta(days=90))
    accounts = ["Contoso 商事", "Fabrikam 製作所", "Northwind 物流"]
    for i, account_name in enumerate(accounts):
        aid = api_post("accounts", {"name": account_name, "emailaddress1": f"info@{['contoso', 'fabrikam', 'northwind'][i]}.example.com"})
        cid = api_post("contacts", {"lastname": ["佐藤", "鈴木", "高橋"][i], "firstname": ["花子", "一郎", "美咲"][i],
                                    "emailaddress1": f"{['sato', 'suzuki', 'takahashi'][i]}@{['contoso', 'fabrikam', 'northwind'][i]}.example.com",
                                    "parentcustomerid_account@odata.bind": f"/accounts({aid})"})
        deals = [(f"{account_name} 基幹刷新", 12_000_000, 100000002, 70, end - timedelta(days=10), "決裁者との条件確認"),
                 (f"{account_name} 追加ライセンス", 4_000_000, 100000001, 40, start + timedelta(days=20), "")]
        for name, amount, stage, prob, close, next_step in deals[: 2 if i < 2 else 1]:
            oid = api_post(opp_set, {c("name"): name, c("amount"): amount, c("stage"): stage, c("probability"): prob,
                                     c("estimatedclosedate"): close.isoformat(), c("nextstep"): next_step,
                                     f"{c('accountid')}@odata.bind": f"/accounts({aid})", f"{c('contactid')}@odata.bind": f"/contacts({cid})"})
            api_post(act_set, {c("name"): f"{name} 打合せ", c("type"): 100000003, c("status"): 100000000, c("priority"): 100000001,
                               c("duedate"): datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                               f"{c('opportunityid')}@odata.bind": f"/{opp_set}({oid})"})
    won_close = min(today, end)
    api_post(opp_set, {c("name"): "Contoso 商事 分析基盤", c("amount"): 9_000_000, c("stage"): 100000003, c("probability"): 100,
                       c("estimatedclosedate"): won_close.isoformat(), c("actualclosedate"): won_close.isoformat(), c("nextstep"): "導入支援"})
    print("  + デモデータ（会計期間・目標・取引先・担当者・商談・活動）を投入しました")


def main() -> int:
    global BASE_LANG, LANGS
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="確認のみ（既定）")
    parser.add_argument("--apply", action="store_true", help="不足しているテーブル・列・参照を作成する")
    parser.add_argument("--seed-demo", action="store_true", help="商談が 0 件のときだけデモデータを投入する（--apply と併用）")
    parser.add_argument("--fiscal-start-month", type=int, default=4, help="年度の開始月（既定 4）")
    args = parser.parse_args()

    print(f"対象: {os.getenv('DATAVERSE_URL')}  ソリューション: {SOLUTION}  接頭辞: {P}")
    if args.apply:
        BASE_LANG, LANGS = languages()
        apply()
        if args.seed_demo:
            seed_demo(args.fiscal_start_month)
    missing = check()
    report_counts()
    if missing:
        print("NG: 不足しているスキーマがあります（--apply で作成できます）")
        for item in missing:
            print(f"  - {item}")
        return 1
    print("OK: sales-crm が必要とするテーブル・列・参照がそろっています")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
