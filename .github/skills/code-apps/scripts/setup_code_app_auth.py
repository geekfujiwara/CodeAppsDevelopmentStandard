"""Save approved browser preferences and warm the independent Python/CLI caches."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from pa_cli import list_connections, load_project_env, run_cli, run_console, verify_cli_account
from auth_preferences import save_preferences, validate_preferences


def main() -> None:
    load_project_env()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", default=os.getenv("PP_AUTH_ACCOUNT", ""))
    parser.add_argument("--edge-profile", default=os.getenv("PP_AUTH_EDGE_PROFILE", ""))
    parser.add_argument("--approve-interactive", action="store_true",
                        help="Record approval to reopen browser authentication when silent renewal requires it.")
    parser.add_argument("--save-only", action="store_true", help="Save preferences without opening a browser.")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    validate_preferences(args.account, args.edge_profile)
    if not args.approve_interactive:
        parser.error("Confirm the account/profile and supply --approve-interactive before saving approval.")
    env = Path.cwd() / ".env"
    if not env.is_file():
        parser.error("Run from the project containing its existing .env.")
    save_preferences(env, args.account, args.edge_profile, args.approve_interactive)
    print("Saved non-secret browser preferences. No tokens or passwords were written to .env.")
    if args.save_only:
        return
    from auth_helper import get_token
    get_token()
    status = run_cli(["auth", "status", "--json", "--non-interactive"], args.timeout)
    if status.returncode:
        raise SystemExit(f"NG: Cannot inspect CLI sign-in status.\n{status.stderr}")
    payload = json.loads(status.stdout)
    accounts = payload.get("accounts", [])
    if payload.get("success") is not True or not isinstance(accounts, list):
        raise SystemExit("NG: CLI auth status reported failure or an invalid account list.")
    if any(str(account.get("username", "")).lower() == args.account.lower() for account in accounts):
        switched = run_cli(["auth", "switch", "--account", args.account, "--non-interactive"], args.timeout)
        if switched.returncode:
            raise SystemExit(f"NG: Could not select the approved cached CLI account.\n{switched.stderr}")
    else:
        run_console(["auth", "login", "--account", args.account], args.timeout)
    verify_cli_account(args.timeout)
    if Path("power.config.json").is_file():
        list_connections(args.timeout)
        print("Verified the CLI connection resource and its silent cache reuse.")
    else:
        print("CLI account ready. After app init, rerun this command to verify the connection resource.")


if __name__ == "__main__":
    main()
