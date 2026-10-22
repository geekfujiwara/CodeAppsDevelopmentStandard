"""Run the installed official CLI, with opt-in, bounded browser recovery."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from dotenv import load_dotenv


def load_project_env() -> None:
    for root in (Path.cwd(), *Path.cwd().parents, *Path(__file__).resolve().parents):
        if (root / ".env").is_file():
            load_dotenv(root / ".env")
            return


def environment_id() -> str:
    config = Path("power.config.json")
    configured = json.loads(config.read_text(encoding="utf-8")).get("environmentId", "") if config.is_file() else ""
    expected = os.getenv("ENV_ID", "") or os.getenv("ENVIRONMENT_ID", "")
    if configured and expected and configured.lower() != expected.lower():
        raise SystemExit("NG: power.config.json and .env target different environments.")
    if not (configured or expected):
        raise SystemExit("NG: ENV_ID or power.config.json environmentId is required.")
    return configured or expected


def cli_command() -> list[str]:
    package = Path.cwd() / "node_modules" / "@microsoft" / "power-apps-cli"
    manifest = package / "package.json"
    node = shutil.which("node")
    if manifest.is_file() and node:
        info = json.loads(manifest.read_text(encoding="utf-8"))
        entry = info.get("bin", {}).get("pa")
        if info.get("name") == "@microsoft/power-apps-cli" and isinstance(entry, str):
            target = (package / entry).resolve()
            if target.is_relative_to(package.resolve()) and target.is_file():
                return [node, str(target)]
    raise SystemExit("NG: Install the project's @microsoft/power-apps-cli and Node.js first. No npm package will be downloaded automatically.")


def run_cli(args: list[str], timeout: int = 600) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            [*cli_command(), *args], stdin=subprocess.DEVNULL, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(f"NG: pa timed out after {timeout}s; operation outcome is unknown. Inspect state before retrying.") from exc


def needs_interaction(result: subprocess.CompletedProcess[str]) -> bool:
    text = f"{result.stdout}\n{result.stderr}".lower()
    return result.returncode != 0 and any(marker in text for marker in (
        "interactive sign-in is required", "requires interactive sign-in",
        "interaction_required", "interactionrequired", "you are not signed in",
    ))


def run_console(args: list[str], timeout: int) -> None:
    command = [*cli_command(), *[a for a in args if a != "--non-interactive"]]
    print("Opening the approved interactive command; complete browser sign-in if requested.", flush=True)
    if os.name != "nt":
        if not sys.stdin.isatty():
            raise SystemExit("NG: Interactive recovery requires a terminal on this OS. Use the integrated browser; do not enable device-code or change CI settings.")
        result = subprocess.run(command, timeout=timeout, check=False)
        if result.returncode:
            raise SystemExit(f"NG: Interactive pa failed (exit={result.returncode}).")
        return
    # Only an exit status crosses the console boundary, never a token or CLI output.
    with tempfile.TemporaryDirectory(prefix="pa-console-") as folder:
        status = Path(folder) / "status.json"
        child = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--console-child",
             str(status), str(timeout), json.dumps(command)],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        try:
            code = child.wait(timeout=timeout + 15)
        except subprocess.TimeoutExpired as exc:
            child.kill()
            child.wait()
            raise SystemExit("NG: Interactive recovery timed out; inspect state before retrying.") from exc
        if code or not status.is_file():
            raise SystemExit(f"NG: Interactive console failed or was closed (exit={code}).")
        result = json.loads(status.read_text(encoding="utf-8"))
        if result["returncode"] != 0:
            raise SystemExit(f"NG: Interactive pa failed (exit={result['returncode']}). See the console; inspect state before retrying.")


def run_with_recovery(args: list[str], timeout: int = 600, allow_interactive: bool = False) -> subprocess.CompletedProcess[str]:
    result = run_cli(args, timeout)
    if not needs_interaction(result) or not allow_interactive:
        return result
    run_console(args, timeout)
    # Do not repeat a potentially state-changing command just to test the cache.
    # Callers must read back their own expected output/state.
    return subprocess.CompletedProcess(args, 0, "", "")


def json_items(result: subprocess.CompletedProcess[str]) -> list[dict]:
    if result.returncode:
        raise SystemExit(f"NG: pa failed (exit={result.returncode}).\n{result.stdout}\n{result.stderr}")
    text = result.stdout.strip()
    start = min((i for i in (text.find("["), text.find("{")) if i >= 0), default=-1)
    try:
        payload = json.loads(text[start:]) if start >= 0 else None
    except json.JSONDecodeError as exc:
        raise SystemExit("NG: pa returned malformed JSON, not an empty result.") from exc
    if isinstance(payload, dict) and payload.get("success") is False:
        raise SystemExit(f"NG: pa reported failure: {payload.get('errorMessage', 'unknown error')}")
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "value", "connections", "connectors", "data", "results"):
            if isinstance(payload.get(key), list):
                return payload[key]
    raise SystemExit("NG: pa JSON did not contain a result list.")


def list_connections(timeout: int = 600, allow_interactive: bool = False) -> list[dict]:
    if not Path("power.config.json").is_file():
        raise SystemExit("NG: Run from an initialized app root before listing connections.")
    environment_id()
    args = ["connection", "list", "--json", "--non-interactive"]
    result = run_cli(args, timeout)
    if needs_interaction(result) and allow_interactive:
        run_console(args, timeout)
        result = run_cli(args, timeout)
    return json_items(result)


def connection_name(row: dict) -> str:
    return str(row.get("name") or row.get("id", "")).rsplit("/", 1)[-1]


def connected(row: dict, api_id: str, env_id: str) -> bool:
    props = row.get("properties", {})
    statuses = props.get("statuses", [])
    return (
        str(props.get("apiId", "")).rsplit("/", 1)[-1].lower() == api_id.lower()
        and str(props.get("environment", {}).get("name", "")).lower() == env_id.lower()
        and bool(statuses)
        and all(status.get("status") == "Connected" for status in statuses)
    )


def require_connection(rows: list[dict], name: str, api_id: str, env_id: str) -> dict:
    matches = [row for row in rows if connection_name(row) == name]
    if len(matches) != 1 or not connected(matches[0], api_id, env_id):
        raise SystemExit(f"NG: Connection '{name}' is missing, unhealthy, or belongs to another connector/environment.")
    return matches[0]


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "--console-child":
        raise SystemExit("Internal console worker; use add_data_source.py or setup_connection_reference.py.")
    status_path, seconds, encoded = sys.argv[2:]
    try:
        completed = subprocess.run(json.loads(encoded), timeout=int(seconds), check=False)
        exit_code = completed.returncode
    except subprocess.TimeoutExpired:
        print("NG: Interactive CLI timed out. Inspect state before retrying.", file=sys.stderr)
        exit_code = 124
    Path(status_path).write_text(json.dumps({"returncode": exit_code}), encoding="utf-8")
