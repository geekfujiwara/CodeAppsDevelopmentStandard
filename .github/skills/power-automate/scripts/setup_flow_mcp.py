"""
Flow agent MCP SERVER セットアップスクリプト（VS Code 版）

auth_helper で認証し、FlowAgent MCP SERVER の実体（server/mcp.mjs）を
git スパースチェックアウトで取得し、VS Code の `.vscode/mcp.json` に登録する。

★ VS Code の GitHub Copilot Chat（このリポジトリの標準クライアント）は
  Claude Code / GitHub Copilot CLI の `/plugin marketplace add` コマンドや
  `.mcp.json`（Claude 形式）を解釈できない。VS Code は独自に
  `.vscode/mcp.json`（"servers" キー・"type": "stdio"）を読む MCP クライアントを
  持っているため、本スクリプトは FlowAgent プラグイン本体（自己完結型 ESM バンドル）
  を `microsoft/power-platform-skills` リポジトリから直接取得し、VS Code 形式で
  登録する。プラグインマーケットプレイスの仕組みは経由しない。

使い方:
  python .github/skills/power-automate/scripts/setup_flow_mcp.py
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --plugin-root /path/to/plugin
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --output /path/to/.vscode/mcp.json
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --dry-run

.env 必須項目:
  DATAVERSE_URL  - Power Platform 環境 URL (例: https://{org}.crm.dynamics.com/)
  SOLUTION_NAME  - ソリューション名

.env オプション項目:
  FLOW_MCP_PLUGIN_ROOT - FlowAgent プラグインのルートパス（--plugin-root の代替。
                         省略時は ~/.power-platform-skills/plugins/power-automate を
                         git スパースチェックアウトで自動取得する）
  TENANT_ID            - Entra テナント ID（MCP サーバーの PA_TENANT_ID として渡す。★ 重要:
                         FlowAgent MCP は AZURE_TENANT_ID ではなく PA_TENANT_ID を見る。
                         未設定だとテナントが "common" 扱いになり、MSAL キャッシュが
                         全テナント共通の単一ファイル（%LOCALAPPDATA%/flowagent/msal-cache/common.json）
                         になり、別テナントの古い認証を誤って使い回す）
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

# auth_helper へのパスを解決
_this_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_this_dir))
sys.path.insert(0, str(_this_dir / ".." / ".." / "standard" / "scripts"))

from dotenv import load_dotenv

load_dotenv()

DATAVERSE_URL: str = os.getenv("DATAVERSE_URL", "").rstrip("/")
SOLUTION_NAME: str = os.getenv("SOLUTION_NAME", "")
TENANT_ID: str = os.getenv("TENANT_ID", "")
FLOW_MCP_PLUGIN_ROOT: str = os.getenv("FLOW_MCP_PLUGIN_ROOT", "")

# FlowAgent プラグイン本体の取得元（Claude/Copilot CLI のプラグインマーケットプレイスと同じソース）
_PLUGIN_REPO_URL = "https://github.com/microsoft/power-platform-skills.git"
_PLUGIN_SPARSE_PATH = "plugins/power-automate"
# git スパースチェックアウトの保存先（マシン全体で共有・プロジェクトをまたいで再利用する）
_DEFAULT_PLUGIN_CACHE_DIR = Path.home() / ".power-platform-skills"

# FlowAgent plugin 内の MCP サーバーエントリポイント
_PLUGIN_MCP_JS = "server/mcp.mjs"

# 明示指定・.env が無い場合に検索する追加候補（Claude Code / Copilot CLI で
# 別途プラグインをインストール済みの場合の再利用のみを目的とする）
_PLUGIN_ROOT_CANDIDATES: list[Path] = [
    _DEFAULT_PLUGIN_CACHE_DIR / _PLUGIN_SPARSE_PATH,
    Path.home() / ".claude" / "plugins" / "power-automate@power-platform-skills",
    Path.home() / ".copilot" / "plugins" / "power-automate@power-platform-skills",
]


# ---------------------------------------------------------------------------
# 前提確認ヘルパー
# ---------------------------------------------------------------------------


def check_node() -> None:
    """Node.js 18+ が存在するかを確認する。"""
    node = shutil.which("node")
    if not node:
        print("❌ Node.js が見つかりません。Node.js 18+ をインストールしてください。", file=sys.stderr)
        sys.exit(1)
    result = subprocess.run(
        ["node", "--version"],
        capture_output=True, text=True, timeout=10,
    )
    version_str = result.stdout.strip()  # 例: "v20.11.0"
    try:
        major = int(version_str.lstrip("v").split(".")[0])
        if major < 18:
            print(
                f"❌ Node.js {version_str} は古すぎます（18+ が必要）。",
                file=sys.stderr,
            )
            sys.exit(1)
    except (ValueError, IndexError):
        pass
    print(f"✅ Node.js {version_str}")


def _run_az(args: list[str], timeout: int = 20) -> subprocess.CompletedProcess:
    """az CLI を実行する。

    ★ Windows では az は az.cmd（バッチファイル）としてインストールされるため、
      shell=False の subprocess.run(["az", ...]) は CreateProcess が .cmd を直接
      起動できず FileNotFoundError になることがある（★ 検証済み教訓）。
      shell=True で cmd.exe 経由にすることで解消する。引数はすべて固定文字列
      （ユーザー入力を含まない）なのでインジェクションリスクはない。
    """
    use_shell = os.name == "nt"
    cmd = " ".join(["az", *args]) if use_shell else ["az", *args]
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout, shell=use_shell,
    )


def check_az_login() -> bool:
    """Azure CLI の認証状態を確認し、必要なら対象テナントへ切り替える。

    FlowAgent MCP サーバーは Azure CLI（az login）を使って認証するため、
    az login 済みかを事前確認する。

    ★ 重要な教訓（2026-07 検証済み）:
      az login は auth_helper.py（Python/MSAL）とは完全に別の資格情報ストア
      （~/.azure）を使う。複数テナントを行き来する場合、az login はアカウントを
      上書きせず `az account list` に追加保持されるため、いきなり az login で
      ブラウザ操作を求める前に、まず az account list で対象テナントが既に
      キャッシュされていないか確認し、あれば az account set だけで切り替える
      （対話不要）。無い場合のみ、その回だけインタラクティブ az login が必要。
    """
    az = shutil.which("az")
    if not az:
        print(
            "⚠ Azure CLI が見つかりません。FlowAgent MCP サーバーには az login が必要です。\n"
            "  インストール: https://docs.microsoft.com/cli/azure/install-azure-cli",
        )
        return False

    # 現在ログイン中のアカウントを確認
    current = _run_az(["account", "show", "--query", "tenantId", "-o", "tsv"])
    current_tenant = current.stdout.strip() if current.returncode == 0 else ""

    if current_tenant and (not TENANT_ID or current_tenant == TENANT_ID):
        result = _run_az(["account", "show", "--query", "user.name", "-o", "tsv"])
        print(f"✅ Azure CLI 認証済み ({result.stdout.strip()})")
        return True

    # ★ 対象テナントに未切り替え → いきなり az login せず、まず account list を確認
    if TENANT_ID:
        listed = _run_az(["account", "list", "--all", "-o", "json"], timeout=30)
        if listed.returncode == 0:
            try:
                accounts = json.loads(listed.stdout or "[]")
            except json.JSONDecodeError:
                accounts = []
            match = next((a for a in accounts if a.get("tenantId") == TENANT_ID), None)
            if match:
                sub_id = match.get("id") or match.get("subscriptionId")
                switched = _run_az(["account", "set", "--subscription", sub_id])
                if switched.returncode == 0:
                    print(
                        f"✅ 既存キャッシュのアカウントに切り替えました "
                        f"({match.get('user', {}).get('name', '?')}) — 再ログイン不要",
                    )
                    return True

    print(
        "⚠ Azure CLI が対象テナントで未認証です。\n"
        f"  次のコマンドを実行してサインインしてください: az login --tenant {TENANT_ID or '<tenant-id>'}",
    )
    return False


# ---------------------------------------------------------------------------
# auth_helper 認証
# ---------------------------------------------------------------------------


def auth_with_helper() -> None:
    """auth_helper（PAC CLI / DeviceCode）で認証し、トークンをキャッシュに乗せる。

    - DATAVERSE_URL スコープ（Dataverse 操作用）
    - Flow API スコープ（フロー有効化・Webhook 登録用）
    どちらも取得してキャッシュしておく。
    """
    from auth_helper import get_token  # noqa: PLC0415

    print("🔑 auth_helper で認証中...")

    token = get_token()  # Dataverse スコープ（デフォルト）
    if not token:
        print("❌ Dataverse トークンの取得に失敗しました。", file=sys.stderr)
        sys.exit(1)
    print("✅ 認証成功（Dataverse）")

    try:
        get_token(scope="https://service.flow.microsoft.com/.default")
        print("✅ 認証成功（Flow API）")
    except Exception as exc:  # noqa: BLE001
        # Flow API トークンが取れなくても致命的ではない
        print(f"⚠ Flow API トークン取得失敗（継続）: {exc}")


# ---------------------------------------------------------------------------
# プラグイン取得（git スパースチェックアウト）
# ---------------------------------------------------------------------------


def _run_git(args: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, timeout=60, cwd=cwd,
    )


def ensure_flow_agent_plugin(explicit: str | None) -> Path | None:
    """FlowAgent プラグイン本体を確保して server/mcp.mjs のあるルートを返す。

    優先順:
      1. --plugin-root（明示指定）
      2. .env の FLOW_MCP_PLUGIN_ROOT
      3. 既存の Claude/Copilot CLI プラグインインストール（あれば再利用）
      4. git スパースチェックアウトで microsoft/power-platform-skills から自動取得
         （★ VS Code は /plugin marketplace 経由のインストールに対応していないため、
           このリポジトリを直接取得するのが VS Code 向けの標準手段）
    """
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if (p / _PLUGIN_MCP_JS).exists():
            print(f"✅ FlowAgent プラグインを検出: {p}")
            return p
        print(f"⚠ 指定されたパスに {_PLUGIN_MCP_JS} が見つかりません: {p}")

    if FLOW_MCP_PLUGIN_ROOT:
        p = Path(FLOW_MCP_PLUGIN_ROOT).expanduser().resolve()
        if (p / _PLUGIN_MCP_JS).exists():
            print(f"✅ FlowAgent プラグインを検出: {p}")
            return p

    for p in _PLUGIN_ROOT_CANDIDATES:
        if (p / _PLUGIN_MCP_JS).exists():
            print(f"✅ FlowAgent プラグインを検出: {p}")
            return p

    # ── git スパースチェックアウトで取得 ──
    git = shutil.which("git")
    if not git:
        print(
            "⚠ git が見つからず、FlowAgent プラグインを自動取得できません。\n"
            f"  手動で {_PLUGIN_REPO_URL} の {_PLUGIN_SPARSE_PATH} を取得し、\n"
            "  --plugin-root で指定してください。",
        )
        return None

    dest = _DEFAULT_PLUGIN_CACHE_DIR
    target = dest / _PLUGIN_SPARSE_PATH
    print(f"📦 FlowAgent プラグインを取得中: {_PLUGIN_REPO_URL} ({_PLUGIN_SPARSE_PATH})")

    if not dest.exists():
        r = _run_git([
            "clone", "--depth", "1", "--filter=blob:none", "--sparse",
            _PLUGIN_REPO_URL, str(dest),
        ])
        if r.returncode != 0:
            print(f"❌ git clone 失敗: {r.stderr.strip()}")
            return None
        r = _run_git(["sparse-checkout", "set", _PLUGIN_SPARSE_PATH], cwd=dest)
        if r.returncode != 0:
            print(f"❌ git sparse-checkout 失敗: {r.stderr.strip()}")
            return None
    else:
        # 既存クローンを最新化（失敗しても既存内容で続行）
        _run_git(["sparse-checkout", "set", _PLUGIN_SPARSE_PATH], cwd=dest)
        r = _run_git(["pull", "--ff-only"], cwd=dest)
        if r.returncode != 0:
            print(f"⚠ git pull 失敗（既存キャッシュを使用して続行）: {r.stderr.strip()}")

    if (target / _PLUGIN_MCP_JS).exists():
        print(f"✅ FlowAgent プラグインを取得しました: {target}")
        return target

    print(f"❌ 取得後も {_PLUGIN_MCP_JS} が見つかりません: {target}")
    return None


# ---------------------------------------------------------------------------
# .vscode/mcp.json 生成（VS Code MCP クライアント形式）
# ---------------------------------------------------------------------------


def build_vscode_mcp_entry(plugin_root: Path | None) -> dict:
    """VS Code の .vscode/mcp.json 用 FlowAgent サーバーエントリを返す。

    ★ VS Code の MCP 設定スキーマは Claude Code の .mcp.json（"mcpServers" キー）
      とは異なり、"servers" キー + "type": "stdio" が必要。
    """
    env: dict[str, str] = {}

    if DATAVERSE_URL:
        env["DATAVERSE_URL"] = DATAVERSE_URL
    if SOLUTION_NAME:
        env["SOLUTION_NAME"] = SOLUTION_NAME
    if TENANT_ID:
        # ★ FlowAgent MCP 自体は AZURE_TENANT_ID ではなく PA_TENANT_ID を見る。
        #   未設定だと MSAL キャッシュ識別子が "common" になり、全テナント共通の
        #   単一キャッシュファイルを使い回してしまう（auth_helper.py と同種のバグ）。
        env["PA_TENANT_ID"] = TENANT_ID
        # Azure SDK / Azure CLI 系ツールとの互換のため併記（FlowAgent 自体は無視する）
        env["AZURE_TENANT_ID"] = TENANT_ID

    if plugin_root:
        args = [str(plugin_root / _PLUGIN_MCP_JS)]
    else:
        # プラグイン未検出時はプレースホルダー（後で手動修正）
        args = ["<FLOW_MCP_PLUGIN_ROOT>/server/mcp.mjs"]

    return {
        "type": "stdio",
        "command": "node",
        "args": args,
        "env": env,
    }


def write_vscode_mcp_json(entry: dict, output_path: Path, dry_run: bool) -> None:
    """既存の .vscode/mcp.json に FlowAgent エントリをマージして書き込む。

    他の servers エントリは保持する。
    """
    existing: dict = {}
    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"⚠ 既存 {output_path} の読み込みに失敗しました（上書き）: {exc}")

    existing.setdefault("servers", {})
    existing["servers"]["FlowAgent"] = entry

    content = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"

    print(f"\n--- {output_path} ---")
    print(content)

    if dry_run:
        print("(--dry-run: ファイルは書き込まれません)")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")
    print(f"✅ {output_path} を作成/更新しました")

    # .gitignore チェック（.vscode/mcp.json は環境依存パスや秘密情報を含み得るため）
    gitignore = output_path.parent.parent / ".gitignore"
    rel_entry = f"{output_path.parent.name}/{output_path.name}"
    if gitignore.exists():
        gi_text = gitignore.read_text(encoding="utf-8")
        if rel_entry not in gi_text and output_path.name not in gi_text:
            print(
                f"⚠ .gitignore に {rel_entry} を追加することを推奨します:\n"
                f"  Add-Content {gitignore} '{rel_entry}'",
            )
    else:
        print(
            f"⚠ .gitignore が見つかりません。{rel_entry} をコミットしないよう注意してください。",
        )


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Flow agent MCP SERVER を VS Code の .vscode/mcp.json に登録し auth_helper で認証する",
    )
    parser.add_argument(
        "--plugin-root",
        default="",
        help="FlowAgent プラグインのルートパス（.env の FLOW_MCP_PLUGIN_ROOT より優先）",
    )
    parser.add_argument(
        "--output",
        default=".vscode/mcp.json",
        help="出力する mcp.json のパス（既定: .vscode/mcp.json）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="ファイルを書き込まずに内容だけ表示する",
    )
    parser.add_argument(
        "--skip-auth",
        action="store_true",
        help="auth_helper 認証をスキップする（テスト用）",
    )
    args = parser.parse_args()

    print("=== Flow agent MCP SERVER セットアップ（VS Code 版） ===\n")

    # ── 前提確認 ──────────────────────────────────────────────────────
    if not DATAVERSE_URL:
        print(
            "❌ DATAVERSE_URL が未設定です。.env に設定してください。\n"
            "   例: DATAVERSE_URL=https://{org}.crm.dynamics.com/",
            file=sys.stderr,
        )
        return 1

    check_node()
    check_az_login()

    # ── auth_helper 認証（Python スクリプト用） ─────────────────────
    if not args.skip_auth:
        auth_with_helper()

    # ── プラグイン取得（git スパースチェックアウト） ─────────────────
    plugin_root = ensure_flow_agent_plugin(args.plugin_root or None)

    # ── .vscode/mcp.json 生成 ────────────────────────────────────────
    entry = build_vscode_mcp_entry(plugin_root)
    write_vscode_mcp_json(entry, Path(args.output).resolve(), args.dry_run)

    # ── 次のステップ案内 ───────────────────────────────────────────────
    if not args.dry_run:
        print("\n=== 次のステップ ===")
        if plugin_root is None:
            print(
                "  1. git / Node.js の前提を満たしてから本スクリプトを再実行してください。\n"
                "  2. または --plugin-root で FlowAgent プラグインのパスを直接指定してください。",
            )
        else:
            print(
                "  VS Code で .vscode/mcp.json を認識させるため:\n"
                "    1. コマンドパレット → 'MCP: List Servers' で FlowAgent が表示されるか確認\n"
                "       （表示されない場合はウィンドウをリロード）\n"
                "    2. FlowAgent を Start\n"
                "    3. Copilot Chat（エージェントモード）で自然言語で指示する:\n"
                "       「承認フローを作って。Dataverse の申請テーブルにレコードが作成されたら承認者にメール送信」",
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
