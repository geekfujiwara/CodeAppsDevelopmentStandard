"""Power Pages デプロイ前提チェックスクリプト.

以下を検証し、不足があれば次のアクションを提示する:
- pac CLI が利用可能か
- node / npm が利用可能か
- az CLI が利用可能か（任意）
- .powerpages-site マーカーファイルが存在するか
- pac auth のアクティブプロファイルが存在するか
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 設定
# ---------------------------------------------------------------------------

SITE_PATH = os.environ.get("POWERPAGES_SITE_PATH", ".")

# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------


def _run(cmd: list[str], check: bool = False) -> subprocess.CompletedProcess:
    """サブプロセスを実行し結果を返す."""
    try:
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            check=check,
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="not found")
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="timeout")


def _check_command(name: str, version_args: list[str] | None = None) -> tuple[bool, str]:
    """コマンドの存在とバージョンを確認する."""
    path = shutil.which(name)
    if not path:
        return False, ""
    args = version_args or [name, "--version"]
    result = _run(args)
    version = result.stdout.strip().split("\n")[0] if result.returncode == 0 else "unknown"
    return True, version


# ---------------------------------------------------------------------------
# チェック項目
# ---------------------------------------------------------------------------


def check_pac() -> tuple[bool, str]:
    """pac CLI の存在を確認."""
    found, version = _check_command("pac", ["pac", "--version"])
    return found, version


def check_node() -> tuple[bool, str]:
    """node の存在を確認."""
    found, version = _check_command("node", ["node", "--version"])
    return found, version


def check_npm() -> tuple[bool, str]:
    """npm の存在を確認."""
    found, version = _check_command("npm", ["npm", "--version"])
    return found, version


def check_az() -> tuple[bool, str]:
    """az CLI の存在を確認（任意）."""
    found, version = _check_command("az", ["az", "--version"])
    return found, version


def check_powerpages_site() -> tuple[bool, str]:
    """.powerpages-site マーカーファイルの存在を確認."""
    site_path = Path(SITE_PATH)
    marker = site_path / ".powerpages-site"
    if marker.exists():
        return True, str(marker.resolve())
    return False, str(marker)


def check_pac_auth() -> tuple[bool, str]:
    """pac auth のアクティブプロファイルを確認."""
    # PAC_AUTH_PROFILE 環境変数での指定
    auth_profile = os.environ.get("PAC_AUTH_PROFILE")
    if auth_profile:
        return True, f"env:PAC_AUTH_PROFILE={auth_profile}"

    # pac auth list でアクティブプロファイルを確認
    result = _run(["pac", "auth", "list"])
    if result.returncode != 0:
        return False, "pac auth list failed"

    # アクティブプロファイルは先頭に * マークが付く
    for line in result.stdout.split("\n"):
        stripped_line = line.strip()
        if not stripped_line:
            continue
        if line.lstrip().startswith("*"):
            return True, stripped_line

    # 出力があればプロファイル自体は存在する
    if result.stdout.strip():
        return False, "プロファイルは存在するがアクティブなものがない"

    return False, "認証プロファイルなし"


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------


def main() -> int:
    """全チェックを実行し結果を表示する."""
    print("=" * 60)
    print("Power Pages 前提チェック")
    print("=" * 60)
    print()

    errors: list[str] = []
    warnings: list[str] = []

    # 必須: pac
    ok, info = check_pac()
    if ok:
        print(f"  ✅ pac CLI: {info}")
    else:
        print("  ❌ pac CLI: 未検出")
        errors.append("pac CLI をインストール: npm install -g @microsoft/power-apps-cli")

    # 必須: node
    ok, info = check_node()
    if ok:
        print(f"  ✅ node: {info}")
    else:
        print("  ❌ node: 未検出")
        errors.append("Node.js 18+ をインストール: https://nodejs.org/")

    # 必須: npm
    ok, info = check_npm()
    if ok:
        print(f"  ✅ npm: {info}")
    else:
        print("  ❌ npm: 未検出")
        errors.append("npm をインストール（Node.js に同梱）")

    # 任意: az
    ok, info = check_az()
    if ok:
        print(f"  ✅ az CLI: {info}")
    else:
        print(f"  ⚠️  az CLI: 未検出（任意）")
        warnings.append("az CLI は Azure 連携時のみ必要")

    print()

    # 必須: .powerpages-site
    ok, info = check_powerpages_site()
    if ok:
        print(f"  ✅ .powerpages-site: {info}")
    else:
        print(f"  ❌ .powerpages-site: 未検出 ({info})")
        errors.append(
            f".powerpages-site ファイルを作成: touch {info}"
        )

    # 必須: pac auth
    ok, info = check_pac_auth()
    if ok:
        print(f"  ✅ pac auth: {info}")
    else:
        print(f"  ❌ pac auth: {info}")
        errors.append(
            "pac auth を設定: pac auth create --environment {{ENVIRONMENT_ID}}"
        )

    print()
    print("-" * 60)

    if errors:
        print()
        print("❌ 次のアクションが必要です:")
        print()
        for i, err in enumerate(errors, 1):
            print(f"  {i}. {err}")
        print()
        return 1

    if warnings:
        print()
        print("⚠️  注意事項:")
        for w in warnings:
            print(f"  - {w}")
        print()

    print()
    print("✅ すべての前提条件を満たしています。デプロイ可能です。")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
