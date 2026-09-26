"""ソースファイルをプロファイルし、型・NULL 率・キー候補・外部キー候補を出力する（読み取りのみ）。

使い方:
    python profile_source.py --source-dir data/ --out spec/profile.json
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
sys.path.insert(0, str(SCRIPT_DIR.parents[1] / "data-platform" / "scripts"))
from data_platform_common import print_json, write_json  # noqa: E402
from source_reader import infer_type, read_table  # noqa: E402

SUPPORTED = {".csv", ".json", ".jsonl", ".ndjson"}


def profile_table(path: Path) -> dict:
    columns, rows = read_table(path)
    profiled = []
    for column in columns:
        values = [row.get(column) for row in rows]
        present = [value for value in values if value is not None]
        profiled.append({
            "name": column,
            "type": infer_type(values),
            "nullCount": len(values) - len(present),
            "distinctCount": len(set(present)),
            "maxLength": max((len(value) for value in present), default=0),
            "samples": present[:3],
        })
    keys = [c["name"] for c in profiled if c["nullCount"] == 0 and c["distinctCount"] == len(rows) and rows]
    return {"file": path.name, "rows": len(rows), "columns": profiled, "keyCandidates": keys,
            "key": choose_key(path.stem, keys), "_values": {c: {row[c] for row in rows if row.get(c) is not None} for c in columns}}


def choose_key(stem: str, candidates: list[str]) -> str | None:
    singular = stem[:-1] if stem.endswith("s") else stem
    for preferred in (f"{singular}_id", f"{stem}_id", "id"):
        if preferred in candidates:
            return preferred
    id_like = [name for name in candidates if name.endswith("_id")]
    return (id_like or candidates or [None])[0]


def foreign_keys(tables: list[dict]) -> None:
    """同名の列で、値が他表の業務キー集合に含まれるものを外部キー候補にする。"""
    for child in tables:
        child["foreignKeyCandidates"] = []
        for parent in tables:
            if parent is child or not parent["key"]:
                continue
            column = parent["key"]
            values = child["_values"].get(column)
            if column == child["key"] or not values:
                continue
            if values <= parent["_values"][column]:
                child["foreignKeyCandidates"].append({"column": column, "references": {"file": parent["file"], "column": column}})


def profile(source_dir: Path) -> dict:
    files = sorted(p for p in source_dir.iterdir() if p.suffix.lower() in SUPPORTED)
    if not files:
        raise SystemExit(f"{source_dir} に対象ファイル（{', '.join(sorted(SUPPORTED))}）がありません")
    tables = [profile_table(path) for path in files]
    foreign_keys(tables)
    for table in tables:
        table.pop("_values")
    return {"schemaVersion": "1.0", "sourceDir": str(source_dir), "tables": tables}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source-dir", required=True)
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    result = profile(Path(args.source_dir))
    if args.out:
        write_json(args.out, result)
    print_json(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
