import argparse
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import api_get, api_patch, api_post, api_request, retry_metadata

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
            {"logical": "${PUBLISHER_PREFIX}_modelurl", "display": "3D モデル URL", "type": "String", "maxLength": 1000},
            {"logical": "${PUBLISHER_PREFIX}_modelcenter", "display": "3D 表示情報", "type": "String", "maxLength": 500},
            choice("${PUBLISHER_PREFIX}_modeltype", "3D モデル種別", [
                (100000000, "橋梁"), (100000001, "造成"), (100000002, "トンネル"),
                (100000003, "建築"), (100000004, "水路・護岸"), (100000005, "道路"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_description", "display": "工事概要", "type": "Memo", "maxLength": 4000},
            # CAD 取り込み: 本体（GLB / OBJ / STL / FBX）と、座標・単位・部品と作業の対応付け・施工単位（JSON）
            {"logical": "${PUBLISHER_PREFIX}_modelfile", "display": "CAD モデル", "type": "File", "maxSizeInKB": 51200},
            {"logical": "${PUBLISHER_PREFIX}_modelmapping", "display": "CAD モデル対応表", "type": "Memo", "maxLength": 100000},
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
            {"logical": "${PUBLISHER_PREFIX}_reportedprogress", "display": "報告進捗率", "type": "Integer", "minValue": 0, "maxValue": 100},
            choice("${PUBLISHER_PREFIX}_status", "状態", [(100000000, "未着手"), (100000001, "作業中"), (100000002, "完了")]),
            choice("${PUBLISHER_PREFIX}_reviewstatus", "確認状態", [
                (100000000, "下書き"), (100000001, "提出済"),
                (100000002, "承認"), (100000003, "差戻し"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_reviewcomment", "display": "監督コメント", "type": "Memo", "maxLength": 4000},
            {"logical": "${PUBLISHER_PREFIX}_zone", "display": "3D 部位", "type": "String", "maxLength": 100},
            {"logical": "${PUBLISHER_PREFIX}_sequence", "display": "工程順", "type": "Integer", "minValue": 0, "maxValue": 1000},
            {"logical": "${PUBLISHER_PREFIX}_issue", "display": "阻害要因", "type": "Memo", "maxLength": 2000},
            # 3D から自動生成した施工位置イメージ（フルサイズ保存は ensure_full_images が作成後に有効化する）
            {"logical": "${PUBLISHER_PREFIX}_locationimage", "display": "施工箇所図", "type": "Image", "maxSizeInKB": 10240},
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
            choice("${PUBLISHER_PREFIX}_reviewstatus", "確認状態", [
                (100000000, "下書き"), (100000001, "提出済"),
                (100000002, "承認"), (100000003, "差戻し"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_reviewcomment", "display": "監督コメント", "type": "Memo", "maxLength": 4000},
            {"logical": "${PUBLISHER_PREFIX}_photourl", "display": "日報写真 URL", "type": "String", "maxLength": 1000},
            {"logical": "${PUBLISHER_PREFIX}_photocaption", "display": "写真説明", "type": "String", "maxLength": 500},
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
    {
        # KY の AI 危険予測の要求と結果。アプリが「待機」で作成し、Copilot Studio の Workflow
        # （行の追加トリガー → KY 危険予測エージェント）が「処理中」→「完了 / 失敗」に更新する
        "logical": "${PUBLISHER_PREFIX}_kyprediction",
        "display": "KY 危険予測要求",
        "plural": "KY 危険予測要求",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_requestkey", "display": "要求キー", "type": "String", "maxLength": 64},
            {"logical": "${PUBLISHER_PREFIX}_input", "display": "入力（JSON）", "type": "Memo", "maxLength": 20000},
            {"logical": "${PUBLISHER_PREFIX}_prompt", "display": "エージェントへの依頼文", "type": "Memo", "maxLength": 20000},
            choice("${PUBLISHER_PREFIX}_predictionstatus", "状態", [
                (100000000, "待機"), (100000001, "処理中"), (100000002, "完了"), (100000003, "失敗"),
            ]),
            {"logical": "${PUBLISHER_PREFIX}_result", "display": "結果（JSON）", "type": "Memo", "maxLength": 20000},
            {"logical": "${PUBLISHER_PREFIX}_error", "display": "エラー", "type": "Memo", "maxLength": 2000},
        ],
    },
    {
        # 日報に添付する現場写真。Copilot Studio のアシスタント（Teams）とアプリから登録する
        "logical": "${PUBLISHER_PREFIX}_reportphoto",
        "display": "日報写真",
        "plural": "日報写真",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_photo", "display": "写真", "type": "Image", "maxSizeInKB": 10240},
            {"logical": "${PUBLISHER_PREFIX}_caption", "display": "説明", "type": "String", "maxLength": 500},
            {"logical": "${PUBLISHER_PREFIX}_takenon", "display": "撮影日時", "type": "DateTime"},
        ],
    },
    {
        # 日報に含まれる工程進捗の報告（下書き）。監督が承認すると作業の進捗（${PUBLISHER_PREFIX}_task.${PUBLISHER_PREFIX}_progress）に反映される
        "logical": "${PUBLISHER_PREFIX}_progressentry",
        "display": "進捗報告",
        "plural": "進捗報告",
        "columns": [
            {"logical": "${PUBLISHER_PREFIX}_reportedprogress", "display": "報告進捗", "type": "Integer", "minValue": 0, "maxValue": 100},
            {"logical": "${PUBLISHER_PREFIX}_previousprogress", "display": "報告前の進捗", "type": "Integer", "minValue": 0, "maxValue": 100},
            {"logical": "${PUBLISHER_PREFIX}_approvedprogress", "display": "承認した進捗", "type": "Integer", "minValue": 0, "maxValue": 100},
            {"logical": "${PUBLISHER_PREFIX}_completedunit", "display": "完了した施工単位", "type": "String", "maxLength": 200},
            {"logical": "${PUBLISHER_PREFIX}_note", "display": "報告内容", "type": "Memo", "maxLength": 4000},
            choice("${PUBLISHER_PREFIX}_reviewstatus", "監督確認", [(100000000, "下書き"), (100000001, "提出済"), (100000002, "承認"), (100000003, "差戻し")]),
            {"logical": "${PUBLISHER_PREFIX}_reviewcomment", "display": "監督コメント", "type": "Memo", "maxLength": 4000},
        ],
    },
]

LOOKUPS = [
    ("${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_worktype", "工種", "${PUBLISHER_PREFIX}_worktype"),
    ("${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_predecessor", "先行作業", "${PUBLISHER_PREFIX}_task"),
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
    ("${PUBLISHER_PREFIX}_kyprediction", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
    ("${PUBLISHER_PREFIX}_kyprediction", "${PUBLISHER_PREFIX}_worktype", "工種", "${PUBLISHER_PREFIX}_worktype"),
    ("${PUBLISHER_PREFIX}_reportphoto", "${PUBLISHER_PREFIX}_dailyreport", "日報", "${PUBLISHER_PREFIX}_dailyreport"),
    ("${PUBLISHER_PREFIX}_reportphoto", "${PUBLISHER_PREFIX}_task", "作業", "${PUBLISHER_PREFIX}_task"),
    ("${PUBLISHER_PREFIX}_progressentry", "${PUBLISHER_PREFIX}_dailyreport", "日報", "${PUBLISHER_PREFIX}_dailyreport"),
    ("${PUBLISHER_PREFIX}_progressentry", "${PUBLISHER_PREFIX}_task", "作業", "${PUBLISHER_PREFIX}_task"),
    ("${PUBLISHER_PREFIX}_progressentry", "${PUBLISHER_PREFIX}_project", "工事", "${PUBLISHER_PREFIX}_project"),
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
    elif kind == "File":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.FileAttributeMetadata", "MaxSizeInKB": column.get("maxSizeInKB", 32768)})
    elif kind == "Image":
        body.update({
            "@odata.type": "#Microsoft.Dynamics.CRM.ImageAttributeMetadata",
            "MaxSizeInKB": column.get("maxSizeInKB", 10240),
            "CanStoreFullImage": True,
            "IsPrimaryImage": False,
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
    ensure_full_images()
    api_post("PublishAllXml", {})


def ensure_full_images() -> None:
    """画像列をフルサイズ保存にする。

    作成時に CanStoreFullImage: True を送っても無視され、サムネイル（144px）しか保存されない。
    その状態では `$value?size=full` が 204（空）を返し、アプリは画像を表示できない。
    作成後に PUT で設定し直し、読み戻して確かめる（べき等。既に True なら何もしない）。
    """
    for table in TABLES:
        for column in table["columns"]:
            if column.get("type") != "Image":
                continue
            attribute = f"EntityDefinitions(LogicalName='{table['logical']}')/Attributes(LogicalName='{column['logical']}')"
            path = f"{attribute}/Microsoft.Dynamics.CRM.ImageAttributeMetadata"
            metadata = api_get(path)
            if metadata.get("CanStoreFullImage"):
                continue
            metadata.pop("@odata.context", None)
            metadata.update({"@odata.type": "Microsoft.Dynamics.CRM.ImageAttributeMetadata", "CanStoreFullImage": True})
            retry_metadata(lambda a=attribute, m=metadata: api_request(a, m, method="PUT"), f"full image {column['logical']}")
            # 作成直後の列は、PUT が成功しても読み戻しに反映されるまで数十秒かかることがある
            for _ in range(12):
                if api_get(f"{path}?$select=CanStoreFullImage").get("CanStoreFullImage"):
                    break
                time.sleep(10)
            else:
                raise SystemExit(f"{table['logical']}.{column['logical']} をフルサイズ保存にできませんでした")
            print(f"enabled full image: {table['logical']}.{column['logical']}")


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



def verify() -> None:
    for table in TABLES:
        logical = table["logical"]
        rows = api_get(f"{entity_set(logical)}?$select=${PUBLISHER_PREFIX}_name&$top=500").get("value", [])
        print(f"{logical}: {len(rows)} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description="Plan or provision the Construction Cockpit Dataverse schema.")
    parser.add_argument("--apply", action="store_true", help="Create/update the schema and publish customizations.")
    parser.add_argument("--seed-demo", action="store_true", help="Insert idempotent rich demonstration data (requires --apply).")
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
        # 本格デモデータ（工事 16 件・工程・日報写真・KY・ヒヤリハット・ナレッジ・重機稼働）
        from seed_construction_demo import main as seed_demo
        seed_demo()
    verify()


if __name__ == "__main__":
    main()
