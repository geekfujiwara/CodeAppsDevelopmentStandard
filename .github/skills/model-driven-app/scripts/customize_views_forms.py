"""
モデル駆動型アプリ ビュー・フォーム・テーブルアイコン カスタマイズスクリプト

既定ビュー:
  - プライマリ列を先頭に表示
  - カスタム列をすべて表示（複数行テキストは除外）
  - 作成日・所有者を表示
  - 作成日降順ソート

メインフォーム:
  - カスタム列をすべて表示
  - 適切にタブ・セクション分け
  - 複数行テキスト → 行の高さ 7 行
  - オートナンバー → 任意・読み取り専用
  - セクション内 2 列表示

テーブルアイコン:
  - テーブルのテーマに合わせた SVG アイコン（32x32）を自動生成
  - Web Resource として登録し EntityMetadata.IconVectorName に設定

使い方:
  python .github/skills/model-driven-app/customize_views_forms.py                # 全テーブル
  python .github/skills/model-driven-app/customize_views_forms.py geek_incident  # 特定テーブル
"""

import base64
import json
import os
import re
import sys
import uuid
import xml.etree.ElementTree as ET

_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.join(_this_dir, "..", "power-platform-standard"))

import requests
from dotenv import load_dotenv
from auth_helper import get_token as _get_token

load_dotenv()

DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "")
API = f"{DATAVERSE_URL}/api/data/v9.2"


def get_headers(include_solution=False):
    token = _get_token()
    h = {
        "Authorization": f"Bearer {token}",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        "Accept": "application/json",
        "Content-Type": "application/json; charset=utf-8",
    }
    if include_solution and SOLUTION_NAME:
        h["MSCRM.SolutionName"] = SOLUTION_NAME
    return h


def api_get(path, params=None):
    r = requests.get(f"{API}/{path}", headers=get_headers(), params=params)
    r.raise_for_status()
    return r.json()


def api_patch(path, body, include_solution=True):
    h = get_headers(include_solution)
    h["MSCRM.MergeLabels"] = "true"
    r = requests.patch(f"{API}/{path}", headers=h, json=body)
    if not r.ok:
        print(f"  API ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r


def new_guid():
    return "{" + str(uuid.uuid4()) + "}"


# ═══════════════════════════════════════════════════════════
#  Step 1: テーブルのカスタム列メタデータを取得
# ═══════════════════════════════════════════════════════════

def get_custom_attributes(entity_logical_name):
    """テーブルのカスタム列とシステム列（createdon, ownerid）のメタデータを取得"""
    # 全属性を取得してクライアント側でフィルタ
    meta = api_get(
        f"EntityDefinitions(LogicalName='{entity_logical_name}')/Attributes",
        {
            "$select": "LogicalName,AttributeType,DisplayName,SchemaName,"
                       "IsCustomAttribute,IsValidForRead,IsValidForCreate,"
                       "IsValidForUpdate,RequiredLevel,AttributeOf",
        },
    )
    all_attrs = meta.get("value", [])
    # クライアント側フィルタ: カスタム列（AttributeOf=null, 読み取り可）+ createdon + ownerid
    attrs = [
        a for a in all_attrs
        if (
            (a.get("IsCustomAttribute") and a.get("AttributeOf") is None
             and a.get("IsValidForRead"))
            or a["LogicalName"] in ("createdon", "ownerid")
        )
    ]

    # AutoNumber 検出: StringAttributeMetadata の AutoNumberFormat を個別取得
    autonumber_set = set()
    try:
        str_meta = api_get(
            f"EntityDefinitions(LogicalName='{entity_logical_name}')"
            f"/Attributes/Microsoft.Dynamics.CRM.StringAttributeMetadata",
            {"$select": "LogicalName,AutoNumberFormat"}
        )
        for sm in str_meta.get("value", []):
            if sm.get("AutoNumberFormat"):
                autonumber_set.add(sm["LogicalName"])
    except Exception:
        pass

    result = []
    for a in attrs:
        logical_name = a["LogicalName"]
        attr_type = a.get("AttributeType", "")
        display = ""
        dn = a.get("DisplayName", {})
        if dn:
            labels = dn.get("LocalizedLabels", [])
            for lbl in labels:
                if lbl.get("LanguageCode") == 1041:
                    display = lbl.get("Label", "")
                    break
            if not display and labels:
                display = labels[0].get("Label", logical_name)
        if not display:
            display = logical_name

        is_autonumber = logical_name in autonumber_set
        is_multiline = attr_type == "Memo"

        result.append({
            "logical_name": logical_name,
            "display_name": display,
            "attr_type": attr_type,
            "is_custom": a.get("IsCustomAttribute", False),
            "is_autonumber": is_autonumber,
            "is_multiline": is_multiline,
            "is_lookup": attr_type == "Lookup" or attr_type == "Owner",
            "is_valid_for_create": a.get("IsValidForCreate", True),
            "is_valid_for_update": a.get("IsValidForUpdate", True),
            "required_level": a.get("RequiredLevel", {}).get("Value", "None"),
        })

    return result


# ═══════════════════════════════════════════════════════════
#  Step 2: 既定ビュー（savedquery）をカスタマイズ
# ═══════════════════════════════════════════════════════════

def customize_default_view(entity_logical_name, attributes):
    """既定のアクティブビューにカスタム列 + createdon + ownerid を表示し、createdon 降順ソート"""
    print(f"\n--- ビュー カスタマイズ: {entity_logical_name} ---")

    # 既定ビューを取得
    views = api_get("savedqueries", {
        "$filter": (
            f"returnedtypecode eq '{entity_logical_name}'"
            " and querytype eq 0 and isdefault eq true"
            " and statecode eq 0"
        ),
        "$select": "savedqueryid,name,fetchxml,layoutxml",
    })

    if not views.get("value"):
        # 既定がなければ最初の Public View
        views = api_get("savedqueries", {
            "$filter": (
                f"returnedtypecode eq '{entity_logical_name}'"
                " and querytype eq 0 and statecode eq 0"
            ),
            "$select": "savedqueryid,name,fetchxml,layoutxml",
            "$top": "1",
            "$orderby": "name",
        })

    if not views.get("value"):
        print(f"  ⚠️ ビューが見つかりません: {entity_logical_name}")
        return

    view = views["value"][0]
    view_id = view["savedqueryid"]
    view_name = view["name"]
    print(f"  既定ビュー: {view_name} ({view_id})")

    # カスタム列 + createdon + ownerid を対象
    # 複数行テキスト（Memo）はビューに含めない（一覧で見づらいため）
    view_columns = []
    for a in attributes:
        ln = a["logical_name"]
        if a["is_multiline"]:
            continue  # Memo 列はビュー対象外
        if a["is_lookup"] and not ln.endswith("id"):
            continue  # xxx_value 列はスキップ
        view_columns.append(a)

    # プライマリ列（primary name column = _name）を先頭に移動
    primary_name = f"{PREFIX}_name"
    primary_col = next((a for a in view_columns if a["logical_name"] == primary_name), None)
    if primary_col:
        view_columns.remove(primary_col)
        view_columns.insert(0, primary_col)

    # FetchXml 構築
    attr_xml = "\n    ".join(
        f'<attribute name="{a["logical_name"]}" />'
        for a in view_columns
    )
    fetch_xml = (
        f'<fetch version="1.0" output-format="xml-platform" mapping="logical" distinct="false">'
        f'\n  <entity name="{entity_logical_name}">'
        f'\n    {attr_xml}'
        f'\n    <order attribute="createdon" descending="true" />'
        f'\n    <filter type="and">'
        f'\n      <condition attribute="statecode" operator="eq" value="0" />'
        f'\n    </filter>'
        f'\n  </entity>'
        f'\n</fetch>'
    )

    # LayoutXml 構築
    # テーブルの主キー列名を推定 (entity_logical_name + "id")
    pk_name = entity_logical_name + "id"
    # jump = primary name column（先頭に来ているはず）
    jump_col = primary_name if primary_col else view_columns[0]["logical_name"]
    cells_xml = "\n      ".join(
        f'<cell name="{a["logical_name"]}" width="150" />'
        for a in view_columns
    )
    layout_xml = (
        f'<grid name="resultset" object="0" jump="{jump_col}" '
        f'select="1" preview="1" icon="1">'
        f'\n    <row name="result" id="{pk_name}">'
        f'\n      {cells_xml}'
        f'\n    </row>'
        f'\n  </grid>'
    )

    # PATCH で更新
    api_patch(f"savedqueries({view_id})", {
        "fetchxml": fetch_xml,
        "layoutxml": layout_xml,
    })
    print(f"  ✅ ビュー更新完了: {len(view_columns)} 列")
    return view_id


# ═══════════════════════════════════════════════════════════
#  Step 3: メインフォーム（systemform）をカスタマイズ
# ═══════════════════════════════════════════════════════════

CLASSID_STANDARD = "{4273EDBD-AC1D-40D3-9FB2-095C621B552D}"

# 列の分類キーワード
LOOKUP_KEYWORDS = ("_value",)
SYSTEM_COLUMNS = ("createdon", "ownerid", "createdby", "modifiedon", "modifiedby", "statecode", "statuscode")


def classify_columns(attributes):
    """カスタム列を分類してタブ・セクションに整理する"""
    main_cols = []      # メイン情報（必須・基本フィールド）
    detail_cols = []    # 詳細情報（複数行テキスト等）
    lookup_cols = []    # Lookup / Owner 列
    autonumber_cols = []  # オートナンバー列
    system_cols = []    # システム列

    for a in attributes:
        ln = a["logical_name"]
        if ln in SYSTEM_COLUMNS or not a["is_custom"]:
            if ln in ("createdon", "ownerid"):
                system_cols.append(a)
            continue
        if a["is_autonumber"]:
            autonumber_cols.append(a)
        elif a["is_multiline"]:
            detail_cols.append(a)
        elif a["is_lookup"]:
            lookup_cols.append(a)
        else:
            main_cols.append(a)

    return main_cols, detail_cols, lookup_cols, autonumber_cols, system_cols


def build_form_xml(entity_logical_name, attributes, entity_display_name=""):
    """カスタム列ベースの FormXml を構築する"""
    main_cols, detail_cols, lookup_cols, autonumber_cols, system_cols = classify_columns(attributes)

    tabs = []

    # ── タブ 1: 一般情報 ──
    sections_general = []

    # セクション: 基本情報（2列）
    basic_fields = autonumber_cols + main_cols + lookup_cols
    if basic_fields:
        rows = _build_rows_2col(basic_fields, entity_logical_name)
        sections_general.append(_build_section("sec_basic", "基本情報", rows, columns=2))

    # セクション: 詳細情報（複数行テキスト — 1列、各 7 行高）
    if detail_cols:
        rows = _build_rows_multiline(detail_cols, entity_logical_name)
        sections_general.append(_build_section("sec_detail", "詳細情報", rows, columns=1))

    if sections_general:
        tabs.append(_build_tab("tab_general", "一般", sections_general))

    # ── タブ 2: システム情報 ──
    if system_cols:
        sys_rows = _build_rows_2col(system_cols, entity_logical_name)
        sys_section = _build_section("sec_system", "システム情報", sys_rows, columns=2)
        tabs.append(_build_tab("tab_system", "システム情報", [sys_section]))

    # タブがない場合のフォールバック
    if not tabs:
        empty_section = _build_section("sec_empty", "情報", "", columns=1)
        tabs.append(_build_tab("tab_general", "一般", [empty_section]))

    tabs_xml = "\n".join(tabs)
    form_xml = f'<form><tabs>{tabs_xml}</tabs></form>'
    return form_xml


def _build_tab(name, label, sections_list):
    """タブ XML を構築"""
    tab_id = new_guid()
    sections_xml = "\n".join(sections_list)
    return (
        f'<tab name="{name}" id="{tab_id}" IsUserDefined="1" '
        f'locklevel="0" showlabel="true" expanded="true" visible="true">'
        f'<labels><label description="{label}" languagecode="1041" /></labels>'
        f'<columns><column width="100%"><sections>'
        f'{sections_xml}'
        f'</sections></column></columns>'
        f'</tab>'
    )


def _build_section(name, label, rows_xml, columns=2):
    """セクション XML を構築"""
    sec_id = new_guid()
    return (
        f'<section name="{name}" showlabel="true" showbar="false" '
        f'locklevel="0" id="{sec_id}" IsUserDefined="1" '
        f'columns="{columns}" celllabelalignment="Left" celllabelposition="Left">'
        f'<labels><label description="{label}" languagecode="1041" /></labels>'
        f'<rows>{rows_xml}</rows></section>'
    )


def _build_cell(attr, entity_logical_name, disabled=False):
    """個別のセル XML を構築"""
    cell_id = new_guid()
    ctrl_id = attr["logical_name"]
    disabled_attr = ' disabled="true"' if disabled or attr.get("is_autonumber") else ""
    # オートナンバーは isrequired="false" にする
    required_attr = ""
    if attr.get("is_autonumber"):
        required_attr = ' isrequired="false"'
    return (
        f'<cell id="{cell_id}" showlabel="true" locklevel="0">'
        f'<labels><label description="{attr["display_name"]}" languagecode="1041" /></labels>'
        f'<control id="{ctrl_id}" classid="{CLASSID_STANDARD}" '
        f'datafieldname="{attr["logical_name"]}"{disabled_attr}{required_attr} />'
        f'</cell>'
    )


def _build_spacer_cell():
    """空のスペーサーセル"""
    cell_id = new_guid()
    return f'<cell id="{cell_id}" showlabel="false" locklevel="0" userspacer="true" />'


def _build_rows_2col(fields, entity_logical_name):
    """2 列レイアウトで行を構築（フィールドを 2 つずつペアにする）"""
    rows = []
    for i in range(0, len(fields), 2):
        cell1 = _build_cell(fields[i], entity_logical_name)
        if i + 1 < len(fields):
            cell2 = _build_cell(fields[i + 1], entity_logical_name)
        else:
            cell2 = _build_spacer_cell()
        rows.append(f'<row>{cell1}{cell2}</row>')
    return "\n".join(rows)


def _build_rows_multiline(fields, entity_logical_name):
    """複数行テキスト用に 1 列・7 行の高さで構築"""
    rows = []
    for f in fields:
        cell_id = new_guid()
        ctrl_id = f["logical_name"]
        # rowspan="7" で高さを確保 + row height 指定
        cell = (
            f'<cell id="{cell_id}" showlabel="true" locklevel="0" rowspan="7">'
            f'<labels><label description="{f["display_name"]}" languagecode="1041" /></labels>'
            f'<control id="{ctrl_id}" classid="{CLASSID_STANDARD}" '
            f'datafieldname="{f["logical_name"]}" />'
            f'</cell>'
        )
        rows.append(f'<row>{cell}</row>')
    return "\n".join(rows)


def customize_main_form(entity_logical_name, attributes, entity_display_name=""):
    """メインフォームをカスタマイズする"""
    print(f"\n--- フォーム カスタマイズ: {entity_logical_name} ---")

    # 既存メインフォームを取得
    forms = api_get("systemforms", {
        "$filter": (
            f"objecttypecode eq '{entity_logical_name}'"
            " and type eq 2"
        ),
        "$select": "formid,name,formxml",
        "$top": "1",
    })

    if not forms.get("value"):
        print(f"  ⚠️ メインフォームが見つかりません: {entity_logical_name}")
        return

    form = forms["value"][0]
    form_id = form["formid"]
    form_name = form["name"]
    print(f"  メインフォーム: {form_name} ({form_id})")

    # 既存フォームの XML を表示（デバッグ用）
    existing_xml = form.get("formxml", "")
    print(f"  既存 FormXml 長さ: {len(existing_xml)} chars")

    # 新しい FormXml を構築
    form_xml = build_form_xml(entity_logical_name, attributes, entity_display_name)
    print(f"  新規 FormXml 長さ: {len(form_xml)} chars")

    # PATCH で更新
    api_patch(f"systemforms({form_id})", {
        "formxml": form_xml,
    })
    print(f"  ✅ フォーム更新完了")
    return form_id


# ═══════════════════════════════════════════════════════════
#  Step 3.5: テーブルアイコン（SVG）の生成・設定
# ═══════════════════════════════════════════════════════════

# テーブル名キーワード → アイコン定義（SVG path ベース）
# color: アイコンメインカラー, bg: 背景色, path: SVG path (viewBox 0 0 24 24)
ICON_THEMES = {
    # インシデント系
    "incident":  {"color": "#D94A4A", "bg": "#FEE8E8",
                  "path": "M12 2L1 21h22L12 2zm0 4l7.5 13h-15L12 6zm-1 5v4h2v-4h-2zm0 5v2h2v-2h-2z"},
    "comment":   {"color": "#4A7FD9", "bg": "#E8EFFE",
                  "path": "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"},
    # マスタ系
    "category":  {"color": "#D9A54A", "bg": "#FEF3E8",
                  "path": "M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"},
    "priority":  {"color": "#D94A4A", "bg": "#FEE8E8",
                  "path": "M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6zm3.6 8h-4l-.4-2H7V6h5.6l.4 2H18v6z"},
    "asset":     {"color": "#4A90D9", "bg": "#E8F0FE",
                  "path": "M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"},
    # 分析系
    "insight":   {"color": "#4AD99A", "bg": "#E8FEF0",
                  "path": "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"},
    "market":    {"color": "#4AD99A", "bg": "#E8FEF0",
                  "path": "M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zm5.6 8H19v6h-2.8v-6z"},
    "report":    {"color": "#8A4AD9", "bg": "#F0E8FE",
                  "path": "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7v-7zm4-3h2v10h-2V7zm4 6h2v4h-2v-4z"},
    # 人・組織系
    "user":      {"color": "#4A90D9", "bg": "#E8F0FE",
                  "path": "M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"},
    "department":{"color": "#D9A54A", "bg": "#FEF3E8",
                  "path": "M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"},
    # 場所系
    "location":  {"color": "#D97A4A", "bg": "#FEF0E8",
                  "path": "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z"},
    # タスク系
    "task":      {"color": "#4AD9D9", "bg": "#E8FEFE",
                  "path": "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"},
    # 設定系
    "type":      {"color": "#7A7A7A", "bg": "#F0F0F0",
                  "path": "M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"},
    "status":    {"color": "#4AD97A", "bg": "#E8FEE8",
                  "path": "M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"},
    "master":    {"color": "#7A7A7A", "bg": "#F0F0F0",
                  "path": "M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"},
}

# デフォルトアイコン（マッチしないテーブル用）
DEFAULT_ICON = {"color": "#4A90D9", "bg": "#E8F0FE",
                "path": "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"}


def _match_icon_theme(table_logical_name):
    """テーブル論理名からアイコンテーマを自動判定する"""
    # プレフィックスを除去した名前でマッチ
    name_no_prefix = table_logical_name.split("_", 1)[1] if "_" in table_logical_name else table_logical_name
    name_lower = name_no_prefix.lower()

    # 完全一致 → 部分一致の順で検索
    for key, theme in ICON_THEMES.items():
        if name_lower == key:
            return theme
    for key, theme in ICON_THEMES.items():
        if key in name_lower:
            return theme
    return DEFAULT_ICON


def generate_table_svg(table_logical_name):
    """テーブルのテーマに合った 32x32 SVG アイコンを生成する"""
    theme = _match_icon_theme(table_logical_name)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">'
        f'<rect width="32" height="32" rx="6" fill="{theme["bg"]}"/>'
        f'<g transform="translate(4,4)">'
        f'<path d="{theme["path"]}" fill="{theme["color"]}"/>'
        f'</g></svg>'
    )
    return svg


def set_table_icon(entity_logical_name):
    """テーブルにテーマ別 SVG アイコンを設定する"""
    print(f"\n--- テーブルアイコン設定: {entity_logical_name} ---")

    # 1. SVG 生成
    svg_content = generate_table_svg(entity_logical_name)
    svg_b64 = base64.b64encode(svg_content.encode("utf-8")).decode("ascii")

    # 2. Web Resource 名
    name_no_prefix = entity_logical_name.split("_", 1)[1] if "_" in entity_logical_name else entity_logical_name
    wr_name = f"{PREFIX}_/icons/{name_no_prefix}.svg"

    # 3. 既存チェック → 作成 or 更新
    h = get_headers(include_solution=True)
    existing = api_get("webresourceset", {
        "$filter": f"name eq '{wr_name}'",
        "$select": "webresourceid",
    })

    if existing.get("value"):
        wr_id = existing["value"][0]["webresourceid"]
        api_patch(f"webresourceset({wr_id})", {"content": svg_b64}, include_solution=True)
        print(f"  Web Resource 更新: {wr_name}")
    else:
        r = requests.post(f"{API}/webresourceset", headers=h, json={
            "name": wr_name,
            "displayname": f"{entity_logical_name} Icon",
            "content": svg_b64,
            "webresourcetype": 11,  # SVG
        })
        if not r.ok:
            print(f"  ⚠️ Web Resource 作成失敗: {r.status_code} {r.text[:300]}")
            return
        print(f"  Web Resource 作成: {wr_name}")

    # 4. EntityMetadata に IconVectorName を設定
    h_meta = get_headers(include_solution=True)
    h_meta["MSCRM.MergeLabels"] = "true"
    r = requests.put(
        f"{API}/EntityDefinitions(LogicalName='{entity_logical_name}')",
        headers=h_meta,
        json={"IconVectorName": wr_name},
    )
    if r.ok:
        print(f"  ✅ IconVectorName 設定完了: {wr_name}")
    else:
        print(f"  ⚠️ IconVectorName 設定失敗: {r.status_code} {r.text[:300]}")


# ═══════════════════════════════════════════════════════════
#  Step 4: PublishXml で変更を公開
# ═══════════════════════════════════════════════════════════

def publish_entity(entity_logical_name):
    """個別テーブルの変更を公開"""
    publish_xml = (
        f'<importexportxml>'
        f'<entities><entity>{entity_logical_name}</entity></entities>'
        f'</importexportxml>'
    )
    h = get_headers()
    r = requests.post(f"{API}/PublishXml", headers=h, json={"ParameterXml": publish_xml})
    if r.ok:
        print(f"  ✅ 公開完了: {entity_logical_name}")
    else:
        print(f"  ⚠️ 公開失敗: {r.status_code} {r.text[:300]}")


# ═══════════════════════════════════════════════════════════
#  メイン
# ═══════════════════════════════════════════════════════════

def get_solution_tables():
    """ソリューション内のカスタムテーブル一覧を取得"""
    sols = api_get("solutions", {
        "$filter": f"uniquename eq '{SOLUTION_NAME}'",
        "$select": "solutionid",
    })
    if not sols.get("value"):
        raise RuntimeError(f"ソリューション '{SOLUTION_NAME}' が見つかりません")
    sol_id = sols["value"][0]["solutionid"]

    comps = api_get("solutioncomponents", {
        "$filter": f"_solutionid_value eq {sol_id} and componenttype eq 1",
        "$select": "objectid",
    })

    tables = []
    for c in comps.get("value", []):
        eid = c["objectid"]
        try:
            meta = api_get(f"EntityDefinitions({eid})", {
                "$select": "LogicalName,DisplayName,IsCustomEntity",
            })
            display = ""
            dn = meta.get("DisplayName", {})
            if dn and dn.get("LocalizedLabels"):
                for lbl in dn["LocalizedLabels"]:
                    if lbl.get("LanguageCode") == 1041:
                        display = lbl["Label"]
                        break
                if not display:
                    display = dn["LocalizedLabels"][0].get("Label", "")
            tables.append({
                "logical_name": meta["LogicalName"],
                "display_name": display or meta["LogicalName"],
            })
        except Exception as e:
            print(f"  ⚠️ {eid}: {e}")

    return tables


def main():
    print("=" * 60)
    print("  ビュー・フォーム カスタマイズ")
    print(f"  ソリューション: {SOLUTION_NAME}")
    print("=" * 60)

    # 特定テーブルのみ指定する場合
    target = sys.argv[1] if len(sys.argv) > 1 else None

    if target:
        tables = [{"logical_name": target, "display_name": target}]
    else:
        tables = get_solution_tables()

    if not tables:
        print("⚠️ テーブルが見つかりません")
        sys.exit(1)

    print(f"\n対象テーブル: {len(tables)}")
    for t in tables:
        print(f"  - {t['logical_name']} ({t['display_name']})")

    for t in tables:
        entity = t["logical_name"]
        display = t["display_name"]

        # Step 1: カスタム列のメタデータを取得
        print(f"\n{'='*50}")
        print(f"  テーブル: {entity} ({display})")
        print(f"{'='*50}")

        attrs = get_custom_attributes(entity)
        custom_count = sum(1 for a in attrs if a["is_custom"])
        print(f"  属性数: {len(attrs)} (カスタム: {custom_count})")
        for a in attrs:
            flags = []
            if a["is_autonumber"]:
                flags.append("AutoNumber")
            if a["is_multiline"]:
                flags.append("Memo")
            if a["is_lookup"]:
                flags.append("Lookup")
            flag_str = f" [{', '.join(flags)}]" if flags else ""
            print(f"    {a['logical_name']}: {a['display_name']} ({a['attr_type']}){flag_str}")

        if not attrs:
            print(f"  ⚠️ カスタム列がありません。スキップ。")
            continue

        # Step 2: 既定ビューのカスタマイズ
        customize_default_view(entity, attrs)

        # Step 3: メインフォームのカスタマイズ
        customize_main_form(entity, attrs, display)

        # Step 3.5: テーブルアイコン設定
        set_table_icon(entity)

        # Step 4: 公開
        publish_entity(entity)

    print("\n" + "=" * 60)
    print("  ✅ 全テーブルのビュー・フォーム カスタマイズ完了")
    print("=" * 60)


if __name__ == "__main__":
    main()
