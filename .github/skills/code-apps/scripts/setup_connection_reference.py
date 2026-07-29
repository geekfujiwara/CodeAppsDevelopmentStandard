"""Dataverse コネクタ（shared_commondataserviceforapps）用の接続参照をソリューションに用意する。

Code Apps を ALM 対応（ソリューション同梱・環境間移送可能）にするには、データソースを
接続 ID 直バインドではなく **接続参照（Connection Reference）** にバインドする必要がある。
接続そのものはソリューション コンポーネントになれないが、接続参照はなれる。

方針は「既存 CR 流用ファースト」:
  1. 対象ソリューション内に Dataverse コネクタの CR があれば、それをそのまま使う
  2. 無ければ環境内の既存 CR を探し、AddSolutionComponent でソリューションへ追加して流用
  3. それも無ければ Dataverse Web API で CR を新規作成し、ソリューションへ追加

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
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# --- auth_helper（standard スキル）を import パスに追加 ---
_SCRIPT_DIR = Path(__file__).resolve().parent
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

for _p in _SCRIPT_DIR.parents:
    if (_p / ".env").is_file():
        load_dotenv(_p / ".env")
        break

from auth_helper import api_get, api_post  # noqa: E402

# 接続参照のソリューション コンポーネント種別（10029 は CustomAPIResponseProperty なので誤り）
COMPONENT_TYPE_CONNECTION_REFERENCE = 10132


def connector_id(api_id: str) -> str:
    return f"/providers/Microsoft.PowerApps/apis/{api_id}"


def get_solution_id(unique_name: str) -> str:
    values = api_get(
        f"solutions?$filter=uniquename eq '{unique_name}'&$select=solutionid"
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
        f" and componenttype eq {COMPONENT_TYPE_CONNECTION_REFERENCE}"
        "&$select=objectid"
    ).get("value", [])
    object_ids = {c["objectid"] for c in components}
    if not object_ids:
        return None
    for cr in list_connection_references(api_id):
        if cr["connectionreferenceid"] in object_ids:
            return cr
    return None


def add_to_solution(component_id: str, solution_name: str) -> None:
    api_post(
        "AddSolutionComponent",
        {
            "ComponentId": component_id,
            "ComponentType": COMPONENT_TYPE_CONNECTION_REFERENCE,
            "SolutionUniqueName": solution_name,
            "AddRequiredComponents": False,
        },
    )


def create_connection_reference(
    api_id: str, solution_name: str, prefix: str, connection_id: str
) -> dict:
    logical_name = f"{prefix}_connref_{solution_name.lower()}_{api_id.replace('shared_', '')[:16]}"
    body = {
        "connectionreferencedisplayname": f"{api_id} ({solution_name})",
        "connectionreferencelogicalname": logical_name,
        "connectorid": connector_id(api_id),
    }
    if connection_id:
        body["connectionid"] = connection_id
    else:
        print("  ! DATAVERSE_CONNECTION_ID 未設定のため、接続未バインドの CR を作成します。")

    new_id = api_post("connectionreferences", body, solution=solution_name)
    print(f"  + CR を新規作成しました: {logical_name} ({new_id})")
    # MSCRM ヘッダーが効かない場合に備えて明示的にソリューションへ追加する
    try:
        add_to_solution(new_id, solution_name)
    except Exception as exc:  # noqa: BLE001
        print(f"  ! AddSolutionComponent をスキップしました: {exc}")
    return {
        "connectionreferenceid": new_id,
        "connectionreferencelogicalname": logical_name,
        "connectionreferencedisplayname": body["connectionreferencedisplayname"],
        "connectionid": connection_id,
    }


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
    parser.add_argument(
        "--force-create", action="store_true", help="既存 CR を流用せず必ず新規作成する"
    )
    args = parser.parse_args()

    if not args.solution_name:
        raise SystemExit("SOLUTION_NAME が未設定です（.env または --solution-name）")
    if not args.prefix:
        raise SystemExit("PUBLISHER_PREFIX が未設定です（.env または --prefix）")

    print(f"ソリューション: {args.solution_name} / コネクタ: {args.api_id}")
    solution_id = get_solution_id(args.solution_name)
    print(f"ソリューション ID: {solution_id}")

    cr: dict | None = None
    if not args.force_create:
        cr = find_in_solution(solution_id, args.api_id)
        if cr:
            print(f"  = ソリューション内の既存 CR を流用: {cr['connectionreferencelogicalname']}")
        else:
            candidates = list_connection_references(args.api_id)
            if candidates:
                cr = candidates[0]
                print(f"  > 環境内の既存 CR を流用: {cr['connectionreferencelogicalname']}")
                add_to_solution(cr["connectionreferenceid"], args.solution_name)
                print("  + ソリューションへ追加しました。")

    if cr is None:
        cr = create_connection_reference(
            args.api_id, args.solution_name, args.prefix, args.connection_id
        )

    logical_name = cr["connectionreferencelogicalname"]
    print()
    print("=" * 72)
    print(f"Logical Name : {logical_name}")
    print(f"Connection   : {cr.get('connectionid') or '(未バインド)'}")
    print("=" * 72)
    print("次のコマンドでデータソースを接続参照バインドできます:")
    print(
        f"  npx power-apps add-data-source --api-id {args.api_id} "
        f"-cr {logical_name} -s {solution_id} "
        "--resource-name commondataserviceforapps "
        f"--org-url {os.getenv('DATAVERSE_URL', '{DATAVERSE_URL}')} --non-interactive"
    )


if __name__ == "__main__":
    main()
