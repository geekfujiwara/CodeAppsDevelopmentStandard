"""Entra ID の上長を Dataverse のユーザー（systemuser.parentsystemuserid）へ同期する。

チーム ダッシュボードの「自分のチーム」と Dataverse の階層セキュリティは parentsystemuserid を使う。
既定は差分表示のみ。対象は CRM の商談・売上目標を所有しているユーザー（--all で有効な全ユーザー）。

  python scripts/sync_manager_hierarchy.py          # 差分を表示（変更なし）
  python scripts/sync_manager_hierarchy.py --apply  # 差分を反映
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

from dotenv import load_dotenv

load_dotenv(Path.cwd() / ".env")


def _add_auth_helper_path() -> None:
    for start in (Path(__file__).resolve().parent, Path.cwd()):
        for base in (start, *start.parents):
            candidate = base / ".github" / "skills" / "standard" / "scripts"
            if (candidate / "auth_helper.py").is_file():
                sys.path.insert(0, str(candidate))
                return
    sys.exit("auth_helper.py が見つかりません。.github/skills を含む作業ルートで実行してください。")


_add_auth_helper_path()
from auth_helper import api_get, api_patch, get_token  # noqa: E402

P = os.getenv("PUBLISHER_PREFIX", "").strip()
GRAPH = "https://graph.microsoft.com/v1.0"
# 既定クライアントには User.Read.All の委任が無いテナントがあるため、sharepoint スキルと同じ公開クライアントを使う
GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"


def graph_manager(entra_id: str) -> str | None:
    import requests

    token = get_token(scope="https://graph.microsoft.com/User.Read.All", client_id=GRAPH_POWERSHELL_CLIENT_ID)
    resp = requests.get(f"{GRAPH}/users/{entra_id}/manager?$select=id", headers={"Authorization": f"Bearer {token}"}, timeout=60)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("id")


def crm_owner_ids() -> set[str]:
    owners: set[str] = set()
    for entity_set in (f"{P}_crmopportunities", f"{P}_crmsalestargets"):
        for row in api_get(f"{entity_set}?$select=_ownerid_value").get("value", []):
            if row.get("_ownerid_value"):
                owners.add(row["_ownerid_value"])
    return owners


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="差分を Dataverse に反映する")
    parser.add_argument("--all", action="store_true", help="CRM の所有者に限らず、有効な全ユーザーを対象にする")
    args = parser.parse_args()

    users = api_get("systemusers?$select=systemuserid,fullname,azureactivedirectoryobjectid,_parentsystemuserid_value"
                    "&$filter=isdisabled eq false and azureactivedirectoryobjectid ne null").get("value", [])
    by_entra = {u["azureactivedirectoryobjectid"].lower(): u for u in users}
    scope = None if args.all else crm_owner_ids()
    changes = []
    for user in users:
        if scope is not None and user["systemuserid"] not in scope:
            continue
        manager_entra = graph_manager(user["azureactivedirectoryobjectid"])
        manager = by_entra.get(manager_entra.lower()) if manager_entra else None
        desired = manager["systemuserid"] if manager else None
        if desired and desired != user.get("_parentsystemuserid_value"):
            changes.append((user, manager))
        status = f"→ {manager['fullname']}" if manager else "（Entra に上長なし / 上長が Dataverse 未登録）"
        print(f"  {user['fullname']:32} {status}{'  ※変更' if desired and desired != user.get('_parentsystemuserid_value') else ''}")

    print(f"差分: {len(changes)} 件")
    if not args.apply:
        print("DRY-RUN: 変更していません。--apply で反映します。")
        return 0
    for user, manager in changes:
        api_patch(f"systemusers({user['systemuserid']})", {"parentsystemuserid@odata.bind": f"/systemusers({manager['systemuserid']})"})
        print(f"  + {user['fullname']} の上長を {manager['fullname']} に設定")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
