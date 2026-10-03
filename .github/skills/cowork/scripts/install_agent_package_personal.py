"""Cowork プラグイン（agentSkills / agentConnectors を持つ M365 アプリ パッケージ）を、自分だけにインストールする（個人テスト）。

管理センターでの組織公開（Step 8）の前に、作成者本人が Cowork で動作を確かめるための経路。
Microsoft 365 Agents Toolkit の `atk install --scope Personal` と同じ M365 Title サービスの API を、
auth_helper で Agents Toolkit の公開クライアント（初回だけ Device Code）のトークンを取って呼ぶ。

  install   : plan（ZIP の SHA-256 を含む）→ PLAN_HASH 承認 → upload → acquire → poll → launchInfo を読み戻して照合
  status    : launchInfo を読む（読み取りのみ）
  uninstall : plan → PLAN_HASH 承認 → 取得の取り消し → launchInfo が消えたことを確認

例:
  python install_agent_package_personal.py install --package dist/<name>.zip
  python install_agent_package_personal.py install --package dist/<name>.zip --expected-hash <HASH> --apply
  python install_agent_package_personal.py status --title-id U_<GUID>
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import zipfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str((HERE / ".." / ".." / "standard" / "scripts").resolve()))

TOOLKIT_CLIENT_ID = "7ea7c24c-b1f6-4a20-9d11-9ae12e9e7ac0"
BASE = "https://titles.prod.mos.microsoft.com"
LAUNCH_QUERY = "SupportedElementTypes=AgentSkills,AgentConnectors,DeclarativeCopilots,Extensions&ClientDetails="


def canonical_hash(value: dict[str, Any]) -> str:
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def read_package(path: Path) -> dict[str, Any]:
    """ZIP を事前検証する。プレースホルダーが残ったまま入れると Connect で認証に失敗する。"""
    if not path.is_file():
        raise SystemExit(f"パッケージがありません: {path}")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if "manifest.json" not in names:
            raise SystemExit("ZIP のルートに manifest.json がありません（フォルダごと圧縮していないか確認）")
        text = archive.read("manifest.json").decode("utf-8-sig")
    if "__COWORK_OAUTH_REGISTRATION_ID__" in text:
        raise SystemExit("manifest の referenceId がプレースホルダーのままです。build_agent_package.ps1 でビルドしてください")
    manifest = json.loads(text)
    missing = [f"skills/{s.get('id', '?')}" for s in manifest.get("agentSkills", []) if not any(n.startswith("skills/") for n in names)]
    if missing:
        raise SystemExit(f"ZIP にスキルのフォルダがありません: {missing}")
    return {
        "manifestId": manifest.get("id"),
        "name": (manifest.get("name") or {}).get("short"),
        "developerName": (manifest.get("developer") or {}).get("name"),
        "version": manifest.get("version"),
        "agentSkills": len(manifest.get("agentSkills") or []),
        "agentConnectors": len(manifest.get("agentConnectors") or []),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def headers() -> dict[str, str]:
    from auth_helper import get_token  # noqa: PLC0415

    return {"Authorization": f"Bearer {get_token(BASE + '/.default', client_id=TOOLKIT_CLIENT_ID)}"}


def launch_info(title_id: str) -> dict[str, Any] | None:
    import requests  # noqa: PLC0415

    res = requests.get(f"{BASE}/catalog/v1/users/titles/{title_id}/launchInfo?{LAUNCH_QUERY}", headers=headers(), timeout=60)
    # 取り消し後は 404 ではなく 403「title is not acquired」が返る（実測）
    if res.status_code == 404 or (res.status_code == 403 and "not acquired" in res.text):
        return None
    if not res.ok:
        raise SystemExit(f"launchInfo → {res.status_code}: {res.text[:200]}")
    return res.json()


def summarize(info: dict[str, Any]) -> dict[str, Any]:
    elements = info.get("elementDefinitions") or {}
    return {
        "name": info.get("name"),
        "developerName": info.get("developerName"),
        "version": info.get("version"),
        "scope": info.get("scope"),
        "blockStatus": info.get("blockStatus"),
        "agentSkills": len(elements.get("agentSkills") or []),
        "agentConnectors": len(elements.get("agentConnectors") or []),
    }


def approve(args: argparse.Namespace, plan: dict[str, Any]) -> bool:
    digest = canonical_hash(plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))
    print(f"PLAN_HASH={digest}")
    if not args.apply:
        print("DRY-RUN: 変更していません。適用時は --expected-hash と --apply を指定してください。")
        return False
    if args.expected_hash != digest:
        raise SystemExit("承認済み plan hash が一致しません。")
    return True


def install(args: argparse.Namespace) -> None:
    import requests  # noqa: PLC0415

    package = Path(args.package)
    meta = read_package(package)
    plan = {"operation": "install-personal", "endpoint": f"{BASE}/dev/v1/users/packages", "package": meta}
    if not approve(args, plan):
        return
    h = headers()
    up = requests.post(f"{BASE}/dev/v1/users/packages", headers=h, timeout=120,
                       files={"package": (package.name, package.read_bytes(), "application/zip")})
    if not up.ok:
        raise SystemExit(f"upload → {up.status_code}: {up.text[:300]}")
    acquired = requests.post(f"{BASE}/dev/v1/users/packages/acquisitions", headers=h, timeout=60,
                             json={"operationId": up.json()["operationId"]})
    if acquired.status_code not in (200, 202):
        raise SystemExit(f"acquire → {acquired.status_code}: {acquired.text[:300]}")
    status_id = acquired.json()["statusId"]
    result: dict[str, Any] = {}
    for _ in range(args.poll_attempts):
        status = requests.get(f"{BASE}/dev/v1/users/packages/status/{status_id}", headers=h, timeout=60)
        if status.status_code == 200:
            result = status.json()
            break
        if status.status_code != 202:
            raise SystemExit(f"status → {status.status_code}: {status.text[:300]}")
        time.sleep(3)
    title_id = result.get("titleId")
    if not title_id:
        raise SystemExit("インストールの完了を確認できませんでした（poll がタイムアウト）")
    info = launch_info(title_id)
    if info is None:
        raise SystemExit(f"launchInfo を読み戻せません: {title_id}")
    got = summarize(info)
    diff = [k for k in ("version", "developerName", "agentSkills", "agentConnectors") if got[k] != meta[k]]
    if diff or got["blockStatus"]:
        raise SystemExit(f"読み戻しがパッケージと一致しません: {diff} / blockStatus={got['blockStatus']}")
    print(json.dumps({"titleId": title_id, **got}, ensure_ascii=False, indent=2))
    print("✅ 自分だけにインストールしました。Cowork の Customize → Plugins で有効化し、Connect で同意してください")


def status(args: argparse.Namespace) -> None:
    info = launch_info(args.title_id)
    print(json.dumps(summarize(info), ensure_ascii=False, indent=2) if info else "インストールされていません")


def uninstall(args: argparse.Namespace) -> None:
    import requests  # noqa: PLC0415

    plan = {"operation": "uninstall-personal", "endpoint": f"{BASE}/catalog/v1/users/acquisitions/{args.title_id}"}
    if not approve(args, plan):
        return
    res = requests.delete(plan["endpoint"], headers=headers(), timeout=60)
    if res.status_code not in (200, 202, 204):
        raise SystemExit(f"uninstall → {res.status_code}: {res.text[:300]}")
    for _ in range(20):
        if launch_info(args.title_id) is None:
            print("✅ アンインストールし、launchInfo が消えたことを確認しました")
            return
        time.sleep(3)
    raise SystemExit("アンインストール後も launchInfo が残っています")


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    p_install = commands.add_parser("install")
    p_install.add_argument("--package", required=True)
    p_install.add_argument("--poll-attempts", type=int, default=60)
    p_status = commands.add_parser("status")
    p_status.add_argument("--title-id", required=True)
    p_uninstall = commands.add_parser("uninstall")
    p_uninstall.add_argument("--title-id", required=True)
    for p in (p_install, p_uninstall):
        p.add_argument("--apply", action="store_true")
        p.add_argument("--expected-hash")
    args = parser.parse_args()
    {"install": install, "status": status, "uninstall": uninstall}[args.command](args)


if __name__ == "__main__":
    main()
