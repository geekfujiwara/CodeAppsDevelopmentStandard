"""Copilot Managed Runtime アプリを、リポジトリ方式を明示して作成する。

リポジトリ方式は作成後に変更できないため、`--repo-mode` の指定を必須にし、
`ms app create` を呼ぶ前に次を検証する（1 件でも NG なら CLI を呼ばない）。

  - 作成先: 存在しない、または空であること
  - 作成先に ms.config.json がある → 初回 GCM 認証失敗の後に再作成しようとしている（NG）
  - 作成先の親に ms.config.json がある → アプリの入れ子（NG）
  - github: URL が https:// かつ github.com / *.ghe.com の <owner>/<repo> 形式であること
            gh CLI が使えれば private かつ空であることも確認する
  - none : 外部成果物のデプロイ許可（管理者設定）が必要であることを警告する

使い方:
    python create_app.py --display-name "Expense Tracker" --dir ./expense-tracker --repo-mode platform --dry-run
    python create_app.py --display-name "Expense Tracker" --dir ./expense-tracker `
        --repo-mode github --repo-url https://github.com/<org>/<repo>

値は引数 → .env（MANAGED_APP_*）の順で解決する。
終了コード: 0 = 成功（または dry-run 成功）、1 = 事前検証 NG、2 = 入力エラー、その他 = ms CLI の終了コード。
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

REPO_MODES = ("platform", "github", "none")
CONFIG_FILE = "ms.config.json"


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


def validate_repo_url(url: str) -> list[str]:
    """ms app create --repo に渡せる GitHub URL か検証し、問題点を返す。"""
    errors: list[str] = []
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https":
        errors.append("URL は https:// で始まる完全な形式にしてください（contoso.ghe.com/... のような省略形は拒否されます）")
    if host in ("dev.azure.com", "ssh.dev.azure.com") or host.endswith(".visualstudio.com"):
        errors.append(
            "CLI の --repo は Azure DevOps Repos に対応していません（Learn 記載）。"
            " GitHub.com / GitHub Enterprise Cloud を使うか、platform / none を選んでください"
        )
        return errors
    if host and host != "github.com" and not host.endswith(".ghe.com"):
        errors.append(f"対応ホストは github.com と *.ghe.com のみです（GitHub Enterprise Server は非対応）: {host}")
    segments = [segment for segment in parsed.path.split("/") if segment]
    if len(segments) != 2:
        errors.append("URL は https://<host>/<owner>/<repo> の形式にしてください")
    return errors


def owner_repo(url: str) -> tuple[str, str, str]:
    parsed = urlparse(url)
    owner, repo = [segment for segment in parsed.path.split("/") if segment][:2]
    if repo.endswith(".git"):
        repo = repo[:-4]
    return (parsed.hostname or "").lower(), owner, repo


def check_target(target: Path) -> list[str]:
    errors: list[str] = []
    if (target / CONFIG_FILE).exists():
        errors.append(
            f"{target} には既に {CONFIG_FILE} があります。アプリは作成済みです。"
            " 初回の Git 認証失敗なら ms app create を再実行せず、作成先で git fetch origin を実行してください"
        )
        return errors
    if target.exists() and not target.is_dir():
        errors.append(f"{target} はファイルです")
    elif target.exists() and any(target.iterdir()):
        errors.append(f"{target} は空ではありません。新しいフォルダーを指定してください")
    for parent in target.resolve().parents:
        if (parent / CONFIG_FILE).exists():
            errors.append(f"{parent} は既存アプリのルートです。アプリを入れ子にせず、兄弟フォルダーに作成してください")
            break
    return errors


def gh_json(args: list[str]) -> tuple[int, object | None, str]:
    gh = shutil.which("gh")
    if gh is None:
        return 127, None, "gh が見つかりません"
    completed = subprocess.run(
        [gh, "api", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60
    )
    if completed.returncode != 0:
        return completed.returncode, None, (completed.stderr or completed.stdout).strip()
    try:
        return 0, json.loads(completed.stdout or "null"), ""
    except json.JSONDecodeError:
        return 0, None, completed.stdout.strip()


def check_github_repo(url: str, allow_public: bool) -> tuple[list[str], list[str]]:
    """private かつ空であることを gh で確認する。確認できないときは警告に留める。"""
    errors: list[str] = []
    warnings: list[str] = []
    host, owner, repo = owner_repo(url)
    host_args = [] if host == "github.com" else ["--hostname", host]
    code, data, message = gh_json([*host_args, f"repos/{owner}/{repo}"])
    if code != 0 or not isinstance(data, dict):
        warnings.append(f"gh でリポジトリを確認できませんでした（{message[:160]}）。private かつ空であることを手動で確認してください")
        return errors, warnings
    if not data.get("private") and not allow_public:
        errors.append("public リポジトリは既定で禁止されています（管理者設定）。private リポジトリを使ってください")
    code, _, message = gh_json([*host_args, f"repos/{owner}/{repo}/commits?per_page=1"])
    if code == 0:
        errors.append("リポジトリにコミットがあります。ms app create --repo には既存の空リポジトリを指定してください")
    elif "empty" not in message.lower():
        warnings.append(f"リポジトリが空か確認できませんでした（{message[:160]}）")
    return errors, warnings


def build_command(
    display_name: str,
    directory: str,
    repo_mode: str,
    repo_url: str | None = None,
    environment_id: str | None = None,
    description: str | None = None,
    template: str | None = None,
) -> list[str]:
    command = ["ms", "app", "create", directory, "--display-name", display_name]
    if repo_mode == "github":
        command += ["--repo", repo_url or ""]
    elif repo_mode == "none":
        command += ["--repo", "none"]
    if environment_id:
        command += ["--environment-id", environment_id]
    if description:
        command += ["--description", description]
    if template:
        command += ["--template", template]
    command.append("--non-interactive")
    return command


def main() -> int:
    parser = argparse.ArgumentParser(description="リポジトリ方式を明示して Copilot Managed Runtime アプリを作成する")
    parser.add_argument("--env", default=".env", help="既定値を読む .env（既定: .env）")
    parser.add_argument("--display-name", help="アプリの表示名（MANAGED_APP_DISPLAY_NAME）")
    parser.add_argument("--dir", help="作成先フォルダー（MANAGED_APP_DIR）。存在しないか空であること")
    parser.add_argument("--repo-mode", choices=REPO_MODES, help="platform / github / none（MANAGED_APP_REPO_MODE）。作成後は変更不可")
    parser.add_argument("--repo-url", help="github のときの空の private リポジトリ URL（MANAGED_APP_REPO_URL）")
    parser.add_argument("--environment-id", help="対象環境。省略時は開発者環境へ自動ルーティング（MANAGED_APP_ENVIRONMENT_ID）")
    parser.add_argument("--description", help="アプリの説明")
    parser.add_argument("--template", help="scaffold 元（github:owner/repo/subdir）。省略時は組み込み Vite テンプレート")
    parser.add_argument("--allow-public", action="store_true", help="管理者が public GitHub を許可している場合だけ指定")
    parser.add_argument("--skip-remote-check", action="store_true", help="gh による private / 空の確認を省略する")
    parser.add_argument("--dry-run", action="store_true", help="検証して実行コマンドを表示するだけ")
    args = parser.parse_args()

    env = load_env(Path(args.env))
    display_name = args.display_name or env.get("MANAGED_APP_DISPLAY_NAME")
    directory = args.dir or env.get("MANAGED_APP_DIR")
    repo_mode = args.repo_mode or env.get("MANAGED_APP_REPO_MODE")
    repo_url = args.repo_url or env.get("MANAGED_APP_REPO_URL") or None
    environment_id = args.environment_id or env.get("MANAGED_APP_ENVIRONMENT_ID") or None

    missing = [name for name, value in (("--display-name", display_name), ("--dir", directory), ("--repo-mode", repo_mode)) if not value]
    if missing:
        print(f"[NG] 必須の値がありません: {', '.join(missing)}（引数か .env で指定）", file=sys.stderr)
        return 2
    if repo_mode not in REPO_MODES:
        print(f"[NG] --repo-mode は {' / '.join(REPO_MODES)} のいずれかです: {repo_mode}", file=sys.stderr)
        return 2
    if repo_mode == "github" and not repo_url:
        print("[NG] --repo-mode github には --repo-url が必要です", file=sys.stderr)
        return 2
    if repo_mode != "github" and repo_url:
        print(f"[NG] --repo-url は --repo-mode github のときだけ指定します（現在: {repo_mode}）", file=sys.stderr)
        return 2

    errors = check_target(Path(directory))
    warnings: list[str] = []
    if repo_mode == "github":
        url_errors = validate_repo_url(repo_url or "")
        errors += url_errors
        if not url_errors and not args.skip_remote_check:
            remote_errors, remote_warnings = check_github_repo(repo_url or "", args.allow_public)
            errors += remote_errors
            warnings += remote_warnings
        warnings.append("対象の GitHub organization / repository に Microsoft Managed Apps GitHub App を導入済みであること")
    if repo_mode == "none":
        warnings.append("外部成果物のデプロイ（Allow external artifact deployment）は既定で無効です。管理者に有効化を依頼してください")
        warnings.append("この方式ではプラットフォームの preview / rollback を使わず、自前の CI でビルド・デプロイします")
    if shutil.which("ms") is None:
        message = "ms CLI が見つかりません。check_prereqs.py --install-cli で導入してください"
        (warnings if args.dry_run else errors).append(message)

    for warning in warnings:
        print(f"[WARN] {warning}")
    for error in errors:
        print(f"[NG] {error}")
    if errors:
        print("\n事前検証で NG があるため ms app create を実行しません。")
        return 1

    command = build_command(display_name, directory, repo_mode, repo_url, environment_id, args.description, args.template)
    print("実行コマンド: " + subprocess.list2cmdline(command))
    print(f"リポジトリ方式: {repo_mode}（作成後は変更できません）")
    if args.dry_run:
        print("dry-run のため実行しません。")
        return 0

    executable = shutil.which("ms")
    completed = subprocess.run([executable or "ms", *command[1:]])
    if completed.returncode != 0:
        if (Path(directory) / CONFIG_FILE).exists():
            print(
                "\n[HINT] アプリと scaffold は作成済みです。初回の Git 認証失敗なら、ms app create を再実行せず"
                f" 作成先で git fetch origin を実行してください: cd {directory}"
            )
        return completed.returncode
    print("\n作成しました。次: cd " + directory + " → npm install → ms app dev")
    return 0


if __name__ == "__main__":
    sys.exit(main())
