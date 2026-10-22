"""Cache-first push; never repeat a write after an ambiguous timeout or failure."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys

from pa_cli import environment_id, list_connections, load_project_env, run_with_recovery, verify_cli_account


def main() -> None:
    load_project_env()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-auth", action="store_true", help="Read-only authentication check; never push.")
    parser.add_argument("--solution-id")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    environment_id()
    verify_cli_account(args.timeout)
    if args.check_auth:
        list_connections(args.timeout)
        print("OK: CLI account and connection-resource cache verified; no deployment performed.")
        return
    npm = "npm.cmd" if os.name == "nt" else "npm"
    checked = subprocess.run([npm, "run", "predeploy"], check=False, timeout=args.timeout)
    if checked.returncode:
        raise SystemExit(checked.returncode)
    command = ["app", "push", "--non-interactive"]
    solution = args.solution_id or os.getenv("SOLUTION_ID", "")
    if solution:
        command.extend(["--solution-id", solution])
    result = run_with_recovery(command, args.timeout)
    print(result.stdout, end="")
    print(result.stderr, end="", file=sys.stderr)
    if result.returncode:
        raise SystemExit(result.returncode)
    print("CLI push completed. Player consent and UI CRUD require separate verification.")


if __name__ == "__main__":
    main()
