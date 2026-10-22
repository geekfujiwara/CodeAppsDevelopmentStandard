"""Verify shared authentication in two fresh processes without opening a browser."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile

from dotenv import load_dotenv


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env", type=Path, help="Existing project .env (never copied to the test directories)")
    parser.add_argument("--scope", help="OAuth scope; defaults to DATAVERSE_URL/.default")
    parser.add_argument("--client-id", help="Use the existing cache for this client")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.env:
        if not args.env.is_file():
            parser.error("--env must reference an existing file")
        load_dotenv(args.env.resolve(), override=True)
    # Exercise the shared OS cache, not a PAC CLI profile or inherited in-memory state.
    os.environ["PAC_AUTH_PROFILE"] = ""
    if args.worker:
        from azure.core.exceptions import ClientAuthenticationError
        from azure.identity import AuthenticationRequiredError
        from auth_helper import get_token

        try:
            get_token(args.scope, args.client_id)
        except AuthenticationRequiredError:
            print("ERROR: browser authentication is required; existing cache preserved.", file=sys.stderr)
            return 2
        except (ClientAuthenticationError, OSError, RuntimeError, ValueError) as exc:
            print(f"ERROR: shared cache verification failed ({type(exc).__name__}).", file=sys.stderr)
            return 1
        print("PASS: shared cache returned a token silently; token not displayed.")
        return 0

    command = [sys.executable, str(Path(__file__).resolve()), "--worker"]
    for flag, value in (("--scope", args.scope), ("--client-id", args.client_id)):
        if value:
            command.extend([flag, value])
    for index in range(2):
        with tempfile.TemporaryDirectory(prefix="pp-auth-cache-check-") as directory:
            try:
                result = subprocess.run(command, cwd=directory, timeout=120, check=False)
            except subprocess.TimeoutExpired:
                print("ERROR: silent cache verification timed out.", file=sys.stderr)
                return 1
        if result.returncode:
            return result.returncode
        print(f"PASS: fresh process {index + 1}/2, separate working directory.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
