"""PAC プロファイルから環境を取得して .env を構成し、デバイスコード認証して auth_helper に保存する。

標準プロセス（プロジェクト開始時の環境セットアップ）:
  1. ``--list``  : ``pac auth list`` のプロファイルを ``pac org who`` で解決し、環境候補を一覧表示
                   （エージェントはこの一覧を AskUserQuestion でユーザーに選ばせる）。
  2. ``--profile <名前>`` : 選択プロファイルの環境値（URL / 環境 ID / テナント）で ``.env`` を upsert。
  3. 既定でデバイスコード認証をトリガーし、auth_helper が AuthenticationRecord を保存する。
     これ以降の Python スクリプトは 2 層キャッシュによりデバイスコード入力なしで認証される。

補足:
  - この PAC CLI バージョンには ``pac auth token`` が無いため、Python の Dataverse 認証は
    PAC プロファイルではなく **デバイスコード認証（auth_helper）** を正式な経路とする。
  - PAC プロファイルは「環境メタデータ（URL / 環境 ID）」の取得元として利用する。
  - テナント GUID は選択プロファイルのユーザーのドメインから OIDC ディスカバリで解決する。

依存: requests（テナント解決）, azure-identity / python-dotenv（auth_helper 経由）。

使い方:
  python setup_environment.py --list
  python setup_environment.py --profile "<ProfileName>" \
      --solution "<SolutionName>" --prefix "<prefix>" --display "<表示名>"
  python setup_environment.py --auth-only      # 既存 .env でデバイスコード認証のみ実行
  python setup_environment.py --profile "<ProfileName>" --no-auth  # .env 構成のみ（認証しない）

終了コード: 成功 0 / 前提不足・失敗 1。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

HERE = Path(__file__).resolve().parent

# pac auth list の行（[index] [*] Kind Name User... 形式）。名前が空の行は環境なしとして対象外。
_ROW_RE = re.compile(r"^\[(\d+)\]\s*(\*?)\s+\S+\s+(\S+)\s+(\S+@\S+)", re.MULTILINE)


def _run(args: list[str], check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", check=check)


def find_repo_root(start: Path) -> Path:
    """`.git` を上方向に探索してリポジトリルートを返す。無ければ cwd。"""
    for cand in (start, *start.parents):
        if (cand / ".git").exists():
            return cand
    return Path.cwd()


def list_profiles() -> list[dict[str, str]]:
    """`pac auth list` のプロファイル名を抽出する（環境を持つもののみ）。"""
    res = _run(["pac", "auth", "list"])
    if res.returncode != 0:
        sys.exit(f"pac auth list に失敗しました:\n{res.stderr.strip() or res.stdout.strip()}")
    profiles: list[dict[str, str]] = []
    for m in _ROW_RE.finditer(res.stdout):
        index, active, name, user = m.group(1), m.group(2), m.group(3), m.group(4)
        profiles.append({"index": index, "active": "*" if active else "", "name": name, "user": user})
    return profiles


def org_who(profile_name: str) -> dict[str, str] | None:
    """プロファイルを選択して `pac org who --json` から環境メタデータを取得する。"""
    sel = _run(["pac", "auth", "select", "--name", profile_name])
    if sel.returncode != 0:
        return None
    who = _run(["pac", "org", "who", "--json"])
    if who.returncode != 0:
        return None
    try:
        data = json.loads(who.stdout)
    except json.JSONDecodeError:
        return None
    url = (data.get("OrgUrl") or "").strip()
    env_id = (data.get("EnvironmentId") or "").strip()
    user = (data.get("UserEmail") or "").strip()
    if not url:
        return None
    return {"url": url, "env_id": env_id, "user": user, "friendly": (data.get("FriendlyName") or "").strip()}


def resolve_tenant(user_email: str) -> str:
    """ユーザーのドメインから OIDC ディスカバリでテナント GUID を解決する。"""
    domain = user_email.split("@", 1)[1] if "@" in user_email else user_email
    try:
        import requests

        url = f"https://login.microsoftonline.com/{domain}/v2.0/.well-known/openid-configuration"
        endpoint = requests.get(url, timeout=15).json().get("token_endpoint", "")
        m = re.search(r"/([0-9a-fA-F-]{36})/", endpoint)
        return m.group(1) if m else ""
    except Exception as exc:  # noqa: BLE001
        print(f"[setup_environment] テナント解決に失敗（手動設定が必要）: {exc}", file=sys.stderr)
        return ""


def upsert_env(repo_root: Path, mapping: dict[str, str]) -> Path:
    """`.env` の指定キーを upsert する（既存の他キー・コメントは保持）。"""
    env_path = repo_root / ".env"
    lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.is_file() else []
    remaining = dict(mapping)
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                out.append(f"{key}={remaining.pop(key)}")
                continue
        out.append(line)
    if remaining:
        if out and out[-1].strip():
            out.append("")
        for key, value in remaining.items():
            out.append(f"{key}={value}")
    env_path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    return env_path


def trigger_device_code(values: dict[str, str]) -> int:
    """auth_helper のデバイスコード認証をトリガーし、AuthenticationRecord を保存する。"""
    if values.get("DATAVERSE_URL"):
        os.environ["DATAVERSE_URL"] = values["DATAVERSE_URL"]
    if values.get("TENANT_ID"):
        os.environ["TENANT_ID"] = values["TENANT_ID"]
    sys.path.insert(0, str(HERE))
    try:
        from auth_helper import api_get  # type: ignore
    except Exception as exc:  # noqa: BLE001
        print(f"[setup_environment] auth_helper の読み込みに失敗: {exc}", file=sys.stderr)
        return 1
    who = api_get("WhoAmI")
    print("[setup_environment] 認証成功（WhoAmI）:", who.get("UserId", ""))
    print("[setup_environment] 認証レコードを保存しました。以降はデバイスコード不要です。")
    return 0


def cmd_list() -> int:
    profiles = list_profiles()
    rows = []
    for p in profiles:
        info = org_who(p["name"])
        if info is None:
            continue
        rows.append({**p, **info})
    if not rows:
        print("環境を持つ PAC プロファイルが見つかりません。`pac auth create` で作成してください。")
        return 1
    print("番号 | プロファイル | 環境名 | 環境 ID | URL")
    for i, r in enumerate(rows, 1):
        active = " (active)" if r["active"] else ""
        print(f"{i} | {r['name']}{active} | {r['friendly']} | {r['env_id']} | {r['url']}")
    print("\nJSON:", json.dumps(rows, ensure_ascii=False))
    print("\n→ この一覧を AskUserQuestion で提示し、選択後に --profile <名前> を実行してください。")
    return 0


def cmd_profile(args: argparse.Namespace, repo_root: Path) -> int:
    info = org_who(args.profile)
    if info is None:
        sys.exit(f"プロファイル '{args.profile}' から環境を取得できませんでした。")
    tenant = resolve_tenant(info["user"]) if info["user"] else ""
    mapping = {
        "DATAVERSE_URL": info["url"] if info["url"].endswith("/") else info["url"] + "/",
        "TENANT_ID": tenant,
        "ENV_ID": info["env_id"],
        "PAC_AUTH_PROFILE": args.profile,
    }
    if args.solution:
        mapping["SOLUTION_NAME"] = args.solution
    if args.display:
        mapping["SOLUTION_DISPLAY_NAME"] = args.display
    if args.prefix:
        mapping["PUBLISHER_PREFIX"] = args.prefix
        mapping["VITE_PUBLISHER_PREFIX"] = args.prefix
    env_path = upsert_env(repo_root, mapping)
    print(f"[setup_environment] .env を更新しました: {env_path}")
    for key in ("DATAVERSE_URL", "TENANT_ID", "ENV_ID", "PAC_AUTH_PROFILE"):
        print(f"   {key}={mapping.get(key, '')}")
    if not tenant:
        print("[setup_environment] 警告: TENANT_ID を解決できませんでした。.env を手動設定してください。", file=sys.stderr)
    if args.no_auth:
        return 0
    return trigger_device_code(mapping)


def main() -> int:
    ap = argparse.ArgumentParser(description="PAC プロファイルから .env 構成 + デバイスコード認証")
    ap.add_argument("--list", action="store_true", help="環境候補を一覧表示（AskUserQuestion 用）")
    ap.add_argument("--profile", help="利用する PAC プロファイル名")
    ap.add_argument("--solution", help="SOLUTION_NAME（任意）")
    ap.add_argument("--display", help="SOLUTION_DISPLAY_NAME（任意）")
    ap.add_argument("--prefix", help="PUBLISHER_PREFIX（任意）")
    ap.add_argument("--no-auth", action="store_true", help=".env 構成のみ（デバイスコード認証しない）")
    ap.add_argument("--auth-only", action="store_true", help="既存 .env でデバイスコード認証のみ実行")
    args = ap.parse_args()

    repo_root = find_repo_root(Path.cwd())

    if args.list:
        return cmd_list()
    if args.auth_only:
        env_path = repo_root / ".env"
        values: dict[str, str] = {}
        if env_path.is_file():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.split("=", 1)
                    values[k.strip()] = v.strip()
        return trigger_device_code(values)
    if args.profile:
        return cmd_profile(args, repo_root)

    ap.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
