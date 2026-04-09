"""
ソリューションに全コンポーネントを追加するスクリプト

テーブル、Code App、フローをすべて IncidentManagement ソリューションに追加する。
"""

import json
import os
import sys
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
from auth_helper import get_token

load_dotenv()

DATAVERSE_URL = os.environ["DATAVERSE_URL"].rstrip("/")
PREFIX = os.environ.get("PUBLISHER_PREFIX", "geek")
SOLUTION_NAME = os.environ.get("SOLUTION_NAME", "IncidentManagement")

API = f"{DATAVERSE_URL}/api/data/v9.2"

# コンポーネントタイプ定数
COMPONENT_TYPE_ENTITY = 1
COMPONENT_TYPE_CANVASAPP = 300
COMPONENT_TYPE_PROCESS = 29  # Cloud Flow

def headers():
    token = get_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
    }


def api_get(path):
    r = requests.get(f"{API}{path}", headers=headers())
    r.raise_for_status()
    return r.json()


def api_post(path, body):
    r = requests.post(f"{API}{path}", headers=headers(), json=body)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text[:500]}")
    r.raise_for_status()
    return r.json() if r.content else None


def add_component(solution_name, component_id, component_type, name=""):
    """ソリューションにコンポーネントを追加（AddSolutionComponent アクション）"""
    try:
        api_post("/AddSolutionComponent", {
            "ComponentId": component_id,
            "ComponentType": component_type,
            "SolutionUniqueName": solution_name,
            "AddRequiredComponents": False,
            "DoNotIncludeSubcomponents": False,
        })
        print(f"  ✅ 追加: {name} (Type={component_type}, ID={component_id})")
    except requests.HTTPError as e:
        if "already exists" in str(e.response.text if hasattr(e, 'response') and e.response else ""):
            print(f"  ⏭️  既存: {name}")
        else:
            print(f"  ⚠️  警告: {name} — {e}")


def get_solution_id():
    resp = api_get(f"/solutions?$filter=uniquename eq '{SOLUTION_NAME}'&$select=solutionid,uniquename")
    sols = resp.get("value", [])
    if not sols:
        raise RuntimeError(f"ソリューション '{SOLUTION_NAME}' が見つかりません")
    return sols[0]["solutionid"]


def get_existing_components(solution_id):
    resp = api_get(f"/solutioncomponents?$filter=_solutionid_value eq {solution_id}&$select=componenttype,objectid&$top=500")
    existing = set()
    for c in resp.get("value", []):
        existing.add((c["componenttype"], c["objectid"]))
    return existing


def main():
    print("=" * 60)
    print(f"  ソリューション '{SOLUTION_NAME}' にコンポーネントを追加")
    print("=" * 60)

    sol_id = get_solution_id()
    print(f"\nソリューション ID: {sol_id}")

    existing = get_existing_components(sol_id)
    print(f"既存コンポーネント数: {len(existing)}")

    # ── 1. テーブル（Entity）追加 ──
    print("\n--- テーブル ---")
    tables = [
        f"{PREFIX}_incident",
        f"{PREFIX}_incidentcategory",
        f"{PREFIX}_location",
        f"{PREFIX}_incidentcomment",
    ]
    for table in tables:
        # テーブルの MetadataId を取得
        resp = api_get(f"/EntityDefinitions(LogicalName='{table}')?$select=MetadataId,LogicalName,DisplayName")
        meta_id = resp["MetadataId"]
        display = resp.get("DisplayName", {}).get("LocalizedLabels", [{}])[0].get("Label", table)
        add_component(SOLUTION_NAME, meta_id, COMPONENT_TYPE_ENTITY, f"{display} ({table})")

    # ── 2. Code App（Canvas App）追加 ──
    print("\n--- Code App ---")
    # power.config.json から appId を取得
    config_path = os.path.join(os.path.dirname(__file__), "..", "power.config.json")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        app_id = config.get("appId")
        if app_id:
            # canvasapp レコードから canvasappid を取得
            resp = api_get(f"/canvasapps?$filter=name eq '{app_id}'&$select=canvasappid,name,displayname")
            apps = resp.get("value", [])
            if apps:
                canvas_id = apps[0]["canvasappid"]
                display_name = apps[0].get("displayname", app_id)
                add_component(SOLUTION_NAME, canvas_id, COMPONENT_TYPE_CANVASAPP, f"{display_name}")
            else:
                print(f"  ⚠️  Canvas App '{app_id}' が Dataverse に見つかりません")
        else:
            print("  ⚠️  power.config.json に appId がありません")
    else:
        print("  ⚠️  power.config.json が見つかりません")

    # ── 3. Cloud Flow 追加 ──
    print("\n--- Cloud Flow ---")
    # フローを検索（workflow テーブル）
    flow_name = "インシデントステータス変更通知"
    resp = api_get(f"/workflows?$filter=name eq '{flow_name}' and category eq 5&$select=workflowid,name,statecode")
    flows = resp.get("value", [])
    if flows:
        for flow in flows:
            add_component(SOLUTION_NAME, flow["workflowid"], COMPONENT_TYPE_PROCESS, flow["name"])
    else:
        print(f"  ⏭️  フロー '{flow_name}' はまだ作成されていません（後でデプロイ後に追加）")

    # ── 最終確認 ──
    print("\n--- 最終確認 ---")
    existing_after = get_existing_components(sol_id)
    print(f"コンポーネント数: {len(existing)} → {len(existing_after)}")
    print("\n✅ 完了!")


if __name__ == "__main__":
    main()
