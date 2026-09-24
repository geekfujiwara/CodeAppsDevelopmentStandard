#!/usr/bin/env python3
"""Publish a Foundry hosted agent as a Microsoft 365 Autopilot (digital coworker).

An Autopilot blueprint gives every hired instance its **own Entra agent user account**
(mailbox, calendar, OneDrive, Teams presence, org-chart manager): the same outcome as the
self-hosted route in self-hosted-agent.md, but the container runs on Foundry.

Performs, in order:
  1. Preflight (--check): env vars, Agent 365 license seats, resource-app existence,
     and - when IMAGE_MODEL_DEPLOYMENT is set - that the image deployment really exists.
  2. POST  /agents/{name}/versions          (digital_worker_type=m365) + poll until active.
  3. Enable the instance identity service principal (created disabled - troubleshooting #75).
  4. Grant "Foundry User" on the project, plus the account when image generation is on.
  5. PATCH /agents/{name}                   (authorization_schemes=[BotServiceRbac]).
  6. POST  /agents/{name}/microsoft365/publish (publishAsAutopilot=true + accessBoundaries).

Approval in the M365 admin center and hiring in Teams stay manual - see
references/foundry-autopilot.md section 6.

Usage:
    python scripts/publish_foundry_autopilot.py --check      # preflight only, no writes
    python scripts/publish_foundry_autopilot.py              # dry-run: print request bodies
    python scripts/publish_foundry_autopilot.py --execute    # create version + patch + publish
    python scripts/publish_foundry_autopilot.py --execute --bump-version   # republish an update
    python scripts/publish_foundry_autopilot.py --execute --container-only # ship a code fix only
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

# Without these the runtime rejects *every* inbound activity with
# "Autopilot activity authorization currently supports only access boundaries ending with
# '.developers'" and Teams stays silent. The four values are the full 1:1 + group matrix; Foundry
# decides who counts as a developer from the sender's Azure role assignments on the project
# (Microsoft.CognitiveServices/accounts/AIServices/agents/write). See troubleshooting.md #74.
AUTOPILOT_ACCESS_BOUNDARIES = [
    "read.1on1.developers",
    "write.1on1.developers",
    "read.group.developers",
    "write.group.developers",
]

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


def image_model_deployment() -> str:
    return (os.environ.get("IMAGE_MODEL_DEPLOYMENT") or "").strip()


def assert_image_deployment_exists() -> None:
    """Fail before publishing when IMAGE_MODEL_DEPLOYMENT names a deployment that is not there.

    Without this the agent starts, finds no deployment behind the name and silently answers
    that it cannot draw - the failure surfaces only in Teams (→ troubleshooting.md #78).
    """
    deployment = image_model_deployment()
    if not deployment:
        print("  - IMAGE_MODEL_DEPLOYMENT 未設定のため画像生成（B17）は無効のまま発行します")
        return

    url = (
        f"{ARM_BASE}{account_scope()}/deployments/{deployment}"
        "?api-version=2023-05-01"
    )
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {auth_helper.get_token(ARM_SCOPE)}"},
        timeout=60,
    )
    if resp.status_code == 404:
        raise PreflightError(
            f"IMAGE_MODEL_DEPLOYMENT='{deployment}' が {require('AZURE_AI_ACCOUNT')} に存在しません。"
            "先に scripts/provision_image_model.py --execute で作成してください"
        )
    if not resp.ok:
        raise PreflightError(f"画像モデルのデプロイメントを確認できませんでした: {resp.status_code} {resp.text}")

    props = resp.json().get("properties") or {}
    state = props.get("provisioningState")
    if state != "Succeeded":
        raise PreflightError(f"画像モデル '{deployment}' の provisioningState が {state} です（Succeeded を待ってください）")
    model = (props.get("model") or {}).get("name", "?")
    print(f"  OK 画像モデル '{deployment}'（{model}）")


def preflight(display_name: str) -> list[dict]:
    print("== 事前チェック ==")
    # AZURE_AI_ACCOUNT / AZURE_AI_PROJECT are needed only after the version exists,
    # so leaving them out fails halfway through and leaves an ungranted version behind.
    for name in (
        "FOUNDRY_PROJECT_ENDPOINT",
        "AGENT_NAME",
        "AZURE_SUBSCRIPTION_ID",
        "AZURE_RESOURCE_GROUP",
        "AZURE_AI_ACCOUNT",
        "AZURE_AI_PROJECT",
    ):
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
    assert_image_deployment_exists()
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
    # Each version carries its own environment. Omitting this silently drops the
    # container back to the 'responses' brain on the next republish.
    brain = (os.environ.get("TEAMMATE_BRAIN") or "").strip()
    if brain:
        env_vars["TEAMMATE_BRAIN"] = brain
    default_tz = (os.environ.get("DEFAULT_TIMEZONE") or "").strip()
    if default_tz:
        env_vars["DEFAULT_TIMEZONE"] = default_tz
    # Optional feature switches; each one is off in the container unless forwarded here.
    for name in ("DATAVERSE_URL", "PUBLISHER_PREFIX", "EVAL_AGENT_KEY"):
        value = (os.environ.get(name) or "").strip()
        if value:
            env_vars[name] = value
    image_deployment = image_model_deployment()
    if image_deployment:
        env_vars["IMAGE_MODEL_DEPLOYMENT"] = image_deployment

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
        # Without this flag the version is created but the M365 endpoint keeps serving the
        # last vNext version, so a redeploy silently runs old code (troubleshooting #83).
        "metadata": {"enableVnextExperience": "true"},
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


def build_publish_body(display_name: str, scopes: list[dict], app_version: str) -> dict:
    return {
        "agentDisplayName": display_name,
        "publishAsAutopilot": True,
        "publishScope": os.environ.get("AUTOPILOT_PUBLISH_SCOPE", "Tenant"),
        "appVersion": app_version,
        "accessBoundaries": list(AUTOPILOT_ACCESS_BOUNDARIES),
        "canRespondWithoutMention": True,
        "shortDescription": os.environ.get("AGENT_DESCRIPTION_SHORT", f"{display_name} (Foundry Autopilot)"),
        "fullDescription": os.environ.get("AGENT_DESCRIPTION_FULL", f"{display_name} - AI teammate."),
        "developerName": require("DEVELOPER_NAME"),
        "developerWebsiteUrl": require("DEVELOPER_WEBSITE_URL"),
        "privacyUrl": require("DEVELOPER_PRIVACY_URL"),
        "termsOfUseUrl": require("DEVELOPER_TERMS_URL"),
        "optionalPermissionScopes": scopes,
    }


def bump_patch(version: str) -> str:
    parts = (version or "1.0.0").split(".")
    while len(parts) < 3:
        parts.append("0")
    try:
        parts[2] = str(int(parts[2]) + 1)
    except ValueError:
        raise PreflightError(f"TEAMS_APP_VERSION '{version}' を解釈できません（x.y.z 形式にしてください）")
    return ".".join(parts[:3])


def write_env_value(env_path: Path, key: str, value: str) -> None:
    """Persist the published version so the next republish starts from the right number."""
    if not env_path.is_file():
        return
    lines = env_path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[index] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def enable_instance_identity(app_id: str) -> None:
    """Foundry creates the per-agent AgentIdentity principal disabled, so every token request
    fails with AADSTS7000112 until it is enabled. See troubleshooting.md #75."""
    token = auth_helper.get_token(GRAPH_SCOPE)
    headers = {"Authorization": f"Bearer {token}"}
    lookup = requests.get(
        f"https://graph.microsoft.com/beta/servicePrincipals(appId='{app_id}')"
        "?$select=id,accountEnabled,displayName",
        headers=headers,
        timeout=60,
    )
    if not lookup.ok:
        print(f"  ! agent identity SP ({app_id}) を取得できませんでした: {lookup.status_code}")
        return
    principal = lookup.json()
    if principal.get("accountEnabled"):
        print(f"  OK agent identity SP は有効です（{principal.get('displayName')}）")
        return
    patch = requests.patch(
        f"https://graph.microsoft.com/beta/servicePrincipals/{principal['id']}",
        headers={**headers, "Content-Type": "application/json"},
        json={"accountEnabled": True},
        timeout=60,
    )
    if patch.status_code in (200, 204):
        print(f"  OK agent identity SP を有効化しました（{principal.get('displayName')}）")
    else:
        raise SystemExit(
            "agent identity SP を有効化できませんでした"
            f"（{patch.status_code} {patch.text}）。Application Administrator 相当の権限が要ります"
        )


def latest_version_number(base: str, agent_name: str, api_version: str) -> int | None:
    try:
        listed = foundry_request("GET", f"{base}/agents/{agent_name}/versions?api-version={api_version}")
    except SystemExit:
        return None  # first publish: the agent does not exist yet
    items = listed.get("data") or listed.get("value") or []
    numbers = [int(item["version"]) for item in items if str(item.get("version", "")).isdigit()]
    return max(numbers) if numbers else None


def recycle_stale_sessions(base: str, agent_name: str, version: str, *, delete: bool) -> None:
    """Sessions are bound to the version they were created on, so existing chats keep old code."""
    url = f"{base}/agents/{agent_name}/endpoint/sessions"
    listed = foundry_request("GET", f"{url}?api-version=v1")
    stale = [
        s for s in listed.get("data") or listed.get("value") or []
        if s.get("status") != "deleted"
        and str((s.get("version_indicator") or {}).get("agent_version")) != str(version)
    ]
    print(f"\n== セッション: 古い version に固定されたもの {len(stale)} 件 ==")
    for session in stale:
        pinned = (session.get("version_indicator") or {}).get("agent_version")
        session_id = session["agent_session_id"]
        if delete:
            foundry_request("DELETE", f"{url}/{session_id}?api-version=v1")
            print(f"  削除 {session_id[:12]}…（version {pinned}）")
        else:
            print(f"  残存 {session_id[:12]}…（version {pinned}）")
    if stale and not delete:
        print(
            "  ! このままだと既存のチャットは古いコードで動き続けます。"
            "--recycle-sessions で削除してください（troubleshooting.md #83）。"
        )


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


def grant_role(principal_id: str, role_name: str, scope: str) -> None:
    """Assign a built-in role to the instance identity at *scope*."""
    token = auth_helper.get_token(ARM_SCOPE)
    headers = {"Authorization": f"Bearer {token}"}
    roles = requests.get(
        f"{ARM_BASE}{scope}/providers/Microsoft.Authorization/roleDefinitions"
        f"?api-version=2022-04-01&$filter=roleName eq '{role_name}'",
        headers=headers,
        timeout=60,
    )
    roles.raise_for_status()
    definitions = roles.json().get("value", [])
    if not definitions:
        raise SystemExit(f"'{role_name}' ロール定義が見つかりませんでした")

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
        print(f"  OK {role_name} ロールを付与しました")
    elif resp.status_code == 409 or "RoleAssignmentExists" in resp.text:
        print(f"  OK {role_name} ロールは付与済みです")
    else:
        raise SystemExit(f"ロール付与に失敗しました: {resp.status_code} {resp.text}")


def account_scope() -> str:
    return (
        f"/subscriptions/{require('AZURE_SUBSCRIPTION_ID')}"
        f"/resourceGroups/{require('AZURE_RESOURCE_GROUP')}"
        f"/providers/Microsoft.CognitiveServices/accounts/{require('AZURE_AI_ACCOUNT')}"
    )


def grant_instance_roles(principal_id: str) -> None:
    grant_role(principal_id, "Foundry User", f"{account_scope()}/projects/{require('AZURE_AI_PROJECT')}")
    if image_model_deployment():
        # The grant above lands on the project, but the image API is served by the account
        # itself - a parent of that scope. Verified 2026-09-20: the narrower "Cognitive
        # Services OpenAI User" is not enough on a kind=AIServices account.
        grant_role(principal_id, "Foundry User", account_scope())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="事前チェックだけ行い、何も変更しない")
    parser.add_argument("--execute", action="store_true", help="実際に agent version 作成・PATCH・発行を行う")
    parser.add_argument(
        "--bump-version",
        action="store_true",
        help="TEAMS_APP_VERSION の patch を +1 して発行する（再発行時は必須。同じバージョンは拒否される）",
    )
    parser.add_argument(
        "--container-only",
        action="store_true",
        help="コード修正を反映するだけの再デプロイ。version だけ作って M365 への再発行はしない",
    )
    parser.add_argument(
        "--recycle-sessions",
        action="store_true",
        help="古い version に固定されたセッションを削除する（$HOME の作業状態は消える）",
    )
    parser.add_argument("--env", type=Path, help=".env のパス（既定はリポジトリ ルート）")
    args = parser.parse_args()

    env_path = args.env or find_repo_env() or Path(".env")
    load_env(env_path)

    try:
        display_name = os.environ.get("AGENT_DISPLAY_NAME") or require("AGENT_NAME")
        scopes = preflight(display_name)
        app_version = os.environ.get("TEAMS_APP_VERSION", "1.0.0")
        if args.bump_version:
            app_version = bump_patch(app_version)
            print(f"  OK appVersion を {app_version} へ上げます")
    except PreflightError as exc:
        print(f"事前チェックに失敗しました: {exc}", file=sys.stderr)
        return 1

    if args.check:
        return 0

    base = require("FOUNDRY_PROJECT_ENDPOINT").rstrip("/")
    agent_name = require("AGENT_NAME")
    api_version = os.environ.get("FOUNDRY_API_VERSION", "2025-11-15-preview")
    version_body = build_version_body()
    # --container-only never publishes, so it must not demand the developer metadata.
    publish_body = None if args.container_only else build_publish_body(display_name, scopes, app_version)

    if not args.execute:
        print("\n== dry-run（--execute で実行）==")
        print("POST /agents/{name}/versions:")
        print(json.dumps(version_body, ensure_ascii=False, indent=2))
        if publish_body is not None:
            print("POST /agents/{name}/microsoft365/publish:")
            print(json.dumps(publish_body, ensure_ascii=False, indent=2))
        return 0

    print("\n== agent version を作成します ==")
    previous = latest_version_number(base, agent_name, api_version)
    created = foundry_request(
        "POST", f"{base}/agents/{agent_name}/versions?api-version={api_version}", version_body
    )
    version = created["version"]
    print(f"  version={version} blueprint={created.get('blueprint_reference', {}).get('blueprint_id')}")
    if previous is not None and int(version) <= previous:
        # An identical body is deduplicated, so a rebuilt image behind the same tag never runs.
        print(
            f"  NG 定義が前回と同一なので新しい version が作られませんでした（既存 {previous}）。\n"
            "     イメージを更新したなら AGENT_IMAGE_TAG をビルドごとに一意にしてください（troubleshooting.md #83）。",
            file=sys.stderr,
        )
        return 1
    if created.get("status") != "active":
        created = wait_until_active(base, agent_name, version, api_version)

    identity = created.get("instance_identity") or {}
    print("\n== agent identity を確認します ==")
    if identity.get("client_id"):
        enable_instance_identity(identity["client_id"])
    else:
        print("  ! instance_identity.client_id が返っていません。AADSTS7000112 が出たら troubleshooting.md #75")
    grant_instance_roles(identity["principal_id"])

    print("\n== BotServiceRbac を確認します ==")
    # authorization_schemes is an agent-level setting, so it survives new versions.
    # PATCH replaces agent_endpoint wholesale and access_boundaries cannot be
    # patched back, so an unconditional PATCH silences Teams (troubleshooting #77).
    current = foundry_request("GET", f"{base}/agents/{agent_name}?api-version={api_version}")
    schemes = (current.get("agent_endpoint") or {}).get("authorization_schemes") or []
    if any(scheme.get("type") == "BotServiceRbac" for scheme in schemes):
        print("  OK 既に設定済みなので PATCH をスキップします")
    else:
        foundry_request(
            "PATCH",
            f"{base}/agents/{agent_name}?api-version={api_version}",
            {"agent_endpoint": agent_endpoint(with_auth_scheme=True)},
        )
        print("  OK")

    if args.container_only:
        print("\n--container-only なので M365 への再発行は行いません。")
        recycle_stale_sessions(base, agent_name, version, delete=args.recycle_sessions)
        return 0

    print("\n== Autopilot として M365 に発行します ==")
    published = foundry_request(
        "POST", f"{base}/agents/{agent_name}/microsoft365/publish?api-version={api_version}", publish_body
    )
    print(f"  teamsAppId={published.get('teamsAppId')} titleId={published.get('titleId')}")
    write_env_value(env_path, "TEAMS_APP_VERSION", app_version)

    print(
        "\n次は管理者の操作です:\n"
        "  1. M365 管理センター → エージェント → すべてのエージェント → 要求 で承認（管理者の同意を付与）\n"
        "  2. Teams → アプリ → Agents for your team → インスタンスを作成（上司を指定）\n"
        "     再発行のときは既存インスタンスを作り直す（旧インスタンスは旧 blueprint を持ち続ける）\n"
        "  3. python scripts/run_regression_tests.py --execute で回帰テスト\n"
        "  詳細: references/foundry-autopilot.md §6"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
