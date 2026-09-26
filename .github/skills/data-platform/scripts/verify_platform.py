"""データ基盤を runtime まで実測し、MCP 接続情報を出力する（HTTP 200 やリソース存在だけで成功にしない）。

使い方:
    python verify_platform.py --check databricks-sql --check databricks-genie --check databricks-genie-mcp
    python verify_platform.py --check fabric-mcp --check foundry-kb --check foundry-kb-mcp
    python verify_platform.py --check all --spec ../references/samples/cold-chain-semantics.json --emit-mcp spec/mcp-endpoints.json

期待値は --expected（既定: references/samples/cold-chain-expected.json）。
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import (  # noqa: E402
    REFERENCES_DIR, Api, DatabricksSql, HttpError, McpClient, env, exit_code, load_env, mcp_outcome, mcp_text,
    parse_sse_or_json, print_json, read_json, require_identifier, result, summarize, write_json,
)

CHECKS = ["databricks-sql", "databricks-genie", "databricks-genie-mcp", "fabric-mcp", "foundry-kb", "foundry-kb-mcp"]
SEARCH_KB_API = "2026-08-01-preview"
GENIE_TERMINAL = {"COMPLETED", "FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}


def normalize(value):
    if value is None:
        return None
    try:
        number = float(value)
        return round(number, 6)
    except (TypeError, ValueError):
        return str(value)


def rows_match(actual: list[list], expected: list[list]) -> bool:
    return sorted(map(lambda r: tuple(map(normalize, r)), actual)) == sorted(map(lambda r: tuple(map(normalize, r)), expected))


def databricks_host() -> str:
    return env("DATABRICKS_HOST", required=True).removeprefix("https://").rstrip("/")


def databricks_schema(spec: dict) -> str:
    catalog = require_identifier(env("DATABRICKS_CATALOG", required=True), "catalog")
    return f"{catalog}.{require_identifier(spec['databricks']['schema'], 'schema')}"


def check_databricks_sql(api: Api, spec: dict, expected: dict) -> list[dict]:
    sql = DatabricksSql(api, env("DATABRICKS_WAREHOUSE_ID", required=True))
    schema = databricks_schema(spec)
    checks = spec["databricks"]["checks"]
    metric = expected["metricView"]
    rows = sql.rows(checks["metricViewSql"].replace("{schema}", schema),
                    [{"name": "freezer_id", "value": metric["freezerId"], "type": "STRING"}])
    want = [[metric["freezerId"], metric["anomalyCount"], metric["maximumTemperatureC"]]]
    out = [result("databricks-sql:metric-view", "verified" if rows_match(rows, want) else "failed", "", rows=rows, expected=want)]
    truth = sql.rows(checks["groundTruthSql"].replace("{schema}", schema))
    out.append(result("databricks-sql:ground-truth", "verified" if rows_match(truth, expected["rows"]) else "failed", "",
                      rows=truth, expected=expected["rows"]))
    return out


def check_databricks_genie(api: Api, expected: dict, *, sleep=time.sleep, timeout: float = 600) -> list[dict]:
    space = env("DATABRICKS_GENIE_SPACE_ID", required=True)
    start = api.json("POST", f"/api/2.0/genie/spaces/{space}/start-conversation",
                     json_body={"content": expected["question"]})
    conversation = start.get("conversation_id") or start.get("conversation", {}).get("conversation_id")
    message_id = start.get("message_id") or start.get("message", {}).get("message_id")
    if not conversation or not message_id:
        return [result("databricks-genie", "failed", "conversation_id / message_id が返りません")]
    path = f"/api/2.0/genie/spaces/{space}/conversations/{conversation}/messages/{message_id}"
    deadline = time.monotonic() + timeout
    message = api.json("GET", path)
    while message.get("status") not in GENIE_TERMINAL:
        if time.monotonic() > deadline:
            return [result("databricks-genie", "failed", f"timeout: {message.get('status')}")]
        sleep(2)
        message = api.json("GET", path)
    if message["status"] != "COMPLETED":
        return [result("databricks-genie", "failed", f"status={message['status']}")]
    rows: list[list] = []
    for attachment in message.get("attachments", []):
        if attachment.get("query") and attachment.get("attachment_id"):
            data = api.json("GET", f"{path}/attachments/{attachment['attachment_id']}/query-result")
            rows += data.get("statement_response", {}).get("result", {}).get("data_array", []) or []
    status = "verified" if rows_match(rows, expected["rows"]) else "failed"
    return [result("databricks-genie", status, "", rows=rows, expected=expected["rows"])]


def text_arguments(tool: dict, question: str) -> dict | None:
    """必須引数が文字列 1 つ、または文字列配列 1 つなら質問を渡す。それ以外は推測しない。"""
    schema = tool.get("inputSchema", {})
    required = schema.get("required", [])
    properties = schema.get("properties", {})
    if len(required) != 1:
        return None
    prop = properties.get(required[0], {})
    if prop.get("type") == "string":
        return {required[0]: question}
    if prop.get("type") == "array" and prop.get("items", {}).get("type") == "string":
        return {required[0]: [question]}
    return None


def check_mcp(name: str, api: Api, endpoint: str, *, question: str, must_contain: list[str],
              tool_name: str | None, list_tool: str | None = None) -> list[dict]:
    client = McpClient(api, endpoint)
    init = client.initialize()
    status, detail = mcp_outcome(init)
    out = [result(f"{name}:initialize", status, detail)]
    if status != "verified":
        return out
    tools_body = client.list_tools()
    status, detail = mcp_outcome(tools_body)
    tools = tools_body.get("result", {}).get("tools", []) if status == "verified" else []
    out.append(result(f"{name}:tools/list", status, detail, tools=[tool.get("name") for tool in tools]))
    if status != "verified":
        return out
    if list_tool and any(tool.get("name") == list_tool for tool in tools):
        body = client.call_tool(list_tool, {})
        status, detail = mcp_outcome(body)
        if status == "verified" and not mcp_text(body["result"]).strip(" []{}\n"):
            status, detail = "blocked", "entity type が 0 件（Ontology が未バインド。Fabric UI で entity / binding を構成）"
        out.append(result(f"{name}:{list_tool}", status, detail))
        if status != "verified":
            return out
    tool = next((tool for tool in tools if tool.get("name") == tool_name), None) if tool_name else (tools[0] if tools else None)
    if not tool:
        out.append(result(f"{name}:tools/call", "failed", f"tool '{tool_name}' がありません"))
        return out
    arguments = text_arguments(tool, question)
    if arguments is None:
        out.append(result(f"{name}:tools/call", "not-tested", "inputSchema が単一の文字列引数ではないため推測しない",
                          inputSchema=tool.get("inputSchema")))
        return out
    body = client.call_tool(tool["name"], arguments)
    status, detail = mcp_outcome(body)
    if status == "verified":
        text = mcp_text(body["result"])
        missing = [token for token in must_contain if token not in text]
        status, detail = ("verified", "") if not missing else ("failed", f"回答に {missing} が含まれない")
    out.append(result(f"{name}:tools/call", status, detail, tool=tool["name"]))
    return out


def _structured(body: dict) -> dict:
    payload = body.get("result", {})
    if isinstance(payload.get("structuredContent"), dict):
        return payload["structuredContent"]
    return parse_sse_or_json(mcp_text(payload) or "{}")


def genie_mcp_rows(state: dict) -> list[list]:
    rows = []
    for attachment in state.get("content", {}).get("queryAttachments", []):
        for record in attachment.get("statement_response", {}).get("result", {}).get("data_array", []) or []:
            values = record.get("values", record) if isinstance(record, dict) else record
            rows.append([next(iter(v.values()), None) if isinstance(v, dict) else v for v in values])
    return rows


def check_genie_mcp(api: Api, endpoint: str, expected: dict, *, sleep=time.sleep, timeout: float = 600) -> list[dict]:
    """Genie Agent MCP は非同期: query_space → poll_response を完了まで呼び、行を正解と比較する。"""
    client = McpClient(api, endpoint)
    status, detail = mcp_outcome(client.initialize())
    out = [result("databricks-genie-mcp:initialize", status, detail)]
    if status != "verified":
        return out
    tools_body = client.list_tools()
    status, detail = mcp_outcome(tools_body)
    tools = tools_body.get("result", {}).get("tools", []) if status == "verified" else []
    out.append(result("databricks-genie-mcp:tools/list", status, detail, tools=[tool.get("name") for tool in tools]))
    query = next((t["name"] for t in tools if t.get("name", "").startswith("query_space")), None)
    poll = next((t["name"] for t in tools if t.get("name", "").startswith("poll_response")), None)
    if status != "verified" or not query or not poll:
        out.append(result("databricks-genie-mcp:tools/call", "failed" if status == "verified" else status,
                          "query_space / poll_response がありません" if status == "verified" else detail))
        return out
    body = client.call_tool(query, {"query": expected["question"]})
    status, detail = mcp_outcome(body)
    deadline = time.monotonic() + timeout
    state = _structured(body) if status == "verified" else {}
    while status == "verified" and state.get("status") not in GENIE_TERMINAL:
        if time.monotonic() > deadline:
            status, detail = "failed", f"timeout: {state.get('status')}"
            break
        sleep(3)
        body = client.call_tool(poll, {"conversation_id": state["conversationId"], "message_id": state["messageId"]})
        status, detail = mcp_outcome(body)
        state = _structured(body) if status == "verified" else state
    rows = genie_mcp_rows(state)
    if status == "verified":
        if state.get("status") != "COMPLETED":
            status, detail = "failed", f"status={state.get('status')}"
        elif not rows_match(rows, expected["rows"]):
            status, detail = "failed", "行が正解と一致しません"
    out.append(result("databricks-genie-mcp:tools/call", status, detail, tool=query, rows=rows, expected=expected["rows"]))
    return out


def retrieve_body(reasoning: str, question: str, output_mode: str) -> dict:
    if reasoning == "minimal":
        return {"intents": [{"type": "semantic", "search": question}], "includeActivity": True}
    return {"messages": [{"role": "user", "content": [{"type": "text", "text": question}]}],
            "outputMode": output_mode, "includeActivity": True}


def check_foundry_kb(api: Api, spec: dict, expected: dict) -> list[dict]:
    kb_name = spec["foundry"]["knowledgeBase"]["name"]
    definition = api.json("GET", f"/knowledgebases/{kb_name}?api-version={SEARCH_KB_API}")
    reasoning = definition.get("retrievalReasoningEffort", {}).get("kind", "minimal")
    output_mode = definition.get("outputMode", "extractiveData")
    knowledge = expected["knowledge"]
    response = api.request("POST", f"/knowledgebases/{kb_name}/retrieve?api-version={SEARCH_KB_API}",
                           json_body=retrieve_body(reasoning, knowledge["query"], output_mode), expected=(200, 206))
    body = response.json()
    failed_sources = [a.get("knowledgeSourceName") or a.get("type") for a in body.get("activity", []) if a.get("error")]
    text = "\n".join(part.get("text", "") for message in body.get("response", []) for part in message.get("content", []))
    doc_keys = [ref.get("docKey") for ref in body.get("references", [])]
    missing = [token for token in knowledge["mustContain"] if token not in text]
    cited = knowledge["referenceDocKey"] in doc_keys
    status = "verified" if not missing and cited else "failed"
    detail = "" if status == "verified" else f"missing={missing}, cited={cited}"
    if response.status_code == 206:
        detail = (detail + "; " if detail else "") + f"206 Partial Content（失敗した source: {failed_sources}）"
    return [result("foundry-kb:retrieve", status, detail, reasoning=reasoning, outputMode=output_mode, references=doc_keys,
                   httpStatus=response.status_code, failedSources=failed_sources)]


def mcp_endpoints(spec: dict) -> dict:
    endpoints = {}
    if env("DATABRICKS_HOST") and env("DATABRICKS_GENIE_SPACE_ID"):
        endpoints["databricks-genie"] = {"endpoint": f"https://{databricks_host()}/api/2.0/mcp/genie/{env('DATABRICKS_GENIE_SPACE_ID')}",
                                         "tokenKind": "databricks", "clientSkills": ["copilot-studio", "ai-teammate"]}
    if env("FABRIC_WORKSPACE_ID") and env("FABRIC_ONTOLOGY_ID"):
        endpoints["fabric-ontology"] = {
            "endpoint": f"https://api.fabric.microsoft.com/v1/mcp/dataPlane/workspaces/{env('FABRIC_WORKSPACE_ID')}/items/{env('FABRIC_ONTOLOGY_ID')}/ontologyEndpoint",
            "tokenKind": "fabric", "clientSkills": ["cowork", "copilot-studio", "ai-teammate"]}
    if env("SEARCH_SERVICE_NAME") and spec.get("foundry"):
        endpoints["foundry-iq"] = {
            "endpoint": f"https://{env('SEARCH_SERVICE_NAME')}.search.windows.net/knowledgebases/{spec['foundry']['knowledgeBase']['name']}/mcp?api-version={SEARCH_KB_API}",
            "tokenKind": "search", "tool": "knowledge_base_retrieve", "role": "Search Index Data Reader",
            "clientSkills": ["copilot-studio", "ai-teammate"]}
    return endpoints


def run(checks: list[str], spec: dict, expected: dict, factory=Api) -> tuple[list[dict], dict]:
    out: list[dict] = []
    endpoints = mcp_endpoints(spec)
    question = expected["question"]
    tokens = [str(value) for value in expected["rows"][0]] if expected.get("rows") else []
    for check in checks:
        try:
            if check == "databricks-sql":
                out += check_databricks_sql(factory("databricks", f"https://{databricks_host()}"), spec, expected)
            elif check == "databricks-genie":
                out += check_databricks_genie(factory("databricks", f"https://{databricks_host()}"), expected)
            elif check == "databricks-genie-mcp":
                out += check_genie_mcp(factory("databricks"), endpoints["databricks-genie"]["endpoint"], expected)
            elif check == "fabric-mcp":
                out += check_mcp(check, factory("fabric"), endpoints["fabric-ontology"]["endpoint"], question=question,
                                 must_contain=tokens[1:2], tool_name="search_ontology", list_tool="list_ontology_entity_types")
            elif check == "foundry-kb":
                out += check_foundry_kb(factory("search", f"https://{env('SEARCH_SERVICE_NAME', required=True)}.search.windows.net"),
                                        spec, expected)
            elif check == "foundry-kb-mcp":
                out += check_mcp(check, factory("search"), endpoints["foundry-iq"]["endpoint"],
                                 question=expected["knowledge"]["query"], must_contain=expected["knowledge"]["mustContain"],
                                 tool_name="knowledge_base_retrieve")
        except KeyError as error:
            out.append(result(check, "not-tested", f"接続情報が未設定: {error}"))
        except (HttpError, RuntimeError, TimeoutError) as error:
            status = "blocked" if isinstance(error, HttpError) and error.status in {401, 403} else "failed"
            out.append(result(check, status, str(error)))
    return out, endpoints


def mcp_ready(results: list[dict], check: str) -> bool:
    """MCP 検証のすべての段階が verified の場合だけ公開候補にする。"""
    items = [item for item in results if item["check"].split(":")[0] == check]
    return bool(items) and all(item["status"] == "verified" for item in items)


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="append", required=True, choices=CHECKS + ["all"])
    parser.add_argument("--spec", default=str(REFERENCES_DIR / "samples" / "cold-chain-semantics.json"))
    parser.add_argument("--expected", default=str(REFERENCES_DIR / "samples" / "cold-chain-expected.json"))
    parser.add_argument("--emit-mcp", help="verified な基盤の MCP 接続情報（トークンは含まない）を書き出す")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    checks = CHECKS if "all" in args.check else args.check
    results, endpoints = run(checks, read_json(args.spec), read_json(args.expected))
    report = summarize(results)
    if args.emit_mcp:
        mapping = {"databricks-genie": "databricks-genie-mcp", "fabric-ontology": "fabric-mcp", "foundry-iq": "foundry-kb-mcp"}
        write_json(args.emit_mcp, {key: value for key, value in endpoints.items() if mcp_ready(results, mapping[key])})
    if args.out:
        write_json(args.out, report)
    print_json(report)
    return exit_code(results)


if __name__ == "__main__":
    raise SystemExit(main())
