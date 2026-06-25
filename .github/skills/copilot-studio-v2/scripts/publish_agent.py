"""
Copilot Studio v2 (cliagent) エージェントを API で公開する。
================================================================================
PvaPublish アクションを呼ぶ。プロビジョニング直後は一時的に失敗することがあるため
数回リトライする。

★公開状態の確認は `pac copilot list`（Published / Active / Provisioned）が正。
  cliagent では bots.publishedon が None のままになることがある。

★MCP サーバーを含むエージェントは、公開後に Copilot Studio UI で MCP サーバーの
  「確認(Confirm)」が一度必要（正常系の一部）。再公開だけではエラーが消えないことがある。
  詳細は references/mcp-servers.md を参照。

.env パラメータ:
  AGENT_BOTID / AGENT_SCHEMA   対象エージェント（未指定なら agent_botid.txt）

実行: python publish_agent.py
"""
from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import api_get, get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"


def resolve_bot() -> str:
    bot = os.getenv("AGENT_BOTID", "").strip()
    if bot and re.fullmatch(r"[0-9a-fA-F-]{36}", bot):
        return bot
    schema = os.getenv("AGENT_SCHEMA", "").strip()
    if schema:
        res = api_get(f"bots?$select=botid&$filter=schemaname eq '{schema}'").get("value")
        if res:
            return res[0]["botid"]
    bf = Path("agent_botid.txt")
    if bf.exists():
        return bf.read_text(encoding="utf-8").strip()
    print("Error: AGENT_BOTID / AGENT_SCHEMA / agent_botid.txt のいずれかが必要です。", file=sys.stderr)
    sys.exit(1)


def publish(sess, bot_id: str, retries: int = 3) -> bool:
    for attempt in range(retries):
        r = sess.post(f"{API}/bots({bot_id})/Microsoft.Dynamics.CRM.PvaPublish", json={})
        if r.status_code in (200, 204):
            print(f"  ✅ 公開成功 (status={r.status_code})")
            return True
        print(f"  ⚠️ 公開リトライ {attempt + 1}/{retries}: {r.status_code} {r.text[:300]}")
        time.sleep(10)
    print("  ❌ 公開に失敗しました。Copilot Studio UI で公開してください。", file=sys.stderr)
    return False


def main() -> None:
    bot_id = resolve_bot()
    sess = get_session()
    print(f"公開: bot={bot_id}")
    publish(sess, bot_id)
    print("確認: pac copilot list（Published / Active / Provisioned）")
    print("※ MCP を含む場合は UI で MCP サーバーの「確認(Confirm)」が一度必要なことがあります。")


if __name__ == "__main__":
    main()
