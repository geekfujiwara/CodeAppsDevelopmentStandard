"""プロファイルからマッピング契約（mapping.json）の下書きを作る。出力は必ず利用者がレビューする。

使い方:
    python build_mapping.py --profile spec/profile.json --target databricks --catalog main --schema cold_chain --out spec/mapping.json
    python build_mapping.py --profile spec/profile.json --target dataverse --prefix cr123 --out spec/mapping.json
    python build_mapping.py --profile spec/profile.json --target fabric-lakehouse --workspace-id <id> --lakehouse-id <id> --out spec/mapping.json
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parents[1] / "data-platform" / "scripts"))
from data_platform_common import print_json, read_json, require_identifier, write_json  # noqa: E402

TARGETS = ("databricks", "dataverse", "fabric-lakehouse")
PREFIX_RE = re.compile(r"^[a-z][a-z0-9]{1,7}$")


def snake(name: str, fallback: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    if not value:
        value = fallback
    if value[0].isdigit():
        value = f"c_{value}"
    return value[:100]


def singular(name: str) -> str:
    return name[:-1] if name.endswith("s") and not name.endswith("ss") else name


def target_name(kind: str, stem: str, prefix: str) -> str:
    base = snake(stem, "table")
    return f"{prefix}_{singular(base)}" if kind == "dataverse" else base


def column_name(kind: str, column: str, index: int, prefix: str) -> str:
    base = snake(column, f"col_{index}")
    return f"{prefix}_{base}" if kind == "dataverse" else base


def load_order(tables: list[dict]) -> list[str]:
    """親 → 子のトポロジカル順。循環はエラー。"""
    names = [table["target"] for table in tables]
    depends = {table["target"]: {rel["references"]["table"] for rel in table["relationships"]} for table in tables}
    order: list[str] = []
    state: dict[str, str] = {}

    def visit(name: str, path: list[str]) -> None:
        if state.get(name) == "done":
            return
        if state.get(name) == "visiting":
            raise ValueError(f"参照が循環しています: {' -> '.join(path + [name])}")
        state[name] = "visiting"
        for parent in sorted(depends.get(name, ())):
            if parent not in depends:
                raise ValueError(f"{name} が未定義のテーブル {parent} を参照しています")
            visit(parent, path + [name])
        state[name] = "done"
        order.append(name)

    for name in names:
        visit(name, [])
    return order


def build(profile: dict, kind: str, *, prefix: str = "", catalog: str = "", schema: str = "",
          workspace_id: str = "", lakehouse_id: str = "") -> dict:
    if kind not in TARGETS:
        raise ValueError(f"target は {TARGETS} のいずれか")
    if kind == "dataverse" and not PREFIX_RE.match(prefix):
        raise ValueError("Dataverse の --prefix は英小文字で始まる 2-8 文字の英数字")
    target: dict = {"kind": kind}
    if kind == "databricks":
        target.update(catalog=require_identifier(catalog, "catalog"), schema=require_identifier(schema, "schema"))
    elif kind == "dataverse":
        target["publisherPrefix"] = prefix
    else:
        if not workspace_id or not lakehouse_id:
            raise ValueError("fabric-lakehouse には --workspace-id と --lakehouse-id が必要")
        target.update(workspaceId=workspace_id, lakehouseId=lakehouse_id, folder="migration")
    by_file = {table["file"]: target_name(kind, Path(table["file"]).stem, prefix) for table in profile["tables"]}
    tables, review = [], []
    for table in profile["tables"]:
        name = by_file[table["file"]]
        if not table.get("key"):
            review.append(f"{table['file']}: 業務キー候補がありません。key を指定してください")
        columns = []
        for index, column in enumerate(table["columns"]):
            entry = {"source": column["name"], "target": column_name(kind, column["name"], index, prefix),
                     "type": column["type"], "required": column["nullCount"] == 0}
            if column["type"] == "string":
                entry["maxLength"] = max(column["maxLength"], 1)
            columns.append(entry)
        relationships = []
        for fk in table.get("foreignKeyCandidates", []):
            relation = {"column": fk["column"], "references": {"table": by_file[fk["references"]["file"]], "column": fk["references"]["column"]}}
            if kind == "dataverse":
                relation["navigationProperty"] = f"{by_file[fk['references']['file']]}id"
                review.append(f"{name}.{fk['column']}: navigationProperty を Lookup のスキーマ名（大文字小文字を区別）に合わせる")
            relationships.append(relation)
        entry = {"source": table["file"], "target": name, "key": table.get("key"), "columns": columns, "relationships": relationships}
        if kind == "dataverse":
            entry["entitySet"] = f"{name}s"
            review.append(f"{name}: entitySet と代替キー（{table.get('key')} 列）が dataverse スキルの定義と一致するか確認する")
        tables.append(entry)
    mapping = {"schemaVersion": "1.0", "target": target, "tables": tables, "review": review}
    mapping["loadOrder"] = load_order(tables)
    return mapping


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--target", required=True, choices=TARGETS)
    parser.add_argument("--prefix", default="")
    parser.add_argument("--catalog", default="")
    parser.add_argument("--schema", default="")
    parser.add_argument("--workspace-id", default="")
    parser.add_argument("--lakehouse-id", default="")
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    try:
        mapping = build(read_json(args.profile), args.target, prefix=args.prefix, catalog=args.catalog, schema=args.schema,
                        workspace_id=args.workspace_id, lakehouse_id=args.lakehouse_id)
    except ValueError as error:
        print(f"入力エラー: {error}", file=sys.stderr)
        return 2
    if args.out:
        write_json(args.out, mapping)
    print_json(mapping)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
