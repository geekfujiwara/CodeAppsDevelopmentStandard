"""コネクタの通称からコネクタ ID（`shared_xxx`）を解決する共通モジュール。

CLI やスクリプトが「コネクタ ID を入力してください」と対話プロンプトで止まるのを防ぐため、
実行前にコネクタ ID を確定させる。カタログは `references/connector-catalog.json`。

```python
from connector_catalog import resolve_connector

entry = resolve_connector("SharePoint")   # -> {"id": "shared_sharepointonline", ...}
entry = resolve_connector("shared_sql")   # -> ID 直指定もそのまま通る
```

解決順:
  1. コネクタ ID 直指定（`shared_xxx` / `/providers/Microsoft.PowerApps/apis/shared_xxx`）
  2. カタログの別名・表示名の完全一致（大文字小文字・記号を無視）
  3. カタログの部分一致（候補が 1 つに絞れる場合のみ）

候補が 0 個または 2 個以上のときは `ConnectorResolutionError` を送出する。
呼び出し側は例外メッセージをそのまま表示して終了し、**プロンプトを出さない**こと。

CLI としても使える:
  python connector_catalog.py --list
  python connector_catalog.py --resolve sharepoint
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from functools import lru_cache
from pathlib import Path

CATALOG_PATH = Path(__file__).resolve().parent.parent / "references" / "connector-catalog.json"

_ARM_PREFIX = "/providers/microsoft.powerapps/apis/"
_CONNECTOR_ID_PATTERN = re.compile(r"^shared_[a-z0-9\-]+$")


class ConnectorResolutionError(Exception):
    """コネクタ ID を一意に決められなかった。"""


def _normalize(value: str) -> str:
    """比較用にゆらぎを落とす（空白・記号・大文字小文字を無視、日本語はそのまま残す）。"""
    return re.sub(r"[\W_]", "", value.lower(), flags=re.UNICODE)


@lru_cache(maxsize=1)
def load_catalog() -> tuple[dict, ...]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return tuple(data.get("connectors", []))


def _as_connector_id(name: str) -> str | None:
    """`shared_xxx` 形式（ARM パス付きを含む）ならコネクタ ID を返す。"""
    candidate = name.strip()
    lowered = candidate.lower()
    if lowered.startswith(_ARM_PREFIX):
        candidate = candidate[len(_ARM_PREFIX) :]
    elif "/" in candidate:
        candidate = candidate.rsplit("/", 1)[-1]
    candidate = candidate.strip().lower()
    return candidate if _CONNECTOR_ID_PATTERN.match(candidate) else None


def _entry_for_id(connector_id: str) -> dict:
    for entry in load_catalog():
        if entry["id"] == connector_id:
            return dict(entry)
    return {"id": connector_id, "displayName": connector_id, "aliases": [], "requires": []}


def _keys(entry: dict) -> set[str]:
    keys = {_normalize(entry["id"]), _normalize(entry["id"].removeprefix("shared_"))}
    keys.add(_normalize(entry.get("displayName", "")))
    keys.update(_normalize(alias) for alias in entry.get("aliases", []))
    return {key for key in keys if key}


def find_candidates(name: str) -> list[dict]:
    """部分一致でカタログを検索する（曖昧さの提示用）。"""
    needle = _normalize(name)
    if not needle:
        return []
    return [
        dict(entry)
        for entry in load_catalog()
        if any(needle in key or key in needle for key in _keys(entry))
    ]


def resolve_connector(name: str) -> dict:
    """コネクタの通称・ID からカタログエントリを返す。

    見つからない／複数候補のときは ``ConnectorResolutionError`` を送出する。
    """
    if not name or not name.strip():
        raise ConnectorResolutionError("コネクタ名が空です。--connector を指定してください。")

    connector_id = _as_connector_id(name)
    if connector_id:
        return _entry_for_id(connector_id)

    needle = _normalize(name)
    exact = [dict(entry) for entry in load_catalog() if needle in _keys(entry)]
    if len(exact) == 1:
        return exact[0]

    candidates = exact or find_candidates(name)
    if len(candidates) == 1:
        return candidates[0]
    if not candidates:
        raise ConnectorResolutionError(
            f"コネクタ '{name}' をカタログから解決できませんでした。\n"
            f"  - コネクタ ID を直接指定する（例: --connector shared_sharepointonline）\n"
            f"  - 環境内の一覧から探す: npx pa connector list --search {name} --json\n"
            f"  - カタログに追加する: {CATALOG_PATH}"
        )
    listed = "\n".join(f"    - {c['id']}  ({c.get('displayName', '')})" for c in candidates)
    raise ConnectorResolutionError(
        f"コネクタ '{name}' の候補が複数あります。コネクタ ID で指定し直してください。\n{listed}"
    )


def resolve_connector_id(name: str) -> str:
    return resolve_connector(name)["id"]


def format_catalog() -> str:
    lines = [f"{'コネクタ ID':<40} 表示名 / 別名"]
    for entry in load_catalog():
        aliases = ", ".join(entry.get("aliases", []))
        lines.append(f"{entry['id']:<40} {entry.get('displayName', '')} [{aliases}]")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="コネクタ ID カタログの参照・解決")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list", action="store_true", help="カタログを一覧表示する")
    group.add_argument("--resolve", metavar="NAME", help="通称からコネクタ ID を解決する")
    args = parser.parse_args()

    if args.list:
        print(format_catalog())
        return 0
    try:
        print(resolve_connector_id(args.resolve))
    except ConnectorResolutionError as exc:
        print(f"NG: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    raise SystemExit(main())
