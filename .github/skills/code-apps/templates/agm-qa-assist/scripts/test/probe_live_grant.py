"""LIVE 共有の要: Dataverse コネクタ経由（アプリと同じ経路）で GrantAccess / RevokeAccess が通るかを確かめる。

1. テスト用の LIVE レコードを作る（Web API）
2. 自分以外の有効な利用者 1 人に、コネクタの PerformUnboundActionWithOrganization で読み取りを共有
3. RetrieveSharedPrincipalsAndAccess で共有を確認 → RevokeAccess → 解除を確認
4. テスト用レコードを消す

使い方: python scripts/test/probe_live_grant.py [--user <UPN の一部>]
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))


def load_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--user", help="共有先の UPN（一部）。省略時は自分以外の最初の有効な利用者")
    args = parser.parse_args()
    load_env()
    import requests  # noqa: PLC0415
    from auth_helper import api_delete, api_get, api_post, get_token  # noqa: PLC0415

    prefix = os.environ.get("VITE_PUBLISHER_PREFIX", "${PUBLISHER_PREFIX}")
    org = os.environ["DATAVERSE_URL"].rstrip("/")
    me = api_get("WhoAmI")["UserId"]
    flt = "isdisabled eq false and accessmode eq 0 and applicationid eq null"
    if args.user:
        flt += f" and contains(domainname,'{args.user}')"
    users = [u for u in api_get(f"systemusers?$select=systemuserid,fullname,domainname&$filter={urllib.parse.quote(flt)}&$top=20")["value"] if u["systemuserid"] != me]
    if not users:
        print("共有先の利用者が見つかりません")
        return 1
    target_user = users[0]
    print(f"共有先: {target_user['fullname']}")

    live_id = api_post(f"{prefix}_agmlives", {f"{prefix}_name": "probe-live-grant", f"{prefix}_status": "probe"})

    print(f"テスト用 LIVE: {live_id}")

    spec = importlib.util.spec_from_file_location("cc", ROOT / ".github/skills/custom-connector/scripts/create_connection.py")
    cc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cc)  # type: ignore[union-attr]
    from _common import connection as connection_of  # noqa: PLC0415

    conn = connection_of("CONNECTION_REFERENCE_LOGICAL_NAME")[0]
    runtime = cc.connector_properties(os.environ["ENV_ID"], "shared_commondataserviceforapps")["runtimeUrls"][0].rstrip("/")
    headers = {"Authorization": f"Bearer {get_token('https://apihub.azure.com/.default')}", "organization": org, "Content-Type": "application/json"}
    target = {"@odata.type": f"Microsoft.Dynamics.CRM.{prefix}_agmlive", f"{prefix}_agmliveid": live_id}
    principal = {"@odata.type": "Microsoft.Dynamics.CRM.systemuser", "systemuserid": target_user["systemuserid"]}

    def shared() -> list[dict]:
        t = urllib.parse.quote(json.dumps({"@odata.id": f"{prefix}_agmlives({live_id})"}))
        return api_get(f"RetrieveSharedPrincipalsAndAccess(Target=@t)?@t={t}").get("PrincipalAccesses", [])

    result = {"grant": None, "revoke": None}
    try:
        t0 = time.perf_counter()
        res = requests.post(f"{runtime}/{conn}/flow/api/data/v9.1.0/GrantAccess", headers=headers, json={"Target": target, "PrincipalAccess": {"Principal": principal, "AccessMask": "ReadAccess"}}, timeout=60)
        print(f"GrantAccess（コネクタ経由）: {res.status_code} {int((time.perf_counter() - t0) * 1000)} ms {res.text[:300]}")
        after = shared()
        granted = any(p["Principal"].get("ownerid") == target_user["systemuserid"] or p["Principal"].get("systemuserid") == target_user["systemuserid"] for p in after)
        print(f"共有の確認: {'あり' if granted else 'なし'} {json.dumps(after, ensure_ascii=False)[:300]}")
        result["grant"] = res.ok and granted

        res = requests.post(f"{runtime}/{conn}/flow/api/data/v9.1.0/RevokeAccess", headers=headers, json={"Target": target, "Revokee": principal}, timeout=60)
        print(f"RevokeAccess（コネクタ経由）: {res.status_code} {res.text[:300]}")
        after = shared()
        result["revoke"] = res.ok and not after
        print(f"解除の確認: 共有 {len(after)} 件")
    finally:
        api_delete(f"{prefix}_agmlives({live_id})")
        print("テスト用 LIVE を削除しました")
    print(json.dumps(result))
    return 0 if all(result.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
