"""Everything a Foundry Autopilot teammate needs once an instance has been hired in Teams.

Hiring creates a new agent identity and agent user per instance, and none of the grants or
Dataverse registrations carry over from the template. Doing them by hand is where features go
missing without an error: no ChatMessage.Send and reactions never appear, no hub application user
and conversation turns never reach the evaluation hub. This script runs every step in order:

  1. find the hired agent user (Graph) and record AGENTIC_USER_ID / AGENT_UPN / AGENT_INSTANCE_APP_ID
  2. delegated scopes on the instance: Graph (chat, reactions, files) and Dataverse MCP
  3. connect_agent_dataverse.py   agent user in the environment, MCP client, role
  4. setup_agent_dataverse_user.py  the container identity's hub application user
  5. setup_evaluation_dataverse.py  hub tables and this teammate's row
  6. set_agent_user_photo.py        assets/profile.png, when the scaffold placed one

Dry-run by default; ``--execute`` applies. Afterwards run run_regression_tests.py --check.

Usage:
    python scripts/setup_autopilot_instance.py --env <teammate>/.env
    python scripts/setup_autopilot_instance.py --env <teammate>/.env --execute
    python scripts/setup_autopilot_instance.py --env <teammate>/.env --upn kai@contoso.com --execute
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

import requests

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS.parents[1] / "standard" / "scripts"))
import auth_helper  # noqa: E402

GRAPH = "https://graph.microsoft.com"
BAP = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments"
DATAVERSE_APP_ID = "00000007-0000-0000-c000-000000000000"
# ChatMessage.Send: reactions (setReaction is delegated-only). Chat.Read: pasted images.
GRAPH_SCOPES = "User.Read Chat.Read ChatMessage.Send Files.Read.All Files.ReadWrite"
DATAVERSE_SCOPES = "mcp.tools user_impersonation"


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        key, sep, value = line.strip().partition("=")
        if sep and not key.startswith("#"):
            values[key.strip()] = value.strip()
    return values


def write_env(path: Path, updates: dict[str, str]) -> None:
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    for key, value in updates.items():
        for index, line in enumerate(lines):
            if line.strip().startswith(f"{key}="):
                lines[index] = f"{key}={value}"
                break
        else:
            lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def graph_get(path: str, **params) -> dict:
    token = auth_helper.get_token(f"{GRAPH}/.default")
    response = requests.get(f"{GRAPH}{path}", params=params, timeout=60,
                            headers={"Authorization": f"Bearer {token}", "ConsistencyLevel": "eventual"})
    response.raise_for_status()
    return response.json()


def find_agent_user(display_name: str, upn: str) -> dict:
    if upn:
        return graph_get(f"/beta/users/{upn}", **{"$select": "id,displayName,userPrincipalName,identityParentId"})
    found = graph_get("/beta/users", **{
        "$search": f'"displayName:{display_name}"',
        "$select": "id,displayName,userPrincipalName,identityParentId",
    }).get("value", [])
    agents = [u for u in found if u.get("identityParentId")]
    if len(agents) != 1:
        names = ", ".join(u.get("userPrincipalName", "") for u in agents) or "(none)"
        raise SystemExit(
            f"Expected one hired agent user named like '{display_name}', found: {names}. "
            "Hire the instance in Teams first, or pass --upn."
        )
    return agents[0]


def environment_id(dataverse_url: str) -> str:
    token = auth_helper.get_token("https://service.powerapps.com/.default")
    response = requests.get(f"{BAP}?api-version=2020-10-01", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    response.raise_for_status()
    host = dataverse_url.rstrip("/").lower()
    for env in response.json().get("value", []):
        url = ((env.get("properties") or {}).get("linkedEnvironmentMetadata") or {}).get("instanceUrl", "")
        if url.rstrip("/").lower() == host:
            return env["name"]
    raise SystemExit(f"No Power Platform environment has the Dataverse URL {dataverse_url}")


def plan(env_path: Path, env: dict[str, str], user: dict, instance_app_id: str, env_id: str) -> list[list[str]]:
    py = sys.executable
    prefix = env.get("PUBLISHER_PREFIX", "")
    agent = re.sub(r"[^a-z0-9]", "", (env.get("AGENT_NAME") or "agent").lower())
    display = env.get("AGENT_DISPLAY_NAME") or env.get("AGENT_NAME", "")
    role = (["--existing-role", env["DATAVERSE_EXISTING_ROLE"]] if env.get("DATAVERSE_EXISTING_ROLE") else
            ["--role-name", f"{display} Reader", "--read-prefix", env.get("DATAVERSE_READ_PREFIX") or prefix])
    steps = [
        [py, str(SCRIPTS / "grant_agent_graph_scopes.py"), "--instance-id", instance_app_id, "--scopes", GRAPH_SCOPES],
        [py, str(SCRIPTS / "grant_agent_graph_scopes.py"), "--instance-id", instance_app_id,
         "--resource-app-id", DATAVERSE_APP_ID, "--scopes", DATAVERSE_SCOPES],
        [py, str(SCRIPTS / "connect_agent_dataverse.py"), "--env-id", env_id, "--agent-user-id", user["id"],
         "--instance-app-id", instance_app_id, "--client-name", user.get("displayName") or display,
         "--client-unique-name", f"{prefix}_{agent}", *role],
        [py, str(SCRIPTS / "setup_agent_dataverse_user.py"), "--env", str(env_path)],
        [py, str(SCRIPTS / "setup_evaluation_dataverse.py"), "--env", str(env_path)],
    ]
    photo = env_path.parent / "assets" / "profile.png"
    if photo.is_file():
        steps.append([py, str(SCRIPTS / "set_agent_user_photo.py"), "--upn", user["userPrincipalName"], "--icon", str(photo)])
    return steps


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env", type=Path, required=True, help="the teammate's .env")
    parser.add_argument("--upn", default="", help="agent user UPN when the display name matches several")
    parser.add_argument("--execute", action="store_true", help="apply (default: show the plan)")
    args = parser.parse_args()

    env = load_env(args.env)
    missing = [k for k in ("AGENT_NAME", "DATAVERSE_URL", "PUBLISHER_PREFIX", "SOLUTION_NAME", "AGENT_IDENTITY_CLIENT_ID") if not env.get(k)]
    if missing:
        raise SystemExit(f"{args.env} is missing {', '.join(missing)} (scaffold writes the first four, deploy.ps1 the last)")

    user = find_agent_user(env.get("AGENT_DISPLAY_NAME") or env["AGENT_NAME"], args.upn)
    instance_app_id = user.get("identityParentId") or ""
    if not instance_app_id:
        raise SystemExit(f"{user.get('userPrincipalName')} is not an agent user (no identityParentId)")
    # identityParentId is the instance agent identity's object id; for agent identities appId == id.
    print(f"agent user : {user.get('displayName')} <{user.get('userPrincipalName')}> ({user['id']})")
    print(f"instance   : {instance_app_id}")
    env_id = environment_id(env["DATAVERSE_URL"])
    steps = plan(args.env.resolve(), env, user, instance_app_id, env_id)
    for step in steps:
        print("  " + " ".join(Path(part).name if part.endswith(".py") else part for part in step[1:]))
    if not args.execute:
        print("\nDry run. Add --execute to apply.")
        return 0

    write_env(args.env, {
        "AGENTIC_USER_ID": user["id"],
        "AGENT_UPN": user.get("userPrincipalName", ""),
        "AGENT_INSTANCE_APP_ID": instance_app_id,
    })
    for step in steps:
        print(f"\n== {Path(step[1]).name}")
        result = subprocess.run(step, cwd=str(SCRIPTS.parents[3]))
        if result.returncode not in (0, 3):
            print(f"FAILED ({result.returncode}). Fix the error above and re-run; every step is idempotent.", file=sys.stderr)
            return result.returncode
    print("\nDone. Next: send the teammate one Teams message, then run_regression_tests.py --check --execute")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
