"""ソースファイル（CSV / JSON 配列 / JSON Lines）の読み込みと型変換。"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path

TYPES = ("boolean", "integer", "decimal", "datetime", "date", "string")
INTEGER_RE = re.compile(r"^[+-]?\d+$")
DECIMAL_RE = re.compile(r"^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DATETIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$")
BOOLEAN_VALUES = {"true": True, "false": False}


def read_table(path: str | Path) -> tuple[list[str], list[dict]]:
    """列名リストと行（値は文字列 or None）を返す。空文字は None として扱う。"""
    path = Path(path)
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".csv":
        reader = csv.DictReader(io.StringIO(text))
        columns = list(reader.fieldnames or [])
        rows = [{key: (value if value != "" else None) for key, value in row.items()} for row in reader]
        return columns, rows
    if path.suffix.lower() in {".json", ".jsonl", ".ndjson"}:
        stripped = text.strip()
        records = json.loads(stripped) if stripped.startswith("[") else [json.loads(line) for line in stripped.splitlines() if line.strip()]
        columns: list[str] = []
        for record in records:
            for key in record:
                if key not in columns:
                    columns.append(key)
        rows = [{key: _to_text(record.get(key)) for key in columns} for record in records]
        return columns, rows
    raise ValueError(f"未対応の形式: {path.name}（.csv / .json / .jsonl）")


def _to_text(value) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def matches(kind: str, value: str) -> bool:
    lowered = value.strip().lower()
    if kind == "boolean":
        return lowered in BOOLEAN_VALUES
    if kind == "integer":
        return bool(INTEGER_RE.match(lowered))
    if kind == "decimal":
        return bool(DECIMAL_RE.match(lowered))
    if kind == "date":
        return bool(DATE_RE.match(lowered))
    if kind == "datetime":
        return bool(DATETIME_RE.match(value.strip()))
    return True


def infer_type(values: list[str]) -> str:
    present = [value for value in values if value is not None]
    if not present:
        return "string"
    for kind in TYPES:
        if all(matches(kind, value) for value in present):
            return kind
    return "string"


def convert(kind: str, value: str | None):
    """文字列を宣言型へ変換する。変換できなければ ValueError。"""
    if value is None:
        return None
    text = value.strip()
    if kind == "string":
        return value
    if not matches(kind, text):
        raise ValueError(f"{kind} に変換できません")
    if kind == "boolean":
        return BOOLEAN_VALUES[text.lower()]
    if kind == "integer":
        return int(text)
    if kind == "decimal":
        return float(text)
    if kind == "date":
        return date.fromisoformat(text)
    if kind == "datetime":
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00").replace(" ", "T", 1))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    raise ValueError(f"未知の型: {kind}")


def to_wire(kind: str, value) -> str | None:
    """API に送る文字列表現（UTC、ISO 8601）。"""
    if value is None:
        return None
    if kind == "datetime":
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    if kind == "date":
        return value.isoformat()
    if kind == "boolean":
        return "true" if value else "false"
    if kind == "decimal":
        return repr(float(value))
    return str(value)


def normalize_for_compare(kind: str, value):
    """読み戻した値を比較用に正規化する。"""
    if value is None or value == "":
        return None
    if kind in {"datetime", "date", "boolean", "integer", "decimal"} and not isinstance(value, str):
        value = to_wire(kind, value) if kind in {"datetime", "date"} else value
    try:
        converted = convert(kind, str(value) if not isinstance(value, bool) else ("true" if value else "false"))
    except ValueError:
        return str(value)
    if kind == "decimal":
        return round(converted, 6)
    if kind in {"datetime", "date"}:
        return to_wire(kind, converted)
    return converted
