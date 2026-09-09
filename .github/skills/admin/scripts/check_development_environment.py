"""Run read-only environment, classic DLP and ACP checks with baseline connectors."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

SCRIPT_ROOT = Path(__file__).resolve().parent
BASELINE_CONNECTORS = ("shared_commondataserviceforapps", "shared_agentnode")


def check_commands(environment_id, tenant_id, connectors):
    connector_args = []
    for connector in dict.fromkeys((*BASELINE_CONNECTORS, *connectors)):
        connector_args.extend(["--connector", connector])
    common = ["--environment-id", environment_id]
    tenant_args = ["--tenant-id", tenant_id] if tenant_id else []
    return [
        [sys.executable, str(SCRIPT_ROOT / "check_environment.py"), *common],
        [sys.executable, str(SCRIPT_ROOT / "check_dlp.py"), *common, *tenant_args, *connector_args],
        [sys.executable, str(SCRIPT_ROOT / "set_acp_connector.py"), *common, "--include-group", *connector_args],
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID"))
    parser.add_argument("--tenant-id", default=os.getenv("TENANT_ID"))
    parser.add_argument("--connector", action="append", default=[])
    args = parser.parse_args()
    if not args.environment_id:
        parser.error("--environment-id or ENV_ID is required")
    for command in check_commands(args.environment_id, args.tenant_id, args.connector):
        result = subprocess.run(command, check=False)
        if result.returncode:
            print("NG: Preflight failed. Review the output; no policy changes were applied.")
            return result.returncode
    print("OK: Configuration checks passed. Workflow runtime acceptance is still required.")
    return 0


if __name__ == "__main__":
    sys.exit(main())