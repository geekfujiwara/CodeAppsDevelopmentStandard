"""プラグインの作成者（manifest の developer.name とスキルの metadata.author）に使う、開発中のサインイン アカウントを取得する。

auth_helper のキャッシュ（Microsoft Graph PowerShell の公開クライアント）で Graph の /me を読む。追加のサインインは不要。

  （引数なし）       表示名と UPN を JSON で出す（scaffold.json の detect から呼ぶ）
  --write-env FILE   COWORK_DEVELOPER_NAME を FILE に書く（既に値があれば --force が無い限り変えない）
  --check-manifest P manifest.json の developer.name が開発中のアカウントと一致するか確かめる（違えば終了コード 1）

例:
  python get_developer_account.py
  python get_developer_account.py --write-env .mcp/cowork.answers.env
  python get_developer_account.py --check-manifest cowork/<plugin>/manifest.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str((HERE / ".." / ".." / "standard" / "scripts").resolve()))

GRAPH_POWERSHELL_CLIENT_ID = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
# Teams / M365 アプリ manifest の developer.name の上限
MAX_DEVELOPER_NAME = 32


def signed_in_account() -> dict[str, str]:
    import requests  # noqa: PLC0415
    from auth_helper import get_token  # noqa: PLC0415

    token = get_token("https://graph.microsoft.com/.default", client_id=GRAPH_POWERSHELL_CLIENT_ID)
    res = requests.get("https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName",
                       headers={"Authorization": f"Bearer {token}"}, timeout=30)
    if not res.ok:
        raise SystemExit(f"Graph /me → {res.status_code}: {res.text[:200]}")
    me = res.json()
    name = (me.get("displayName") or me.get("userPrincipalName") or "").strip()
    return {"displayName": name, "userPrincipalName": me.get("userPrincipalName", ""), "developerName": name[:MAX_DEVELOPER_NAME]}


def write_env(path: Path, key: str, value: str, force: bool) -> str:
    """書いたら空文字、既存の値を残したらその値を返す。"""
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    current = next((line.split("=", 1)[1] for line in lines if line.startswith(f"{key}=")), "")
    if current and not force:
        return current
    lines = [line for line in lines if not line.startswith(f"{key}=")] + [f"{key}={value}"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return ""


def check_manifest(path: Path, expected: str) -> int:
    manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    actual = (manifest.get("developer") or {}).get("name", "")
    if actual != expected:
        print(f"✖ developer.name が開発中のアカウントと違います: manifest={actual!r} / アカウント={expected!r}")
        return 1
    print(f"✅ developer.name は開発中のアカウント（{expected}）です")
    return 0


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except AttributeError:
        pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--write-env", type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check-manifest", type=Path)
    args = parser.parse_args()
    account = signed_in_account()
    if args.check_manifest:
        return check_manifest(args.check_manifest, account["developerName"])
    if args.write_env:
        kept = write_env(args.write_env, "COWORK_DEVELOPER_NAME", account["developerName"], args.force)
        if kept:
            print(f"COWORK_DEVELOPER_NAME={kept} のまま（開発中のアカウントは {account['developerName']}。--force で上書き）")
        else:
            print(f"COWORK_DEVELOPER_NAME={account['developerName']} を書きました")
        return 0
    print(json.dumps(account, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
