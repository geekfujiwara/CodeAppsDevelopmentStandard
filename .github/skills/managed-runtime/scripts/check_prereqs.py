"""Copilot Managed Runtime の開発前提を確認する（読み取り専用）。

確認項目:
  - Node.js >= 24.11.0（@microsoft/managed-apps-cli の engines）
  - Git >= 2.27.0
  - Git Credential Manager（platform-managed Git の認証に必須）
  - Git の user.name / user.email（ms app create の初回 commit に必須）
  - ms CLI（@microsoft/managed-apps-cli）の有無と版。.env の MANAGED_APPS_CLI_VERSION と比較
  - （--check-auth）ms auth status でサインイン済みか

使い方:
    python check_prereqs.py
    python check_prereqs.py --check-auth
    python check_prereqs.py --install-cli     # 固定版を npm install -g する

終了コード: 0 = NG なし、1 = NG あり。
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

MIN_NODE = (24, 11, 0)
MIN_GIT = (2, 27, 0)
CLI_PACKAGE = "@microsoft/managed-apps-cli"

results: list[tuple[str, str, str]] = []


def record(level: str, item: str, message: str) -> None:
    results.append((level, item, message))


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def parse_version(text: str) -> tuple[int, int, int] | None:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def run(command: list[str]) -> tuple[int, str]:
    executable = shutil.which(command[0])
    if executable is None:
        return 127, ""
    try:
        completed = subprocess.run(
            [executable, *command[1:]],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return 1, str(error)
    return completed.returncode, (completed.stdout + completed.stderr).strip()


def version_text(version: tuple[int, int, int]) -> str:
    return ".".join(str(part) for part in version)


def check_min_version(item: str, command: list[str], minimum: tuple[int, int, int], install_hint: str) -> None:
    code, output = run(command)
    if code == 127:
        record("NG", item, f"見つかりません。{install_hint}")
        return
    version = parse_version(output)
    if version is None:
        record("NG", item, f"版を判定できません: {output[:120]}")
        return
    if version < minimum:
        record("NG", item, f"{version_text(version)} は要件 >= {version_text(minimum)} を満たしません。{install_hint}")
        return
    record("OK", item, version_text(version))


def check_git_identity() -> None:
    missing = []
    for key in ("user.name", "user.email"):
        code, output = run(["git", "config", "--get", key])
        if code != 0 or not output:
            missing.append(key)
    if missing:
        record("NG", "Git identity", f"{', '.join(missing)} が未設定です。git config --global で設定してください")
    else:
        record("OK", "Git identity", "user.name / user.email 設定済み")


def check_credential_manager() -> None:
    code, output = run(["git", "credential-manager", "--version"])
    if code == 0:
        record("OK", "Git Credential Manager", output.splitlines()[0] if output else "installed")
        return
    record(
        "NG",
        "Git Credential Manager",
        "見つかりません。platform-managed Git の fetch / push に必要です。"
        " https://github.com/git-ecosystem/git-credential-manager を導入してください",
    )


def check_cli(pinned: str | None) -> bool:
    code, output = run(["ms", "--version"])
    install = f"npm install -g {CLI_PACKAGE}@{pinned}" if pinned else f"npm install -g {CLI_PACKAGE}"
    if code == 127:
        record("NG", "ms CLI", f"見つかりません。{install} で導入してください（npx ms は別パッケージなので使わない）")
        return False
    version = parse_version(output)
    if version is None:
        record("NG", "ms CLI", f"ms はありますが版を判定できません（別の ms を拾っている可能性）: {output[:120]}")
        return False
    if pinned and parse_version(pinned) and version != parse_version(pinned):
        record("WARN", "ms CLI", f"{version_text(version)}（.env の固定版 {pinned} と不一致。Preview 中は版を揃える: {install}）")
        return True
    record("OK", "ms CLI", version_text(version))
    return True


def check_auth() -> None:
    code, output = run(["ms", "auth", "status"])
    if code != 0 or not output or re.search(r"no (cached )?accounts?|not signed in", output, re.IGNORECASE):
        record("NG", "ms auth", "サインインしていません。ms auth login を実行してください")
        return
    lines = output.splitlines()
    active = next((line for line in lines if "*" in line), lines[0])
    record("OK", "ms auth", active.strip()[:160])


def install_cli(pinned: str | None) -> int:
    spec = f"{CLI_PACKAGE}@{pinned}" if pinned else CLI_PACKAGE
    npm = shutil.which("npm")
    if npm is None:
        print("[NG] npm が見つかりません", file=sys.stderr)
        return 1
    print(f"npm install -g {spec}")
    return subprocess.run([npm, "install", "-g", spec]).returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot Managed Runtime の開発前提を確認する")
    parser.add_argument("--env", default=".env", help="固定版などを読む .env（既定: .env）")
    parser.add_argument("--check-auth", action="store_true", help="ms auth status も確認する")
    parser.add_argument("--install-cli", action="store_true", help="MANAGED_APPS_CLI_VERSION の版を npm install -g する")
    args = parser.parse_args()

    env = load_env(Path(args.env))
    pinned = env.get("MANAGED_APPS_CLI_VERSION") or None

    if args.install_cli:
        code = install_cli(pinned)
        if code != 0:
            return code

    check_min_version("Node.js", ["node", "--version"], MIN_NODE, "https://nodejs.org/ から LTS (>= 24.11.0) を導入してください")
    check_min_version("Git", ["git", "--version"], MIN_GIT, "https://git-scm.com/ から導入してください")
    check_credential_manager()
    check_git_identity()
    cli_ok = check_cli(pinned)
    if args.check_auth and cli_ok:
        check_auth()

    for level, item, message in results:
        print(f"[{level}] {item}: {message}")
    has_ng = any(level == "NG" for level, _, _ in results)
    print("\n結果: " + ("NG があります。解消してから次へ進んでください。" if has_ng else "前提を満たしています。"))
    return 1 if has_ng else 0


if __name__ == "__main__":
    sys.exit(main())
