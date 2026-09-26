"""データ基盤を plan → hash 承認 → apply → read-back で構築する（1 プラットフォーム = 1 リソースグループ）。

使い方:
    python deploy_platform.py plan  --platform fabric|databricks|foundry [--validate] [--out FILE]
    python deploy_platform.py apply --plan FILE --approve-hash HASH

plan は読み取りのみ。apply は planHash とテンプレート hash の両方が一致した場合だけ変更する。
削除は行わない。
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import (  # noqa: E402
    REFERENCES_DIR, Api, HttpError, env, get_token, load_env, print_json, read_json, require_approval,
    seal_plan, sha256_text, write_json,
)

TEMPLATES = {
    "fabric": "fabric-capacity.json",
    "databricks": "databricks-workspace.json",
    "foundry": "foundry-iq.json",
}
ARM_RG_API = "2021-04-01"
ARM_DEPLOY_API = "2021-04-01"
FABRIC_ITEM_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,122}$")
CAPACITY_RE = re.compile(r"^[a-z][a-z0-9]{2,62}$")
AZURE_NAME_RE = re.compile(r"^[a-z][a-z0-9-]{1,58}[a-z0-9]$")


def alnum(prefix: str) -> str:
    return re.sub(r"[^a-z0-9]", "", prefix.lower())


def kebab(prefix: str) -> str:
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9-]", "-", prefix.lower())).strip("-")


def snake(prefix: str) -> str:
    return re.sub(r"_{2,}", "_", re.sub(r"[^A-Za-z0-9]", "_", prefix)).strip("_").lower()


def derive_names(prefix: str) -> dict:
    """DP_NAME_PREFIX から各基盤の名前を機械的に導出する（.env の個別指定が優先）。"""
    if not prefix or not re.match(r"^[A-Za-z]", prefix):
        raise ValueError("DP_NAME_PREFIX は英字で始めてください")
    k, a, s = kebab(prefix), alnum(prefix), snake(prefix)
    names = {
        "fabric": {
            "resourceGroup": env("FABRIC_RESOURCE_GROUP", f"rg-{k}-fabric"),
            "capacityName": env("FABRIC_CAPACITY_NAME", f"{a}fabric"[:63]),
            "workspaceName": env("FABRIC_WORKSPACE_NAME", f"{k}-workspace"),
            "lakehouseName": env("FABRIC_LAKEHOUSE_NAME", f"{s}_lakehouse"),
            "ontologyName": env("FABRIC_ONTOLOGY_NAME", f"{s}_ontology"),
        },
        "databricks": {
            "resourceGroup": env("DATABRICKS_RESOURCE_GROUP", f"rg-{k}-databricks"),
            "workspaceName": env("DATABRICKS_WORKSPACE_NAME", f"dbw-{k}"),
            "managedResourceGroupName": env("DATABRICKS_MANAGED_RESOURCE_GROUP", f"rg-{k}-databricks-managed"),
            "warehouseName": env("DATABRICKS_WAREHOUSE_NAME", f"{k}-serverless"),
        },
        "foundry": {
            "resourceGroup": env("FOUNDRY_RESOURCE_GROUP", f"rg-{k}-foundry"),
            "accountName": env("FOUNDRY_ACCOUNT_NAME", f"ais-{k}"[:60]),
            "projectName": env("FOUNDRY_PROJECT_NAME", f"proj-{k}"[:60]),
            "searchName": env("SEARCH_SERVICE_NAME", f"srch-{k}"[:60]),
        },
    }
    validate_names(names)
    return names


def validate_names(names: dict) -> None:
    if not CAPACITY_RE.match(names["fabric"]["capacityName"]):
        raise ValueError("Fabric capacity 名は英小文字と数字のみ（3-63 文字、英字で開始）")
    for key in ("lakehouseName", "ontologyName"):
        if not FABRIC_ITEM_RE.match(names["fabric"][key]):
            raise ValueError(f"Fabric {key} は英数字と _ のみ（英字で開始）")
    for key in ("accountName", "searchName"):
        if not AZURE_NAME_RE.match(names["foundry"][key]):
            raise ValueError(f"Foundry {key} は英小文字・数字・ハイフン（2-60 文字）")
    groups = [names[platform]["resourceGroup"] for platform in names]
    groups.append(names["databricks"]["managedResourceGroupName"])
    if len(set(groups)) != len(groups):
        raise ValueError("リソースグループ名が重複しています（1 プラットフォーム = 1 RG）")


def template_path(platform: str) -> Path:
    return REFERENCES_DIR / "templates" / TEMPLATES[platform]


def token_object_id(token: str) -> str:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))["oid"]


def build_plan(platform: str, *, token_provider=get_token) -> dict:
    if platform not in TEMPLATES:
        raise ValueError(f"unknown platform: {platform}")
    names = derive_names(env("DP_NAME_PREFIX", required=True))[platform]
    location = env("DP_LOCATION", required=True)
    tags = {"managed-by": "data-platform", "purpose": env("DP_PURPOSE", "data-platform")}
    template = template_path(platform)
    if platform == "fabric":
        parameters = {
            "capacityName": names["capacityName"], "location": location,
            "skuName": env("FABRIC_CAPACITY_SKU", "F2"),
            "administrator": env("FABRIC_CAPACITY_ADMIN", required=True), "tags": tags,
        }
        post_steps = [{"step": "fabric-items", "workspaceName": names["workspaceName"],
                       "lakehouseName": names["lakehouseName"], "ontologyName": names["ontologyName"],
                       "capacityName": names["capacityName"]}]
    elif platform == "databricks":
        parameters = {"workspaceName": names["workspaceName"], "location": location,
                      "managedResourceGroupName": names["managedResourceGroupName"], "tags": tags}
        post_steps = [{"step": "databricks-warehouse", "warehouseName": names["warehouseName"],
                       "clusterSize": env("DATABRICKS_WAREHOUSE_SIZE", "2X-Small"), "autoStopMins": 10}]
    else:
        operator = env("DP_OPERATOR_OBJECT_ID") or token_object_id(token_provider("arm"))
        parameters = {"accountName": names["accountName"], "projectName": names["projectName"],
                      "searchName": names["searchName"], "location": location,
                      "operatorPrincipalId": operator, "tags": tags}
        for key, name in (("chatModelName", "FOUNDRY_CHAT_MODEL"), ("chatModelVersion", "FOUNDRY_CHAT_MODEL_VERSION"),
                          ("embeddingModelName", "FOUNDRY_EMBEDDING_MODEL"), ("deploymentSku", "FOUNDRY_DEPLOYMENT_SKU")):
            if env(name):
                parameters[key] = env(name)
        post_steps = []
    return seal_plan({
        "schemaVersion": "1.0",
        "platform": platform,
        "subscriptionId": env("AZURE_SUBSCRIPTION_ID", required=True),
        "location": location,
        "resourceGroup": names["resourceGroup"],
        "deploymentName": f"data-platform-{platform}",
        "template": template.name,
        "templateHash": sha256_text(template.read_bytes()),
        "parameters": parameters,
        "postSteps": post_steps,
        "tags": tags,
    })


def rg_path(plan: dict, name: str | None = None) -> str:
    return f"/subscriptions/{plan['subscriptionId']}/resourcegroups/{name or plan['resourceGroup']}"


def resource_group_exists(arm: Api, plan: dict, name: str | None = None) -> dict | None:
    try:
        return arm.json("GET", f"{rg_path(plan, name)}?api-version={ARM_RG_API}")
    except HttpError as error:
        if error.status == 404:
            return None
        raise


def validate_deployment(arm: Api, plan: dict, template: dict) -> dict:
    if resource_group_exists(arm, plan) is None:
        return {"status": "not-tested", "detail": "リソースグループが未作成のため ARM validate は apply 時に実行"}
    body = deployment_body(plan, template)
    path = f"{rg_path(plan)}/providers/Microsoft.Resources/deployments/{plan['deploymentName']}/validate?api-version={ARM_DEPLOY_API}"
    response = arm.request("POST", path, json_body=body, expected=(200, 202))
    if response.status_code == 202:
        arm.wait_operation(response)
    return {"status": "verified", "detail": "ARM validate 成功"}


def deployment_body(plan: dict, template: dict) -> dict:
    return {"properties": {"mode": "Incremental", "template": template,
                           "parameters": {key: {"value": value} for key, value in plan["parameters"].items()}}}


def guard_databricks_managed_rg(arm: Api, plan: dict) -> None:
    managed = plan["parameters"].get("managedResourceGroupName")
    if not managed:
        return
    existing = resource_group_exists(arm, plan, managed)
    if existing is None:
        return
    managed_by = str(existing.get("managedBy", ""))
    if not managed_by.lower().endswith(f"/workspaces/{plan['parameters']['workspaceName'].lower()}"):
        raise SystemExit(
            f"Databricks managed RG '{managed}' が既に存在し、この workspace の管理下にありません。"
            "managed RG は事前作成しないでください（Databricks が作成します）。別名を指定して plan をやり直してください。")


def apply_plan(plan: dict, *, arm: Api | None = None, fabric: Api | None = None,
               databricks_factory=None) -> dict:
    template_file = template_path(plan["platform"])
    if sha256_text(template_file.read_bytes()) != plan["templateHash"]:
        raise SystemExit("テンプレートが plan 作成後に変更されています。plan を再実行してください。")
    template = read_json(template_file)
    arm = arm or Api("arm")
    if plan["platform"] == "databricks":
        guard_databricks_managed_rg(arm, plan)
    arm.request("PUT", f"{rg_path(plan)}?api-version={ARM_RG_API}",
                json_body={"location": plan["location"], "tags": plan["tags"]}, expected=(200, 201))
    deploy_path = f"{rg_path(plan)}/providers/Microsoft.Resources/deployments/{plan['deploymentName']}?api-version={ARM_DEPLOY_API}"
    response = arm.request("PUT", deploy_path, json_body=deployment_body(plan, template), expected=(200, 201))
    arm.wait_operation(response, timeout=3600, interval=15)
    deployment = arm.json("GET", deploy_path)
    state = deployment.get("properties", {}).get("provisioningState")
    outputs = {key: value.get("value") for key, value in deployment.get("properties", {}).get("outputs", {}).items()}
    report = {"platform": plan["platform"], "resourceGroup": plan["resourceGroup"],
              "provisioningState": state, "outputs": outputs, "postSteps": []}
    if state != "Succeeded":
        report["status"] = "failed"
        return report
    for step in plan["postSteps"]:
        if step["step"] == "fabric-items":
            report["postSteps"].append(ensure_fabric_items(fabric or Api("fabric"), step))
        elif step["step"] == "databricks-warehouse":
            host = outputs["workspaceUrl"]
            api = databricks_factory(host) if databricks_factory else Api("databricks", f"https://{host}")
            report["postSteps"].append(ensure_warehouse(api, step))
    report["status"] = "verified"
    return report


def _find(items: list[dict], display_name: str) -> dict | None:
    return next((item for item in items if item.get("displayName") == display_name), None)


def ensure_fabric_items(fabric: Api, step: dict) -> dict:
    capacities = fabric.json("GET", "/v1/capacities").get("value", [])
    capacity = _find(capacities, step["capacityName"])
    if not capacity:
        raise SystemExit(f"Fabric capacity '{step['capacityName']}' が Fabric API から見えません（capacity 管理者を確認）")
    workspaces = fabric.json("GET", "/v1/workspaces").get("value", [])
    workspace = _find(workspaces, step["workspaceName"])
    created = []
    if not workspace:
        workspace = fabric.json("POST", "/v1/workspaces", json_body={"displayName": step["workspaceName"], "capacityId": capacity["id"]})
        created.append("workspace")
    elif workspace.get("capacityId") != capacity["id"]:
        fabric.request("POST", f"/v1/workspaces/{workspace['id']}/assignToCapacity",
                       json_body={"capacityId": capacity["id"]}, expected=(200, 202))
    items = {}
    for item_type, name, path in (("Lakehouse", step["lakehouseName"], "lakehouses"), ("Ontology", step["ontologyName"], "items")):
        existing = _find(fabric.json("GET", f"/v1/workspaces/{workspace['id']}/items?type={item_type}").get("value", []), name)
        if not existing:
            body = {"displayName": name} if item_type == "Lakehouse" else {"displayName": name, "type": item_type}
            response = fabric.request("POST", f"/v1/workspaces/{workspace['id']}/{path}", json_body=body, expected=(200, 201, 202))
            if response.status_code == 202:
                fabric.wait_operation(response)
                existing = _find(fabric.json("GET", f"/v1/workspaces/{workspace['id']}/items?type={item_type}").get("value", []), name)
            else:
                existing = response.json()
            created.append(item_type)
        items[item_type] = existing["id"]
    return {"step": "fabric-items", "status": "verified", "created": created, "workspaceId": workspace["id"],
            "capacityId": capacity["id"], "lakehouseId": items["Lakehouse"], "ontologyId": items["Ontology"]}


def ensure_warehouse(api: Api, step: dict) -> dict:
    warehouses = api.json("GET", "/api/2.0/sql/warehouses").get("warehouses", [])
    warehouse = next((item for item in warehouses if item.get("name") == step["warehouseName"]), None)
    created = False
    if not warehouse:
        warehouse = api.json("POST", "/api/2.0/sql/warehouses", json_body={
            "name": step["warehouseName"], "cluster_size": step["clusterSize"], "min_num_clusters": 1,
            "max_num_clusters": 1, "auto_stop_mins": step["autoStopMins"], "warehouse_type": "PRO",
            "enable_serverless_compute": True})
        created = True
    return {"step": "databricks-warehouse", "status": "verified", "created": created,
            "warehouseId": warehouse.get("id")}


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    plan_parser = sub.add_parser("plan")
    plan_parser.add_argument("--platform", required=True, choices=sorted(TEMPLATES))
    plan_parser.add_argument("--validate", action="store_true", help="既存 RG に対して ARM validate を実行する")
    plan_parser.add_argument("--out")
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--plan", required=True)
    apply_parser.add_argument("--approve-hash", required=True)
    apply_parser.add_argument("--out")
    args = parser.parse_args(argv)

    if args.command == "plan":
        plan = build_plan(args.platform)
        out = args.out or f".data-platform/plan-{args.platform}.json"
        write_json(out, plan)
        summary = {"plan": out, "planHash": plan["planHash"], "resourceGroup": plan["resourceGroup"],
                   "parameters": plan["parameters"], "postSteps": plan["postSteps"]}
        if args.validate:
            summary["validate"] = validate_deployment(Api("arm"), plan, read_json(template_path(args.platform)))
        print_json(summary)
        return 0

    plan = read_json(args.plan)
    require_approval(plan, args.approve_hash)
    report = apply_plan(plan)
    write_json(args.out or f".data-platform/deploy-{plan['platform']}.json", report)
    print_json(report)
    return 0 if report["status"] == "verified" else 1


if __name__ == "__main__":
    raise SystemExit(main())
