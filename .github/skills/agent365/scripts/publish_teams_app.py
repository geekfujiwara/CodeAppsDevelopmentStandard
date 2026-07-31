#!/usr/bin/env python3
"""Publish (or update) a Teams app package to the tenant app catalog via Microsoft Graph.

Replaces the manual "upload in Microsoft 365 / Teams admin center" step with a
scripted Graph API call. These Graph APIs only support Delegated permissions
(Application permissions are not supported), so this reuses the same
DeviceCodeCredential + persistent cache as every other script in this repo
(``standard/scripts/auth_helper.py``) instead of inventing a new auth flow.

Flow:
  1. Read the built Teams app ZIP (default: teams/<AGENT_NAME>-teams-app.zip).
  2. Extract manifest.json from the ZIP to read the app id (used as externalId).
  3. GET /appCatalogs/teamsApps?$filter=externalId eq '<id>' to see whether it is
     already published to the org catalog.
  4. Not found -> POST /appCatalogs/teamsApps (new app).
     Found      -> POST /appCatalogs/teamsApps/{catalogAppId}/appDefinitions (new version).

Required Entra permission (delegated, tenant-consented once):
  AppCatalog.ReadWrite.All
Publishing without --requires-review requires the signed-in user to hold a Teams
admin role; otherwise pass --requires-review to submit for admin approval instead.

Reference: https://learn.microsoft.com/graph/api/teamsapp-publish

Usage:
    python scripts/publish_teams_app.py
    python scripts/publish_teams_app.py --package teams/hunter-teams-app.zip
    python scripts/publish_teams_app.py --requires-review
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import zipfile
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

GRAPH_SCOPE = "https://graph.microsoft.com/.default"
GRAPH_BASE = "https://graph.microsoft.com/v1.0"


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


def read_manifest_id(package: Path) -> str:
    with zipfile.ZipFile(package) as zf:
        manifest = json.loads(zf.read("manifest.json"))
    app_id = manifest.get("id")
    if not app_id:
        raise SystemExit(f"{package}: manifest.json に 'id' がありません。")
    return app_id


def find_existing_app(session: requests.Session, external_id: str) -> str | None:
    resp = session.get(
        f"{GRAPH_BASE}/appCatalogs/teamsApps",
        params={"$filter": f"externalId eq '{external_id}'"},
    )
    resp.raise_for_status()
    values = resp.json().get("value", [])
    return values[0]["id"] if values else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", help="Teams app ZIP (default: teams/<AGENT_NAME>-teams-app.zip).")
    parser.add_argument(
        "--requires-review",
        action="store_true",
        help="Submit for Teams admin review instead of publishing immediately.",
    )
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))

    # auth_helper reads TENANT_ID; this skill's .env uses AZURE_TENANT_ID.
    os.environ.setdefault("TENANT_ID", os.environ.get("AZURE_TENANT_ID", ""))
    from auth_helper import get_token  # noqa: E402  (import after sys.path/env setup)

    agent = os.environ.get("AGENT_NAME", "agent")
    package = Path(args.package or f"teams/{agent}-teams-app.zip")
    if not package.is_file():
        raise SystemExit(
            f"Teams app package not found: {package}\nRun scripts/build_teams_package.py first."
        )

    external_id = read_manifest_id(package)
    body = package.read_bytes()

    token = get_token(scope=GRAPH_SCOPE)
    session = requests.Session()
    session.headers.update({"Authorization": f"Bearer {token}"})

    existing_id = find_existing_app(session, external_id)
    params = {"requiresReview": "true"} if args.requires_review else {}

    if existing_id:
        url = f"{GRAPH_BASE}/appCatalogs/teamsApps/{existing_id}/appDefinitions"
        print(f"Updating existing catalog app {existing_id} with a new version...")
    else:
        url = f"{GRAPH_BASE}/appCatalogs/teamsApps"
        print("Publishing a new app to the tenant catalog...")

    resp = session.post(url, params=params, data=body, headers={"Content-Type": "application/zip"})
    if resp.status_code not in (200, 201, 204):
        sys.stderr.write(f"Graph request failed ({resp.status_code}): {resp.text}\n")
        return 1

    if resp.content:
        try:
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except ValueError:
            pass

    catalog_note = f" catalogAppId={existing_id}" if existing_id else ""
    print(f"Done. externalId={external_id}{catalog_note}")
    print(
        "Note: without --requires-review this requires the signed-in user to hold a "
        "Teams admin role. Otherwise re-run with --requires-review."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
