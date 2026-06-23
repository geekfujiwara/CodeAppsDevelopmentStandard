"""
MCP Server を Copilot Studio v2 (cliagent) エージェントに API だけで追加する【正準スクリプト】
================================================================================
実機検証済み。手動 UI 接続の前後で Dataverse レコードに差分が無かったことから、
以下の API 手順が「Dataverse 側の完全な必要要件」であることを確認済み。

要点（ハマりどころ）:
  1) McpTool は botcomponent type=9 / data に kind:McpTool
     （connectorId / authMode / connectionReference / operationId）
  2) operationId は コネクタ Swagger の x-ms-agentic-protocol=mcp-streamable-1.0 の POST 操作
       例) Dataverse = InvokeMCP, Work IQ OneDrive = mcp_OneDriveRemoteServer
  3) ★接続参照(connectionReference)の論理名は厳密な規約に従う:
       {botschema}.cr.{connector}.{接続GUID}
       - コネクタ名は「フル」（shared_commondataserviceforapps をそのまま）。
         切詰め名だと公開時に「1 missing connection reference」で失敗する。
       - 接続名末尾の GUID（ハイフン有無は接続名に合わせる）
       - 100 文字を超える場合のみコネクタ名末尾を切詰（UI 互換フォールバック）
  4) ツール name/schemaname は UI 形式に合わせる:
       name="<表示名> — <表示名>"
       schemaname="{botschema}.tool.{Ascii表示名}-{Ascii表示名}_{乱数3}"
  5) ★接続の事前承認: 対象コネクタの Connected な接続が環境に存在している必要がある
       （接続自体は API 作成不可。未承認なら make.powerautomate.com で一度作成/承認）
  6) ★公開後に UI で MCP サーバーの「確認(Confirm)」が一度必要（正常系の一部）。
       references/mcp-servers.md を参照。

使い方:
  python add_mcp_server.py --connector shared_commondataserviceforapps \
      --display "Microsoft Dataverse MCP サーバー"
  python add_mcp_server.py --connector shared_workiqonedrive \
      --display "Work IQ OneDrive (Preview)"
  ※ --bot 省略時は .env の AGENT_SCHEMA / AGENT_BOTID から解決
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import (  # noqa: E402
    api_get, api_post, api_patch, get_session, get_token, DATAVERSE_URL,
)

API = f"{DATAVERSE_URL}/api/data/v9.2"
PREFIX = os.getenv("PUBLISHER_PREFIX", "geek").strip()
SOLUTION_NAME = os.getenv("SOLUTION_NAME", "").strip()
AGENT_SCHEMA_DEFAULT = os.getenv("AGENT_SCHEMA", "").strip()
AGENT_BOTID_DEFAULT = os.getenv("AGENT_BOTID", "").strip()

# 既知 MCP コネクタの operationId フォールバック（Swagger 取得不可時）
KNOWN_MCP_OPS = {
    "shared_commondataserviceforapps": "InvokeMCP",          # Dataverse MCP
    "shared_workiqonedrive": "mcp_OneDriveRemoteServer",     # Work IQ OneDrive (Preview)
}


def resolve_env_id() -> str:
    tok = get_token(scope="https://service.flow.microsoft.com/.default")
    r = requests.get(
        "https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments?api-version=2016-11-01",
        headers={"Authorization": f"Bearer {tok}"}, timeout=60)
    r.raise_for_status()
    dv = DATAVERSE_URL.rstrip("/")
    return next(e["name"] for e in r.json()["value"]
                if (e["properties"].get("linkedEnvironmentMetadata", {}).get("instanceUrl", "") or "").rstrip("/") == dv)


def resolve_bot(bot_arg: str | None) -> tuple[str, str]:
    """戻り値: (botid, schemaname)"""
    bot_arg = bot_arg or AGENT_BOTID_DEFAULT or AGENT_SCHEMA_DEFAULT
    if bot_arg and re.fullmatch(r"[0-9a-fA-F-]{36}", bot_arg):
        b = api_get(f"bots({bot_arg})?$select=botid,schemaname")
        return b["botid"], b["schemaname"]
    if not bot_arg:
        bf = Path("agent_botid.txt")
        if bf.exists():
            bot_arg = bf.read_text(encoding="utf-8").strip()
            b = api_get(f"bots({bot_arg})?$select=botid,schemaname")
            return b["botid"], b["schemaname"]
    res = api_get(f"bots?$select=botid,schemaname&$filter=schemaname eq '{bot_arg}'")
    if not res.get("value"):
        print(f"  ❌ エージェントが見つかりません (schema={bot_arg})", file=sys.stderr)
        sys.exit(1)
    b = res["value"][0]
    return b["botid"], b["schemaname"]


def find_connection(env_id: str, connector: str) -> str:
    """Connected な接続の name を返す。"""
    tok = get_token(scope="https://service.powerapps.com/.default")
    r = requests.get(
        f"https://api.powerapps.com/providers/Microsoft.PowerApps/apis/{connector}/connections",
        headers={"Authorization": f"Bearer {tok}"},
        params={"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'"}, timeout=120)
    r.raise_for_status()
    for conn in r.json().get("value", []):
        if any(s.get("status") == "Connected" for s in conn.get("properties", {}).get("statuses", [])):
            return conn["name"]
    print(f"  ❌ Connected な {connector} 接続がありません。"
          f"make.powerautomate.com で接続を作成/承認してください。", file=sys.stderr)
    sys.exit(1)


def _fetch_swagger(env_id: str, connector: str):
    tok = get_token(scope="https://service.powerapps.com/.default")
    for params in (
        {"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'", "$expand": "properties/apiDefinitions"},
        {"api-version": "2016-11-01", "$filter": f"environment eq '{env_id}'", "$expand": "apiDefinitions"},
    ):
        r = requests.get(f"https://api.powerapps.com/providers/Microsoft.PowerApps/apis/{connector}",
                         headers={"Authorization": f"Bearer {tok}"}, params=params, timeout=120)
        if r.status_code != 200:
            continue
        props = r.json().get("properties", {})
        swurl = (props.get("apiDefinitions", {}) or {}).get("originalSwaggerUrl") or props.get("swagger")
        if isinstance(swurl, dict):
            return swurl
        if isinstance(swurl, str) and swurl.startswith("http"):
            s = requests.get(swurl, timeout=120)
            if s.status_code == 200:
                return s.json()
    return None


def discover_operation_id(env_id: str, connector: str) -> str:
    """Swagger から x-ms-agentic-protocol=mcp-streamable-1.0 の POST operationId を取得。"""
    sw = _fetch_swagger(env_id, connector)
    if sw:
        for _path, methods in sw.get("paths", {}).items():
            for m, op in methods.items():
                if isinstance(op, dict) and m.lower() == "post" \
                        and op.get("x-ms-agentic-protocol") == "mcp-streamable-1.0":
                    return op.get("operationId")
    if connector in KNOWN_MCP_OPS:
        print(f"  ⚠ Swagger 取得不可 → 既知フォールバック使用: {KNOWN_MCP_OPS[connector]}")
        return KNOWN_MCP_OPS[connector]
    print("  ❌ operationId を検出できません。--operation で明示指定してください。", file=sys.stderr)
    sys.exit(1)


def build_connref_logical(bot_schema: str, connector: str, connection_name: str) -> str:
    """UI と同一規約: {botschema}.cr.{connector}.{接続GUID}。
    100 文字超のときのみコネクタ名末尾を切詰める（UI 互換フォールバック）。"""
    m = re.search(r"[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}",
                  connection_name)
    guid = m.group(0) if m else connection_name
    name = f"{bot_schema}.cr.{connector}.{guid}"
    if len(name) > 100:
        overflow = len(name) - 100
        name = f"{bot_schema}.cr.{connector[:max(0, len(connector) - overflow)]}.{guid}"
    return name


def ensure_connref(logical: str, connector: str, connection_name: str, display: str):
    existing = api_get("connectionreferences?$select=connectionreferenceid,connectionid"
                       f"&$filter=connectionreferencelogicalname eq '{logical}'")
    if existing.get("value"):
        ref = existing["value"][0]
        if ref.get("connectionid") != connection_name:
            api_patch(f"connectionreferences({ref['connectionreferenceid']})", {"connectionid": connection_name})
        print(f"  接続参照 既存: {logical}")
        return
    api_post("connectionreferences", {
        "connectionreferencelogicalname": logical,
        "connectionreferencedisplayname": display,
        "connectorid": f"/providers/Microsoft.PowerApps/apis/{connector}",
        "connectionid": connection_name,
    }, solution=SOLUTION_NAME or None)
    print(f"  ✅ 接続参照 作成: {logical} (len={len(logical)})")


def create_mcp_tool(sess, bot_id: str, bot_schema: str, connector: str,
                    operation_id: str, connref_logical: str, display: str) -> str:
    ascii_name = re.sub(r"[^A-Za-z0-9]+", "", display) or "McpServer"
    schema = f"{bot_schema}.tool.{ascii_name}-{ascii_name}_{uuid.uuid4().hex[:3].upper()}"

    # 冪等化: 同コネクタの McpTool を削除
    res = api_get(f"botcomponents?$select=botcomponentid,data"
                  f"&$filter=_parentbotid_value eq {bot_id} and componenttype eq 9")
    for c in res.get("value", []):
        d = c.get("data") or ""
        if "McpTool" in d and connector in d:
            sess.delete(f"{API}/botcomponents({c['botcomponentid']})")
            print(f"  🧹 既存 MCP ツール削除: {c['botcomponentid']}")

    data = (
        "kind: McpTool\r\n"
        f"connectorId: /providers/Microsoft.PowerApps/apis/{connector}\r\n"
        "authMode: Invoker\r\n"
        f"connectionReference: {connref_logical}\r\n"
        f"operationId: {operation_id}"
    )
    body = {
        "name": f"{display} — {display}",
        "schemaname": schema,
        "componenttype": 9,
        "description": display,
        "data": data,
        "parentbotid@odata.bind": f"/bots({bot_id})",
    }
    headers = {"Prefer": "return=representation"}
    if SOLUTION_NAME:
        headers["MSCRM.SolutionName"] = SOLUTION_NAME
    r = sess.post(f"{API}/botcomponents", json=body, headers=headers)
    if r.status_code not in (200, 201):
        print("  ❌ ツール作成失敗:", r.status_code, r.text[:600], file=sys.stderr)
        sys.exit(1)
    cid = r.json()["botcomponentid"]
    print(f"  ✅ MCP ツール作成: {cid}\n     schemaname: {schema}")
    return cid


def add_mcp_server(sess, bot_id: str, bot_schema: str, connector: str,
                   display: str, operation: str | None = None) -> str:
    """MCP 追加のオーケストレーション。deploy_agent.py からも import して再利用する。"""
    env_id = resolve_env_id()
    conn_name = find_connection(env_id, connector)
    print(f"  接続: {conn_name}")
    op_id = operation or discover_operation_id(env_id, connector)
    print(f"  operationId: {op_id}")
    connref = build_connref_logical(bot_schema, connector, conn_name)
    print(f"  接続参照 規約名: {connref}")
    ensure_connref(connref, connector, conn_name, f"{display} (MCP)")
    return create_mcp_tool(sess, bot_id, bot_schema, connector, op_id, connref, display)


def main():
    ap = argparse.ArgumentParser(description="Copilot Studio v2 エージェントに MCP Server を追加")
    ap.add_argument("--connector", default="shared_commondataserviceforapps",
                    help="MCP コネクタ名（既定: Dataverse）")
    ap.add_argument("--display", default="Microsoft Dataverse MCP サーバー", help="ツール表示名")
    ap.add_argument("--bot", default=None, help="botid または schemaname（既定: .env / agent_botid.txt）")
    ap.add_argument("--operation", default=None, help="operationId（省略時は Swagger から自動検出）")
    args = ap.parse_args()

    print("=" * 60)
    print(f"  MCP Server 追加: {args.display} ({args.connector})")
    print("=" * 60)
    bot_id, bot_schema = resolve_bot(args.bot)
    print(f"  エージェント: {bot_schema} ({bot_id})")

    sess = get_session()
    add_mcp_server(sess, bot_id, bot_schema, args.connector, args.display, args.operation)

    print("\n✅ 完了。Copilot Studio でエージェントを公開してください。")
    print("   ※ 公開後、UI で MCP サーバーの「確認(Confirm)」が一度必要な場合があります"
          "（references/mcp-servers.md）。")


if __name__ == "__main__":
    main()
