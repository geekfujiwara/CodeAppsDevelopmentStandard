"""環境戦略の現状スキャン（読み取り専用）。

テナント設定・環境グループ・環境・マネージド環境・コネクタ ポリシー・ライセンス・
アプリ / フロー数・Dataverse 容量消費・Copilot クレジットを読み取り、
[environment-strategy.json](../references/environment-strategy.json)
のブループリントと突き合わせてギャップを出力する。**一切変更しない。**

使い方:
    python scan_environment_strategy.py --tenant-id <TENANT_ID>
    python scan_environment_strategy.py --tenant-id <TENANT_ID> --report-file scan.json
    python scan_environment_strategy.py --tenant-id <TENANT_ID> --no-usage      # アプリ/フロー数の収集を省く（高速）
    python scan_environment_strategy.py --tenant-id <TENANT_ID> --client-id <APP_ID>

--client-id: 「アンマネージド カスタマイズ不可」の読み取りには Power Platform API の委任アクセス許可
`EnvironmentManagement.Settings.Read` が必要。既定のクライアントには無いため 403 になる。
許可を付与した Entra アプリの ID を渡すか、ブループリントの environmentFacts に手入力する。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import applied_policies  # noqa: E402
from auth_helper import get_token  # noqa: E402
from apply_routing_strategy import scan_routing, plan_hash as routing_plan_hash
from set_acp_connector import allowed_ids, assigned_policy_id, connector_rule_set, get_policy  # noqa: E402
from set_environment_routing import tenant_host  # noqa: E402

BAP_BASE = "https://api.bap.microsoft.com"
BAP_SCOPE = "https://api.bap.microsoft.com/.default"
PP_BASE = "https://api.powerplatform.com"
PP_SCOPE = "https://api.powerplatform.com/.default"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
POWERAPPS_BASE = "https://api.powerapps.com/providers/Microsoft.PowerApps"
POWERAPPS_SCOPE = "https://service.powerapps.com/.default"
FLOW_BASE = "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple"
FLOW_SCOPE = "https://service.flow.microsoft.com/.default"
STORAGE_TYPES = ("Database", "File", "Log")
BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
_TIMEOUT = 120


def _get(url: str, scope: str, method: str = "GET", body: dict | None = None, client_id: str | None = None):
    for attempt in range(4):
        try:
            response = requests.request(
                method,
                url,
                headers={
                    "Authorization": f"Bearer {get_token(scope=scope, client_id=client_id)}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=_TIMEOUT,
            )
            break
        except requests.exceptions.RequestException as error:
            if attempt == 3:
                return {"_error": str(error)}
            time.sleep(3)
    if response.status_code >= 300:
        return {"_error": f"HTTP {response.status_code}"}
    return response.json() if response.content else {}


def tenant_settings() -> dict:
    url = f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/listTenantSettings?api-version=2020-10-01"
    return _get(url, BAP_SCOPE, method="POST", body={})


def environment_groups() -> list[dict]:
    data = _get(f"{PP_BASE}/environmentmanagement/environmentGroups?api-version=2024-10-01", PP_SCOPE)
    return data.get("value") or []


def environments() -> list[dict]:
    url = (
        f"{BAP_BASE}/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments"
        f"?api-version=2021-04-01&$expand=properties"
    )
    return (_get(url, BAP_SCOPE).get("value")) or []


def copilot_allocations(tenant_id: str) -> dict[str, float]:
    """環境ごとの Copilot クレジット割り当てを一括取得する。"""
    data = _get(f"{tenant_host(tenant_id)}/licensing/AllocationsByEnvironment?api-version=1", PP_SCOPE)
    if isinstance(data, dict):
        return {}
    allocations = {}
    for entry in data:
        for currency in entry.get("currencyAllocations") or []:
            if currency.get("currencyType") == "MCSMessages":
                allocations[entry.get("environmentId")] = currency.get("allocated")
    return allocations


def _inventory(url: str, scope: str) -> tuple[int | None, str | None]:
    """一覧 API から件数と最終更新日時（最大値）を返す。取得できなければ (None, None)。"""
    data = _get(url, scope)
    items = data.get("value") if isinstance(data, dict) else None
    if items is None:
        return None, None
    stamps = [(item.get("properties") or {}).get("lastModifiedTime") or "" for item in items]
    latest = max(stamps) if stamps else ""
    return len(items), latest or None


def app_inventory(environment_id: str) -> tuple[int | None, str | None]:
    url = f"{POWERAPPS_BASE}/scopes/admin/environments/{environment_id}/apps?api-version=2016-11-01"
    return _inventory(url, POWERAPPS_SCOPE)


def flow_inventory(environment_id: str) -> tuple[int | None, str | None]:
    url = f"{FLOW_BASE}/scopes/admin/environments/{environment_id}/v2/flows?api-version=2016-11-01"
    return _inventory(url, FLOW_SCOPE)


def storage_by_environment(tenant_id: str) -> dict[str, float]:
    """環境ごとの Dataverse 消費量（Database + File + Log、MB）を返す。"""
    totals: dict[str, float] = {}
    host = tenant_host(tenant_id)
    for currency in STORAGE_TYPES:
        data = _get(f"{host}/licensing/environments/entitlements/{currency}?searchRequest=&api-version=1", PP_SCOPE)
        for entry in (data.get("value") or []) if isinstance(data, dict) else []:
            entitlement = entry.get("entitlement") or {}
            capacity = entitlement.get("capacity") or {}
            paygo = entitlement.get("payGo") or {}
            used = ((capacity.get("consumed") or {}).get("value") or 0) + ((paygo.get("consumed") or {}).get("value") or 0)
            environment_id = entry.get("environmentId")
            totals[environment_id] = totals.get(environment_id, 0.0) + float(used)
    return totals


def block_unmanaged_customizations(environment_id: str, client_id: str | None) -> bool | None:
    """環境の「アンマネージド カスタマイズ不可」を返す。読み取れなければ None。"""
    url = f"{PP_BASE}/environmentmanagement/environments/{environment_id}/settings?api-version=2022-03-01-preview"
    data = _get(url, PP_SCOPE, client_id=client_id)
    if not isinstance(data, dict) or "_error" in data:
        return None
    for key, value in data.items():
        if "blockunmanaged" in key.lower().replace("_", ""):
            return bool(value)
    return None


def _days_since(timestamp: str | None) -> int | None:
    if not timestamp:
        return None
    text = timestamp.strip().replace("Z", "+00:00")
    if "." in text:  # 秒の小数部は桁数が一定でなく fromisoformat が受け付けないので落とす
        head, _, tail = text.partition(".")
        offset = tail[tail.find("+"):] if "+" in tail else "+00:00"
        text = head + offset
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - parsed).days


def is_unused(environment: dict, criteria: dict) -> list[str]:
    """削除候補と判定した理由を返す（空リストなら候補ではない）。

    活動の有無はアプリ / フローの最終更新日時だけで見る。環境自体の lastModifiedTime は
    管理操作でも更新されるため、利用されているかの指標にはならない。
    """
    if criteria.get("excludeDefault", True) and environment["isDefault"]:
        return []
    if environment["sku"] in (criteria.get("excludeSkus") or []):
        return []
    apps, flows = environment["appCount"], environment["flowCount"]
    if apps is None and flows is None:
        return []
    if (apps or 0) > criteria["maxApps"] or (flows or 0) > criteria["maxFlows"]:
        return []
    age = _days_since(environment.get("createdTime"))
    if age is not None and age < criteria["inactiveDays"]:
        return []
    days = _days_since(environment["lastActivity"])
    if days is not None and days < criteria["inactiveDays"]:
        return []
    reasons = [f"アプリ {apps if apps is not None else '?'} 件 / フロー {flows if flows is not None else '?'} 件"]
    reasons.append(f"最終更新から {days} 日経過" if days is not None else "アプリ・フローの更新履歴なし")
    return reasons


def recommend_group(environment: dict, policy: dict) -> dict | None:
    """AI CoE 内製開発グループへの割り当て提案を返す。"""
    reuse = policy["reuseExistingEnvironment"]
    if environment["blockUnmanagedCustomizations"] and policy["blockUnmanagedCustomizations"]["meansProduction"]:
        return {
            "group": reuse["recommendGroup"],
            "stage": "Prod",
            "reason": "「アンマネージド カスタマイズ不可」が既に ON。本番環境の条件を満たしているため新規作成せずに採用する。",
        }
    loose = environment["acpPolicyId"] is None or (environment["acpAllowedCount"] or 0) >= reuse["looseConnectorAllowedCount"]
    if loose and (environment["appCount"] or 0) >= reuse["minApps"] and not environment["isDefault"]:
        return {
            "group": reuse["recommendGroup"],
            "stage": reuse["recommendStage"],
            "reason": f"コネクタ制限がゆるく（許可 {environment['acpAllowedCount'] or 'ACP 未割り当て'}）アプリが {environment['appCount']} 件ある実質的な内製開発環境。",
        }
    return None


def copilot_entitled(tenant_id: str) -> float | None:
    """テナントが保有する Copilot クレジット数を返す。"""
    data = _get(f"{tenant_host(tenant_id)}/licensing/entitlements/MCSMessages?api-version=1", PP_SCOPE)
    capacity = ((data.get("entitlement") or {}).get("capacity") or {}) if isinstance(data, dict) else {}
    return (capacity.get("entitled") or {}).get("value")


def license_summary(blueprint: dict) -> dict:
    data = _get("https://graph.microsoft.com/v1.0/subscribedSkus", GRAPH_SCOPE)
    if "_error" in data:
        return {"error": data["_error"]}
    managed_keys = blueprint["licenses"]["managedEnvironmentSkuKeywords"]
    copilot_keys = blueprint["licenses"]["copilotStudioSkuKeywords"]
    premium, copilot = [], []
    for sku in data.get("value") or []:
        part = (sku.get("skuPartNumber") or "").upper()
        entry = {
            "skuPartNumber": part,
            "enabled": (sku.get("prepaidUnits") or {}).get("enabled", 0),
            "consumed": sku.get("consumedUnits", 0),
        }
        if any(key in part for key in managed_keys):
            premium.append(entry)
        if any(key in part for key in copilot_keys):
            copilot.append(entry)
    return {"premiumLikeSkus": premium, "copilotStudioSkus": copilot}


def _nested(settings: dict, path: str):
    current = settings
    for part in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def scan(tenant_id: str, blueprint: dict, collect_usage: bool = True, client_id: str | None = None) -> dict:
    settings = tenant_settings()
    groups = environment_groups()
    group_by_id = {group.get("id"): group.get("displayName") for group in groups}
    allocations = copilot_allocations(tenant_id)
    storage = storage_by_environment(tenant_id)
    facts = {k: v for k, v in (blueprint.get("environmentFacts") or {}).items() if not k.startswith("$")}
    lifecycle = blueprint["lifecyclePolicy"]
    envs = []
    for environment in environments():
        properties = environment.get("properties") or {}
        environment_id = environment.get("name")
        governance = properties.get("governanceConfiguration") or {}
        extended = governance.get("settings", {}).get("extendedSettings", {}) if governance else {}
        parent = (properties.get("parentEnvironmentGroup") or {}).get("id")
        acp_policy = assigned_policy_id("Environment", environment_id)
        acp_count = None
        if acp_policy:
            rule_set = connector_rule_set(get_policy(acp_policy))
            acp_count = len(allowed_ids(rule_set)) if rule_set else None
        display_name = properties.get("displayName")
        app_count = flow_count = None
        last_activity = None
        if collect_usage:
            app_count, app_stamp = app_inventory(environment_id)
            flow_count, flow_stamp = flow_inventory(environment_id)
            last_activity = max(filter(None, [app_stamp, flow_stamp]), default=None)
        manual = facts.get(display_name) or {}
        blocked = manual.get("blockUnmanagedCustomizations")
        if blocked is None:
            blocked = block_unmanaged_customizations(environment_id, client_id)
        entry = {
            "id": environment_id,
            "displayName": display_name,
            "sku": properties.get("environmentSku"),
            "isDefault": properties.get("isDefault", False),
            "managed": governance.get("protectionLevel") == "Standard",
            "sharingLimit": extended.get("limitSharingMode"),
            "maxSharingUsers": extended.get("maxLimitUserSharing"),
            "solutionCheckerMode": extended.get("solutionCheckerMode"),
            "hasDataverse": bool(properties.get("linkedEnvironmentMetadata")),
            "group": group_by_id.get(parent),
            "acpPolicyId": acp_policy,
            "acpAllowedCount": acp_count,
            "copilotCredits": allocations.get(environment_id),
            "appCount": app_count,
            "flowCount": flow_count,
            "lastActivity": last_activity,
            "createdTime": properties.get("createdTime"),
            "storageMb": round(storage.get(environment_id, 0.0), 1),
            "blockUnmanagedCustomizations": blocked,
        }
        entry["unusedReasons"] = is_unused(entry, lifecycle["unusedEnvironment"])
        entry["recommendation"] = recommend_group(entry, lifecycle)
        envs.append(entry)

    dlp = [
        {"name": policy.get("name"), "displayName": policy.get("displayName"), "type": policy.get("environmentType")}
        for policy in applied_policies(envs[0]["id"])
    ] if envs else []

    setting_gaps = []
    for path, spec in blueprint["tenantSettings"].items():
        if "expected" not in spec:
            continue
        actual = _nested(settings, path)
        if actual != spec["expected"]:
            setting_gaps.append(
                {"setting": path, "label": spec["label"], "actual": actual, "expected": spec["expected"], "why": spec["why"]}
            )

    blueprint_groups = [group["name"] for group in blueprint["groups"]]
    existing_groups = [group.get("displayName") for group in groups]
    unused = [
        {
            "id": e["id"],
            "displayName": e["displayName"],
            "sku": e["sku"],
            "storageMb": e["storageMb"],
            "appCount": e["appCount"],
            "flowCount": e["flowCount"],
            "lastActivity": e["lastActivity"],
            "reasons": e["unusedReasons"],
        }
        for e in envs
        if e["unusedReasons"]
    ]
    return {
        "tenantId": tenant_id,
        "routingRecommendation": scan_routing(tenant_id, blueprint),
        "tenantSettings": {
            path: _nested(settings, path) for path in blueprint["tenantSettings"]
        },
        "tenantSettingGaps": setting_gaps,
        "environmentGroups": [{"id": g.get("id"), "displayName": g.get("displayName")} for g in groups],
        "missingGroups": [name for name in blueprint_groups if name not in existing_groups],
        "environments": envs,
        "unmanagedEnvironments": [e["displayName"] for e in envs if not e["managed"] and e["hasDataverse"]],
        "ungroupedEnvironments": [e["displayName"] for e in envs if not e["group"] and e["hasDataverse"]],
        "unusedEnvironmentCandidates": unused,
        "reclaimableStorageMb": round(sum(e["storageMb"] for e in unused), 1),
        "groupRecommendations": [
            {"displayName": e["displayName"], "id": e["id"], **e["recommendation"]}
            for e in envs
            if e["recommendation"]
        ],
        "blockUnmanagedUnknown": [e["displayName"] for e in envs if e["blockUnmanagedCustomizations"] is None],
        "classicDlpPolicies": dlp,
        "licenses": license_summary(blueprint),
        "copilotCreditsEntitled": copilot_entitled(tenant_id),
    }


def print_report(report: dict, blueprint: dict) -> None:
    print("=== 環境戦略スキャン（読み取りのみ・変更していません）===\n")
    routing = report["routingRecommendation"]
    print(f"推奨: 新旧すべてのルーティング宛先を {routing['targetGroup']['displayName']} へ統一（同意後のみ実行）")
    for rule in routing["rules"]:
        print(f"  {rule['ruleName']}: {rule['sourceGroupId']} -> {rule['targetGroupId']} / 変更={rule['changeRequired']}")
    print(f"  旧設定: {routing['legacyChange']}")
    print("  対象ユーザー・ポータル・優先順位・既存環境所属は保持。apply_routing_strategy.py の計画を承認後に適用。")

    print(f"環境グループ: {len(report['environmentGroups'])} 件")
    for group in report["environmentGroups"]:
        print(f"  - {group['displayName']}")
    if report["missingGroups"]:
        print(f"  未作成（推奨）: {', '.join(report['missingGroups'])}")

    print(f"\n環境: {len(report['environments'])} 件")
    print(f"  {'環境名':<28}{'SKU':<12}{'managed':<9}{'アプリ':<7}{'フロー':<7}{'容量MB':<10}{'グループ':<24}{'ACP許可':<8}Copilot")
    for environment in report["environments"]:
        print(
            f"  {str(environment['displayName'])[:26]:<28}"
            f"{str(environment['sku'])[:10]:<12}"
            f"{'はい' if environment['managed'] else 'いいえ':<9}"
            f"{str(environment['appCount'] if environment['appCount'] is not None else '-'):<7}"
            f"{str(environment['flowCount'] if environment['flowCount'] is not None else '-'):<7}"
            f"{environment['storageMb']:<10g}"
            f"{str(environment['group'] or '-')[:22]:<24}"
            f"{str(environment['acpAllowedCount'] or '-'):<8}"
            f"{environment['copilotCredits'] if environment['copilotCredits'] is not None else '-'}"
        )

    criteria = blueprint["lifecyclePolicy"]["unusedEnvironment"]
    candidates = report["unusedEnvironmentCandidates"]
    print("\n--- 使われていない環境（削除候補）---")
    print(
        f"  判定基準: アプリ {criteria['maxApps']} 件以下かつフロー {criteria['maxFlows']} 件以下、"
        f"かつ最終更新から {criteria['inactiveDays']} 日以上経過"
    )
    if not candidates:
        print("  候補はありません。")
    for candidate in candidates:
        print(f"  - {candidate['displayName']}（{candidate['sku']}）{candidate['storageMb']:g}MB")
        print(f"      {' / '.join(candidate['reasons'])}")
    if candidates:
        print(
            f"\n  [アドバイス] 環境グループへ入れる前にこの {len(candidates)} 環境を削除すると、"
            f"Dataverse 容量を {report['reclaimableStorageMb']:g}MB 削減できます。"
        )
        print(f"           {criteria['action']}")
        print(f"           {criteria['note']}")

    recommendations = report["groupRecommendations"]
    if recommendations:
        print("\n--- 既存環境の割り当て提案 ---")
        for item in recommendations:
            print(f"  - {item['displayName']} → {item['group']} / {item['stage']}")
            print(f"      {item['reason']}")
    if report["blockUnmanagedUnknown"]:
        print(
            f"\n  [確認] 「アンマネージド カスタマイズ不可」を読み取れなかった環境: "
            f"{len(report['blockUnmanagedUnknown'])} 件"
        )
        print(f"         {blueprint['lifecyclePolicy']['blockUnmanagedCustomizations']['fallback']}")

    if report["unmanagedEnvironments"]:
        print(f"\n[要対応] マネージド環境ではない: {', '.join(report['unmanagedEnvironments'])}")
        print("         環境グループにはマネージド環境しか入れられません。")
    if report["ungroupedEnvironments"]:
        print(f"[要対応] どのグループにも属していない: {', '.join(report['ungroupedEnvironments'])}")

    print("\n--- テナント設定 ---")
    for path, spec in blueprint["tenantSettings"].items():
        actual = report["tenantSettings"].get(path)
        expected = spec.get("expected", spec.get("expectedGroup"))
        mark = "OK  " if "expected" in spec and actual == spec["expected"] else "確認"
        print(f"  [{mark}] {spec['label']}: 現在={actual} / 推奨={expected}")

    print(f"\n--- クラシック DLP（適用中 {len(report['classicDlpPolicies'])} 件）---")
    for policy in report["classicDlpPolicies"]:
        print(f"  {policy['displayName']} ({policy['type']})")
    print(f"  推奨: {blueprint['connectorPolicy']['mode']}（{blueprint['connectorPolicy']['profile']} プロファイル）")

    licenses = report["licenses"]
    print("\n--- ライセンス ---")
    if licenses.get("error"):
        print(f"  取得できませんでした（{licenses['error']}）。Microsoft Graph の権限を確認してください。")
    else:
        if not licenses["premiumLikeSkus"]:
            print("  [要対応] Power Apps Premium 等のスタンドアロン ライセンスが見つかりません。")
            print(f"           {blueprint['licenses']['why']}")
        for sku in licenses["premiumLikeSkus"]:
            print(f"  {sku['skuPartNumber']}: {sku['consumed']} / {sku['enabled']}")
        if not licenses["copilotStudioSkus"]:
            print("  [確認] Copilot Studio のライセンス / クレジットが見つかりません。")
        for sku in licenses["copilotStudioSkus"]:
            print(f"  {sku['skuPartNumber']}: {sku['consumed']} / {sku['enabled']}")

    allocated = sum(e["copilotCredits"] or 0 for e in report["environments"])
    entitled = report.get("copilotCreditsEntitled")
    print(f"\n  Copilot クレジット（MCSMessages）: 保有 {entitled if entitled is not None else '?'} / 割り当て済み合計 {allocated}")
    if entitled is not None and allocated > entitled:
        print(f"  [要対応] 保有数を {allocated - entitled:g} 超えて割り当てています。set_environment_capacity.py で調整してください。")


def main() -> int:
    parser = argparse.ArgumentParser(description="環境戦略の現状を読み取り専用でスキャンする")
    parser.add_argument("--tenant-id", default=os.environ.get("TENANT_ID"), help="テナント ID")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--report-file", type=Path, help="スキャン結果を JSON で書き出す")
    parser.add_argument("--routing-only", action="store_true", help="全グループ・環境所属・新旧ルーティングに絞った読み取りスキャン")
    parser.add_argument(
        "--no-usage",
        action="store_true",
        help="アプリ / フロー数の収集を省く（高速。削除候補の判定は行われない）",
    )
    parser.add_argument(
        "--client-id",
        help="アンマネージド カスタマイズ不可の読み取りに使う Entra アプリ ID（EnvironmentManagement.Settings.Read が必要）",
    )
    args = parser.parse_args()

    if not args.tenant_id:
        parser.error("--tenant-id が必要です。")

    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    if args.routing_only:
        plan = scan_routing(args.tenant_id, blueprint)
        report = {"tenantId": args.tenant_id, "routingRecommendation": plan, "expectedHash": routing_plan_hash(plan), "readOnly": True}
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if args.report_file:
            args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0
    report = scan(args.tenant_id, blueprint, collect_usage=not args.no_usage, client_id=args.client_id)
    print_report(report, blueprint)

    if args.report_file:
        args.report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nスキャン結果を書き出しました: {args.report_file}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
