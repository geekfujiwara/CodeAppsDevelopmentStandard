"""スキルに書いた SQL を、実際の Dataverse MCP（read_query）で 1 本ずつ実行して確かめる。

    python -u <plugin-root>/scripts/check_skill_queries.py [--client-id <allowedmcpclients に登録済みの公開クライアント>]

- <plugin-root>/skills/*/SKILL.md の ```sql ブロックと `SELECT ...` を取り出し、接頭辞と <今日> などの
  置き換えをしてから、{DATAVERSE_URL}/api/mcp の tools/call read_query に送る。
  ブロックの直後に「`top` 引数に `N`」と書いてあれば、その top 引数も渡す。
- top 引数なしでちょうど 20 行返ったクエリは失敗にする（read_query は top 引数を省くと 20 行で黙って切れるため）。
- 既定のクライアントは Microsoft GitHub Copilot（VS Code。allowedmcpclients で既定で許可されている）。
  初回だけサインインが要る（以降は auth_helper のキャッシュで無操作）。
- 読み取り（SELECT）だけを送る。create_record などの書き込みは送らない。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(line_buffering=True, encoding="utf-8", errors="replace")
except AttributeError:
    pass

HERE = Path(__file__).resolve()
PLUGIN_ROOT = HERE.parents[1]  # manifest.json と skills/ がある
# .env と .github/skills/standard/scripts は上位のフォルダから探す（プラグインはリポジトリの下に置く）
_ENV = next((p / ".env" for p in HERE.parents if (p / ".env").exists()), None)
_STANDARD = next((p / ".github" / "skills" / "standard" / "scripts" for p in HERE.parents if (p / ".github" / "skills" / "standard" / "scripts" / "auth_helper.py").exists()), None)
if _STANDARD is None:
    raise SystemExit("auth_helper.py が見つかりません（.github/skills/standard/scripts を上位のフォルダに置いてください）")
if _ENV:
    load_dotenv(_ENV)
sys.path.insert(0, str(_STANDARD))
from auth_helper import DATAVERSE_URL, api_get, get_token  # noqa: E402

PREFIX = os.environ["PUBLISHER_PREFIX"].strip()
COPILOT_UNIQUE_NAME = "microsoftgithubcopilot"  # allowedmcpclients の Microsoft GitHub Copilot（VS Code）


def default_client_id() -> str:
    """環境で許可済みの Microsoft GitHub Copilot（VS Code）のアプリ ID を allowedmcpclients から読む（ID を直書きしない）。"""
    rows = api_get("allowedmcpclients?$select=uniquename,applicationid,isenabled").get("value", [])
    hit = next((r for r in rows if r.get("uniquename") == COPILOT_UNIQUE_NAME), None)
    if not hit or not hit.get("isenabled"):
        raise SystemExit("allowedmcpclients で Microsoft GitHub Copilot が有効ではありません（standard スキルの check_mcp_client.py で確認）。--client-id で許可済みの公開クライアントを指定してください")
    return hit["applicationid"]


TOP_HINT = re.compile(r"`top` 引数に `(\d+)`")
PAGING_HINT = "続きを読む例"  # キーで続きを読む例は 20 行ずつ返るのが正しい
TRUNCATION = 20  # read_query は top 引数を省くと 20 行で黙って切れる


def extract_queries() -> list[tuple[str, str, int | None, bool]]:
    """(スキル名, SQL, top 引数, 続きを読む例か) を返す。SQL ブロックの直後 3 行以内に「`top` 引数に `N`」があれば top=N。"""
    out = []
    for skill in sorted((PLUGIN_ROOT / "skills").glob("*/SKILL.md")):
        text = skill.read_text(encoding="utf-8")
        for m in re.finditer(r"```sql\r?\n([\s\S]*?)```", text):
            after = "\n".join(text[m.end():].splitlines()[:4])
            hint = TOP_HINT.search(after)
            out.append((skill.parent.name, " ".join(m.group(1).split()), int(hint.group(1)) if hint else None, PAGING_HINT in after))
        for q in re.findall(r"`(SELECT [^`]+)`", text):
            if " FROM " in q:
                out.append((skill.parent.name, " ".join(q.split()), None, False))
    return out


def substitutions() -> dict[str, str]:
    es = api_get(f"EntityDefinitions(LogicalName='{PREFIX}_tksetting')?$select=EntitySetName")["EntitySetName"]
    row = api_get(f"{es}?$select={PREFIX}_businessdate&$top=1")["value"][0]
    today = date.fromisoformat(row[f"{PREFIX}_businessdate"][:10])
    d = lambda n: (today - timedelta(days=n)).isoformat()  # noqa: E731
    return {
        "${" + "PUBLISHER_PREFIX}": PREFIX,  # 生成前のスキル（未置換）にも使えるように
        "<今日>": today.isoformat(),
        "<昨日>": d(1),
        "<週初>": d(7),
        "<前週初>": d(14),
        "<前週末>": d(8),
        "<28日前>": d(28),
        "<14日前>": d(14),
    }


class Mcp:
    def __init__(self, client_id: str):
        self.url = f"{DATAVERSE_URL.rstrip('/')}/api/mcp"
        self.token = get_token(f"{DATAVERSE_URL.rstrip('/')}/.default", client_id=client_id)
        self.id = 0
        self.session_id: str | None = None

    def rpc(self, method: str, params: dict | None = None, notify: bool = False):
        body: dict = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        if not notify:
            self.id += 1
            body["id"] = self.id
        headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        resp = requests.post(self.url, json=body, headers=headers, timeout=120)
        if resp.status_code >= 400:
            raise RuntimeError(f"{method}: HTTP {resp.status_code} {resp.text[:300]}")
        self.session_id = resp.headers.get("Mcp-Session-Id", self.session_id)
        if notify:
            return None
        text = resp.text
        if "text/event-stream" in resp.headers.get("Content-Type", ""):
            data = [line[5:].strip() for line in text.splitlines() if line.startswith("data:")]
            text = data[-1] if data else "{}"
        msg = json.loads(text)
        if "error" in msg:
            raise RuntimeError(f"{method}: {msg['error']}")
        return msg["result"]

    def start(self) -> list[str]:
        self.rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "store-assist-check", "version": "1.0"}})
        self.rpc("notifications/initialized", notify=True)
        return [t["name"] for t in self.rpc("tools/list")["tools"]]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id", default=os.environ.get("MCP_CHECK_CLIENT_ID"), help="既定: allowedmcpclients の Microsoft GitHub Copilot")
    args = ap.parse_args()

    subs = substitutions()
    queries = extract_queries()
    mcp = Mcp(args.client_id or default_client_id())
    tools = mcp.start()
    print(f"[MCP] {mcp.url} ツール {len(tools)} 個: {', '.join(sorted(tools))}")
    for needed in ("describe", "read_query", "create_record"):
        print(f"  {'✅' if needed in tools else '❌'} {needed}")

    failed = 0
    for skill, q, top, paging in queries:
        for k, v in subs.items():
            q = q.replace(k, v)
        arguments: dict = {"querytext": q}
        if top:
            arguments["top"] = top
        try:
            result = mcp.rpc("tools/call", {"name": "read_query", "arguments": arguments})
            text = "".join(c.get("text", "") for c in result.get("content", []))
            if result.get("isError"):
                raise RuntimeError(text[:300])
            try:
                rows = json.loads(text)
                n = len(rows) if isinstance(rows, list) else None
            except ValueError:
                n = None
            if top is None and n == TRUNCATION and not paging:
                raise RuntimeError(
                    f"ちょうど {TRUNCATION} 行で返りました（top 引数なしの上限）。続きが切れている可能性があります。"
                    "スキルに COUNT と「`top` 引数に `N` を渡す」を書くか、20 行未満に絞ってください"
                )
            preview = text.replace("\n", " ")[:120]
            print(f"  ✅ [{skill}] {q[:90]}…" + (f"（top={top}）" if top else "") + f" {n if n is not None else '?'} 行\n       → {preview}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"  ❌ [{skill}] {q}" + (f"（top={top}）" if top else "") + f"\n       → {exc}")
    print(f"\n{'[OK]' if not failed else '[NG]'} {len(queries) - failed}/{len(queries)} 本の SQL が通りました")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
