"""
Flow agent MCP SERVER セットアップスクリプト

auth_helper で認証し、FlowAgent MCP SERVER の .mcp.json を生成する。
生成された .mcp.json を使って Claude Code / GitHub Copilot CLI から
FlowAgent MCP SERVER に接続できる。

使い方:
  python .github/skills/power-automate/scripts/setup_flow_mcp.py
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --plugin-root /path/to/plugin
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --output /path/to/.mcp.json
  python .github/skills/power-automate/scripts/setup_flow_mcp.py --dry-run

.env 必須項目:
  DATAVERSE_URL  - Power Platform 環境 URL (例: https://{org}.crm.dynamics.com/)
  SOLUTION_NAME  - ソリューション名

.env オプション項目:
  FLOW_MCP_PLUGIN_ROOT - FlowAgent プラグインのルートパス（--plugin-root の代替）
  TENANT_ID            - Entra テナント ID（MCP サーバーの AZURE_TENANT_ID として渡す）
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

# FlowAgent plugin 内の MCP サーバーエントリポイント
_PLUGIN_MCP_JS = "server/mcp.mjs"

# Claude Code / Copilot CLI がプラグインをインストールするデフォルト候補パス
_PLUGIN_ROOT_CANDIDATES: list[Path] = [
    Path.home() / ".claude" / "plugins" / "power-automate@power-platform-skills",
    Path.home() / ".copilot" / "plugins" / "power-automate@power-platform-skills",
    Path.home() / ".copilot-cli" / "plugins" / "power-automate@power-platform-skills",
    Path.home() / ".vscode" / "extensions" / "power-automate@power-platform-skills",
    Path.cwd() / "plugins" / "power-automate",
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


def check_az_login() -> bool:
    """Azure CLI の認証状態を確認する。

    FlowAgent MCP サーバーは Azure CLI（az login）を使って認証するため、
    az login 済みかを事前確認する。未認証でも後で実行できるため、
    このチェックは警告のみで中断しない。
    """
    az = shutil.which("az")
    if not az:
        print(
            "⚠ Azure CLI が見つかりません。FlowAgent MCP サーバーには az login が必要です。\n"
            "  インストール: https://docs.microsoft.com/cli/azure/install-azure-cli",
        )
        return False
    result = subprocess.run(
        ["az", "account", "show", "--query", "user.name", "-o", "tsv"],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode == 0 and result.stdout.strip():
        print(f"✅ Azure CLI 認証済み ({result.stdout.strip()})")
        return True
    print(
        "⚠ Azure CLI が未認証です。\n"
        "  FlowAgent MCP サーバーを起動する前に `az login` を実行してください。",
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
# プラグイン探索
# ---------------------------------------------------------------------------


def find_plugin_root(explicit: str | None) -> Path | None:
    """FlowAgent プラグインの server/mcp.mjs が存在するルートディレクトリを返す。

    1. コマンドライン引数 explicit が指定された場合は最優先
    2. .env の FLOW_MCP_PLUGIN_ROOT
    3. デフォルト候補パスを順に検索
    """
    candidates: list[Path] = []

    if explicit:
        candidates.append(Path(explicit).expanduser().resolve())
    if FLOW_MCP_PLUGIN_ROOT:
        candidates.append(Path(FLOW_MCP_PLUGIN_ROOT).expanduser().resolve())
    candidates.extend(_PLUGIN_ROOT_CANDIDATES)

    for p in candidates:
        if (p / _PLUGIN_MCP_JS).exists():
            print(f"✅ FlowAgent プラグインを検出: {p}")
            return p

    # 見つからない場合は案内のみ
    print(
        "⚠ FlowAgent プラグインが見つかりません。\n"
        "  以下のいずれかの方法でインストールしてください:\n"
        "\n"
        "  [Claude Code / Copilot CLI セッション内]\n"
        "    /plugin marketplace add microsoft/power-platform-skills\n"
        "    /plugin install power-automate@power-platform-skills\n"
        "\n"
        "  インストール後、--plugin-root または .env の FLOW_MCP_PLUGIN_ROOT に\n"
        "  インストール先パスを指定して本スクリプトを再実行してください。",
    )
    return None


# ---------------------------------------------------------------------------
# .mcp.json 生成
# ---------------------------------------------------------------------------


def build_mcp_entry(plugin_root: Path | None) -> dict:
    """FlowAgent MCP サーバーの設定エントリを返す。"""
    env: dict[str, str] = {}

    if DATAVERSE_URL:
        env["DATAVERSE_URL"] = DATAVERSE_URL
    if SOLUTION_NAME:
        env["SOLUTION_NAME"] = SOLUTION_NAME
    if TENANT_ID:
        # Azure SDK / Azure CLI の両方が参照する標準環境変数
        env["AZURE_TENANT_ID"] = TENANT_ID

    if plugin_root:
        args = [str(plugin_root / _PLUGIN_MCP_JS)]
    else:
        # プラグイン未検出時はプレースホルダー（後で手動修正）
        args = ["<FLOW_MCP_PLUGIN_ROOT>/server/mcp.mjs"]

    return {
        "command": "node",
        "args": args,
        "env": env,
    }


def write_mcp_json(entry: dict, output_path: Path, dry_run: bool) -> None:
    """既存の .mcp.json に FlowAgent エントリをマージして書き込む。

    他の mcpServers エントリは保持する。
    """
    existing: dict = {}
    if output_path.exists():
        try:
            existing = json.loads(output_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            print(f"⚠ 既存 {output_path} の読み込みに失敗しました（上書き）: {exc}")

    existing.setdefault("mcpServers", {})
    existing["mcpServers"]["FlowAgent"] = entry

    content = json.dumps(existing, indent=2, ensure_ascii=False) + "\n"

    print(f"\n--- {output_path} ---")
    print(content)

    if dry_run:
        print("(--dry-run: ファイルは書き込まれません)")
        return

    output_path.write_text(content, encoding="utf-8")
    print(f"✅ {output_path} を作成/更新しました")

    # .gitignore チェック
    gitignore = output_path.parent / ".gitignore"
    entry_name = output_path.name
    if gitignore.exists():
        if entry_name not in gitignore.read_text(encoding="utf-8"):
            print(
                f"⚠ .gitignore に {entry_name} を追加することを推奨します:\n"
                f"  echo '{entry_name}' >> {gitignore}",
            )
    else:
        print(
            f"⚠ .gitignore が見つかりません。{entry_name} をコミットしないよう注意してください。",
        )


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Flow agent MCP SERVER の .mcp.json を生成し auth_helper で認証する",
    )
    parser.add_argument(
        "--plugin-root",
        default="",
        help="FlowAgent プラグインのルートパス（.env の FLOW_MCP_PLUGIN_ROOT より優先）",
    )
    parser.add_argument(
        "--output",
        default=".mcp.json",
        help="出力する .mcp.json のパス（既定: .mcp.json）",
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

    print("=== Flow agent MCP SERVER セットアップ ===\n")

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

    # ── auth_helper 認証 ─────────────────────────────────────────────
    if not args.skip_auth:
        auth_with_helper()

    # ── プラグイン探索 ────────────────────────────────────────────────
    plugin_root = find_plugin_root(args.plugin_root or None)

    # ── .mcp.json 生成 ────────────────────────────────────────────────
    entry = build_mcp_entry(plugin_root)
    write_mcp_json(entry, Path(args.output).resolve(), args.dry_run)

    # ── 次のステップ案内 ───────────────────────────────────────────────
    if not args.dry_run:
        print("\n=== 次のステップ ===")
        if plugin_root is None:
            print(
                "  1. Claude Code または Copilot CLI セッション内でプラグインをインストール:\n"
                "       /plugin marketplace add microsoft/power-platform-skills\n"
                "       /plugin install power-automate@power-platform-skills\n"
                "  2. --plugin-root を指定して本スクリプトを再実行してください。",
            )
        else:
            print(
                "  FlowAgent MCP が利用できます。\n"
                "  Claude Code / Copilot CLI を起動して以下のように指示してください:\n"
                "  「承認フローを作って。Dataverse の申請テーブルにレコードが作成されたら承認者にメール送信」",
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
