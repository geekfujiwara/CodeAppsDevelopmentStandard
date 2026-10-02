import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import api_get, api_post, api_patch, retry_metadata

SOLUTION = os.environ["SOLUTION_NAME"]
TEMPLATE_PREFIX = "${PUBLISHER_PREFIX}"
PREFIX = os.environ.get("PUBLISHER_PREFIX", TEMPLATE_PREFIX)

if PREFIX != TEMPLATE_PREFIX:
    raise RuntimeError(
        f"PUBLISHER_PREFIX must match the scaffold value '{TEMPLATE_PREFIX}', got '{PREFIX}'."
    )


def label(text: str) -> dict:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": 1041}]}


def choice(logical: str, display: str, options: list[tuple[int, str]]) -> dict:
    return {
        "logical": logical,
        "display": display,
        "type": "Picklist",
        "options": options,
    }


TABLES = [
    {
        "logical": "${PUBLISHER_PREFIX}_worktype",
        "display": "工種・工法",
        "plural": "工種・工法",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_code", "display": "工種コード", "type": "String", "maxLength": 30},
            choice("${PUBLISHER_PREFIX}_category", "分類", [
                (100000000, "土工"), (100000001, "基礎工"), (100000002, "橋梁"),
                (100000003, "トンネル"), (100000004, "舗装"), (100000005, "建築躯体"),
                (100000006, "仕上げ"), (100000007, "設備"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_description", "display": "説明", "type": "Memo", "maxLength": 4000},
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_project",
        "display": "工事",
        "plural": "工事",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_projectno", "display": "工事番号", "type": "String", "maxLength": 50},
            {"logical": "${PUBLISHER_PREFIX}_client", "display": "発注者", "type": "String", "maxLength": 200},
            choice("${PUBLISHER_PREFIX}_projecttype", "工事区分", [(100000000, "土木"), (100000001, "建築")]),
            {"logical": "${PUBLISHER_PREFIX}_address", "display": "所在地", "type": "String", "maxLength": 300},
            {"logical": "${PUBLISHER_PREFIX}_latitude", "display": "緯度", "type": "Double", "minValue": -90, "maxValue": 90},
            {"logical": "${PUBLISHER_PREFIX}_longitude", "display": "経度", "type": "Double", "minValue": -180, "maxValue": 180},
            {"logical": "${PUBLISHER_PREFIX}_startdate", "display": "着工日", "type": "DateTime", "format": "DateOnly"},
            {"logical": "${PUBLISHER_PREFIX}_enddate", "display": "竣工予定日", "type": "DateTime", "format": "DateOnly"},
            {"logical": "${PUBLISHER_PREFIX}_progress", "display": "進捗率", "type": "Integer", "minValue": 0, "maxValue": 100},
            choice("${PUBLISHER_PREFIX}_status", "状態", [(100000000, "計画中"), (100000001, "施工中"), (100000002, "完了")]),
            {"logical": "${PUBLISHER_PREFIX}_sitemanager", "display": "現場代理人", "type": "String", "maxLength": 100},
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_task",
        "display": "作業",
        "plural": "作業",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_plannedstart", "display": "予定開始日", "type": "DateTime", "format": "DateOnly"},
            {"logical": "${PUBLISHER_PREFIX}_plannedend", "display": "予定終了日", "type": "DateTime", "format": "DateOnly"},
            {"logical": "${PUBLISHER_PREFIX}_progress", "display": "進捗率", "type": "Integer", "minValue": 0, "maxValue": 100},
            choice("${PUBLISHER_PREFIX}_status", "状態", [(100000000, "未着手"), (100000001, "作業中"), (100000002, "完了")]),
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_dailyreport",
        "display": "日報",
        "plural": "日報",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_reportdate", "display": "報告日", "type": "DateTime", "format": "DateOnly"},
            choice("${PUBLISHER_PREFIX}_weather", "天候", [
                (100000000, "晴れ"), (100000001, "曇り"), (100000002, "雨"),
                (100000003, "雪"), (100000004, "強風"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_workers", "display": "作業人員", "type": "Integer", "minValue": 0, "maxValue": 10000},
            {"logical": "${PUBLISHER_PREFIX}_workdetail", "display": "作業内容", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_nextplan", "display": "明日の予定", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_remarks", "display": "特記事項", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_aidrafted", "display": "AI 下書き", "type": "Boolean"},
            choice("${PUBLISHER_PREFIX}_status", "状態", [(100000000, "下書き"), (100000001, "確定")]),
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_kyactivity",
        "display": "KY 活動",
        "plural": "KY 活動",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_kydate", "display": "実施日", "type": "DateTime", "format": "DateOnly"},
            {"logical": "${PUBLISHER_PREFIX}_workdetail", "display": "作業内容", "type": "Memo", "maxLength": 10000},
            choice("${PUBLISHER_PREFIX}_weather", "天候", [
                (100000000, "晴れ"), (100000001, "曇り"), (100000002, "雨"),
                (100000003, "雪"), (100000004, "強風"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_equipmenttext", "display": "使う重機（補足）", "type": "String", "maxLength": 300},
            {"logical": "${PUBLISHER_PREFIX}_hazards", "display": "想定される危険", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_countermeasures", "display": "対策", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_aiprediction", "display": "AI の予測結果", "type": "Memo", "maxLength": 20000},
            choice("${PUBLISHER_PREFIX}_risklevel", "危険度", [(100000000, "高"), (100000001, "中"), (100000002, "低")]),
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_incident",
        "display": "ヒヤリハット",
        "plural": "ヒヤリハット",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_occurredon", "display": "発生日時", "type": "DateTime", "format": "DateAndTime"},
            choice("${PUBLISHER_PREFIX}_incidenttype", "区分", [
                (100000000, "ヒヤリハット"), (100000001, "軽微な事故"),
                (100000002, "品質トラブル"), (100000003, "設備トラブル"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_description", "display": "内容", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_cause", "display": "原因", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_countermeasure", "display": "対策", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_latitude", "display": "緯度", "type": "Double", "minValue": -90, "maxValue": 90},
            {"logical": "${PUBLISHER_PREFIX}_longitude", "display": "経度", "type": "Double", "minValue": -180, "maxValue": 180},
            {"logical": "${PUBLISHER_PREFIX}_knowledgecreated", "display": "ナレッジ化済み", "type": "Boolean"},
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_knowledge",
        "display": "ナレッジ",
        "plural": "ナレッジ",
        "columns": [
            choice("${PUBLISHER_PREFIX}_knowledgetype", "区分", [
                (100000000, "安全"), (100000001, "品質"), (100000002, "工程"), (100000003, "工法"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_event", "display": "事象", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_cause", "display": "原因", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_lesson", "display": "対策・教訓", "type": "Memo", "maxLength": 10000},
            {"logical": "${PUBLISHER_PREFIX}_keywords", "display": "キーワード", "type": "String", "maxLength": 1000},
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_equipment",
        "display": "重機",
        "plural": "重機",
        "columns": [
            choice("${PUBLISHER_PREFIX}_equipmenttype", "種類", [
                (100000000, "バックホウ"), (100000001, "クレーン"), (100000002, "ダンプ"),
                (100000003, "ブルドーザ"), (100000004, "杭打ち機"), (100000005, "高所作業車"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_assetno", "display": "管理番号", "type": "String", "maxLength": 50},
        ],
    },
    {
        "logical": "${PUBLISHER_PREFIX}_equipmentusage",
        "display": "重機稼働",
        "plural": "重機稼働",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_hours", "display": "稼働時間", "type": "Decimal", "precision": 1, "minValue": 0, "maxValue": 24},
        ],
    },
]

LOOKUPS = [
    ("${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_worktype", "工種", "${PUBLISHER_PREFIX}_worktype"),
    ("${PUBLISHER_PREFIX}_dailyreport", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_task", "作業", "${PUBLISHER_PREFIX}_task"),
    ("${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_equipment", "重機", "${PUBLISHER_PREFIX}_equipment"),
    ("${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_task", "作業", "${PUBLISHER_PREFIX}_task"),
    ("${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_worktype", "工種", "${PUBLISHER_PREFIX}_worktype"),
    ("${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_worktype", "工種", "${PUBLISHER_PREFIX}_worktype"),
    ("${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_sourceincident", "元のヒヤリハット", "${PUBLISHER_PREFIX}_incident"),
    ("${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_dailyreport", "日報", "${PUBLISHER_PREFIX}_dailyreport"),
    ("${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_equipment", "重機", "${PUBLISHER_PREFIX}_equipment"),
]


def column_body(column: dict) -> dict:
    body = {
        "SchemaName": column["logical"],
        "DisplayName": label(column["display"]),
        "RequiredLevel": {"Value": "None"},
    }
    kind = column["type"]
    if kind == "String":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata", "FormatName": {"Value": "Text"}, "MaxLength": column.get("maxLength", 200)})
    elif kind == "Memo":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata", "Format": "Text", "MaxLength": column.get("maxLength", 4000)})
    elif kind == "Integer":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata", "MinValue": column.get("minValue", 0), "MaxValue": column.get("maxValue", 100000)})
    elif kind == "Decimal":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata", "Precision": column.get("precision", 2), "MinValue": column.get("minValue", 0), "MaxValue": column.get("maxValue", 100000)})
    elif kind == "Double":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DoubleAttributeMetadata", "Precision": 5, "MinValue": column["minValue"], "MaxValue": column["maxValue"]})
    elif kind == "DateTime":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "Format": column.get("format", "DateAndTime")})
        if column.get("format", "DateAndTime") == "DateAndTime":
            body["DateTimeBehavior"] = {"Value": "UserLocal"}
    elif kind == "Boolean":
        body.update({
            "@odata.type": "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
            "OptionSet": {
                "@odata.type": "#Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
                "TrueOption": {"Value": 1, "Label": label("はい")},
                "FalseOption": {"Value": 0, "Label": label("いいえ")},
            },
        })
    elif kind == "Picklist":
        body.update({
            "@odata.type": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
            "OptionSet": {
                "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata",
                "IsGlobal": False,
                "OptionSetType": "Picklist",
                "Options": [{"Value": value, "Label": label(text)} for value, text in column["options"]],
            },
        })
    return body


def exists(path: str) -> bool:
    try:
        api_get(path)
        return True
    except Exception:
        return False


def create_schema() -> None:
    for table in TABLES:
        logical = table["logical"]
        if not exists(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName"):
            def create_table() -> None:
                api_post("EntityDefinitions", {
                    "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
                    "SchemaName": logical,
                    "DisplayName": label(table["display"]),
                    "DisplayCollectionName": label(table["plural"]),
                    "Description": label(f"現場コックピット {table['display']}"),
                    "OwnershipType": "UserOwned",
                    "IsActivity": False,
                    "HasActivities": False,
                    "HasNotes": False,
                    "PrimaryNameAttribute": "${PUBLISHER_PREFIX}_name",
                    "Attributes": [{
                        "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                        "SchemaName": "${PUBLISHER_PREFIX}_name",
                        "DisplayName": label("名前"),
                        "IsPrimaryName": True,
                        "RequiredLevel": {"Value": "ApplicationRequired"},
                        "FormatName": {"Value": "Text"},
                        "MaxLength": 200,
                    }],
                }, solution=SOLUTION)
            retry_metadata(create_table, f"table {logical}")
            print(f"created table: {logical}")
            time.sleep(8)
        for column in table["columns"]:
            if exists(f"EntityDefinitions(LogicalName='{logical}')/Attributes(LogicalName='{column['logical']}')?$select=LogicalName"):
                continue
            retry_metadata(
                lambda t=logical, c=column: api_post(
                    f"EntityDefinitions(LogicalName='{t}')/Attributes",
                    column_body(c),
                    solution=SOLUTION,
                ),
                f"column {logical}.{column['logical']}",
            )
            print(f"created column: {logical}.{column['logical']}")
            time.sleep(3)

    for source, attribute, display, target in LOOKUPS:
        if exists(f"EntityDefinitions(LogicalName='{source}')/Attributes(LogicalName='{attribute}')?$select=LogicalName"):
            continue
        retry_metadata(
            lambda s=source, a=attribute, d=display, t=target: api_post(
                "RelationshipDefinitions",
                {
                    "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
                    "SchemaName": f"{s}_{a}",
                    "ReferencedEntity": t,
                    "ReferencingEntity": s,
                    "Lookup": {
                        "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                        "SchemaName": a,
                        "DisplayName": label(d),
                        "RequiredLevel": {"Value": "None"},
                    },
                },
                solution=SOLUTION,
            ),
            f"lookup {source}.{attribute}",
        )
        print(f"created lookup: {source}.{attribute}")
        time.sleep(5)
    api_post("PublishAllXml", {})


def entity_set(logical: str) -> str:
    return api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=EntitySetName")["EntitySetName"]


def nav(source: str, attribute: str) -> str:
    rows = api_get(
        f"EntityDefinitions(LogicalName='{source}')/ManyToOneRelationships"
        f"?$filter=ReferencingAttribute eq '{attribute}'"
        f"&$select=ReferencingEntityNavigationPropertyName"
    ).get("value", [])
    if not rows:
        raise RuntimeError(f"Navigation property not found: {source}.{attribute}")
    return rows[0]["ReferencingEntityNavigationPropertyName"]


def ensure(logical: str, name: str, data: dict) -> str:
    safe_name = name.replace("'", "''")
    rows = api_get(
        f"{entity_set(logical)}?$select={logical}id&$filter=${PUBLISHER_PREFIX}_name eq '{safe_name}'"
    ).get("value", [])
    if rows:
        return rows[0][f"{logical}id"]
    record_id = api_post(entity_set(logical), {"${PUBLISHER_PREFIX}_name": name, **data}, solution=SOLUTION)
    if not record_id:
        raise RuntimeError(f"Could not create {logical}: {name}")
    return record_id


def bind(data: dict, source: str, attribute: str, target: str, target_id: str) -> dict:
    data[f"{nav(source, attribute)}@odata.bind"] = f"/{entity_set(target)}({target_id})"
    return data


def seed_data() -> None:
    today = date.today()
    worktypes = {}
    worktype_rows = [
        ("掘削工", "EW-01", 100000000), ("盛土工", "EW-02", 100000000),
        ("杭打ち工", "FD-01", 100000001), ("橋梁架設工", "BR-01", 100000002),
        ("山岳トンネル掘削", "TN-01", 100000003), ("アスファルト舗装工", "PV-01", 100000004),
        ("鉄筋・型枠工", "ST-01", 100000005), ("足場組立工", "ST-02", 100000005),
    ]
    for name, code, category in worktype_rows:
        worktypes[name] = ensure("${PUBLISHER_PREFIX}_worktype", name, {"${PUBLISHER_PREFIX}_code": code, "${PUBLISHER_PREFIX}_category": category})

    project_rows = [
        ("青葉川橋梁下部工事", "P-2026-001", "架空県 道路局", 100000000, "宮城県仙台市", 38.27, 140.87, 45, 100000001),
        ("若葉台造成工事", "P-2026-002", "架空市 都市整備部", 100000000, "千葉県千葉市", 35.61, 140.12, 30, 100000001),
        ("山の辺トンネル工事", "P-2026-003", "架空高速道路株式会社", 100000000, "静岡県静岡市", 34.98, 138.38, 62, 100000001),
        ("港南物流センター新築工事", "P-2026-004", "架空物流株式会社", 100000001, "大阪府大阪市", 34.65, 135.43, 20, 100000001),
        ("緑町排水路改修工事", "P-2026-005", "架空市 下水道部", 100000000, "福岡県福岡市", 33.59, 130.40, 0, 100000000),
    ]
    projects = {}
    for index, row in enumerate(project_rows):
        name, number, client, kind, address, latitude, longitude, progress, status = row
        projects[name] = ensure("${PUBLISHER_PREFIX}_project", name, {
            "${PUBLISHER_PREFIX}_projectno": number, "${PUBLISHER_PREFIX}_client": client, "${PUBLISHER_PREFIX}_projecttype": kind, "${PUBLISHER_PREFIX}_address": address,
            "${PUBLISHER_PREFIX}_latitude": latitude, "${PUBLISHER_PREFIX}_longitude": longitude,
            "${PUBLISHER_PREFIX}_startdate": (today - timedelta(days=180 - index * 20)).isoformat(),
            "${PUBLISHER_PREFIX}_enddate": (today + timedelta(days=180 + index * 30)).isoformat(),
            "${PUBLISHER_PREFIX}_progress": progress, "${PUBLISHER_PREFIX}_status": status, "${PUBLISHER_PREFIX}_sitemanager": f"現場代理人 {index + 1}",
        })

    completed_project_rows = [
        ("桜台市民会館耐震改修", "P-2025-018", "架空市 建築保全課", 100000001, "東京都練馬区", 35.74, 139.65, 320, 45),
        ("北浜歩道橋更新工事", "P-2025-024", "架空県 道路保全課", 100000000, "神奈川県横浜市", 35.45, 139.64, 410, 190),
    ]
    for index, row in enumerate(completed_project_rows):
        name, number, client, kind, address, latitude, longitude, start_days_ago, end_days_ago = row
        projects[name] = ensure("${PUBLISHER_PREFIX}_project", name, {
            "${PUBLISHER_PREFIX}_projectno": number, "${PUBLISHER_PREFIX}_client": client, "${PUBLISHER_PREFIX}_projecttype": kind, "${PUBLISHER_PREFIX}_address": address,
            "${PUBLISHER_PREFIX}_latitude": latitude, "${PUBLISHER_PREFIX}_longitude": longitude,
            "${PUBLISHER_PREFIX}_startdate": (today - timedelta(days=start_days_ago)).isoformat(),
            "${PUBLISHER_PREFIX}_enddate": (today - timedelta(days=end_days_ago)).isoformat(),
            "${PUBLISHER_PREFIX}_progress": 100, "${PUBLISHER_PREFIX}_status": 100000002, "${PUBLISHER_PREFIX}_sitemanager": f"完了工事責任者 {index + 1}",
        })

    task_rows = [
        ("P2 橋脚 杭打ち", "青葉川橋梁下部工事", "杭打ち工", 60),
        ("P2 橋脚 鉄筋組立", "青葉川橋梁下部工事", "鉄筋・型枠工", 0),
        ("第2工区 掘削", "若葉台造成工事", "掘削工", 40),
        ("第1工区 盛土", "若葉台造成工事", "盛土工", 85),
        ("本坑 掘削(上半)", "山の辺トンネル工事", "山岳トンネル掘削", 55),
        ("外部足場 組立", "港南物流センター新築工事", "足場組立工", 70),
    ]
    tasks = {}
    for index, (name, project, worktype, progress) in enumerate(task_rows):
        data = {
            "${PUBLISHER_PREFIX}_plannedstart": (today - timedelta(days=40 - index * 4)).isoformat(),
            "${PUBLISHER_PREFIX}_plannedend": (today + timedelta(days=30 + index * 5)).isoformat(),
            "${PUBLISHER_PREFIX}_progress": progress,
            "${PUBLISHER_PREFIX}_status": 100000001 if progress else 100000000,
        }
        bind(data, "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", projects[project])
        bind(data, "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[worktype])
        tasks[name] = ensure("${PUBLISHER_PREFIX}_task", name, data)

    equipments = {}
    for name, kind, asset in [
        ("バックホウ 0.7m³", 100000000, "EQ-001"), ("ラフタークレーン 25t", 100000001, "EQ-002"),
        ("ダンプ 10t", 100000002, "EQ-003"), ("杭打ち機", 100000004, "EQ-004"),
        ("高所作業車 12m", 100000005, "EQ-005"),
    ]:
        equipments[name] = ensure("${PUBLISHER_PREFIX}_equipment", name, {"${PUBLISHER_PREFIX}_equipmenttype": kind, "${PUBLISHER_PREFIX}_assetno": asset})

    report_specs = [
        ("日報 青葉川 D-2", "青葉川橋梁下部工事", 100000000, 14, "P2 橋脚の杭打ち 3 本完了", 100000001),
        ("日報 若葉台 D-2", "若葉台造成工事", 100000001, 22, "第2工区の掘削、残土搬出", 100000001),
        ("日報 山の辺 D-2", "山の辺トンネル工事", 100000002, 18, "上半掘削 2 進行、吹付け", 100000001),
        ("日報 青葉川 D-1", "青葉川橋梁下部工事", 100000004, 12, "強風のためクレーン作業を中止、杭頭処理", 100000000),
        ("日報 港南 D-1", "港南物流センター新築工事", 100000000, 30, "外部足場の組立（東面）", 100000001),
    ]
    reports = {}
    for index, (name, project, weather, workers, detail, status) in enumerate(report_specs):
        data = {
            "${PUBLISHER_PREFIX}_reportdate": (today - timedelta(days=2 if index < 3 else 1)).isoformat(),
            "${PUBLISHER_PREFIX}_weather": weather, "${PUBLISHER_PREFIX}_workers": workers, "${PUBLISHER_PREFIX}_workdetail": detail,
            "${PUBLISHER_PREFIX}_nextplan": "安全確認後に作業を継続", "${PUBLISHER_PREFIX}_remarks": "", "${PUBLISHER_PREFIX}_aidrafted": False, "${PUBLISHER_PREFIX}_status": status,
        }
        bind(data, "${PUBLISHER_PREFIX}_dailyreport", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", projects[project])
        reports[name] = ensure("${PUBLISHER_PREFIX}_dailyreport", name, data)

    ky_specs = [
        ("KY 青葉川 今日", "青葉川橋梁下部工事", "P2 橋脚 杭打ち", 100000004, 100000000, "強風時の吊り荷の振れ"),
        ("KY 若葉台 今日", "若葉台造成工事", "第2工区 掘削", 100000001, 100000001, "バックホウ旋回範囲への立入り"),
        ("KY 山の辺 今日", "山の辺トンネル工事", "本坑 掘削(上半)", 100000002, 100000000, "切羽からの肌落ち"),
        ("KY 港南 今日", "港南物流センター新築工事", "外部足場 組立", 100000000, 100000001, "高所からの墜落"),
        ("KY 若葉台 昨日", "若葉台造成工事", "第1工区 盛土", 100000001, 100000002, "重機との接触"),
    ]
    for index, (name, project, task, weather, risk, hazard) in enumerate(ky_specs):
        data = {
            "${PUBLISHER_PREFIX}_kydate": (today - timedelta(days=1 if index == 4 else 0)).isoformat(),
            "${PUBLISHER_PREFIX}_workdetail": task, "${PUBLISHER_PREFIX}_weather": weather, "${PUBLISHER_PREFIX}_equipmenttext": "重機使用",
            "${PUBLISHER_PREFIX}_hazards": hazard, "${PUBLISHER_PREFIX}_countermeasures": "作業範囲を区画し、指差し確認を行う", "${PUBLISHER_PREFIX}_risklevel": risk,
        }
        bind(data, "${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", projects[project])
        bind(data, "${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_task", tasks[task])
        ensure("${PUBLISHER_PREFIX}_kyactivity", name, data)

    incident_specs = [
        ("旋回範囲への立ち入り", "若葉台造成工事", "第2工区 掘削", "掘削工", 100000000, "バックホウの旋回範囲に誘導員が入りかけた", True),
        ("強風時の吊り荷の振れ", "青葉川橋梁下部工事", "P2 橋脚 杭打ち", "杭打ち工", 100000000, "突風で鋼管杭の吊り荷が大きく振れた", True),
        ("切羽からの肌落ち", "山の辺トンネル工事", "本坑 掘削(上半)", "山岳トンネル掘削", 100000001, "吹付け前に小規模な肌落ち。けが人なし", False),
        ("足場板の固定漏れ", "港南物流センター新築工事", "外部足場 組立", "足場組立工", 100000000, "足場板1枚の緊結を忘れ、作業員がつまずいた", False),
        ("締固め不足", "若葉台造成工事", "第1工区 盛土", "盛土工", 100000002, "現場密度試験で基準値を下回った", True),
    ]
    incidents = {}
    for index, (name, project, task, worktype, kind, detail, converted) in enumerate(incident_specs):
        data = {
            "${PUBLISHER_PREFIX}_occurredon": (datetime.now(timezone.utc) - timedelta(days=index + 1)).isoformat(),
            "${PUBLISHER_PREFIX}_incidenttype": kind, "${PUBLISHER_PREFIX}_description": detail, "${PUBLISHER_PREFIX}_cause": "作業範囲と確認手順が不明確",
            "${PUBLISHER_PREFIX}_countermeasure": "区画とチェックリストを徹底する",
            "${PUBLISHER_PREFIX}_latitude": next(row[5] for row in project_rows if row[0] == project),
            "${PUBLISHER_PREFIX}_longitude": next(row[6] for row in project_rows if row[0] == project),
            "${PUBLISHER_PREFIX}_knowledgecreated": converted,
        }
        bind(data, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", projects[project])
        bind(data, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_task", tasks[task])
        bind(data, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[worktype])
        incidents[name] = ensure("${PUBLISHER_PREFIX}_incident", name, data)

    knowledge_specs = [
        ("バックホウの旋回範囲での接触リスク", "掘削工", 100000000, "バックホウの旋回範囲に人が入る", "旋回範囲をカラーコーンで区画し、誘導員の立ち位置を決めておく", "バックホウ、旋回、誘導員", "旋回範囲への立ち入り"),
        ("強風時の吊り作業", "杭打ち工", 100000000, "強風で吊り荷が振れる", "平均風速 10m/s 以上で吊り作業を中止し、介錯ロープを使う", "強風、クレーン、吊り荷", "強風時の吊り荷の振れ"),
        ("雨の後の切羽の肌落ち", "山岳トンネル掘削", 100000000, "降雨後に切羽が肌落ちする", "切羽観察の時間を延ばし、先に吹付けする", "切羽、肌落ち、降雨", "切羽からの肌落ち"),
        ("盛土の締固め不足", "盛土工", 100000001, "現場密度が基準を下回る", "仕上がり厚さを30cm以下にし、含水比を毎日確認する", "締固め、含水比、密度", "締固め不足"),
        ("足場板の緊結確認", "足場組立工", 100000000, "足場板の固定が不足する", "組立後にチェックリストで緊結を確認する", "足場、緊結、墜落", "足場板の固定漏れ"),
        ("掘削の法面の崩落", "掘削工", 100000000, "降雨で法面が崩落する", "掘削勾配を守り、降雨前に法面をシートで養生する", "法面、崩落、降雨", None),
    ]
    for name, worktype, kind, event, lesson, keywords, incident in knowledge_specs:
        data = {
            "${PUBLISHER_PREFIX}_knowledgetype": kind, "${PUBLISHER_PREFIX}_event": event, "${PUBLISHER_PREFIX}_cause": "安全確認と作業計画が不十分",
            "${PUBLISHER_PREFIX}_lesson": lesson, "${PUBLISHER_PREFIX}_keywords": keywords,
        }
        bind(data, "${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[worktype])
        if incident:
            bind(data, "${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_sourceincident", "${PUBLISHER_PREFIX}_incident", incidents[incident])
        ensure("${PUBLISHER_PREFIX}_knowledge", name, data)

    usage_specs = [
        ("稼働 青葉川 杭打ち機", "日報 青葉川 D-2", "杭打ち機", 6.5),
        ("稼働 若葉台 バックホウ", "日報 若葉台 D-2", "バックホウ 0.7m³", 7.0),
        ("稼働 若葉台 ダンプ", "日報 若葉台 D-2", "ダンプ 10t", 5.5),
        ("稼働 港南 高所作業車", "日報 港南 D-1", "高所作業車 12m", 6.0),
    ]
    for name, report, equipment, hours in usage_specs:
        data = {"${PUBLISHER_PREFIX}_hours": hours}
        bind(data, "${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_dailyreport", "${PUBLISHER_PREFIX}_dailyreport", reports[report])
        bind(data, "${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_equipment", "${PUBLISHER_PREFIX}_equipment", equipments[equipment])
        ensure("${PUBLISHER_PREFIX}_equipmentusage", name, data)

    api_post("PublishAllXml", {})
    print("seed data complete")


def verify() -> None:
    for table in TABLES:
        logical = table["logical"]
        rows = api_get(f"{entity_set(logical)}?$select=${PUBLISHER_PREFIX}_name&$top=500").get("value", [])
        print(f"{logical}: {len(rows)} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description="Plan or provision the Construction Cockpit Dataverse schema.")
    parser.add_argument("--apply", action="store_true", help="Create/update the schema and publish customizations.")
    parser.add_argument("--seed-demo", action="store_true", help="Insert idempotent demonstration data (requires --apply).")
    args = parser.parse_args()

    if args.seed_demo and not args.apply:
        parser.error("--seed-demo requires --apply")

    if not args.apply:
        print(f"PLAN solution={SOLUTION} publisherPrefix={PREFIX}")
        for table in TABLES:
            print(f"  table {table['logical']} ({len(table['columns'])} custom columns)")
        print("No changes made. Re-run with --apply, optionally adding --seed-demo.")
        return

    create_schema()
    if args.seed_demo:
        seed_data()
    verify()


if __name__ == "__main__":
    main()
