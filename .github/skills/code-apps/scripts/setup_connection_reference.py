"""Dataverse コネクタ（shared_commondataserviceforapps）用の接続参照をソリューションに用意する。

Code Apps を ALM 対応（ソリューション同梱・環境間移送可能）にするには、データソースを
接続 ID 直バインドではなく **接続参照（Connection Reference）** にバインドする必要がある。
接続そのものはソリューション コンポーネントになれないが、接続参照はなれる。

方針は「対象環境・正常な接続・明示的な選択・冪等性」。
専用接続は --create-connection、追加認証の承認は --allow-interactive で指定する。
既存の共有接続・異なる接続へのバインドは勝手に変更しない。

認証は standard スキルの auth_helper を使う（requests / MSAL の直呼びは禁止）。

必要な環境変数（`.env` / references/.env.example 参照）:
  DATAVERSE_URL           Dataverse 組織 URL
  TENANT_ID               テナント ID
  SOLUTION_NAME           対象ソリューションの一意名
  PUBLISHER_PREFIX        発行者プレフィックス（既定: 環境の発行者に合わせる）
  DATAVERSE_CONNECTION_ID 新規作成時にバインドする接続 ID（`pac connection list` で取得）

使い方:
  python .github/skills/code-apps/scripts/setup_connection_reference.py
  python .github/skills/code-apps/scripts/setup_connection_reference.py --force-create
  python .github/skills/code-apps/scripts/setup_connection_reference.py --api-id shared_sql
  python .github/skills/code-apps/scripts/setup_connection_reference.py --write-env .env
    # SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME を .env へ upsert する
    # （呼び出し側が標準出力をパースしなくて済むようにするための最小実装）
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPT_DIR))

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

from pa_cli import (
    connected, connection_name, environment_id, list_connections, load_project_env,
    require_connection, run_console, run_with_recovery,
)

# --- auth_helper（standard スキル）を import パスに追加 ---
_CANDIDATES = [
    _SCRIPT_DIR.parent.parent / "standard" / "scripts",  # .github/skills/standard/scripts
    *[p / ".github" / "skills" / "standard" / "scripts" for p in _SCRIPT_DIR.parents],
    *[p / "scripts" for p in _SCRIPT_DIR.parents],
    *_SCRIPT_DIR.parents,
]
for _c in _CANDIDATES:
    if (_c / "auth_helper.py").is_file():
        sys.path.insert(0, str(_c))
        break
else:  # noqa: PLW0120
    sys.exit("auth_helper.py が見つかりません（standard スキルの scripts フォルダを確認）")

load_project_env()

from auth_helper import api_get, api_post  # noqa: E402

# 接続参照のソリューション コンポーネント種別。10000 以上は環境ごとに採番されるエンティティの ObjectTypeCode なので
# 固定値にしない（ある環境の 10132 が別の環境では `Invalid component type provided` になる。10029 は別物）。
_component_type_cache: dict[str, int] = {}


def connection_reference_component_type() -> int:
    """接続参照（connectionreference）のコンポーネント種別を、この環境のメタデータから取得する。"""
    if "value" not in _component_type_cache:
        meta = api_get("EntityDefinitions(LogicalName='connectionreference')?$select=ObjectTypeCode")
        _component_type_cache["value"] = int(meta["ObjectTypeCode"])
    return _component_type_cache["value"]

# `pa app add data-source --connection-ref` が受け付ける論理名（英字で始まり英数字とアンダースコアのみ）。
# カスタムコネクタの API ID はハイフンを含む（例: shared_xxx-5fmy-20api-5f…）ため、そのまま使うと拒否される。
LOGICAL_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def build_logical_name(prefix: str, solution_name: str, api_id: str) -> str:
    solution_slug = re.sub(r"[^a-z0-9]", "", solution_name.lower())
    api_slug = re.sub(r"[^a-z0-9]", "", api_id.replace("shared_", "").lower())[:16]
    name = f"{prefix}_connref_{solution_slug}_{api_slug}"
    assert_valid_logical_name(name)
    return name


def assert_valid_logical_name(name: str) -> None:
    if not LOGICAL_NAME_PATTERN.match(name):
        raise SystemExit(
            f"接続参照の論理名 '{name}' は pa CLI で使えません（英字で始まり英数字と _ のみ）。"
            " --force-create で作り直すか、論理名を修正してください。"
        )


def connector_id(api_id: str) -> str:
    return f"/providers/Microsoft.PowerApps/apis/{api_id}"


def get_solution_id(unique_name: str) -> str:
    escaped = unique_name.replace("'", "''")
    values = api_get(
        f"solutions?$filter=uniquename eq '{escaped}'&$select=solutionid"
    ).get("value", [])
    if not values:
        raise SystemExit(f"ソリューション '{unique_name}' が見つかりません。先に作成してください。")
    return values[0]["solutionid"]


def list_connection_references(api_id: str) -> list[dict]:
    """環境内の対象コネクタの接続参照を列挙する。"""
    return api_get(
        "connectionreferences"
        f"?$filter=connectorid eq '{connector_id(api_id)}'"
        "&$select=connectionreferenceid,connectionreferencelogicalname,"
        "connectionreferencedisplayname,connectionid"
    ).get("value", [])


def find_in_solution(solution_id: str, api_id: str) -> dict | None:
    """対象ソリューションに含まれる接続参照を返す。"""
    components = api_get(
        "solutioncomponents"
        f"?$filter=_solutionid_value eq {solution_id}"
        f" and componenttype eq {connection_reference_component_type()}"
        "&$select=objectid"
    ).get("value", [])
    object_ids = {c["objectid"] for c in components}
    if not object_ids:
        return None
    matches = [cr for cr in list_connection_references(api_id) if cr["connectionreferenceid"] in object_ids]
    if len(matches) > 1:
        raise SystemExit("NG: Multiple references exist in this solution. Specify --logical-name or --connection-id.")
    return matches[0] if matches else None


def is_in_solution(solution_id: str, component_id: str) -> bool:
    """接続参照がソリューションのコンポーネントとして登録されているか。"""
    rows = api_get(
        "solutioncomponents"
        f"?$filter=_solutionid_value eq {solution_id}"
        f" and componenttype eq {connection_reference_component_type()}"
        f" and objectid eq {component_id}"
        "&$select=solutioncomponentid"
    ).get("value", [])
    return bool(rows)


def add_to_solution(component_id: str, solution_name: str) -> None:
    api_post(
        "AddSolutionComponent",
        {
            "ComponentId": component_id,
            "ComponentType": connection_reference_component_type(),
            "SolutionUniqueName": solution_name,
            "AddRequiredComponents": False,
        },
    )


def create_connection_reference(
    api_id: str, solution_name: str, prefix: str, connection_id: str,
    logical_name: str = "",
) -> dict:
    logical_name = logical_name or build_logical_name(prefix, solution_name, api_id)
    assert_valid_logical_name(logical_name)
    if not connection_id:
        raise SystemExit("NG: A verified Connected connection is required before creating a reference.")
    body = {
        "connectionreferencedisplayname": f"{api_id} ({solution_name})",
        "connectionreferencelogicalname": logical_name,
        "connectorid": connector_id(api_id),
    }
    body["connectionid"] = connection_id

    new_id = api_post("connectionreferences", body, solution=solution_name)
    print(f"  + CR を新規作成しました: {logical_name} ({new_id})")
    if not is_in_solution(get_solution_id(solution_name), new_id):
        add_to_solution(new_id, solution_name)
    return {
        "connectionreferenceid": new_id,
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": body["connectionreferencedisplayname"],
        "connectionid": connection_id,
    }


def upsert_env(path: Path, values: dict[str, str]) -> None:
    """`.env` の該当キーだけを書き換える（無ければ追記）。他の行・順序・コメントは保持する。

    ここで書くのは SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME のような**非秘匿の識別子**の
    みで、シークレット値は扱わない。呼び出し側の標準出力パース（stdout 依存）を無くすための最小実装。
    """
    remaining = dict(values)
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip() if "=" in line and not line.strip().startswith("#") else None
        if key in remaining:
            lines[i] = f"{key}={remaining.pop(key)}"
    lines.extend(f"{k}={v}" for k, v in remaining.items())
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def create_dedicated_connection(api_id: str, display_name: str, timeout: int, allow_interactive: bool) -> str:
    if api_id != "shared_commondataserviceforapps":
        raise SystemExit("NG: --create-connection currently supports Dataverse only; pass an approved --connection-id for other connectors.")
    if not Path("power.config.json").is_file():
        raise SystemExit("NG: Initialize the app before creating its dedicated connection.")
    before = list_connections(timeout, allow_interactive)
    base = ["connection", "create", "--connector", api_id, "--display-name", display_name]
    result = run_with_recovery([*base, "--use-sso", "--non-interactive"], timeout, allow_interactive)
    if result.returncode:
        detail = f"{result.stdout}\n{result.stderr}"
        print(detail, file=sys.stderr)
        if not allow_interactive or "connector service rejected the automatic connection request" not in detail.lower():
            raise SystemExit("NG: Connection creation failed. No automatic retry; inspect connections before retrying.")
        after = list_connections(timeout, allow_interactive)
        old_names = {connection_name(row) for row in before}
        if any(connection_name(row) not in old_names for row in after):
            raise SystemExit("NG: Connection list changed after rejected SSO. Inspect it before browser creation.")
        run_console(base, timeout)
    after = list_connections(timeout, allow_interactive)
    old_names = {connection_name(row) for row in before}
    new_rows = [row for row in after if connection_name(row) not in old_names
                and connected(row, api_id, environment_id())]
    if len(new_rows) != 1:
        raise SystemExit("NG: Could not uniquely verify the new Connected connection. Inspect the portal and pass --connection-id; do not create another connection.")
    return connection_name(new_rows[0])


def choose_reference(references: list[dict], logical_name: str, connection_id: str) -> dict | None:
    matches = [cr for cr in references if cr["connectionreferencelogicalname"] == logical_name]
    if len(matches) > 1:
        raise SystemExit("NG: Multiple references match. Specify --logical-name and --connection-id.")
    if not matches:
        return None
    cr = matches[0]
    if connection_id and cr.get("connectionid") != connection_id:
        raise SystemExit("NG: Reference already has a different binding. It was not changed. Choose a new --logical-name.")
    return cr


def main() -> None:
    parser = argparse.ArgumentParser(description="接続参照をソリューションに用意する")
    parser.add_argument(
        "--api-id",
        default="shared_commondataserviceforapps",
        help="コネクタ API ID（既定: shared_commondataserviceforapps）",
    )
    parser.add_argument("--solution-name", default=os.getenv("SOLUTION_NAME", ""))
    parser.add_argument("--prefix", default=os.getenv("PUBLISHER_PREFIX", ""))
    parser.add_argument("--connection-id", default=os.getenv("DATAVERSE_CONNECTION_ID", ""))
    parser.add_argument("--logical-name", default="", help="Explicit reference name; existing bindings are never overwritten")
    parser.add_argument("--create-connection", action="store_true", help="Approved creation of a dedicated Dataverse connection")
    parser.add_argument("--display-name", default="", help="New connection display name")
    parser.add_argument("--allow-interactive", action="store_true", help="Approved browser sign-in in a bounded interactive console")
    parser.add_argument("--timeout", type=int, default=600)
    parser.add_argument(
        "--force-create", action="store_true", help="互換オプション。同名・同一バインドは再利用し、異なるバインドは変更しない"
    )
    parser.add_argument(
        "--write-env", type=Path, default=None,
        help="SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME をこの .env へ upsert する"
             "（呼び出し側が標準出力をパースしなくて済むようにする）",
    )
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if not args.logical_name and args.api_id == "shared_commondataserviceforapps":
        args.logical_name = os.getenv("CONNECTION_REFERENCE_LOGICAL_NAME", "")

    if not args.solution_name:
        raise SystemExit("SOLUTION_NAME が未設定です（.env または --solution-name）")
    if not args.prefix:
        raise SystemExit("PUBLISHER_PREFIX が未設定です（.env または --prefix）")

    environment_id()
    print(f"ソリューション: {args.solution_name} / コネクタ: {args.api_id}")
    solution_id = get_solution_id(args.solution_name)
    print(f"ソリューション ID: {solution_id}")

    logical_name = args.logical_name or build_logical_name(args.prefix, args.solution_name, args.api_id)
    assert_valid_logical_name(logical_name)
    references = list_connection_references(args.api_id)
    cr = choose_reference(references, logical_name, args.connection_id)
    if args.create_connection and cr is None and not args.connection_id:
        args.connection_id = create_dedicated_connection(
            args.api_id, args.display_name or args.solution_name, args.timeout, args.allow_interactive,
        )
        if args.write_env:
            upsert_env(args.write_env, {"DATAVERSE_CONNECTION_ID": args.connection_id})
            print("Verified new connection ID saved for safe resume before reference creation.")
    connection_id = args.connection_id or (cr or {}).get("connectionid", "")
    if not connection_id:
        raise SystemExit("NG: Select an approved --connection-id or use --create-connection. No shared connection was selected.")
    require_connection(list_connections(args.timeout, args.allow_interactive), connection_id, args.api_id, environment_id())
    if cr is None:
        cr = create_connection_reference(
            args.api_id, args.solution_name, args.prefix, connection_id, logical_name,
        )
    elif not is_in_solution(solution_id, cr["connectionreferenceid"]):
        add_to_solution(cr["connectionreferenceid"], args.solution_name)

    rows = [row for row in list_connection_references(args.api_id)
            if row["connectionreferenceid"] == cr["connectionreferenceid"]]
    if len(rows) != 1 or rows[0].get("connectionid") != connection_id:
        raise SystemExit("NG: Reference binding read-back failed; .env was not changed.")
    cr = rows[0]
    logical_name = cr["connectionreferencelogicalname"]
    assert_valid_logical_name(logical_name)
    if not is_in_solution(solution_id, cr["connectionreferenceid"]):
        raise SystemExit(
            f"NG: 接続参照 {logical_name} がソリューション {args.solution_name} に入っていません"
            f"（componenttype={connection_reference_component_type()}）。"
            " references/troubleshooting.md #29 を参照し、ポータルの「既存を追加 → 接続参照」で追加してから再実行してください。"
        )
    print()
    print("=" * 72)
    print(f"Logical Name : {logical_name}")
    print(f"Connection   : {cr.get('connectionid') or '(未バインド)'}")
    print("=" * 72)
    print("次のコマンドでデータソースを接続参照バインドできます:")
    print(
        f'  python "{Path(__file__).with_name("add_data_source.py")}" --connector {args.api_id} '
        f"--connection-ref {logical_name} --solution-id {solution_id}"
    )

    if args.write_env:
        upsert_env(args.write_env, {
            "SOLUTION_ID": solution_id,
            "CONNECTION_REFERENCE_LOGICAL_NAME": logical_name,
            "DATAVERSE_CONNECTION_ID": connection_id,
        })
        print(f"\n  + {args.write_env} に SOLUTION_ID / CONNECTION_REFERENCE_LOGICAL_NAME / DATAVERSE_CONNECTION_ID を書き込みました。")


if __name__ == "__main__":
    main()
