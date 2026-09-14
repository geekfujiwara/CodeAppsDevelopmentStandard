"""Find Teams connector action shapes in existing cloud flows (GET only)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = next(path for path in SCRIPT_DIR.parents if (path / ".git").exists())
sys.path.insert(0, str(REPO_ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import api_get  # noqa: E402


def walk(value: object, flow: dict, path: str, output: list[dict]) -> None:
    if isinstance(value, dict):
        host = value.get("inputs", {}).get("host", {}) if isinstance(value.get("inputs"), dict) else {}
        if isinstance(host, dict) and host.get("apiId", "").endswith("/shared_teams"):
            parameters = value["inputs"].get("parameters", {})
            output.append(
                {
                    "workflowId": flow["workflowid"],
                    "flow": flow["name"],
                    "active": flow.get("statecode") == 1,
                    "path": path,
                    "operationId": host.get("operationId"),
                    "parameterKeys": sorted(parameters) if isinstance(parameters, dict) else [],
                }
            )
        for key, item in value.items():
            walk(item, flow, f"{path}/{key}", output)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            walk(item, flow, f"{path}/{index}", output)


def main() -> int:
    flows = api_get(
        "workflows?$select=workflowid,name,clientdata,statecode,statuscode"
        "&$filter=category eq 5&$top=500"
    ).get("value", [])
    output: list[dict] = []
    for flow in flows:
        try:
            clientdata = json.loads(flow.get("clientdata") or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        walk(clientdata, flow, "clientdata", output)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())