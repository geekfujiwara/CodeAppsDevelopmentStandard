#!/usr/bin/env python3
"""Discover Azure / Foundry connection values via ARM REST and write them into .env file(s).

Replaces manually copying the subscription id / resource group / Foundry project endpoint
from the Azure or Foundry portal (SKILL.md Step 3). Uses the same auth_helper.get_token()
credential (DeviceCodeCredential + persistent cache) as every other script in this repo, so
no separate `az login` / portal browsing is required.

Discovers, in order:
  1. The Azure subscription (and its tenant id).
  2. The Microsoft Foundry account (Cognitive Services account, kind=AIServices).
  3. The Foundry project under that account.
and derives FOUNDRY_PROJECT_ENDPOINT from them.

If more than one candidate is found at any step, the script lists the candidates and asks
for a disambiguating argument instead of guessing.

Usage:
    python scripts/discover_foundry_context.py
    python scripts/discover_foundry_context.py --account my-foundry-resource --project my-project
    python scripts/discover_foundry_context.py --write agents/hunter/.env --write agents/tech/.env --write agents/meena/.env
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests

# Reuse the repo-wide auth_helper (DeviceCodeCredential + persistent cache).
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

ARM_SCOPE = "https://management.azure.com/.default"
ARM_BASE = "https://management.azure.com"
SUBSCRIPTIONS_API_VERSION = "2022-12-01"
COGNITIVE_API_VERSION = "2026-05-01"


def load_env(path: Path) -> None:
    """Load KEY=VALUE pairs from a .env file without overriding real env vars."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def upsert_env_file(path: Path, values: dict[str, str]) -> None:
    """Update matching KEY= lines in-place, append missing keys, leave everything else untouched."""
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            out.append(line)
            continue
        key = stripped.split("=", 1)[0].strip()
        if key in values:
            out.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in values.items():
        if key not in seen:
            out.append(f"{key}={value}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


def get_json(session: requests.Session, url: str, api_version: str) -> dict:
    resp = session.get(url, params={"api-version": api_version}, timeout=30)
    if not resp.ok:
        raise SystemExit(f"ARM request failed ({resp.status_code}) {url}\n{resp.text}")
    return resp.json()


def list_all(session: requests.Session, url: str, api_version: str) -> list[dict]:
    """GET a collection endpoint, following ``nextLink`` until exhausted."""
    items: list[dict] = []
    next_url: str | None = url
    params: dict[str, str] | None = {"api-version": api_version}
    while next_url:
        resp = session.get(next_url, params=params, timeout=30)
        if not resp.ok:
            raise SystemExit(f"ARM request failed ({resp.status_code}) {next_url}\n{resp.text}")
        data = resp.json()
        items.extend(data.get("value", []))
        next_url = data.get("nextLink")
        params = None  # nextLink already contains the query string
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription-id", help="Default: auto-detect (errors if more than one is visible).")
    parser.add_argument("--account", help="Foundry account name (Cognitive Services, kind=AIServices).")
    parser.add_argument("--project", help="Foundry project name under the account.")
    parser.add_argument("--write", action="append", default=[], metavar="PATH",
                        help=".env file to update in place (repeatable).")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    os.environ.setdefault("TENANT_ID", os.environ.get("AZURE_TENANT_ID", ""))
    from auth_helper import get_token  # noqa: E402  (import after sys.path/env setup)

    token = get_token(scope=ARM_SCOPE)
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})

    print("Listing subscriptions...")
    subs = list_all(session, f"{ARM_BASE}/subscriptions", SUBSCRIPTIONS_API_VERSION)

    subscription_id = args.subscription_id or os.environ.get("AZURE_SUBSCRIPTION_ID")
    if subscription_id:
        match = next((s for s in subs if s["subscriptionId"] == subscription_id), None)
        if not match:
            raise SystemExit(f"Subscription {subscription_id} is not visible to the signed-in account.")
    else:
        if len(subs) != 1:
            listing = "\n".join(f"  - {s['subscriptionId']}  {s['displayName']}" for s in subs)
            raise SystemExit("Multiple subscriptions are visible; pass --subscription-id.\n" + listing)
        match = subs[0]
        subscription_id = match["subscriptionId"]
    tenant_id = match["tenantId"]

    accounts_url = f"{ARM_BASE}/subscriptions/{subscription_id}/providers/Microsoft.CognitiveServices/accounts"
    print(f"Listing Foundry accounts in subscription {subscription_id}...")
    accounts = [
        a for a in list_all(session, accounts_url, COGNITIVE_API_VERSION)
        if a.get("kind") == "AIServices"
    ]
    if args.account:
        accounts = [a for a in accounts if a["name"] == args.account]
    if not accounts:
        raise SystemExit(
            "No Microsoft Foundry account found (Cognitive Services, kind=AIServices). "
            "Create one first, or pass --account."
        )
    if len(accounts) > 1:
        listing = "\n".join(f"  - {a['name']}  ({a['id']})" for a in accounts)
        raise SystemExit("Multiple Foundry accounts found; pass --account to disambiguate.\n" + listing)

    account = accounts[0]
    account_name = account["name"]
    resource_group = account["id"].split("/resourceGroups/")[1].split("/")[0]

    projects_url = f"{ARM_BASE}{account['id']}/projects"
    print(f"Listing Foundry projects under account {account_name}...")
    projects = list_all(session, projects_url, COGNITIVE_API_VERSION)
    if args.project:
        projects = [p for p in projects if p["name"].rsplit("/", 1)[-1] == args.project]
    if not projects:
        raise SystemExit(
            f"No Foundry project found under account '{account_name}'. Create one first, or pass --project."
        )
    if len(projects) > 1:
        listing = "\n".join(f"  - {p['name'].rsplit('/', 1)[-1]}" for p in projects)
        raise SystemExit("Multiple Foundry projects found; pass --project to disambiguate.\n" + listing)

    project_name = projects[0]["name"].rsplit("/", 1)[-1]
    endpoint = f"https://{account_name}.services.ai.azure.com/api/projects/{project_name}"

    values = {
        "AZURE_SUBSCRIPTION_ID": subscription_id,
        "AZURE_TENANT_ID": tenant_id,
        "AZURE_RESOURCE_GROUP": resource_group,
        "AZURE_AI_ACCOUNT": account_name,
        "AZURE_AI_PROJECT": project_name,
        "FOUNDRY_PROJECT_ENDPOINT": endpoint,
    }

    print("Discovered:")
    for key, value in values.items():
        print(f"  {key}={value}")

    if not args.write:
        print("\n--write <path> を指定すると、その .env ファイルへ反映します（複数指定可）。")
    for target in args.write:
        upsert_env_file(Path(target), values)
        print(f"Updated {target}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
