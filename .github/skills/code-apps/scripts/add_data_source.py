"""Code Apps のデータソースを **対話プロンプトなし** で追加する。

`npx pa app add data-source` はコネクタ ID や接続を省略すると対話プロンプトで停止し、
スクリプト実行（CI / エージェント実行）が固まる。このラッパーは実行前に

  1. コネクタの通称（SharePoint / Outlook / SQL …）→ コネクタ ID（`shared_xxx`）
  2. バインド先（接続参照 または 接続 ID）
  3. コネクタが必須とする追加値（`--org-url` / `--dataset` / `--table`）

をすべて確定させ、`--non-interactive` かつ **標準入力を閉じた状態** で CLI を起動する。
値が足りないときはプロンプトを出さずに `NG:` を表示して終了コード 1 で止まるため、
ターミナルが入力待ちでハングすることはない。

使い方:
  python .github/skills/code-apps/scripts/add_data_source.py --connector sharepoint
  python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse \
      --connection-ref {CR_LOGICAL_NAME} --solution-id {SOLUTION_ID}
  python .github/skills/code-apps/scripts/add_data_source.py --connector sql \
      --dataset {server},{database} --table {table}
  python .github/skills/code-apps/scripts/add_data_source.py --list-connectors
  python .github/skills/code-apps/scripts/add_data_source.py --connector teams --dry-run

`.env` から既定値を読む:
  DATAVERSE_URL                       --org-url の既定値
  ENV_ID                              接続一覧の検索対象環境
  SOLUTION_ID                         --solution-id の既定値
  CONNECTION_REFERENCE_LOGICAL_NAME   --connection-ref の既定値
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

_SCRIPT_DIR = Path(__file__).resolve().parent

# --- standard スキルの connector_catalog を import パスへ ---
for _candidate in (
    _SCRIPT_DIR.parent.parent / "standard" / "scripts",
    *[p / ".github" / "skills" / "standard" / "scripts" for p in _SCRIPT_DIR.parents],
):
    if (_candidate / "connector_catalog.py").is_file():
        sys.path.insert(0, str(_candidate))
        break
else:  # noqa: PLW0120
    sys.exit("NG: connector_catalog.py が見つかりません（standard スキルの scripts を確認）")

for _parent in _SCRIPT_DIR.parents:
    if (_parent / ".env").is_file():
        load_dotenv(_parent / ".env")
        break

from connector_catalog import (  # noqa: E402
    ConnectorResolutionError,
    format_catalog,
    resolve_connector,
)

CONNECTION_ID_KEYS = ("name", "id", "connectionId", "connectionName")
CONNECTOR_KEYS = ("connectorId", "apiId", "apiName", "connector", "connectorName", "connectorType")
DISPLAY_KEYS = ("displayName", "connectionDisplayName", "name")


def _npx() -> str:
    npx = shutil.which("npx")
    if not npx:
        sys.exit("NG: npx が見つかりません。Node.js 22 以上をインストールしてください。")
    return npx


def _run_cli(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    """CLI を標準入力を閉じて実行する（プロンプトが出ても待ち続けない）。"""
    command = [_npx(), "pa", *args]
    print(f"$ npx pa {' '.join(args)}")
    try:
        return subprocess.run(
            command,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        sys.exit(
            f"NG: CLI が {timeout} 秒以内に終了しませんでした。"
            "対話プロンプト待ちの可能性があります。不足している値をフラグで明示してください。"
        )


def _extract_items(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("value", "connections", "connectors", "data", "items", "results"):
            if isinstance(payload.get(key), list):
                return [item for item in payload[key] if isinstance(item, dict)]
    return []


def _first(item: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    properties = item.get("properties")
    if isinstance(properties, dict):
        for key in keys:
            value = properties.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
            if isinstance(value, dict) and isinstance(value.get("name"), str):
                return value["name"].strip()
    return ""


def _connector_of(item: dict) -> str:
    return _first(item, CONNECTOR_KEYS).rsplit("/", 1)[-1].lower()


def _list_json(args: list[str], timeout: int) -> list[dict]:
    result = _run_cli([*args, "--json", "--non-interactive"], timeout)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        sys.exit(f"NG: `pa {' '.join(args)}` が失敗しました。\n{detail}")
    stdout = (result.stdout or "").strip()
    start = min((i for i in (stdout.find("["), stdout.find("{")) if i >= 0), default=-1)
    if start < 0:
        return []
    try:
        return _extract_items(json.loads(stdout[start:]))
    except json.JSONDecodeError:
        return []


def resolve_connector_id(name: str, env_id: str, timeout: int) -> str:
    """カタログで解決し、無ければ環境のコネクタ一覧から一意に解決する。"""
    try:
        entry = resolve_connector(name)
        return entry["id"]
    except ConnectorResolutionError as exc:
        print(f"  カタログでは解決できませんでした。環境のコネクタ一覧を検索します。\n  {exc}")

    args = ["connector", "list", "--search", name]
    if env_id:
        args += ["--environment-id", env_id]
    matches = {
        _connector_of(item): _first(item, DISPLAY_KEYS)
        for item in _list_json(args, timeout)
        if _connector_of(item)
    }
    if len(matches) == 1:
        connector_id = next(iter(matches))
        print(f"  環境のコネクタ一覧から解決しました: {connector_id}")
        return connector_id
    if not matches:
        sys.exit(f"NG: コネクタ '{name}' が環境内に見つかりません。--connector にコネクタ ID を指定してください。")
    listed = "\n".join(f"    - {cid}  ({display})" for cid, display in sorted(matches.items()))
    sys.exit(f"NG: コネクタ '{name}' の候補が複数あります。コネクタ ID で指定し直してください。\n{listed}")


def resolve_connection_id(connector_id: str, env_id: str, timeout: int) -> str:
    """コネクタに紐づく接続が 1 つだけならその ID を返す。複数・0 なら停止する。"""
    args = ["connection", "list", "--search", connector_id]
    if env_id:
        args += ["--environment-id", env_id]
    matches = {
        _first(item, CONNECTION_ID_KEYS): _first(item, DISPLAY_KEYS)
        for item in _list_json(args, timeout)
        if _connector_of(item) == connector_id and _first(item, CONNECTION_ID_KEYS)
    }
    if len(matches) == 1:
        connection_id, display = next(iter(matches.items()))
        print(f"  接続を自動選択しました: {display or connection_id} ({connection_id})")
        return connection_id
    if not matches:
        sys.exit(
            f"NG: コネクタ '{connector_id}' の接続が環境にありません。\n"
            f"    先に接続を作成してください: npx pa connection create --connector {connector_id}"
        )
    listed = "\n".join(f"    - {cid}  ({display})" for cid, display in sorted(matches.items()))
    sys.exit(
        f"NG: コネクタ '{connector_id}' の接続が複数あります。--connection-id で 1 つ選んでください。\n{listed}"
    )


def build_command(args: argparse.Namespace, connector_id: str, binding: list[str]) -> list[str]:
    command = ["app", "add", "data-source", "--connector", connector_id, *binding]
    if args.org_url:
        command += ["--org-url", args.org_url]
    if args.dataset:
        command += ["--dataset", args.dataset]
    if args.table:
        command += ["--table", args.table]
    if args.procedure:
        command += ["--procedure", args.procedure]
    return command + ["--non-interactive"]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Code Apps のデータソースを対話プロンプトなしで追加する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--connector", help="コネクタの通称またはコネクタ ID（例: sharepoint / shared_sql）")
    parser.add_argument("--connection-ref", default=os.getenv("CONNECTION_REFERENCE_LOGICAL_NAME", ""))
    parser.add_argument("--connection-id", default="")
    parser.add_argument("--solution-id", default=os.getenv("SOLUTION_ID", ""))
    parser.add_argument("--org-url", default="")
    parser.add_argument("--dataset", default="", help="データセット（SharePoint はサイト URL、SQL は server,database）")
    parser.add_argument("--table", default="", help="テーブル / リスト")
    parser.add_argument("--procedure", default="", help="SQL ストアドプロシージャ")
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID", ""), help="接続・コネクタ一覧の検索対象環境")
    parser.add_argument("--timeout", type=int, default=600, help="CLI 1 回あたりの上限秒数（既定 600）")
    parser.add_argument("--dry-run", action="store_true", help="実行せずコマンドだけ表示する")
    parser.add_argument("--list-connectors", action="store_true", help="コネクタ ID カタログを表示して終了する")
    args = parser.parse_args()

    if args.list_connectors:
        print(format_catalog())
        return 0
    if not args.connector:
        parser.error("--connector を指定してください（--list-connectors で一覧を確認できます）")

    if not Path("power.config.json").is_file():
        sys.exit("NG: power.config.json が見つかりません。Code App のルートで実行してください。")

    connector_id = resolve_connector_id(args.connector, args.environment_id, args.timeout)
    try:
        entry = resolve_connector(connector_id)
    except ConnectorResolutionError:
        entry = {"id": connector_id, "displayName": connector_id, "requires": []}
    requires = entry.get("requires", [])
    print(f"コネクタ: {entry.get('displayName', connector_id)} -> {connector_id}")
    if entry.get("note"):
        print(f"  memo: {entry['note']}")

    if "orgUrl" in requires and not args.org_url:
        args.org_url = os.getenv("DATAVERSE_URL", "")
        if not args.org_url:
            sys.exit("NG: このコネクタには --org-url（または .env の DATAVERSE_URL）が必要です。")
    for name, value in (("dataset", args.dataset), ("table", args.table)):
        if name in requires and not value:
            sys.exit(
                f"NG: このコネクタには --{name} が必要です。"
                f"候補は `npx pa connection list-{'datasets' if name == 'dataset' else 'tables'}` で確認できます。"
            )

    if args.connection_ref:
        if not args.solution_id:
            sys.exit("NG: --connection-ref には --solution-id（または .env の SOLUTION_ID）が必要です。")
        binding = ["--connection-ref", args.connection_ref, "--solution-id", args.solution_id]
        print(f"  バインド: 接続参照 {args.connection_ref}（ソリューション同梱）")
    else:
        connection_id = args.connection_id or resolve_connection_id(
            connector_id, args.environment_id, args.timeout
        )
        binding = ["--connection-id", connection_id]
        print("  バインド: 接続 ID 直バインド（ソリューションに入らない。ALM 用途では --connection-ref を使う）")

    command = build_command(args, connector_id, binding)
    if args.dry_run:
        print(f"\n[dry-run] npx pa {' '.join(command)}")
        return 0

    result = _run_cli(command, args.timeout)
    print((result.stdout or "").strip())
    if result.returncode != 0:
        print((result.stderr or "").strip(), file=sys.stderr)
        print(f"\nNG: データソースの追加に失敗しました（exit={result.returncode}）", file=sys.stderr)
        return 1
    print(f"\nOK: {connector_id} をデータソースに追加しました。src/generated/ を確認してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
