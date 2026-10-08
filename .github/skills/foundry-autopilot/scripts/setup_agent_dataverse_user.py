#!/usr/bin/env python3
"""Give the AI teammate's managed identity its own Dataverse application user and role.

The agent's background workers (``EvaluationDataverse``, ``EvaluationRunner``, ``TestRunner``,
``SkillSync``) call the Dataverse Web API with the app's **managed identity**, not with the signed-in
user and not with the agentic user. A managed identity that has no application user in the
environment gets 403 on every call, and because the failure happens inside a ``BackgroundService``
the host can stop outright - so the symptom is "the teammate answers in Teams but nothing ever
reaches the hub", or an App Service that restarts in a loop.

This script is idempotent:

  1. finds (or creates) the application user bound to ``AZURE_CLIENT_ID``
  2. finds (or creates) a custom security role in the root business unit
  3. gives that role Global-depth privileges on the evaluation-hub tables only
  4. assigns the role to the application user

It deliberately does not grant Basic User or System Administrator: the agent only needs its own
hub tables, and a broad role is what turns one compromised teammate into a tenant-wide problem.

Usage:
    python scripts/setup_agent_dataverse_user.py --check
    python scripts/setup_agent_dataverse_user.py

Exit codes:
    0 = already correct (or, on --check, all good)
    1 = fatal problem (missing .env value, Dataverse error)
    3 = --check only: something is missing but nothing conflicts
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path


def _dataverse_url_from_env_arg() -> None:
    # auth_helper reads DATAVERSE_URL once at import, so the --env file must be applied before it.
    argv = sys.argv[1:]
    path = next((argv[i + 1] for i, a in enumerate(argv[:-1]) if a == "--env"), None)
    path = path or next((a.split("=", 1)[1] for a in argv if a.startswith("--env=")), None)
    if not path or not Path(path).is_file() or os.environ.get("DATAVERSE_URL"):
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        key, _, value = line.strip().partition("=")
        if key.strip() == "DATAVERSE_URL" and value.strip():
            os.environ["DATAVERSE_URL"] = value.strip()


_dataverse_url_from_env_arg()

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard" / "scripts"))
from auth_helper import DATAVERSE_URL, api_get, api_post  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_evaluation_dataverse import build_tables  # noqa: E402

# Everything the workers do: read rows the app created, write their own answers back, and link
# results to turns. Global depth because the rows are created by whoever ran the app, not by the
# agent, so user- or business-unit-scoped depths would hide them.
OPERATIONS = ("Create", "Read", "Write", "Delete", "Append", "AppendTo")


def load_env(env_path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    values.update({k: v for k, v in os.environ.items() if k in values or k.isupper()})
    return values


def root_business_unit() -> str:
    rows = api_get("businessunits?$select=businessunitid&$filter=parentbusinessunitid eq null").get("value", [])
    if not rows:
        raise SystemExit("FATAL: could not find the root business unit.")
    return rows[0]["businessunitid"]


def find_application_user(client_id: str) -> str | None:
    rows = api_get(
        f"systemusers?$select=systemuserid&$filter=applicationid eq {client_id}"
    ).get("value", [])
    return rows[0]["systemuserid"] if rows else None


def create_application_user(client_id: str, business_unit: str, display_name: str) -> str:
    body = {
        "applicationid": client_id,
        "firstname": "AI",
        "lastname": display_name,
        "businessunitid@odata.bind": f"/businessunits({business_unit})",
    }
    created = api_post("systemusers", body)
    if not created:
        raise SystemExit("FATAL: Dataverse accepted the application user but returned no id.")
    return created


def find_role(name: str, business_unit: str) -> str | None:
    rows = api_get(
        f"roles?$select=roleid&$filter=name eq '{name}' and _businessunitid_value eq {business_unit}"
    ).get("value", [])
    return rows[0]["roleid"] if rows else None


def create_role(name: str, business_unit: str, solution_name: str) -> str:
    body = {"name": name, "businessunitid@odata.bind": f"/businessunits({business_unit})"}
    created = api_post("roles", body, solution=solution_name)
    if not created:
        raise SystemExit("FATAL: Dataverse accepted the role but returned no id.")
    # Role privileges are rejected right after creation until the role is readable, so give it a moment.
    time.sleep(2)
    return created


def privilege_ids(logical_names: list[str]) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    missing: list[str] = []
    for logical in logical_names:
        # Queried per table rather than in one sweep: the full privileges list is paged, and a
        # silently truncated first page would look exactly like "these privileges do not exist".
        rows = api_get(
            f"privileges?$select=privilegeid,name&$filter=contains(name,'{logical}')"
        ).get("value", [])
        by_name = {(row.get("name") or "").lower(): row["privilegeid"] for row in rows}
        for operation in OPERATIONS:
            name = f"prv{operation}{logical}".lower()
            if name not in by_name:
                missing.append(name)
            elif name not in seen:
                seen.add(name)
                found.append(by_name[name])
    if missing:
        raise SystemExit(
            "FATAL: these privileges do not exist yet - run setup_evaluation_dataverse.py first:\n  "
            + "\n  ".join(sorted(missing))
        )
    return found


def role_privilege_ids(role_id: str) -> set[str]:
    rows = api_get(f"roles({role_id})/roleprivileges_association?$select=privilegeid").get("value", [])
    return {row["privilegeid"] for row in rows}


def assign_privileges(role_id: str, ids: list[str]) -> None:
    batches = [ids[i : i + 100] for i in range(0, len(ids), 100)]
    for index, batch in enumerate(batches):
        action = "ReplacePrivilegesRole" if index == 0 else "AddPrivilegesRole"
        api_post(
            f"roles({role_id})/Microsoft.Dynamics.CRM.{action}",
            {"Privileges": [{"PrivilegeId": pid, "Depth": "Global"} for pid in batch]},
        )


def has_role(user_id: str, role_id: str) -> bool:
    rows = api_get(f"systemusers({user_id})/systemuserroles_association?$select=roleid").get("value", [])
    return any(row["roleid"] == role_id for row in rows)


def assign_role(user_id: str, role_id: str) -> None:
    api_post(
        f"systemusers({user_id})/systemuserroles_association/$ref",
        {"@odata.id": f"{DATAVERSE_URL}/api/data/v9.2/roles({role_id})"},
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report what is missing without changing anything")
    parser.add_argument("--env", default=".env", help="path to the .env file (default: .env)")
    args = parser.parse_args()

    env = load_env(Path(args.env))
    # Foundry Autopilot records the container's agent identity as AGENT_IDENTITY_CLIENT_ID.
    client_id = (env.get("AZURE_CLIENT_ID", "") or env.get("AGENT_IDENTITY_CLIENT_ID", "")).strip()
    prefix = env.get("PUBLISHER_PREFIX", "").strip()
    solution_name = env.get("SOLUTION_NAME", "").strip()
    display_name = env.get("AGENT_DISPLAY_NAME", "").strip() or env.get("AGENT_NAME", "").strip() or "Teammate"
    if not client_id or not prefix or not solution_name:
        print("FATAL: .env needs AZURE_CLIENT_ID (or AGENT_IDENTITY_CLIENT_ID), PUBLISHER_PREFIX and SOLUTION_NAME.")
        return 1
    if not DATAVERSE_URL:
        print("FATAL: DATAVERSE_URL is not set in the --env file or the environment.")
        return 1

    logical_names = [table["logical"] for table in build_tables(prefix)]
    role_name = f"{solution_name} Agent"
    business_unit = root_business_unit()

    user_id = find_application_user(client_id)
    role_id = find_role(role_name, business_unit)
    todo: list[str] = []
    if not user_id:
        todo.append(f"create application user for {client_id}")
    if not role_id:
        todo.append(f"create security role '{role_name}'")

    wanted = privilege_ids(logical_names)
    if role_id and not set(wanted).issubset(role_privilege_ids(role_id)):
        todo.append(f"grant {len(wanted)} privileges to '{role_name}'")
    elif not role_id:
        todo.append(f"grant {len(wanted)} privileges to '{role_name}'")
    if user_id and role_id and not has_role(user_id, role_id):
        todo.append(f"assign '{role_name}' to the application user")
    elif not (user_id and role_id):
        todo.append(f"assign '{role_name}' to the application user")

    if args.check:
        if not todo:
            print(f"OK: application user for {client_id} holds '{role_name}'.")
            return 0
        print("MISSING:")
        for item in todo:
            print(f"  - {item}")
        return 3

    if not user_id:
        user_id = create_application_user(client_id, business_unit, display_name)
        print(f"  + application user created for {client_id}")
    if not role_id:
        role_id = create_role(role_name, business_unit, solution_name)
        print(f"  + security role '{role_name}' created")

    if not set(wanted).issubset(role_privilege_ids(role_id)):
        assign_privileges(role_id, wanted)
        print(f"  + {len(wanted)} privileges granted to '{role_name}'")

    if not has_role(user_id, role_id):
        assign_role(user_id, role_id)
        print(f"  + '{role_name}' assigned to the application user")

    print(f"OK: {client_id} can now read/write the {len(logical_names)} evaluation-hub tables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
