"""セマンティック層（Databricks metric view + Genie / Foundry IQ knowledge base）を plan → 承認 → apply で構成する。

使い方:
    python configure_semantics.py plan  --target databricks-genie|foundry-kb --spec FILE [--with-fabric-ontology] [--out FILE]
    python configure_semantics.py apply --plan FILE --approve-hash HASH

Fabric IQ Ontology の entity / relationship / binding は公開オーサリング API が無いため対象外（UI で構成し verify で確認）。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import (  # noqa: E402
    Api, DatabricksSql, HttpError, env, load_env, print_json, read_json, require_approval, require_identifier,
    seal_plan, write_json,
)

SEARCH_INDEX_API = "2025-09-01"
SEARCH_KB_API = "2026-08-01-preview"
REASONING_ORDER = ["minimal", "low", "medium"]


def sql_literal(text: str) -> str:
    return "'" + str(text).replace("\\", "\\\\").replace("'", "\\'") + "'"


def qualified_schema(catalog: str, schema: str) -> str:
    return f"{require_identifier(catalog, 'catalog')}.{require_identifier(schema, 'schema')}"


def yaml_scalar(value: str) -> str:
    return json.dumps(str(value), ensure_ascii=False)


def metric_view_yaml(metric: dict, schema: str) -> str:
    source = require_identifier(metric["source"], "metricView.source")
    lines = ["version: 1.1", f"comment: {yaml_scalar(metric.get('comment', ''))}", f"source: {schema}.{source}", "fields:"]
    for field in metric["fields"]:
        lines += [f"  - name: {yaml_scalar(field['name'])}", f"    expr: {yaml_scalar(field['expr'])}"]
    lines.append("measures:")
    for measure in metric["measures"]:
        lines += [f"  - name: {yaml_scalar(measure['name'])}", f"    expr: {yaml_scalar(measure['expr'])}"]
    text = "\n".join(lines)
    if "$$" in text:
        raise ValueError("metric view 定義に $$ は使えません")
    return text


def genie_question_id(question: str) -> str:
    return hashlib.sha256(question.encode("utf-8")).hexdigest()[:32]


def databricks_operations(spec: dict, catalog: str, warehouse_id: str) -> list[dict]:
    config = spec["databricks"]
    schema = qualified_schema(catalog, config["schema"])
    ops: list[dict] = []
    for table, comment in config.get("comments", {}).get("tables", {}).items():
        ops.append({"kind": "sql", "statement": f"COMMENT ON TABLE {schema}.{require_identifier(table, 'table')} IS {sql_literal(comment)}"})
    for column_path, comment in config.get("comments", {}).get("columns", {}).items():
        table, column = column_path.split(".", 1)
        ops.append({"kind": "sql", "statement":
                    f"COMMENT ON COLUMN {schema}.{require_identifier(table, 'table')}.{require_identifier(column, 'column')} IS {sql_literal(comment)}"})
    for view in config.get("views", []):
        name = require_identifier(view["name"], "view")
        ops.append({"kind": "sql", "statement": f"CREATE OR REPLACE VIEW {schema}.{name} AS {view['sql'].replace('{schema}', schema)}"})
    metric = config["metricView"]
    metric_name = require_identifier(metric["name"], "metricView.name")
    ops.append({"kind": "sql", "statement":
                f"CREATE OR REPLACE VIEW {schema}.{metric_name} WITH METRICS LANGUAGE YAML AS\n$$\n{metric_view_yaml(metric, schema)}\n$$"})
    genie = config["genie"]
    # Genie API は data_sources の各配列が identifier 順でないと 400 を返す
    tables = sorted(f"{schema}.{require_identifier(t, 'table')}" for t in genie["tables"])
    metric_views = sorted(f"{schema}.{require_identifier(m, 'metricView')}" for m in genie.get("metricViews", []))
    serialized = {
        "version": 2,
        "config": {"sample_questions": [{"id": genie_question_id(q), "question": [q]} for q in genie.get("sampleQuestions", [])]},
        "data_sources": {
            "tables": [{"identifier": identifier} for identifier in tables],
            "metric_views": [{"identifier": identifier} for identifier in metric_views],
        },
    }
    ops.append({"kind": "genie", "body": {"warehouse_id": warehouse_id, "title": genie["title"],
                                          "description": genie.get("description", ""),
                                          "serialized_space": json.dumps(serialized, separators=(",", ":"))}})
    return ops


def semantic_configuration(index: dict) -> dict:
    semantic = index["semantic"]
    return {"defaultConfiguration": "default", "configurations": [{"name": "default", "prioritizedFields": {
        "titleField": {"fieldName": semantic["titleField"]},
        "prioritizedContentFields": [{"fieldName": name} for name in semantic["contentFields"]],
        "prioritizedKeywordsFields": [{"fieldName": name} for name in semantic.get("keywordFields", [])],
    }}]}


def foundry_operations(spec: dict, spec_dir: Path, *, with_fabric: bool) -> list[dict]:
    config = spec["foundry"]
    index = config["index"]
    documents = read_json(spec_dir / index["documents"])
    ks = config["knowledgeSource"]
    kb = config["knowledgeBase"]
    account = env("FOUNDRY_ACCOUNT_NAME", required=True)
    chat = env("FOUNDRY_CHAT_MODEL", "gpt-4.1-mini")
    reasoning = kb.get("reasoning", "low")
    ops = [
        {"kind": "search", "method": "PUT", "path": f"/indexes/{index['name']}?api-version={SEARCH_INDEX_API}",
         "body": {"name": index["name"], "fields": index["fields"], "semantic": semantic_configuration(index)}},
        {"kind": "search", "method": "POST", "path": f"/indexes/{index['name']}/docs/index?api-version={SEARCH_INDEX_API}",
         "body": {"value": [dict(doc, **{"@search.action": "mergeOrUpload"}) for doc in documents]}},
        {"kind": "search", "method": "PUT", "path": f"/knowledgesources/{ks['name']}?api-version={SEARCH_KB_API}",
         "body": {"name": ks["name"], "kind": "searchIndex", "description": ks.get("description", ""),
                  "searchIndexParameters": {"searchIndexName": index["name"]}}},
    ]
    sources = [{"name": ks["name"]}]
    if with_fabric:
        fabric = config["fabricOntologySource"]
        ops.append({"kind": "search", "method": "PUT", "path": f"/knowledgesources/{fabric['name']}?api-version={SEARCH_KB_API}",
                    "body": {"name": fabric["name"], "kind": "fabricOntology", "description": fabric.get("description", ""),
                             "fabricOntologyParameters": {"workspaceId": env("FABRIC_WORKSPACE_ID", required=True),
                                                          "ontologyId": env("FABRIC_ONTOLOGY_ID", required=True)}}})
        sources.append({"name": fabric["name"]})
        # Fabric Ontology knowledge source は minimal reasoning を受け付けない
        if REASONING_ORDER.index(reasoning) < REASONING_ORDER.index("low"):
            reasoning = "low"
    ops.append({"kind": "search", "method": "PUT", "path": f"/knowledgebases/{kb['name']}?api-version={SEARCH_KB_API}",
                "body": {"name": kb["name"], "description": kb.get("description", ""),
                         "retrievalInstructions": kb.get("retrievalInstructions", ""),
                         "answerInstructions": kb.get("answerInstructions", ""),
                         "outputMode": kb.get("outputMode", "answerSynthesis"),
                         "knowledgeSources": sources,
                         "models": [{"kind": "azureOpenAI", "azureOpenAIParameters": {
                             "resourceUri": f"https://{account}.openai.azure.com", "deploymentId": chat, "modelName": chat}}],
                         "retrievalReasoningEffort": {"kind": reasoning}}})
    return ops


def build_plan(target: str, spec_path: str, *, with_fabric: bool = False) -> dict:
    spec = read_json(spec_path)
    if target == "databricks-genie":
        operations = databricks_operations(spec, env("DATABRICKS_CATALOG", required=True),
                                           env("DATABRICKS_WAREHOUSE_ID", required=True))
        endpoint = env("DATABRICKS_HOST", required=True)
    elif target == "foundry-kb":
        operations = foundry_operations(spec, Path(spec_path).resolve().parent, with_fabric=with_fabric)
        endpoint = f"https://{env('SEARCH_SERVICE_NAME', required=True)}.search.windows.net"
    else:
        raise ValueError(f"unknown target: {target}")
    return seal_plan({"schemaVersion": "1.0", "target": target, "endpoint": endpoint, "operations": operations})


def apply_plan(plan: dict, *, api: Api | None = None) -> dict:
    report = {"target": plan["target"], "results": []}
    if plan["target"] == "databricks-genie":
        api = api or Api("databricks", f"https://{plan['endpoint'].removeprefix('https://')}")
        warehouse = next(op["body"]["warehouse_id"] for op in plan["operations"] if op["kind"] == "genie")
        sql = DatabricksSql(api, warehouse)
        for op in plan["operations"]:
            if op["kind"] == "sql":
                sql.run(op["statement"])
                report["results"].append({"operation": op["statement"].split(" AS")[0][:120], "status": "verified"})
            else:
                report["results"].append(upsert_genie(api, op["body"]))
    else:
        api = api or Api("search", plan["endpoint"])
        for op in plan["operations"]:
            api.request(op["method"], op["path"], json_body=op["body"], expected=(200, 201, 204))
            report["results"].append({"operation": f"{op['method']} {op['path'].split('?')[0]}", "status": "verified"})
        kb_op = plan["operations"][-1]
        readback = api.json("GET", kb_op["path"])
        sources = [source["name"] for source in readback.get("knowledgeSources", [])]
        expected = [source["name"] for source in kb_op["body"]["knowledgeSources"]]
        report["results"].append({"operation": "read-back knowledge base", "status": "verified" if sources == expected else "failed",
                                  "knowledgeSources": sources,
                                  "reasoning": readback.get("retrievalReasoningEffort", {}).get("kind")})
    report["status"] = "failed" if any(item["status"] != "verified" for item in report["results"]) else "verified"
    return report


def upsert_genie(api: Api, body: dict) -> dict:
    spaces = api.json("GET", "/api/2.0/genie/spaces").get("spaces", [])
    existing = next((space for space in spaces if space.get("title") == body["title"]), None)
    if existing:
        try:
            api.request("PATCH", f"/api/2.0/genie/spaces/{existing['space_id']}", json_body=body, expected=(200,))
            return {"operation": "genie space update", "status": "verified", "spaceId": existing["space_id"]}
        except HttpError as error:
            return {"operation": "genie space update", "status": "failed", "spaceId": existing["space_id"], "detail": str(error)}
    created = api.json("POST", "/api/2.0/genie/spaces", json_body=body)
    return {"operation": "genie space create", "status": "verified", "spaceId": created.get("space_id")}


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    plan_parser = sub.add_parser("plan")
    plan_parser.add_argument("--target", required=True, choices=["databricks-genie", "foundry-kb"])
    plan_parser.add_argument("--spec", required=True)
    plan_parser.add_argument("--with-fabric-ontology", action="store_true")
    plan_parser.add_argument("--out")
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--plan", required=True)
    apply_parser.add_argument("--approve-hash", required=True)
    apply_parser.add_argument("--out")
    args = parser.parse_args(argv)
    if args.command == "plan":
        plan = build_plan(args.target, args.spec, with_fabric=args.with_fabric_ontology)
        out = args.out or f".data-platform/plan-{args.target}.json"
        write_json(out, plan)
        print_json({"plan": out, "planHash": plan["planHash"], "operations": len(plan["operations"])})
        return 0
    plan = read_json(args.plan)
    require_approval(plan, args.approve_hash)
    try:
        report = apply_plan(plan)
    except (HttpError, RuntimeError, TimeoutError) as error:
        report = {"target": plan["target"], "status": "failed", "detail": str(error)}
    write_json(args.out or f".data-platform/semantics-{plan['target']}.json", report)
    print_json(report)
    return 0 if report["status"] == "verified" else 1


if __name__ == "__main__":
    raise SystemExit(main())
