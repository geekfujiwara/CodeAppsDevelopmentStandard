#!/usr/bin/env python3
"""Create the Azure timer that runs a Foundry Autopilot teammate's schedules (feature block B11).

Schedules live in the Foundry state store and run inside the agent's own container, but a hosted
session stops after its idle timeout, so something outside has to wake it. This creates a
Consumption Logic App with a system-assigned managed identity that, every SCHEDULE_TICK_MINUTES,
posts ``{"type": "schedule_tick"}`` to the agent's Invocations endpoint. The identity gets the
least-privileged Foundry role that may invoke an agent, on the project only. No keys or secrets.

Prerequisites (publish_foundry_autopilot.py does both when SCHEDULE_ENABLED=true):
  * the agent version declares the ``invocations`` container protocol
  * the agent endpoint exposes ``invocations`` with the ``Entra`` authorization scheme

Usage:
    python scripts/provision_schedule_trigger.py --env <path>             # dry-run
    python scripts/provision_schedule_trigger.py --env <path> --execute
    python scripts/provision_schedule_trigger.py --env <path> --tick-now  # one tick, for testing

Env: AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_AI_ACCOUNT, AZURE_AI_PROJECT,
     FOUNDRY_PROJECT_ENDPOINT, AGENT_NAME, SCHEDULE_TICK_MINUTES (default 15),
     SCHEDULE_LOGIC_APP_NAME (default <AGENT_NAME>-schedule)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

import requests

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
import auth_helper  # noqa: E402

ARM = "https://management.azure.com"
ARM_SCOPE = f"{ARM}/.default"
FOUNDRY_SCOPE = "https://ai.azure.com/.default"
TICK_SESSION = "schedule-tick"
# Sessions are isolated per caller: an id first used by a person answers the timer with
# 403 session_not_accessible, so manual ticks never touch the timer's id.
MANUAL_TICK_SESSION = "schedule-tick-manual"
# Least privilege first; older tenants only have the broader role.
INVOKER_ROLES = ("Foundry Agent Consumer", "Azure AI Agent Consumer", "Foundry User")


def load_env(path: Path | None) -> None:
    if not path or not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def need(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        sys.exit(f"{name} が未設定です")
    return value


def arm(method: str, path: str, body: dict | None = None) -> requests.Response:
    token = auth_helper.get_token(ARM_SCOPE)
    return requests.request(method, f"{ARM}{path}", headers={"Authorization": f"Bearer {token}"},
                            json=body, timeout=120)


def tick_url(session: str = TICK_SESSION) -> str:
    base = need("FOUNDRY_PROJECT_ENDPOINT").rstrip("/")
    # A fixed session id reuses one sandbox instead of leaving a new stopped session per tick.
    return (f"{base}/agents/{need('AGENT_NAME')}/endpoint/protocols/invocations"
            f"?api-version=v1&agent_session_id={session}")


def workflow_body(location: str, minutes: int) -> dict:
    return {
        "location": location,
        "identity": {"type": "SystemAssigned"},
        "properties": {
            "state": "Enabled",
            "definition": {
                "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
                "contentVersion": "1.0.0.0",
                "triggers": {
                    "Every_tick": {"type": "Recurrence", "recurrence": {"frequency": "Minute", "interval": minutes}},
                },
                "actions": {
                    "Run_due_schedules": {
                        "type": "Http",
                        "runAfter": {},
                        "inputs": {
                            "method": "POST",
                            "uri": tick_url(),
                            "headers": {"Content-Type": "application/json"},
                            "body": {"type": "schedule_tick"},
                            "authentication": {"type": "ManagedServiceIdentity", "audience": "https://ai.azure.com"},
                        },
                    },
                },
            },
        },
    }


def project_scope() -> str:
    return (f"/subscriptions/{need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/{need('AZURE_RESOURCE_GROUP')}"
            f"/providers/Microsoft.CognitiveServices/accounts/{need('AZURE_AI_ACCOUNT')}/projects/{need('AZURE_AI_PROJECT')}")


def grant(principal_id: str, scope: str, roles: tuple[str, ...], label: str) -> None:
    for role in roles:
        found = arm("GET", f"{scope}/providers/Microsoft.Authorization/roleDefinitions"
                           f"?api-version=2022-04-01&$filter=roleName eq '{role}'").json().get("value", [])
        if not found:
            continue
        body = {"properties": {"roleDefinitionId": found[0]["id"], "principalId": principal_id,
                               "principalType": "ServicePrincipal"}}
        # A brand-new identity takes a while to replicate to the authorization service.
        for _ in range(12):
            resp = arm("PUT", f"{scope}/providers/Microsoft.Authorization/roleAssignments/{uuid.uuid4()}"
                              "?api-version=2022-04-01", body)
            if resp.status_code in (200, 201) or "RoleAssignmentExists" in resp.text:
                print(f"  OK {role} を{label}に付与しました")
                return
            if "PrincipalNotFound" not in resp.text:
                sys.exit(f"ロール付与に失敗しました: {resp.status_code} {resp.text[:300]}")
            time.sleep(10)
        sys.exit(f"{label}がまだ見つかりません。少し待って --execute をやり直してください")
    sys.exit(f"付与できるロールがありません（{', '.join(roles)}）")


def ensure_provider(subscription: str, namespace: str) -> None:
    """A subscription that never used the service rejects the PUT with MissingSubscriptionRegistration."""
    path = f"/subscriptions/{subscription}/providers/{namespace}"
    if arm("GET", f"{path}?api-version=2021-04-01").json().get("registrationState") == "Registered":
        return
    arm("POST", f"{path}/register?api-version=2021-04-01")
    for _ in range(30):
        if arm("GET", f"{path}?api-version=2021-04-01").json().get("registrationState") == "Registered":
            print(f"  OK {namespace} リソース プロバイダーを登録しました")
            return
        time.sleep(10)
    sys.exit(f"{namespace} の登録が終わりません。少し待ってやり直してください")


def tick_now() -> None:
    token = auth_helper.get_token(FOUNDRY_SCOPE)
    resp = requests.post(tick_url(MANUAL_TICK_SESSION), headers={"Authorization": f"Bearer {token}"},
                         json={"type": "schedule_tick"}, timeout=180)
    print(f"  tick -> {resp.status_code} {resp.text[:200]}")
    if resp.status_code not in (200, 202):
        sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path, help="値を読む .env")
    parser.add_argument("--execute", action="store_true", help="Logic App を作成・更新してロールを付与する")
    parser.add_argument("--tick-now", action="store_true", help="今すぐ 1 回だけ tick を送る（自分の資格情報で）")
    args = parser.parse_args()
    load_env(args.env)

    if args.tick_now:
        tick_now()
        return 0

    minutes = int(os.environ.get("SCHEDULE_TICK_MINUTES") or 15)
    name = os.environ.get("SCHEDULE_LOGIC_APP_NAME") or f"{need('AGENT_NAME')}-schedule"
    group = f"/subscriptions/{need('AZURE_SUBSCRIPTION_ID')}/resourceGroups/{need('AZURE_RESOURCE_GROUP')}"
    location = arm("GET", f"{group}?api-version=2021-04-01").json()["location"]
    body = workflow_body(location, minutes)
    print(f"== Logic App {name}（{location}、{minutes} 分ごと）==")
    print(f"  POST {tick_url()}")
    if not args.execute:
        print(json.dumps(body, ensure_ascii=False, indent=2))
        print("dry-run です。--execute で作成します。")
        return 0

    ensure_provider(need("AZURE_SUBSCRIPTION_ID"), "Microsoft.Logic")
    resp = arm("PUT", f"{group}/providers/Microsoft.Logic/workflows/{name}?api-version=2019-05-01", body)
    if resp.status_code not in (200, 201):
        sys.exit(f"Logic App を作成できませんでした: {resp.status_code} {resp.text[:400]}")
    principal = (resp.json().get("identity") or {}).get("principalId")
    print(f"  OK Logic App（managed identity {principal}）")
    grant(principal, project_scope(), INVOKER_ROLES, "Logic App の ID（プロジェクト スコープ）")
    print("  ロールの反映に数分かかります。最初の数回の tick が 401/403 になるのは正常です。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
