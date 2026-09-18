#!/usr/bin/env python3
"""Publish a Foundry hosted agent as a Microsoft 365 Autopilot (digital coworker).

An Autopilot blueprint gives every hired instance its **own Entra agent user account**
(mailbox, calendar, OneDrive, Teams presence, org-chart manager): the same outcome as the
self-hosted route in self-hosted-agent.md, but the container runs on Foundry.

Performs, in order:
  1. Preflight (--check): env vars, Agent 365 license seats, resource-app existence.
  2. POST  /agents/{name}/versions          (digital_worker_type=m365) + poll until active.
  3. Grant "Foundry User" to the instance identity on the project scope.
  4. PATCH /agents/{name}                   (authorization_schemes=[BotServiceRbac]).
  5. POST  /agents/{name}/microsoft365/publish (publishAsAutopilot=true).

Approval in the M365 admin center and hiring in Teams stay manual - see
references/foundry-autopilot.md section 6.

Usage:
    python scripts/publish_foundry_autopilot.py --check      # preflight only, no writes
    python scripts/publish_foundry_autopilot.py              # dry-run: print request bodies
    python scripts/publish_foundry_autopilot.py --execute    # create version + patch + publish
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import requests

# Windows の既定コンソール（cp932）でも日本語・記号を落とさない（troubleshooting.md #66）
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

_THIS = Path(__file__).resolve()
_STANDARD_SCRIPTS: Path | None = None
for _parent in _THIS.parents:
    _cand = _parent / ".github" / "skills" / "standard" / "scripts"
    if _cand.is_dir():
        _STANDARD_SCRIPTS = _cand
        break
if _STANDARD_SCRIPTS is None:
    sys.exit("auth_helper が見つかりません（.github/skills/standard/scripts）。リポジトリ内で実行してください。")
sys.path.insert(0, str(_STANDARD_SCRIPTS))

import auth_helper  # noqa: E402

FOUNDRY_SCOPE = "https://ai.azure.com/.default"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"
ARM_SCOPE = "https://management.azure.com/.default"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"
ARM_BASE = "https://management.azure.com"

# Foundry gates the digital-worker surface behind this preview feature header.
DIGITAL_WORKER_HEADER = {"Foundry-Features": "DigitalWorker=V1Preview"}

# All Agent 365 MCP servers (Mail / Calendar / Teams / Word / Excel / OneDrive) live under
# this single first-party resource app, which is identical in every tenant.
A365_MCP_RESOURCE_APP_ID = "ea9ffc3e-8a23-4a7d-836d-234d7c7565c1"
A365_MCP_DEFAULT_SCOPES = [
    "McpServers.Mail.All",
    "McpServers.Calendar.All",
    "McpServers.Teams.All",
    "McpServers.OneDriveSharepoint.All",
    "McpServers.Word.All",
    "McpServers.Excel.All",
]
# Optional: only present in tenants that actually use Azure DevOps.
ADO_MCP_RESOURCE_APP_ID = "2a72489c-aab2-4b65-b93a-a91edccf33b8"
ADO_MCP_SCOPES = ["Ado.Mcp.Tools"]

AGENT_DISPLAY_NAME_MAX = 32
POLL_INTERVAL_SECONDS = 10
POLL_MAX_ATTEMPTS = 30


class PreflightError(Exception):
    """A prerequisite that would make a later write call fail."""


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def find_repo_env() -> Path | None:
    for parent in _THIS.parents:
        if (parent / ".git").exists() or (parent / ".github").is_dir():
            candidate = parent / ".env"
            if candidate.is_file():
                return candidate
    return None


def require(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise PreflightError(f"{name} が未設定です（.env または環境変数に設定してください）")
    return value


def graph_get(path: str) -> dict:
    token = auth_helper.get_token(GRAPH_SCOPE)
    resp = requests.get(f"{GRAPH_BASE}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    resp.raise_for_status()
    return resp.json()


def existing_resource_app_ids(app_ids: list[str]) -> set[str]:
    """Return the subset of app_ids that has a servicePrincipal in this tenant."""
    found: set[str] = set()
    for app_id in app_ids:
        data = graph_get(f"/servicePrincipals?$filter=appId eq '{app_id}'&$select=appId")
        if data.get("value"):
            found.add(app_id)
    return found


def build_permission_scopes() -> list[dict]:
    """Request only resource apps that exist in the tenant.

    Publishing fails with `dependency_error: Resource app '<id>' does not exist in the tenant`
    when an unknown resourceAppId is requested, so the membership check runs on every publish
    (not just when troubleshooting). See references/troubleshooting.md #21.
    """
    wanted = [
        {"resourceAppId": A365_MCP_RESOURCE_APP_ID, "scopes": list(A365_MCP_DEFAULT_SCOPES)},
    ]
    if (os.environ.get("AZURE_DEVOPS_ORGANIZATION") or "").strip():
        wanted.append({"resourceAppId": ADO_MCP_RESOURCE_APP_ID, "scopes": list(ADO_MCP_SCOPES)})

    present = existing_resource_app_ids([entry["resourceAppId"] for entry in wanted])
    kept, dropped = [], []
    for entry in wanted:
        (kept if entry["resourceAppId"] in present else dropped).append(entry)
    for entry in dropped:
        print(f"  ! resourceAppId {entry['resourceAppId']} はこのテナントに存在しないため除外しました")
    if not kept:
        raise PreflightError(
            "要求できる resource app がありません。Agent 365 の MCP 第一者アプリが"
            "テナントにプロビジョニングされているか確認してください"
        )
    return kept


def agent365_seats() -> tuple[int, int] | None:
    """Return (consumed, enabled) for the Agent 365 SKU, or None when the SKU is absent."""
    data = graph_get("/subscribedSkus?$select=skuPartNumber,prepaidUnits,consumedUnits")
    for sku in data.get("value", []):
        if (sku.get("skuPartNumber") or "").upper().startswith("AGENT_365"):
            return int(sku.get("consumedUnits") or 0), int((sku.get("prepaidUnits") or {}).get("enabled") or 0)
    return None


def preflight(display_name: str) -> list[dict]:
    print("== 事前チェック ==")
    for name in ("FOUNDRY_PROJECT_ENDPOINT", "AGENT_NAME", "AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP"):
        require(name)
    print("  OK 必須の環境変数")

    if len(display_name) > AGENT_DISPLAY_NAME_MAX:
        raise PreflightError(
            f"AGENT_DISPLAY_NAME は {AGENT_DISPLAY_NAME_MAX} 文字以内にしてください（現在 {len(display_name)} 文字）"
        )
    print(f"  OK 表示名 '{display_name}'（{len(display_name)}/{AGENT_DISPLAY_NAME_MAX} 文字）")

    seats = agent365_seats()
    if seats is None:
        print("  ! Agent 365 の SKU が見つかりません。ライセンスが無いとインスタンス作成で失敗します")
    else:
        consumed, enabled = seats
        free = enabled - consumed
        marker = "OK" if free > 0 else "!"
        print(f"  {marker} Agent 365 ライセンス: {consumed}/{enabled} 使用（空き {free} 席。1 インスタンス = 1 席）")

    scopes = build_permission_scopes()
    print(f"  OK 要求する resource app: {len(scopes)} 件")
    return scopes


def foundry_request(method: str, url: str, body: dict | None = None) -> dict:
    token = auth_helper.get_token(FOUNDRY_SCOPE)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json", **DIGITAL_WORKER_HEADER}
    if body is not None:
        headers["Content-Type"] = "application/json"
    resp = requests.request(method, url, headers=headers, json=body, timeout=120)
    if not resp.ok:
        raise SystemExit(f"{method} {url} が {resp.status_code} で失敗しました: {resp.text}")
    return resp.json() if resp.content else {}


def build_version_body() -> dict:
    deployment = (os.environ.get("AUTOPILOT_MODEL_DEPLOYMENT") or "").strip() or require("AZURE_OPENAI_DEPLOYMENT")
    env_vars = {"ModelDeployment": deployment}
    tenant_id = (os.environ.get("AZURE_TENANT_ID") or "").strip()
    if tenant_id:
        env_vars["CONNECTIONS__SERVICE_CONNECTION__SETTINGS__TENANTID"] = tenant_id
        env_vars["CONNECTIONS__SERVICE_CONNECTION__SETTINGS__AUTHORITY"] = (
            f"https://login.microsoftonline.com/{tenant_id}"
        )
    toolbox = (os.environ.get("FOUNDRY_TOOLBOX_ENDPOINT") or "").strip()
    if toolbox:
        env_vars["TOOLBOX_ENDPOINT"] = toolbox

    image = f"{require('ACR_LOGIN_SERVER')}/{require('AGENT_IMAGE_NAME')}:{os.environ.get('AGENT_IMAGE_TAG', 'latest')}"
    return {
        "definition": {
            "kind": "hosted",
            "image": image,
            "cpu": os.environ.get("AUTOPILOT_CONTAINER_CPU", "2"),
            "memory": os.environ.get("AUTOPILOT_CONTAINER_MEMORY", "4Gi"),
            "container_protocol_versions": [{"protocol": "activity_protocol", "version": "v1"}],
            "environment_variables": env_vars,
        },
        "description": os.environ.get("AGENT_DESCRIPTION", "Foundry autopilot."),
        "agent_endpoint": agent_endpoint(),
        "digital_worker_type": "m365",
    }


def agent_endpoint(with_auth_scheme: bool = False) -> dict:
    endpoint: dict = {
        "protocols": ["activity"],
        "protocol_configuration": {"activity": {"enable_m365_public_endpoint": True}},
    }
    if with_auth_scheme:
        endpoint["authorization_schemes"] = [{"type": "BotServiceRbac"}]
    return endpoint


def build_publish_body(display_name: str, scopes: list[dict]) -> dict:
    return {
        "agentDisplayName": display_name,
        "publishAsAutopilot": True,
        "publishScope": os.environ.get("AUTOPILOT_PUBLISH_SCOPE", "Tenant"),
        "appVersion": os.environ.get("TEAMS_APP_VERSION", "1.0.0"),
        "canRespondWithoutMention": True,
        "shortDescription": os.environ.get("AGENT_DESCRIPTION_SHORT", f"{display_name} (Foundry Autopilot)"),
        "fullDescription": os.environ.get("AGENT_DESCRIPTION_FULL", f"{display_name} - AI teammate."),
        "developerName": require("DEVELOPER_NAME"),
        "developerWebsiteUrl": require("DEVELOPER_WEBSITE_URL"),
        "privacyUrl": require("DEVELOPER_PRIVACY_URL"),
        "termsOfUseUrl": require("DEVELOPER_TERMS_URL"),
        "optionalPermissionScopes": scopes,
    }


def wait_until_active(base: str, agent_name: str, version: str, api_version: str) -> dict:
    url = f"{base}/agents/{agent_name}/versions/{version}?api-version={api_version}"
    for attempt in range(POLL_MAX_ATTEMPTS):
        payload = foundry_request("GET", url)
        status = payload.get("status", "unknown")
        print(f"  status={status} ({attempt + 1}/{POLL_MAX_ATTEMPTS})")
        if status == "active":
            return payload
        if status == "failed":
            raise SystemExit(f"agent version のプロビジョニングが失敗しました: {json.dumps(payload, ensure_ascii=False)}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise SystemExit("agent version が時間内に active になりませんでした")


def grant_foundry_user(principal_id: str) -> None:
    """Assign the built-in 'Foundry User' role to the instance identity on the project scope."""
    subscription = require("AZURE_SUBSCRIPTION_ID")
    resource_group = require("AZURE_RESOURCE_GROUP")
    account = require("AZURE_AI_ACCOUNT")
    project = require("AZURE_AI_PROJECT")
    scope = (
        f"/subscriptions/{subscription}/resourceGroups/{resource_group}"
        f"/providers/Microsoft.CognitiveServices/accounts/{account}/projects/{project}"
    )
    token = auth_helper.get_token(ARM_SCOPE)
    headers = {"Authorization": f"Bearer {token}"}
    roles = requests.get(
        f"{ARM_BASE}{scope}/providers/Microsoft.Authorization/roleDefinitions"
        "?api-version=2022-04-01&$filter=roleName eq 'Foundry User'",
        headers=headers,
        timeout=60,
    )
    roles.raise_for_status()
    definitions = roles.json().get("value", [])
    if not definitions:
        raise SystemExit("'Foundry User' ロール定義が見つかりませんでした")

    import uuid

    assignment_id = str(uuid.uuid4())
    body = {"properties": {"roleDefinitionId": definitions[0]["id"], "principalId": principal_id}}
    resp = requests.put(
        f"{ARM_BASE}{scope}/providers/Microsoft.Authorization/roleAssignments/{assignment_id}"
        "?api-version=2022-04-01",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=60,
    )
    if resp.status_code in (200, 201):
        print("  OK Foundry User ロールを付与しました")
    elif resp.status_code == 409 or "RoleAssignmentExists" in resp.text:
        print("  OK Foundry User ロールは付与済みです")
    else:
        raise SystemExit(f"ロール付与に失敗しました: {resp.status_code} {resp.text}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="事前チェックだけ行い、何も変更しない")
    parser.add_argument("--execute", action="store_true", help="実際に agent version 作成・PATCH・発行を行う")
    parser.add_argument("--env", type=Path, help=".env のパス（既定はリポジトリ ルート）")
    args = parser.parse_args()

    load_env(args.env or find_repo_env() or Path(".env"))

    try:
        display_name = os.environ.get("AGENT_DISPLAY_NAME") or require("AGENT_NAME")
        scopes = preflight(display_name)
    except PreflightError as exc:
        print(f"事前チェックに失敗しました: {exc}", file=sys.stderr)
        return 1

    if args.check:
        return 0

    base = require("FOUNDRY_PROJECT_ENDPOINT").rstrip("/")
    agent_name = require("AGENT_NAME")
    api_version = os.environ.get("FOUNDRY_API_VERSION", "2025-11-15-preview")
    version_body = build_version_body()
    publish_body = build_publish_body(display_name, scopes)

    if not args.execute:
        print("\n== dry-run（--execute で実行）==")
        print("POST /agents/{name}/versions:")
        print(json.dumps(version_body, ensure_ascii=False, indent=2))
        print("POST /agents/{name}/microsoft365/publish:")
        print(json.dumps(publish_body, ensure_ascii=False, indent=2))
        return 0

    print("\n== agent version を作成します ==")
    created = foundry_request(
        "POST", f"{base}/agents/{agent_name}/versions?api-version={api_version}", version_body
    )
    version = created["version"]
    print(f"  version={version} blueprint={created.get('blueprint_reference', {}).get('blueprint_id')}")
    if created.get("status") != "active":
        created = wait_until_active(base, agent_name, version, api_version)

    grant_foundry_user(created["instance_identity"]["principal_id"])

    print("\n== BotServiceRbac を設定します ==")
    foundry_request(
        "PATCH",
        f"{base}/agents/{agent_name}?api-version={api_version}",
        {"agent_endpoint": agent_endpoint(with_auth_scheme=True)},
    )
    print("  OK")

    print("\n== Autopilot として M365 に発行します ==")
    published = foundry_request(
        "POST", f"{base}/agents/{agent_name}/microsoft365/publish?api-version={api_version}", publish_body
    )
    print(f"  teamsAppId={published.get('teamsAppId')} titleId={published.get('titleId')}")

    print(
        "\n次は管理者の操作です:\n"
        "  1. M365 管理センター → エージェント → すべてのエージェント → 要求 で承認（管理者の同意を付与）\n"
        "  2. Teams → アプリ → Agents for your team → インスタンスを作成（上司を指定）\n"
        "  詳細: references/foundry-autopilot.md §6"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
