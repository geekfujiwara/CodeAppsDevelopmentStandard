"""Code Apps のデータソースを **対話プロンプトなし** で追加する。

`npx pa app add data-source` はコネクタ ID や接続を省略すると対話プロンプトで停止し、
スクリプト実行（CI / エージェント実行）が固まる。このラッパーは実行前に

  1. コネクタの通称（SharePoint / Outlook / SQL …）→ コネクタ ID（`shared_xxx`）
  2. バインド先（接続参照 または 接続 ID）
  3. コネクタが必須とする追加値（`--org-url` / `--dataset` / `--table`）

をすべて確定させ、通常は `--non-interactive` かつ標準入力を閉じてCLIを起動する。
--allow-interactive の承認がある場合だけ、追加認証が必要な実コマンドを別コンソールで実行する。
値が足りないときはプロンプトを出さずに `NG:` を表示して終了コード 1 で止まるため、
ターミナルが入力待ちでハングすることはない。

使い方:
  python .github/skills/code-apps/scripts/add_data_source.py --connector sharepoint
  python .github/skills/code-apps/scripts/add_data_source.py --connector dataverse \
      --connection-ref {CR_LOGICAL_NAME} --solution-id {SOLUTION_ID}
  python .github/skills/code-apps/scripts/add_data_source.py --connector sql \
      --dataset {server},{database} --table {table}
  python .github/skills/code-apps/scripts/add_data_source.py --connector sharepoint --as action \
      --connection-ref {CR_LOGICAL_NAME} --solution-id {SOLUTION_ID}   # ファイル作成などの操作
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
import re
import subprocess
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))

from pa_cli import (
    connected, connection_name, environment_id, json_items, list_connections,
    load_project_env, require_connection, run_with_recovery,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

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

load_project_env()

from connector_catalog import (  # noqa: E402
    ConnectorResolutionError,
    format_catalog,
    resolve_connector,
)

CONNECTOR_KEYS = ("connectorId", "apiId", "apiName", "connector", "connectorName", "connectorType")
DISPLAY_KEYS = ("displayName", "connectionDisplayName", "name")


_allow_interactive = False


def _run_cli(args: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    """CLI を標準入力を閉じて実行する（プロンプトが出ても待ち続けない）。"""
    print(f"$ pa {' '.join(args)}")
    return run_with_recovery(args, timeout, _allow_interactive)


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
    command = [*args, "--json", "--non-interactive"]
    result = _run_cli(command, timeout)
    if result.returncode == 0 and not result.stdout:
        # Interactive output stays in its console; repeat this read-only query.
        result = _run_cli(command, timeout)
    return json_items(result)


def resolve_connector_id(name: str, timeout: int) -> str:
    """カタログで解決し、無ければ環境のコネクタ一覧から一意に解決する。"""
    try:
        entry = resolve_connector(name)
        return entry["id"]
    except ConnectorResolutionError as exc:
        print(f"  カタログでは解決できませんでした。環境のコネクタ一覧を検索します。\n  {exc}")

    args = ["connector", "list", "--search", name]
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
    matches = {
        connection_name(item): _first(item, DISPLAY_KEYS)
        for item in list_connections(timeout, _allow_interactive)
        if connected(item, connector_id, env_id)
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
    if args.as_kind:
        command += ["--as", args.as_kind]
    return command + ["--non-interactive"]


def validate_kind(as_kind: str, dataset: str, table: str) -> None:
    """--as action はコネクタの操作（ファイル作成など）を追加する。dataset / table を渡すと CLI が拒否する。"""
    if as_kind == "action" and (dataset or table):
        raise SystemExit("NG: --as action では --dataset / --table を指定しない（操作の引数として実行時に渡す）。")


def validate_reference(name: str, solution_id: str, api_id: str, timeout: int) -> None:
    from setup_connection_reference import is_in_solution, list_connection_references
    rows = [row for row in list_connection_references(api_id)
            if row["connectionreferencelogicalname"] == name]
    if len(rows) != 1 or not is_in_solution(solution_id, rows[0]["connectionreferenceid"]):
        raise SystemExit("NG: Reference is missing or not in the specified solution.")
    require_connection(list_connections(timeout, _allow_interactive),
                       rows[0].get("connectionid", ""), api_id, environment_id())


def configured_references(api_id: str) -> list[dict]:
    config = json.loads(Path("power.config.json").read_text(encoding="utf-8"))
    return [row for row in config.get("connectionReferences", {}).values()
            if row.get("id", "").rsplit("/", 1)[-1] == api_id]


def verify_generated(api_id: str, reference: str) -> None:
    refs = configured_references(api_id)
    if not refs or (reference and not all(row.get("xrmConnectionReferenceLogicalName") == reference for row in refs)):
        raise SystemExit("NG: CLI exited successfully but expected connector/reference is missing from power.config.json.")
    if api_id == "shared_commondataserviceforapps" and len(refs) != 1:
        raise SystemExit("NG: Multiple Dataverse connector bindings exist. Inspect and remove unintended duplicates via CLI.")
    schema = Path(".power/schemas/appschemas/dataSourcesInfo.ts")
    if not schema.is_file() or not schema.stat().st_size:
        raise SystemExit("NG: Generated dataSourcesInfo.ts is missing or empty.")
    names = [name for row in refs for name in row.get("dataSources", [])]
    text = schema.read_text(encoding="utf-8")
    if not names or not all(re.search(rf"""["']{re.escape(name)}["']\s*:""", text) for name in names):
        raise SystemExit("NG: Connector data source names are missing from generated dataSourcesInfo.ts.")
    if api_id == "shared_commondataserviceforapps":
        service = Path("src/generated/services/MicrosoftDataverseService.ts")
        model = Path("src/generated/models/MicrosoftDataverseModel.ts")
        methods = ("ListRecordsWithOrganization", "GetItemWithOrganization", "CreateRecordWithOrganization",
                   "UpdateRecordWithOrganization", "DeleteRecordWithOrganization")
        if not model.is_file() or not service.is_file() or not all(method in service.read_text(encoding="utf-8") for method in methods):
            raise SystemExit("NG: Generated Dataverse service or required CRUD methods are missing.")


def main() -> int:
    global _allow_interactive
    parser = argparse.ArgumentParser(
        description="Code Apps のデータソースを対話プロンプトなしで追加する",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--connector", help="コネクタの通称またはコネクタ ID（例: sharepoint / shared_sql）")
    parser.add_argument("--connection-ref", default=None, help="接続参照の論理名（Dataverse の場合のみ .env の CONNECTION_REFERENCE_LOGICAL_NAME が既定値）")
    parser.add_argument("--connection-id", default="")
    parser.add_argument("--solution-id", default=os.getenv("SOLUTION_ID", ""))
    parser.add_argument("--org-url", default="")
    parser.add_argument("--dataset", default="", help="データセット（SharePoint はサイト URL、SQL は server,database）")
    parser.add_argument("--table", default="", help="テーブル / リスト")
    parser.add_argument("--procedure", default="", help="SQL ストアドプロシージャ")
    parser.add_argument("--as", dest="as_kind", choices=("table", "action"), default="",
                        help="table（リストの CRUD）か action（ファイル作成などコネクタの操作）。両方に対応するコネクタで使う")
    parser.add_argument("--environment-id", default=os.getenv("ENV_ID", ""), help="接続・コネクタ一覧の検索対象環境")
    parser.add_argument("--timeout", type=int, default=600, help="CLI 1 回あたりの上限秒数（既定 600）")
    parser.add_argument("--dry-run", action="store_true", help="実行せずコマンドだけ表示する")
    parser.add_argument("--allow-interactive", action="store_true", help="Approve browser sign-in only when the real command needs it")
    parser.add_argument("--list-connectors", action="store_true", help="コネクタ ID カタログを表示して終了する")
    args = parser.parse_args()
    _allow_interactive = args.allow_interactive
    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    if args.list_connectors:
        print(format_catalog())
        return 0
    if not args.connector:
        parser.error("--connector を指定してください（--list-connectors で一覧を確認できます）")

    if not Path("power.config.json").is_file():
        sys.exit("NG: power.config.json が見つかりません。Code App のルートで実行してください。")
    target = environment_id()
    if args.environment_id and args.environment_id.lower() != target.lower():
        parser.error("--environment-id does not match power.config.json")
    args.environment_id = target
    if args.connection_ref and args.connection_id:
        parser.error("--connection-ref and --connection-id are mutually exclusive")

    connector_id = resolve_connector_id(args.connector, args.timeout)
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
    validate_kind(args.as_kind, args.dataset, args.table)
    for name, value in (("dataset", args.dataset), ("table", args.table)):
        if name in requires and not value and args.as_kind != "action":
            sys.exit(
                f"NG: このコネクタには --{name} が必要です。"
                f"候補は `npx pa connection list-{'datasets' if name == 'dataset' else 'tables'}` で確認できます。"
            )

    if args.connection_ref is None:
        # .env の接続参照は setup_connection_reference.py が作る Dataverse 用。他コネクタへ流用すると誤バインドになる
        dataverse = connector_id == "shared_commondataserviceforapps"
        args.connection_ref = os.getenv("CONNECTION_REFERENCE_LOGICAL_NAME", "") if dataverse and not args.connection_id else ""

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
        print(f"\n[dry-run] pa {' '.join(command)}")
        return 0

    if args.connection_ref:
        validate_reference(args.connection_ref, args.solution_id, connector_id, args.timeout)
    else:
        require_connection(list_connections(args.timeout, _allow_interactive),
                           binding[1], connector_id, target)
    existing = configured_references(connector_id)
    if existing and connector_id == "shared_commondataserviceforapps":
        if not args.connection_ref:
            raise SystemExit("NG: Dataverse already configured. Inspect the existing binding before adding a direct connection.")
        verify_generated(connector_id, args.connection_ref)
        print("OK: Existing Dataverse data source and verified binding reused; no duplicate was added.")
        return 0
    result = _run_cli(command, args.timeout)
    print((result.stdout or "").strip())
    if result.returncode != 0:
        print((result.stderr or "").strip(), file=sys.stderr)
        print(f"\nNG: データソースの追加に失敗しました（exit={result.returncode}）", file=sys.stderr)
        return 1
    verify_generated(connector_id, args.connection_ref)
    print(f"\nOK: {connector_id} を追加し、生成物と接続参照を確認しました。画面経由のCRUDは別途検証してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
