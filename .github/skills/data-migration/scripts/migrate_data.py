"""マッピング契約に従ってデータを検証・投入・照合する。

使い方:
    python migrate_data.py plan   --mapping spec/mapping.json --source-dir data/ [--out FILE]
    python migrate_data.py apply  --plan FILE --approve-hash HASH
    python migrate_data.py verify --plan FILE [--out FILE]

plan は読み取りのみで、検証エラーが 1 件でもあれば計画を出さない（終了コード 2）。
apply はソースの hash が plan と一致する場合だけ書き込む。削除は行わない。
"""
from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from pathlib import Path
from urllib.parse import quote

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parents[1] / "data-platform" / "scripts"))
from data_platform_common import (  # noqa: E402
    Api, DatabricksSql, HttpError, env, exit_code, load_env, print_json, read_json, require_approval,
    require_identifier, result, seal_plan, sha256_text, summarize, write_json,
)
from build_mapping import load_order  # noqa: E402
from source_reader import TYPES, convert, normalize_for_compare, read_table, to_wire  # noqa: E402

MAX_ERRORS = 200
MAX_PARAMETERS = 1000
DATABRICKS_TYPES = {"string": "STRING", "integer": "BIGINT", "decimal": "DOUBLE", "boolean": "BOOLEAN",
                    "date": "DATE", "datetime": "TIMESTAMP"}
LAKEHOUSE_TABLE_RE = re.compile(r"^(?=[0-9]*[a-zA-Z_])[a-zA-Z0-9_]{1,256}$")
DATAVERSE_NAME_RE = re.compile(r"^[a-z][a-z0-9]{1,7}_[a-z0-9_]{1,90}$")


class Blocked(RuntimeError):
    """前提不足で投入できない（代替キー未定義など）。"""


# ---------- 検証 ----------

def validate_mapping(mapping: dict) -> None:
    kind = mapping["target"]["kind"]
    if kind not in {"databricks", "dataverse", "fabric-lakehouse"}:
        raise ValueError(f"未知の target.kind: {kind}")
    if kind == "databricks":
        require_identifier(mapping["target"]["catalog"], "catalog")
        require_identifier(mapping["target"]["schema"], "schema")
    names = set()
    for table in mapping["tables"]:
        _check_name(kind, table["target"], "table")
        if table["target"] in names:
            raise ValueError(f"テーブル {table['target']} が重複しています")
        names.add(table["target"])
        if not table.get("key"):
            raise ValueError(f"{table['target']}: key（業務キー）は必須です")
        sources = [column["source"] for column in table["columns"]]
        if table["key"] not in sources:
            raise ValueError(f"{table['target']}: key {table['key']} が columns にありません")
        for column in table["columns"]:
            _check_name(kind, column["target"], "column")
            if column["type"] not in TYPES:
                raise ValueError(f"{table['target']}.{column['target']}: 未知の type {column['type']}")
        for rel in table.get("relationships", []):
            if rel["column"] not in sources:
                raise ValueError(f"{table['target']}: relationship の列 {rel['column']} が columns にありません")
            if kind == "dataverse" and not rel.get("navigationProperty"):
                raise ValueError(f"{table['target']}.{rel['column']}: Dataverse には navigationProperty が必要です")
        if kind == "dataverse":
            _check_name(kind, table.get("entitySet", table["target"] + "s"), "entitySet")


def _check_name(kind: str, name: str, label: str) -> None:
    if kind == "dataverse":
        if not DATAVERSE_NAME_RE.match(name or ""):
            raise ValueError(f"Dataverse {label} '{name}' は prefix_ 付きの英小文字・数字・_ で指定してください")
    elif kind == "fabric-lakehouse" and label == "table":
        if not LAKEHOUSE_TABLE_RE.match(name or ""):
            raise ValueError(f"Lakehouse テーブル名 '{name}' が不正です")
    else:
        require_identifier(name, label)


def load_rows(table: dict, source_dir: Path, errors: list[dict]) -> list[dict]:
    """ソース行を宣言型に変換し、キー・必須・長さを検証する。"""
    columns, raw_rows = read_table(source_dir / table["source"])
    missing = [column["source"] for column in table["columns"] if column["source"] not in columns]
    if missing:
        errors.append({"table": table["target"], "rule": "missing-column", "columns": missing})
        return []
    rows, seen = [], set()
    for number, raw in enumerate(raw_rows, start=2):
        row = {}
        for column in table["columns"]:
            value = raw.get(column["source"])
            if value is None:
                if column.get("required") or column["source"] == table["key"]:
                    _error(errors, table, number, column, value, "required")
                row[column["source"]] = None
                continue
            try:
                row[column["source"]] = convert(column["type"], value)
            except ValueError:
                _error(errors, table, number, column, value, f"type:{column['type']}")
                continue
            if column["type"] == "string" and column.get("maxLength") and len(value) > column["maxLength"]:
                _error(errors, table, number, column, value, f"maxLength:{column['maxLength']}")
        key = row.get(table["key"])
        if key is not None:
            if key in seen:
                _error(errors, table, number, {"source": table["key"]}, key, "duplicate-key")
            seen.add(key)
        rows.append(row)
    return rows


def _error(errors: list[dict], table: dict, row: int, column: dict, value, rule: str) -> None:
    if len(errors) < MAX_ERRORS:
        errors.append({"table": table["target"], "row": row, "column": column["source"],
                       "value": None if value is None else str(value)[:80], "rule": rule})


def check_references(mapping: dict, data: dict[str, list[dict]], errors: list[dict]) -> None:
    tables = {table["target"]: table for table in mapping["tables"]}
    for table in mapping["tables"]:
        for rel in table.get("relationships", []):
            parent = tables[rel["references"]["table"]]
            parent_keys = {row.get(rel["references"]["column"]) for row in data[parent["target"]]}
            for index, row in enumerate(data[table["target"]], start=2):
                value = row.get(rel["column"])
                if value is not None and value not in parent_keys:
                    _error(errors, table, index, {"source": rel["column"]}, value, f"reference:{parent['target']}")


def build_plan(mapping: dict, source_dir: Path) -> tuple[dict | None, list[dict]]:
    validate_mapping(mapping)
    order = load_order(mapping["tables"])
    errors: list[dict] = []
    data = {table["target"]: load_rows(table, source_dir, errors) for table in mapping["tables"]}
    if not errors:
        check_references(mapping, data, errors)
    if errors:
        return None, errors
    plan = seal_plan({
        "schemaVersion": "1.0",
        "mapping": mapping,
        "sourceDir": str(source_dir.resolve()),
        "sourceHashes": source_hashes(mapping, source_dir),
        "loadOrder": order,
        "rowCounts": {name: len(rows) for name, rows in data.items()},
    })
    return plan, []


def source_hashes(mapping: dict, source_dir: Path) -> dict:
    return {table["source"]: sha256_text((source_dir / table["source"]).read_bytes()) for table in mapping["tables"]}


def load_verified_data(plan: dict) -> dict[str, list[dict]]:
    source_dir = Path(plan["sourceDir"])
    if source_hashes(plan["mapping"], source_dir) != plan["sourceHashes"]:
        raise SystemExit("ソースが plan 作成後に変更されています。plan を再実行してください。")
    errors: list[dict] = []
    data = {table["target"]: load_rows(table, source_dir, errors) for table in plan["mapping"]["tables"]}
    if errors:
        raise SystemExit(f"ソースの再検証でエラー: {errors[:3]}")
    return data


# ---------- 投入先 ----------

def quote_ident(name: str) -> str:
    return f"`{require_identifier(name, 'identifier')}`"


class DatabricksWriter:
    def __init__(self, mapping: dict, sql: DatabricksSql):
        target = mapping["target"]
        self.schema = f"{quote_ident(target['catalog'])}.{quote_ident(target['schema'])}"
        self.sql = sql

    def table_ref(self, table: dict) -> str:
        return f"{self.schema}.{quote_ident(table['target'])}"

    def prepare(self) -> None:
        self.sql.run(f"CREATE SCHEMA IF NOT EXISTS {self.schema}")

    def write(self, table: dict, rows: list[dict]) -> dict:
        columns = table["columns"]
        definition = ", ".join(f"{quote_ident(c['target'])} {DATABRICKS_TYPES[c['type']]}" for c in columns)
        self.sql.run(f"CREATE TABLE IF NOT EXISTS {self.table_ref(table)} ({definition})")
        key = next(c for c in columns if c["source"] == table["key"])
        batch = max(1, MAX_PARAMETERS // len(columns))
        statements = 0
        for start in range(0, len(rows), batch):
            chunk = rows[start:start + batch]
            values, parameters = [], []
            for r_index, row in enumerate(chunk):
                markers = []
                for c_index, column in enumerate(columns):
                    name = f"r{r_index}_c{c_index}"
                    markers.append(f":{name}")
                    parameter = {"name": name, "type": DATABRICKS_TYPES[column["type"]]}
                    wire = to_wire(column["type"], row[column["source"]])
                    if wire is not None:
                        parameter["value"] = wire.replace("T", " ").rstrip("Z") if column["type"] == "datetime" else wire
                    parameters.append(parameter)
                values.append(f"({', '.join(markers)})")
            aliases = ", ".join(quote_ident(c["target"]) for c in columns)
            statement = (f"MERGE INTO {self.table_ref(table)} AS target USING (SELECT * FROM VALUES {', '.join(values)} "
                         f"AS source({aliases})) AS source ON target.{quote_ident(key['target'])} = source.{quote_ident(key['target'])} "
                         "WHEN MATCHED THEN UPDATE SET * WHEN NOT MATCHED THEN INSERT *")
            self.sql.run(statement, parameters)
            statements += 1
        return {"table": table["target"], "rows": len(rows), "statements": statements}

    def read(self, table: dict) -> list[dict]:
        columns = table["columns"]
        select = ", ".join(quote_ident(c["target"]) for c in columns)
        rows = self.sql.rows(f"SELECT {select} FROM {self.table_ref(table)}")
        return [{c["source"]: value for c, value in zip(columns, row)} for row in rows]


class DataverseWriter:
    def __init__(self, mapping: dict, api: Api):
        self.mapping = mapping
        self.api = api
        self.tables = {table["target"]: table for table in mapping["tables"]}

    @staticmethod
    def entity_set(table: dict) -> str:
        return table.get("entitySet", table["target"] + "s")

    @staticmethod
    def key_literal(column: dict, value) -> str:
        if column["type"] in {"integer", "decimal"}:
            return str(value)
        return "'" + quote(str(value).replace("'", "''"), safe="") + "'"

    def key_column(self, table: dict) -> dict:
        return next(c for c in table["columns"] if c["source"] == table["key"])

    def key_path(self, table: dict, value) -> str:
        column = self.key_column(table)
        return f"{self.entity_set(table)}({column['target']}={self.key_literal(column, value)})"

    def prepare(self) -> None:
        for table in self.mapping["tables"]:
            key_attr = self.key_column(table)["target"]
            keys = self.api.json("GET", f"EntityDefinitions(LogicalName='{table['target']}')/Keys?$select=KeyAttributes").get("value", [])
            if not any(entry.get("KeyAttributes") == [key_attr] for entry in keys):
                raise Blocked(f"{table['target']}: 代替キー [{key_attr}] が未定義です（dataverse スキルで作成）")

    def payload(self, table: dict, row: dict) -> dict:
        lookups = {rel["column"]: rel for rel in table.get("relationships", [])}
        body = {}
        for column in table["columns"]:
            if column["source"] == table["key"]:
                continue
            value = row[column["source"]]
            if column["source"] in lookups:
                rel = lookups[column["source"]]
                if value is not None:
                    parent = self.tables[rel["references"]["table"]]
                    body[f"{rel['navigationProperty']}@odata.bind"] = "/" + self.key_path(parent, value)
                continue
            body[column["target"]] = self._json_value(column, value)
        return body

    @staticmethod
    def _json_value(column: dict, value):
        if value is None:
            return None
        if column["type"] in {"datetime", "date"}:
            return to_wire(column["type"], value)
        return value

    def write(self, table: dict, rows: list[dict]) -> dict:
        for row in rows:
            self.api.request("PATCH", self.key_path(table, row[table["key"]]), json_body=self.payload(table, row),
                             headers={"OData-MaxVersion": "4.0", "OData-Version": "4.0"}, expected=(200, 204))
        return {"table": table["target"], "rows": len(rows), "statements": len(rows)}

    def read(self, table: dict) -> list[dict]:
        plain = [c for c in table["columns"] if c["source"] not in {rel["column"] for rel in table.get("relationships", [])}]
        path = f"{self.entity_set(table)}?$select={','.join(c['target'] for c in plain)}"
        records = []
        while path:
            page = self.api.json("GET", path, headers={"Prefer": "odata.maxpagesize=5000"})
            records += page.get("value", [])
            path = page.get("@odata.nextLink")
        return [{c["source"]: record.get(c["target"]) for c in plain} for record in records]


class LakehouseWriter:
    def __init__(self, mapping: dict, fabric: Api, storage: Api):
        target = mapping["target"]
        self.workspace = target["workspaceId"]
        self.lakehouse = target["lakehouseId"]
        self.folder = require_identifier(target.get("folder", "migration"), "folder")
        self.fabric = fabric
        self.storage = storage

    def prepare(self) -> None:
        return None

    @staticmethod
    def csv_bytes(table: dict, rows: list[dict]) -> bytes:
        buffer = io.StringIO()
        writer = csv.writer(buffer, lineterminator="\n")
        writer.writerow([c["target"] for c in table["columns"]])
        for row in rows:
            writer.writerow(["" if row[c["source"]] is None else to_wire(c["type"], row[c["source"]]) for c in table["columns"]])
        return buffer.getvalue().encode("utf-8")

    def write(self, table: dict, rows: list[dict]) -> dict:
        data = self.csv_bytes(table, rows)
        path = f"/{self.workspace}/{self.lakehouse}/Files/{self.folder}/{table['target']}.csv"
        self.storage.request("PUT", f"{path}?resource=file", headers={"x-ms-version": "2021-06-08"}, expected=(201,))
        self.storage.request("PATCH", f"{path}?action=append&position=0", data=data,
                             headers={"x-ms-version": "2021-06-08", "Content-Type": "application/octet-stream"}, expected=(202,))
        self.storage.request("PATCH", f"{path}?action=flush&position={len(data)}", headers={"x-ms-version": "2021-06-08"}, expected=(200,))
        response = self.fabric.request("POST", f"/v1/workspaces/{self.workspace}/lakehouses/{self.lakehouse}/tables/{table['target']}/load",
                                       json_body={"relativePath": f"Files/{self.folder}/{table['target']}.csv", "pathType": "File",
                                                  "mode": "Overwrite", "recursive": False,
                                                  "formatOptions": {"format": "Csv", "header": True, "delimiter": ","}},
                                       expected=(202,))
        self.fabric.wait_operation(response, timeout=1800, interval=10)
        return {"table": table["target"], "rows": len(rows), "bytes": len(data)}

    def tables(self) -> set[str]:
        names, path = set(), f"/v1/workspaces/{self.workspace}/lakehouses/{self.lakehouse}/tables"
        while path:
            page = self.fabric.json("GET", path)
            names |= {item.get("name") for item in page.get("data", [])}
            path = page.get("continuationUri")
        return names


def writer_for(mapping: dict, factory=Api):
    kind = mapping["target"]["kind"]
    if kind == "databricks":
        host = env("DATABRICKS_HOST", required=True).removeprefix("https://").rstrip("/")
        return DatabricksWriter(mapping, DatabricksSql(factory("databricks", f"https://{host}"), env("DATABRICKS_WAREHOUSE_ID", required=True)))
    if kind == "dataverse":
        base = env("DATAVERSE_URL", required=True).rstrip("/") + "/api/data/v9.2"
        return DataverseWriter(mapping, factory("dataverse", base))
    return LakehouseWriter(mapping, factory("fabric"), factory("storage"))


# ---------- 実行 ----------

def apply(plan: dict, writer) -> dict:
    data = load_verified_data(plan)
    tables = {table["target"]: table for table in plan["mapping"]["tables"]}
    report = {"target": plan["mapping"]["target"]["kind"], "tables": []}
    try:
        writer.prepare()
    except Blocked as error:
        report["status"] = "blocked"
        report["detail"] = str(error)
        return report
    for name in plan["loadOrder"]:
        report["tables"].append(writer.write(tables[name], data[name]))
    report["status"] = "verified"
    return report


def verify(plan: dict, writer) -> list[dict]:
    data = load_verified_data(plan)
    checks = []
    if isinstance(writer, LakehouseWriter):
        existing = writer.tables()
        for name in plan["loadOrder"]:
            checks.append(result(f"{name}:exists", "verified" if name in existing else "failed", ""))
            checks.append(result(f"{name}:rows", "not-tested", "Lakehouse の件数は SQL analytics endpoint で確認する"))
        return checks
    for table in plan["mapping"]["tables"]:
        actual = writer.read(table)
        compare_columns = [c for c in table["columns"] if actual and c["source"] in actual[0]]
        expected = {row[table["key"]]: row for row in data[table["target"]]}
        key_column = next(c for c in table["columns"] if c["source"] == table["key"])
        got = {normalize_for_compare(key_column["type"], row[table["key"]]): row for row in actual}
        expected_keys = {normalize_for_compare(key_column["type"], key) for key in expected}
        missing = sorted(map(str, expected_keys - set(got)))
        extra = sorted(map(str, set(got) - expected_keys))
        mismatched = []
        for key, row in expected.items():
            other = got.get(normalize_for_compare(key_column["type"], key))
            if other is None:
                continue
            for column in compare_columns:
                if normalize_for_compare(column["type"], row[column["source"]]) != normalize_for_compare(column["type"], other[column["source"]]):
                    mismatched.append(f"{key}.{column['source']}")
        status = "verified" if not missing and not extra and not mismatched else "failed"
        checks.append(result(table["target"], status, "", expectedRows=len(expected), actualRows=len(actual),
                             missingKeys=missing[:20], extraKeys=extra[:20], mismatched=mismatched[:20]))
    return checks


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    plan_parser = sub.add_parser("plan")
    plan_parser.add_argument("--mapping", required=True)
    plan_parser.add_argument("--source-dir", required=True)
    plan_parser.add_argument("--out", default=".data-migration/plan.json")
    apply_parser = sub.add_parser("apply")
    apply_parser.add_argument("--plan", required=True)
    apply_parser.add_argument("--approve-hash", required=True)
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("--plan", required=True)
    verify_parser.add_argument("--out")
    args = parser.parse_args(argv)

    if args.command == "plan":
        try:
            plan, errors = build_plan(read_json(args.mapping), Path(args.source_dir))
        except (ValueError, KeyError) as error:
            print(f"マッピングエラー: {error}", file=sys.stderr)
            return 2
        if errors:
            print_json({"status": "failed", "errors": errors})
            return 2
        write_json(args.out, plan)
        print_json({"plan": args.out, "planHash": plan["planHash"], "loadOrder": plan["loadOrder"], "rowCounts": plan["rowCounts"]})
        return 0

    plan = read_json(args.plan)
    if args.command == "apply":
        require_approval(plan, args.approve_hash)
        try:
            report = apply(plan, writer_for(plan["mapping"]))
        except HttpError as error:
            report = {"status": "failed", "detail": str(error)}
        print_json(report)
        return 0 if report["status"] == "verified" else 1

    checks = verify(plan, writer_for(plan["mapping"]))
    report = summarize(checks)
    if args.out:
        write_json(args.out, report)
    print_json(report)
    return exit_code(checks)


if __name__ == "__main__":
    raise SystemExit(main())
