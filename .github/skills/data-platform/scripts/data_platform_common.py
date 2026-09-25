"""data-platform / data-migration 共通: 認証、HTTP 再試行、LRO、plan hash、MCP 応答判定。"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable, Iterable

import requests

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
REFERENCES_DIR = SKILL_DIR / "references"
STANDARD_SCRIPTS = SKILL_DIR.parent / "standard" / "scripts"

SCOPES = {
    "arm": "https://management.azure.com/.default",
    "fabric": "https://api.fabric.microsoft.com/.default",
    "storage": "https://storage.azure.com/.default",
    "databricks": "2ff814a6-3304-4ab8-85cb-cd0e6f879c1d/.default",
    "search": "https://search.azure.com/.default",
}
BASE_URLS = {
    "arm": "https://management.azure.com",
    "fabric": "https://api.fabric.microsoft.com",
    "storage": "https://onelake.dfs.fabric.microsoft.com",
}
STATUSES = ("verified", "blocked", "failed", "not-present", "not-tested")
IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,127}$")
BEARER_RE = re.compile(r"(Bearer\s+)[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
RETRY_STATUSES = {429, 500, 502, 503, 504}


def load_env(start: Path | None = None) -> None:
    """最寄りの .env を環境変数へ読み込む（既存値は上書きしない）。"""
    start = start or Path.cwd()
    for parent in [start, *start.parents]:
        env_file = parent / ".env"
        if env_file.is_file():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())
            return


def env(name: str, default: str | None = None, *, required: bool = False) -> str:
    value = os.environ.get(name, default)
    if required and not value:
        raise SystemExit(f"{name} が未設定です（references/.env.example を参照して .env に設定）")
    return value or ""


def get_token(kind: str) -> str:
    """standard スキルの auth_helper でトークンを取得する。dataverse は DATAVERSE_URL から scope を作る。"""
    if kind == "dataverse":
        scope = env("DATAVERSE_URL", required=True).rstrip("/") + "/.default"
    elif kind in SCOPES:
        scope = SCOPES[kind]
    else:
        raise ValueError(f"unknown token kind: {kind}")
    if str(STANDARD_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(STANDARD_SCRIPTS))
    import auth_helper  # noqa: PLC0415

    return auth_helper.get_token(scope=scope)


def redact(text: Any) -> str:
    return BEARER_RE.sub(r"\1***", str(text))


def require_identifier(value: str, label: str) -> str:
    if not IDENTIFIER_RE.match(value or ""):
        raise ValueError(f"{label} '{value}' は識別子として不正です（英数字と _、先頭は英字か _）")
    return value


class HttpError(RuntimeError):
    def __init__(self, method: str, url: str, status: int, body: str):
        super().__init__(f"{method} {url} -> HTTP {status}: {redact(body)[:800]}")
        self.status = status
        self.body = body


class Api:
    """Bearer 認証付きの最小 HTTP クライアント。429/5xx は Retry-After に従って再試行する。"""

    def __init__(
        self,
        kind: str,
        base_url: str | None = None,
        *,
        session: requests.Session | None = None,
        token_provider: Callable[[str], str] = get_token,
        sleep: Callable[[float], None] = time.sleep,
        max_retries: int = 4,
    ):
        self.kind = kind
        self.base_url = (base_url or BASE_URLS.get(kind, "")).rstrip("/")
        self.session = session or requests.Session()
        self._token_provider = token_provider
        self._token: str | None = None
        self._sleep = sleep
        self.max_retries = max_retries

    def url(self, path: str) -> str:
        return path if path.startswith("https://") else f"{self.base_url}/{path.lstrip('/')}"

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any = None,
        data: bytes | str | None = None,
        params: dict | None = None,
        headers: dict | None = None,
        expected: Iterable[int] = (200, 201, 202, 204),
    ) -> requests.Response:
        url = self.url(path)
        if self._token is None:
            self._token = self._token_provider(self.kind)
        merged = {"Authorization": f"Bearer {self._token}"}
        if json_body is not None:
            merged["Content-Type"] = "application/json; charset=utf-8"
        merged.update(headers or {})
        body = json.dumps(json_body, ensure_ascii=False).encode("utf-8") if json_body is not None else data
        expected = tuple(expected)
        for attempt in range(self.max_retries + 1):
            response = self.session.request(method, url, data=body, params=params, headers=merged, timeout=120)
            if response.status_code in expected:
                return response
            if response.status_code in RETRY_STATUSES and attempt < self.max_retries:
                self._sleep(_retry_after(response, attempt))
                continue
            raise HttpError(method, url, response.status_code, response.text)
        raise HttpError(method, url, response.status_code, response.text)

    def json(self, method: str, path: str, **kwargs: Any) -> dict:
        response = self.request(method, path, **kwargs)
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError:
            return parse_sse_or_json(response.text)

    def wait_operation(self, response: requests.Response, *, timeout: float = 1800, interval: float = 10) -> dict:
        """ARM (Azure-AsyncOperation / Location) と Fabric (Location + /result) の LRO を待つ。"""
        status_url = response.headers.get("Azure-AsyncOperation") or response.headers.get("Location")
        if not status_url:
            return response.json() if response.content else {}
        deadline = time.monotonic() + timeout
        while True:
            current = self.request("GET", status_url, expected=(200, 202))
            payload = current.json() if current.content else {}
            state = str(payload.get("status") or payload.get("properties", {}).get("provisioningState") or "").lower()
            if current.status_code == 200 and state in {"succeeded", "failed", "canceled", "cancelled", ""}:
                if state in {"failed", "canceled", "cancelled"}:
                    raise RuntimeError(f"operation {state}: {redact(json.dumps(payload))[:800]}")
                return payload
            if time.monotonic() > deadline:
                raise TimeoutError(f"operation did not finish: {status_url}")
            self._sleep(_retry_after(current, 0, interval))


def _retry_after(response: requests.Response, attempt: int, default: float | None = None) -> float:
    value = response.headers.get("Retry-After")
    if value and value.isdigit():
        return min(float(value), 120.0)
    return default if default is not None else min(2.0 ** (attempt + 1), 60.0)


def canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def sha256_text(text: str | bytes) -> str:
    data = text.encode("utf-8") if isinstance(text, str) else text
    return hashlib.sha256(data).hexdigest()


def plan_hash(plan: dict) -> str:
    return sha256_text(canonical_json({k: v for k, v in plan.items() if k != "planHash"}))


def seal_plan(plan: dict) -> dict:
    plan = dict(plan)
    plan["planHash"] = plan_hash(plan)
    return plan


def require_approval(plan: dict, approve_hash: str | None) -> None:
    actual = plan_hash(plan)
    if plan.get("planHash") != actual:
        raise SystemExit("計画ファイルが改変されています（planHash 不一致）。plan を再実行してください。")
    if not approve_hash or approve_hash != actual:
        raise SystemExit(f"承認 hash が一致しません。計画を確認し --approve-hash {actual} を指定してください。")


def read_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path: str | Path, obj: Any) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def result(check: str, status: str, detail: str = "", **evidence: Any) -> dict:
    if status not in STATUSES:
        raise ValueError(f"unknown status: {status}")
    item = {"check": check, "status": status}
    if detail:
        item["detail"] = redact(detail)
    if evidence:
        item["evidence"] = evidence
    return item


def summarize(results: list[dict]) -> dict:
    counts = {status: 0 for status in STATUSES}
    for item in results:
        counts[item["status"]] += 1
    return {"counts": counts, "results": results}


def exit_code(results: list[dict]) -> int:
    return 1 if any(item["status"] in {"failed", "blocked"} for item in results) else 0


def parse_sse_or_json(text: str) -> dict:
    stripped = (text or "").strip()
    if not stripped:
        return {}
    if stripped[0] in "{[":
        return json.loads(stripped)
    data_lines = [line[5:].strip() for line in stripped.splitlines() if line.startswith("data:")]
    data_lines = [line for line in data_lines if line and line != "[DONE]"]
    if not data_lines:
        raise ValueError("応答が JSON でも SSE data イベントでもありません")
    return json.loads(data_lines[-1])


def mcp_outcome(body: dict) -> tuple[str, str]:
    """MCP JSON-RPC 応答を判定する。HTTP 200 でも本文のエラーを成功扱いしない。"""
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
        return "failed", "JSON-RPC 2.0 応答ではありません"
    if body.get("error"):
        return "blocked", f"JSON-RPC error: {body['error']}"
    payload = body.get("result")
    if payload is None:
        return "failed", "result がありません"
    if isinstance(payload, dict) and payload.get("isError"):
        return "blocked", f"tool error: {mcp_text(payload)[:400]}"
    return "verified", ""


def mcp_text(payload: dict) -> str:
    return "\n".join(str(part.get("text", "")) for part in payload.get("content", []) if isinstance(part, dict))


class McpClient:
    """Streamable HTTP の MCP クライアント（initialize → initialized → 任意の要求）。"""

    def __init__(self, api: Api, endpoint: str, client_name: str = "data-platform"):
        self.api = api
        self.endpoint = endpoint
        self.client_name = client_name
        self.session_id: str | None = None
        self._next_id = 1

    def _post(self, payload: dict) -> dict:
        headers = {"Accept": "application/json, text/event-stream"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        response = self.api.request("POST", self.endpoint, json_body=payload, headers=headers, expected=(200, 202))
        self.session_id = response.headers.get("Mcp-Session-Id", self.session_id)
        return parse_sse_or_json(response.text) if response.text else {}

    def call(self, method: str, params: dict | None = None) -> dict:
        payload = {"jsonrpc": "2.0", "id": self._next_id, "method": method, "params": params or {}}
        self._next_id += 1
        return self._post(payload)

    def initialize(self, protocol_version: str = "2025-06-18") -> dict:
        body = self.call("initialize", {
            "protocolVersion": protocol_version,
            "capabilities": {},
            "clientInfo": {"name": self.client_name, "version": "1.0.0"},
        })
        if mcp_outcome(body)[0] == "verified":
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        return body

    def list_tools(self) -> dict:
        return self.call("tools/list")

    def call_tool(self, name: str, arguments: dict) -> dict:
        return self.call("tools/call", {"name": name, "arguments": arguments})


def arm_path(subscription_id: str, *parts: str) -> str:
    return "/".join([f"/subscriptions/{subscription_id}", *parts])


class DatabricksSql:
    """SQL Statement Execution API。値は必ず名前付きパラメーターで渡す。"""

    def __init__(self, api: Api, warehouse_id: str, *, sleep: Callable[[float], None] = time.sleep, timeout: float = 900):
        self.api = api
        self.warehouse_id = warehouse_id
        self._sleep = sleep
        self.timeout = timeout

    def run(self, statement: str, parameters: list[dict] | None = None) -> dict:
        body = {"warehouse_id": self.warehouse_id, "statement": statement, "wait_timeout": "50s",
                "on_wait_timeout": "CONTINUE", "disposition": "INLINE", "format": "JSON_ARRAY"}
        if parameters:
            body["parameters"] = parameters
        response = self.api.json("POST", "/api/2.0/sql/statements", json_body=body)
        deadline = time.monotonic() + self.timeout
        while response.get("status", {}).get("state") in {"PENDING", "RUNNING"}:
            if time.monotonic() > deadline:
                raise TimeoutError(f"statement timeout: {response.get('statement_id')}")
            self._sleep(3)
            response = self.api.json("GET", f"/api/2.0/sql/statements/{response['statement_id']}")
        status = response.get("status", {})
        if status.get("state") != "SUCCEEDED":
            message = status.get("error", {}).get("message", status.get("state"))
            raise RuntimeError(f"SQL failed: {message}")
        return response

    def rows(self, statement: str, parameters: list[dict] | None = None) -> list[list]:
        return self.run(statement, parameters).get("result", {}).get("data_array", []) or []


def print_json(obj: Any) -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(obj, ensure_ascii=False, indent=2))
