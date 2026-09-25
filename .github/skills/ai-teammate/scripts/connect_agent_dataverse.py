"""Connect an Agent 365 agent's own user to a Dataverse environment for the Dataverse MCP server.

The agent reaches Dataverse MCP with its **agentic user** token, so what it may read is decided
by that user's security roles - not by whoever is talking to it. Four settings are needed and
each one fails with a different error when missing (references/agent-brain.md §6-2):

  1. delegated consent on the instance (``grant_agent_graph_scopes.py --resource-app-id
     00000007-0000-0000-c000-000000000000 --scopes "mcp.tools user_impersonation"``) - not here
  2. the agentic user added to the environment      -> ``0x80072560 not a member of the organization``
  3. the instance appId in ``allowedmcpclient``      -> ``not authorized to access MCP``
  4. security roles                                  -> tools return permission errors

This script does 2-4. The role it creates is read-only: Dataverse search plus organization-wide
Read on the tables whose logical name starts with one of ``--read-prefix``. Nothing is written,
deleted or customised through it, which keeps one compromised teammate from becoming a
tenant-wide problem.

Usage:
    python scripts/connect_agent_dataverse.py --check \
        --env-id <environment id> --agent-user-id <agentUser oid> --instance-app-id <appId> \
        --role-name "Auri Reader" --read-prefix geek --client-unique-name geek_auri
    python scripts/connect_agent_dataverse.py ...same arguments without --check...

Exit codes: 0 = everything in place, 1 = error, 3 = --check found something missing.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
import auth_helper  # noqa: E402

BAP = "https://api.bap.microsoft.com/providers/Microsoft.BusinessAppPlatform/scopes/admin/environments"
BASE_ROLES = ("Basic User", "Agent 365 Tools Role")
SEARCH_PRIVILEGE = "prvReadDVTableSearch"


class Dataverse:
    def __init__(self, url: str) -> None:
        self.url = url.rstrip("/")
        self.api = f"{self.url}/api/data/v9.2"
        self.headers = {
            "Authorization": f"Bearer {auth_helper.get_token(f'{self.url}/.default')}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
        }

    def get_all(self, query: str) -> list[dict]:
        rows, url = [], f"{self.api}/{query}"
        while url:
            response = requests.get(url, headers=self.headers, timeout=120)
            response.raise_for_status()
            body = response.json()
            rows += body.get("value", [])
            url = body.get("@odata.nextLink")
        return rows

    def post(self, path: str, body: dict) -> requests.Response:
        response = requests.post(f"{self.api}/{path}", headers=self.headers, json=body, timeout=120)
        if not response.ok:
            raise RuntimeError(f"POST {path} returned {response.status_code}: {response.text[:400]}")
        return response


def environment_url(env_id: str) -> str:
    token = auth_helper.get_token("https://service.powerapps.com/.default")
    response = requests.get(f"{BAP}/{env_id}?api-version=2021-04-01",
                            headers={"Authorization": f"Bearer {token}"}, timeout=60)
    response.raise_for_status()
    url = ((response.json().get("properties") or {}).get("linkedEnvironmentMetadata") or {}).get("instanceUrl")
    if not url:
        raise RuntimeError(f"Environment {env_id} has no Dataverse instance")
    return url.rstrip("/")


def find_user(dv: Dataverse, agent_user_id: str) -> dict | None:
    rows = dv.get_all(
        f"systemusers?$select=systemuserid,fullname&$filter=azureactivedirectoryobjectid eq {agent_user_id}"
    )
    return rows[0] if rows else None


def add_user(env_id: str, agent_user_id: str) -> None:
    # POST /systemusers rejects agentic users with 400; the BAP admin API is the working path.
    token = auth_helper.get_token("https://service.powerapps.com/.default")
    response = requests.post(
        f"{BAP}/{env_id}/addUser?api-version=2020-10-01",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"objectId": agent_user_id},
        timeout=120,
    )
    if not response.ok:
        raise RuntimeError(f"addUser returned {response.status_code}: {response.text[:400]}")


def ensure_read_role(dv: Dataverse, name: str, prefixes: list[str], business_unit: str, check: bool) -> tuple[str | None, int]:
    existing = dv.get_all(f"roles?$select=roleid&$filter=name eq '{name}' and _businessunitid_value eq {business_unit}")
    wanted_entities = [
        e["SchemaName"]
        for e in dv.get_all("EntityDefinitions?$select=SchemaName,LogicalName,IsManaged&$filter=IsCustomEntity eq true")
        if any(e["LogicalName"].startswith(f"{p}_") for p in prefixes) and not e["IsManaged"]
    ]
    wanted = {f"prvRead{schema}" for schema in wanted_entities} | {SEARCH_PRIVILEGE}
    privileges = {p["name"]: p["privilegeid"] for p in dv.get_all("privileges?$select=name,privilegeid&$filter=startswith(name,'prvRead')")}
    missing_names = sorted(n for n in wanted if n not in privileges)
    if missing_names:
        print(f"  ! privileges not found (skipped): {', '.join(missing_names[:5])}{' ...' if len(missing_names) > 5 else ''}")
    if check:
        return (existing[0]["roleid"] if existing else None), len(wanted) - len(missing_names)
    if existing:
        role_id = existing[0]["roleid"]
    else:
        response = dv.post("roles", {"name": name, "businessunitid@odata.bind": f"/businessunits({business_unit})"})
        role_id = response.headers["OData-EntityId"].rsplit("(", 1)[1].rstrip(")")
        print(f"  + role '{name}' created")
    granted = [
        {"PrivilegeId": privileges[n], "Depth": "Global", "BusinessUnitId": business_unit}
        for n in sorted(wanted) if n in privileges
    ]
    for start in range(0, len(granted), 200):
        dv.post(f"roles({role_id})/Microsoft.Dynamics.CRM.AddPrivilegesRole", {"Privileges": granted[start:start + 200]})
    print(f"  OK role '{name}': Read (Global) on {len(granted) - 1} table(s) + {SEARCH_PRIVILEGE}")
    return role_id, len(granted)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--env-id", required=True, help="Power Platform environment id")
    parser.add_argument("--agent-user-id", required=True, help="Entra object id of the agentic user")
    parser.add_argument("--instance-app-id", required=True, help="Agent instance appId (MCP client)")
    parser.add_argument("--client-name", default="", help="Display name in allowedmcpclient (default: role name)")
    parser.add_argument("--client-unique-name", required=True, help="allowedmcpclient uniquename, e.g. <prefix>_<agent>")
    parser.add_argument("--role-name", required=True, help="Read-only role to create or reuse")
    parser.add_argument("--read-prefix", action="append", required=True, help="Table prefix to allow Read on. Repeatable.")
    parser.add_argument("--check", action="store_true", help="Report only; change nothing")
    args = parser.parse_args()

    try:
        url = environment_url(args.env_id)
        dv = Dataverse(url)
        print(f"environment: {url}")
        missing = False

        user = find_user(dv, args.agent_user_id)
        if user:
            print(f"  OK agentic user is a member ({user['fullname']})")
        elif args.check:
            print("  MISSING agentic user is not a member of the environment")
            missing = True
        else:
            add_user(args.env_id, args.agent_user_id)
            for _ in range(20):
                time.sleep(5)
                user = find_user(dv, args.agent_user_id)
                if user:
                    break
            if not user:
                raise RuntimeError("addUser succeeded but the systemuser did not appear within 100 seconds")
            print(f"  + agentic user added ({user['fullname']})")

        clients = dv.get_all(
            f"allowedmcpclients?$select=allowedmcpclientid,isenabled&$filter=applicationid eq {args.instance_app_id}"
        )
        if clients and clients[0]["isenabled"]:
            print("  OK instance is an allowed MCP client")
        elif args.check:
            print("  MISSING instance is not an allowed MCP client")
            missing = True
        elif clients:
            requests.patch(f"{dv.api}/allowedmcpclients({clients[0]['allowedmcpclientid']})",
                           headers=dv.headers, json={"isenabled": True}, timeout=60).raise_for_status()
            print("  + allowed MCP client enabled")
        else:
            dv.post("allowedmcpclients", {
                "name": args.client_name or args.role_name, "uniquename": args.client_unique_name,
                "applicationid": args.instance_app_id, "isenabled": True,
            })
            print("  + allowed MCP client registered")

        root_bu = dv.get_all("businessunits?$select=businessunitid&$filter=_parentbusinessunitid_value eq null")[0]["businessunitid"]
        role_id, count = ensure_read_role(dv, args.role_name, args.read_prefix, root_bu, args.check)
        if args.check:
            print(f"  {'OK' if role_id else 'MISSING'} role '{args.role_name}' ({count} privilege(s) wanted)")
            missing |= role_id is None

        if user:
            assigned = {r["name"] for r in dv.get_all(
                f"systemusers({user['systemuserid']})/systemuserroles_association?$select=name")}
            names = [*BASE_ROLES, args.role_name]
            for name in names:
                if name in assigned:
                    continue
                if args.check:
                    print(f"  MISSING role assignment: {name}")
                    missing = True
                    continue
                roles = dv.get_all(f"roles?$select=roleid&$filter=name eq '{name}' and _businessunitid_value eq {root_bu}")
                if not roles:
                    raise RuntimeError(f"role '{name}' does not exist in the root business unit")
                dv.post(f"systemusers({user['systemuserid']})/systemuserroles_association/$ref",
                        {"@odata.id": f"{dv.api}/roles({roles[0]['roleid']})"})
                print(f"  + role assigned: {name}")
            if not missing:
                print(f"  OK roles: {', '.join(names)}")
    except (RuntimeError, requests.HTTPError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 3 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
