"""Copilot SDK エージェントの前提チェック（非対話）。

references/copilot-sdk-runtime.md §2 / SKILL.md Step 3・Step 6 で使用する。ローカルとデプロイ先の両方で実行し、
「ランタイムが起動でき、モデルへ 1 往復できる」前提が揃っているかを機械的に検証する。

検証項目（copilot-sdk-troubleshooting.md の番号と対応）:
  1. .NET SDK のメジャー バージョン                      → #11
  2. 作業ディレクトリがソース リポジトリの外にあるか      → #3
  3. セッション状態の保存先が書き込み可能か              → #2
  4. BYOK エンドポイントの形式（リソース URL のみ）        → #5
  5. モデル（デプロイ名）の指定                          → #4
  6. Entra トークンの取得可否（Managed Identity / CLI）  → #6
  7. GitHub トークンの種別と渡し先                       → #7

依存なし（標準ライブラリのみ）。値は引数 > .env > 既定の順で解決する。

使い方:
  python check_copilot_sdk_env.py --route byok
  python check_copilot_sdk_env.py --route github
  python check_copilot_sdk_env.py --route byok --repo-root <repo-root> --working-dir <path>

終了コード: error が 1 件以上なら 1、それ以外は 0（warning は 0 のまま）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

_UTF8_OUT = (getattr(sys.stdout, "encoding", "") or "").lower().startswith("utf")
MARK_OK = "\u2705" if _UTF8_OUT else "[OK]"
MARK_NG = "\u274c" if _UTF8_OUT else "[NG]"
MARK_WARN = "\u26a0\ufe0f " if _UTF8_OUT else "[WARN]"

DEFAULT_DOTNET_MAJOR = 10
# BYOK の環境変数にはリソース URL のみを入れる（ベース URL の /openai/v1/ はコード側で付与する）
BYOK_URL_RE = re.compile(r"^https://[^/\s]+/?$", re.IGNORECASE)
# Entra の Foundry / Azure OpenAI 用リソース スコープ
AI_RESOURCE = "https://ai.azure.com"

errors: list[str] = []
warnings: list[str] = []


def ok(msg: str) -> None:
    print(f"{MARK_OK} {msg}")


def err(msg: str) -> None:
    errors.append(msg)
    print(f"{MARK_NG} {msg}")


def warn(msg: str) -> None:
    warnings.append(msg)
    print(f"{MARK_WARN} {msg}")


def load_env(start: Path) -> None:
    """リポジトリルート方向へ .env を探して読み込む（既存の環境変数は上書きしない）。"""
    for parent in [start, *start.parents]:
        envf = parent / ".env"
        if envf.is_file():
            for line in envf.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
            return


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")


# --- 個別チェック -------------------------------------------------------------


def check_dotnet_sdk(required_major: int) -> None:
    exe = shutil.which("dotnet")
    if not exe:
        err("dotnet が見つかりません。.NET SDK を導入してください（copilot-sdk-troubleshooting #11）")
        return
    res = run([exe, "--list-sdks"])
    if res.returncode != 0:
        err(f"dotnet --list-sdks に失敗: {res.stderr.strip() or res.stdout.strip()}")
        return
    majors: set[int] = set()
    for line in res.stdout.splitlines():
        m = re.match(r"^(\d+)\.", line.strip())
        if m:
            majors.add(int(m.group(1)))
    if not majors:
        err("インストール済みの .NET SDK を判定できませんでした")
    elif max(majors) < required_major:
        err(f".NET SDK {required_major} 以上が必要（検出: {sorted(majors)}）（copilot-sdk-troubleshooting #11）")
    else:
        ok(f".NET SDK: {sorted(majors)}（必要 {required_major}+）")


def check_workspace_isolation(working_dir: Path, repo_root: Path | None) -> None:
    """エージェントの作業ディレクトリがソース リポジトリの外にあることを検証する（copilot-sdk-troubleshooting #3）。

    組み込みのファイル操作ツールはこのディレクトリへ書き込むため、リポジトリ配下だと
    ソースを破壊しうる。パス包含と .git の有無の両面で検査する。
    """
    wd = working_dir.expanduser().resolve()
    if repo_root is not None:
        rr = repo_root.expanduser().resolve()
        if wd == rr or rr in wd.parents:
            err(f"作業ディレクトリがリポジトリ配下です: {wd}（リポジトリ: {rr}）（copilot-sdk-troubleshooting #3）")
            return
    for candidate in [wd, *wd.parents]:
        if (candidate / ".git").exists():
            err(f"作業ディレクトリが Git 作業ツリー内です: {wd}（.git: {candidate}）（copilot-sdk-troubleshooting #3）")
            return
    ok(f"作業ディレクトリはリポジトリ外: {wd}")


def check_base_directory(base_dir: Path) -> None:
    """セッション状態の保存先に実際に書き込めるかを検証する（copilot-sdk-troubleshooting #2）。"""
    bd = base_dir.expanduser()
    try:
        bd.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=bd, prefix=".writetest_", delete=True):
            pass
    except OSError as exc:
        err(f"セッション保存先に書き込めません: {bd}（{exc}）（copilot-sdk-troubleshooting #2）")
        return
    ok(f"セッション保存先は書き込み可能: {bd.resolve()}")


def check_byok_endpoint(url: str) -> None:
    if not url:
        err("AZURE_OPENAI_ENDPOINT が未設定です（BYOK では必須）")
        return
    if "<" in url or ">" in url:
        err(f"AZURE_OPENAI_ENDPOINT がプレースホルダーのままです: {url}")
        return
    if "/openai" in url.lower():
        err(f"AZURE_OPENAI_ENDPOINT にパスが含まれています（ベース URL の /openai/v1/ は CopilotRuntime.cs が付与するため二重になります）: "
            f"{url}（copilot-sdk-troubleshooting #5）")
        return
    if not BYOK_URL_RE.match(url):
        err(f"AZURE_OPENAI_ENDPOINT の形式が不正です（https://<resource-name>.openai.azure.com 形式）: "
            f"{url}（copilot-sdk-troubleshooting #5）")
        return
    ok(f"BYOK リソース URL: {url}（ベース URL は {url.rstrip('/')}/openai/v1/）")


def check_model(route: str, model: str) -> None:
    if route == "byok" and not model:
        err("AZURE_OPENAI_DEPLOYMENT（Azure ではデプロイ名）が未設定です。BYOK では必須（copilot-sdk-troubleshooting #4）")
        return
    if not model:
        warn("AZURE_OPENAI_DEPLOYMENT が未設定です（既定モデルに委ねる場合のみ可）")
        return
    ok(f"モデル（デプロイ名）: {model}")


def check_entra_token() -> None:
    """Managed Identity / 開発者資格情報でトークンが取得できるかを検証する（copilot-sdk-troubleshooting #6）。"""
    az = shutil.which("az") or shutil.which("az.cmd")
    if not az:
        warn("Azure CLI が無いためトークン取得の事前検証をスキップしました（デプロイ先で必ず疎通確認する）")
        return
    res = run([az, "account", "get-access-token", "--resource", AI_RESOURCE, "-o", "json"])
    if res.returncode != 0:
        err(f"Entra トークンを取得できません（scope: {AI_RESOURCE}/.default）: "
            f"{(res.stderr or res.stdout).strip().splitlines()[-1] if (res.stderr or res.stdout).strip() else ''}"
            "（copilot-sdk-troubleshooting #6）")
        return
    try:
        json.loads(res.stdout)
    except json.JSONDecodeError:
        err("Entra トークンの応答を解釈できませんでした")
        return
    client_id = os.environ.get("AZURE_CLIENT_ID", "")
    cred = os.environ.get("AZURE_TOKEN_CREDENTIALS", "")
    ok(f"Entra トークン取得: 成功（scope: {AI_RESOURCE}/.default）")
    if cred:
        ok(f"資格情報の種別を固定: AZURE_TOKEN_CREDENTIALS={cred}")
    else:
        warn("AZURE_TOKEN_CREDENTIALS が未設定です。ホスト上では ManagedIdentityCredential に固定することを推奨")
    if not client_id:
        warn("AZURE_CLIENT_ID が未設定です。ユーザー割り当てマネージド ID を使う場合は必須")


def check_github_token(route: str) -> None:
    """トークン種別と渡し先の整合を検証する（copilot-sdk-troubleshooting #7）。

    GitHub App のインストール トークン（ghs_ 接頭辞）は SDK のトークン オプションでは 403 になるため、
    必ず環境変数としてランタイムへ渡す必要がある。
    """
    token = os.environ.get("COPILOT_GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if route != "github":
        if token:
            warn("BYOK 経路なのに GitHub トークンが設定されています（不要。取り違えに注意）")
        else:
            ok("GitHub トークン: 不要（BYOK 経路）")
        return
    if not token:
        err("経路 github では COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN のいずれかが必要です")
        return
    kind = "インストール トークン" if token.startswith("ghs_") else "ユーザー トークン"
    ok(f"GitHub トークン: 設定済み（種別: {kind}・値は出力しません）")
    if token.startswith("ghs_"):
        warn("インストール トークンは SDK のトークン オプションではなく**環境変数**で渡すこと。"
             "有効期限が短いため更新とランタイム再起動の仕組みも用意する（copilot-sdk-troubleshooting #7）")


# --- エントリ ポイント ---------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser(description="Copilot SDK エージェントの前提チェック")
    ap.add_argument("--route", choices=["byok", "github"], help="モデル経路（既定: .env COPILOT_ROUTE または byok）")
    ap.add_argument("--agent-name", help="エージェント名（既定: .env AGENT_NAME）")
    ap.add_argument("--workspace-root", help="エージェント作業領域のルート（既定: .env COPILOT_WORKSPACE_ROOT）")
    ap.add_argument("--working-dir", help="作業ディレクトリ（既定: .env COPILOT_WORK_DIR または <workspace-root>/<agent-name>）")
    ap.add_argument("--base-dir", help="セッション保存先（既定: .env COPILOT_STATE_DIR または <working-dir>/.copilot）")
    ap.add_argument("--repo-root", help="ソース リポジトリのルート（既定: カレント ディレクトリ）")
    args = ap.parse_args()

    here = Path.cwd()
    load_env(here)

    route = args.route or os.environ.get("COPILOT_ROUTE", "byok")
    agent = args.agent_name or os.environ.get("AGENT_NAME", "")
    ws_root = args.workspace_root or os.environ.get("COPILOT_WORKSPACE_ROOT", "")
    repo_root = Path(args.repo_root) if args.repo_root else here

    print(f"=== Copilot SDK ランタイム 前提チェック（経路: {route}）===")

    required_major = int(os.environ.get("DOTNET_SDK_MAJOR", DEFAULT_DOTNET_MAJOR))
    check_dotnet_sdk(required_major)

    if args.working_dir:
        working_dir = Path(args.working_dir)
    elif os.environ.get("COPILOT_WORK_DIR"):
        working_dir = Path(os.environ["COPILOT_WORK_DIR"])
    elif ws_root and agent:
        working_dir = Path(ws_root) / agent
    else:
        working_dir = Path()
    if working_dir.parts:
        check_workspace_isolation(working_dir, repo_root)
        base_dir = Path(args.base_dir) if args.base_dir else Path(
            os.environ.get("COPILOT_STATE_DIR") or (working_dir / ".copilot"))
        check_base_directory(base_dir)
    else:
        err("作業ディレクトリを決定できません。COPILOT_WORK_DIR、または --working-dir を"
            "指定してください（copilot-sdk-troubleshooting #3）")

    check_model(route, os.environ.get("AZURE_OPENAI_DEPLOYMENT", ""))

    if route == "byok":
        check_byok_endpoint(os.environ.get("AZURE_OPENAI_ENDPOINT", ""))
        check_entra_token()
    check_github_token(route)

    print()
    if errors:
        print(f"{MARK_NG} error {len(errors)} 件 / warning {len(warnings)} 件 — 修正してから再実行してください")
        return 1
    print(f"{MARK_OK} すべて合格（warning {len(warnings)} 件）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
