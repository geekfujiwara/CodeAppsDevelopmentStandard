"""Copilot Managed Runtime アプリの push / deploy 前ゲート（読み取り専用。--build 時のみビルドを実行）。

検出するもの:
  NG  ms.config.json が無い / JSON として読めない
  NG  Code Apps の資産が混在（power.config.json、@microsoft/power-apps 依存）
  NG  @microsoft/managed-apps が dependencies に無い
  NG  .env が Git で追跡されている
  NG  （--stage deploy、Git 管理アプリ）未 commit の変更がある / HEAD が未 push
  NG  （--stage deploy）共有接続（sharedConnectionId あり）の allowedActions が不足（push 段階では WARN）
  NG  （--build）npm run build が失敗する
  WARN SDK / Vite plugin の版が固定されていない（Preview 中は固定を推奨。--strict で NG）
  WARN 既定 CSP（connect-src 'self'）で遮断される外部 URL への直接通信、index.html の外部 script / stylesheet
  WARN .gitignore に node_modules / dist / .env が無い

使い方:
    python validate_project.py --project ./my-app
    python validate_project.py --project ./my-app --stage deploy --build

終了コード: 0 = NG なし、1 = NG あり。
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

CONFIG_FILE = "ms.config.json"
SDK_PACKAGE = "@microsoft/managed-apps"
PINNED_PACKAGES = (SDK_PACKAGE, "@microsoft/managed-apps-vite-plugin", "@microsoft/managed-apps-cli")
TABLE_VERBS = {"get", "post", "patch", "delete"}
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"}
SKIP_DIRS = {"node_modules", "dist", "generated", ".git", "build", "coverage"}
DIRECT_CALL_RE = re.compile(
    r"""(?:\bfetch\s*\(|\baxios(?:\.[a-z]+)?\s*\(|new\s+(?:WebSocket|EventSource)\s*\(|\.open\s*\(\s*['"][A-Z]+['"]\s*,)\s*[`'"](https?://[^/`'"\s]+)""",
    re.IGNORECASE,
)
HTML_EXTERNAL_RE = re.compile(r"""<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*['"](https?://[^/'"\s]+)""", re.IGNORECASE)


class Report:
    def __init__(self, strict: bool = False) -> None:
        self.items: list[tuple[str, str]] = []
        self.strict = strict

    def ok(self, message: str) -> None:
        self.items.append(("OK", message))

    def warn(self, message: str, promote: bool = False) -> None:
        self.items.append(("NG" if promote and self.strict else "WARN", message))

    def ng(self, message: str) -> None:
        self.items.append(("NG", message))

    @property
    def has_ng(self) -> bool:
        return any(level == "NG" for level, _ in self.items)


def git(project: Path, *args: str) -> tuple[int, str]:
    executable = shutil.which("git")
    if executable is None:
        return 127, ""
    completed = subprocess.run(
        [executable, "-C", str(project), *args], capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    return completed.returncode, completed.stdout.strip()


def is_git_repo(project: Path) -> bool:
    code, output = git(project, "rev-parse", "--is-inside-work-tree")
    return code == 0 and output == "true"


def read_config(project: Path, report: Report) -> dict | None:
    path = project / CONFIG_FILE
    if not path.is_file():
        report.ng(f"{CONFIG_FILE} がありません。ms app create / ms app init で作成したアプリのルートを指定してください")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        report.ng(f"{CONFIG_FILE} を JSON として読めません（手編集しないこと）: {error}")
        return None
    if not isinstance(data, dict):
        report.ng(f"{CONFIG_FILE} がオブジェクトではありません")
        return None
    report.ok(f"{CONFIG_FILE} を読み込みました（repoType: {data.get('repoType', '未記載')}）")
    return data


def check_package(project: Path, report: Report) -> None:
    path = project / "package.json"
    if not path.is_file():
        report.ng("package.json がありません")
        return
    package = json.loads(path.read_text(encoding="utf-8"))
    dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
    if "@microsoft/power-apps" in dependencies:
        report.ng("@microsoft/power-apps（Code Apps SDK）が依存にあります。Managed Runtime では @microsoft/managed-apps を使い、混在させない")
    if SDK_PACKAGE not in package.get("dependencies", {}):
        report.ng(f"{SDK_PACKAGE} が dependencies にありません")
    for name in PINNED_PACKAGES:
        spec = dependencies.get(name)
        if spec is None:
            continue
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", spec):
            report.warn(f"{name} の版が固定されていません（{spec}）。Preview 中は正確な版に固定してください", promote=True)
        else:
            report.ok(f"{name} は {spec} に固定されています")


def check_code_apps_mix(project: Path, report: Report) -> None:
    if (project / "power.config.json").exists():
        report.ng("power.config.json（Code Apps の設定）があります。Managed Runtime アプリに Code Apps の設定を混在させない")


def check_gitignore(project: Path, report: Report, in_git: bool) -> None:
    gitignore = project / ".gitignore"
    entries = gitignore.read_text(encoding="utf-8").splitlines() if gitignore.is_file() else []
    normalized = {entry.strip().strip("/") for entry in entries}
    missing = [name for name in ("node_modules", "dist", ".env") if name not in normalized]
    if missing:
        report.warn(f".gitignore に {', '.join(missing)} がありません")
    if in_git:
        code, output = git(project, "ls-files", "--", ".env")
        if code == 0 and output:
            report.ng(".env が Git で追跡されています。git rm --cached .env で追跡を外し、秘密情報を再発行してください")


def iter_sources(project: Path):
    for path in project.rglob("*"):
        if any(part in SKIP_DIRS for part in path.relative_to(project).parts):
            continue
        if path.is_file() and path.suffix in SOURCE_SUFFIXES and not path.name.endswith(".config.ts"):
            yield path


def check_external_calls(project: Path, report: Report) -> None:
    findings: list[str] = []
    for path in iter_sources(project):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in DIRECT_CALL_RE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            findings.append(f"{path.relative_to(project).as_posix()}:{line} → {match.group(1)}")
    index = project / "index.html"
    if index.is_file():
        text = index.read_text(encoding="utf-8", errors="replace")
        for match in HTML_EXTERNAL_RE.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            findings.append(f"index.html:{line} → {match.group(1)}")
    if findings:
        report.warn(
            "既定 CSP で遮断される外部通信・外部リソースがあります。データは generated/ のサービス経由で呼ぶか、"
            "管理者に CSP ディレクティブの追加を依頼してください:\n    " + "\n    ".join(findings[:20])
        )
    else:
        report.ok("外部 URL への直接通信はありません")


def valid_actions(value) -> bool:
    return isinstance(value, list) and len(value) > 0 and all(isinstance(item, str) and item.strip() for item in value)


def check_shared_connection_policies(config: dict | None, report: Report, stage: str) -> None:
    """共有接続の allowedActions を ms app pack / deploy と同じ規則で検証する。"""
    references = (config or {}).get("connectionReferences") or {}
    if not isinstance(references, dict):
        return
    issues: list[str] = []
    shared = 0
    for name, reference in references.items():
        if not isinstance(reference, dict) or not str(reference.get("sharedConnectionId") or "").strip():
            continue
        shared += 1
        tables = [
            (f"{dataset}/{source}", table)
            for dataset, body in (reference.get("dataSets") or {}).items()
            for source, table in ((body or {}).get("dataSources") or {}).items()
        ]
        if "allowedActions" in reference and not valid_actions(reference["allowedActions"]):
            issues.append(f"{name}: 接続単位の allowedActions が空か空白を含みます")
        if tables:
            for path, table in tables:
                actions = (table or {}).get("allowedActions")
                if not valid_actions(actions):
                    issues.append(f"{name} → {path}: テーブル単位の allowedActions がありません")
                elif any(action not in TABLE_VERBS for action in actions):
                    issues.append(f"{name} → {path}: テーブルには {', '.join(sorted(TABLE_VERBS))} だけを指定します（{actions}）")
        elif "allowedActions" not in reference:
            issues.append(f"{name}: 接続単位の allowedActions（ms connector list-actions の Allow の id）がありません")
    if not issues:
        if shared:
            report.ok(f"共有接続 {shared} 件の allowedActions は宣言済みです")
        return
    message = "共有接続の allowedActions が不足しています（ms app pack / deploy が失敗します）:\n    " + "\n    ".join(issues)
    if stage == "deploy":
        report.ng(message)
    else:
        report.warn(message)


def check_deploy_state(project: Path, config: dict | None, report: Report, in_git: bool) -> None:
    repo_type = (config or {}).get("repoType")
    if repo_type == "none":
        report.ok("repoType: none のため、コミット状態の確認は省略します（外部成果物デプロイ）")
        return
    if not in_git:
        report.ng("Git リポジトリではありません。Git 管理アプリはコミット済みの内容からビルドされます")
        return
    code, output = git(project, "status", "--porcelain")
    if code == 0 and output:
        report.ng("未 commit の変更があります。preview / deploy は push 済みのコミットからビルドされます")
    code, output = git(project, "rev-list", "--count", "@{u}..HEAD")
    if code != 0:
        report.ng("上流ブランチが設定されていません。git push -u origin <branch> を実行してください")
    elif output != "0":
        report.ng(f"未 push のコミットが {output} 件あります。git push してから preview / deploy してください")
    else:
        report.ok("HEAD は push 済みです")


def run_build(project: Path, report: Report) -> None:
    npm = shutil.which("npm")
    if npm is None:
        report.ng("npm が見つかりません")
        return
    completed = subprocess.run([npm, "run", "build"], cwd=project, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0:
        tail = "\n    ".join((completed.stdout + completed.stderr).strip().splitlines()[-15:])
        report.ng(f"npm run build が失敗しました:\n    {tail}")
    else:
        report.ok("npm run build が成功しました")


def validate(project: Path, stage: str = "push", build: bool = False, strict: bool = False) -> Report:
    report = Report(strict=strict)
    in_git = is_git_repo(project)
    config = read_config(project, report)
    check_code_apps_mix(project, report)
    check_package(project, report)
    check_gitignore(project, report, in_git)
    check_external_calls(project, report)
    check_shared_connection_policies(config, report, stage)
    if stage == "deploy":
        check_deploy_state(project, config, report, in_git)
    if build:
        run_build(project, report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Copilot Managed Runtime アプリの push / deploy 前ゲート")
    parser.add_argument("--project", default=".", help="アプリのルート（ms.config.json がある場所）")
    parser.add_argument("--stage", choices=("push", "deploy"), default="push", help="deploy はコミット・push 状態も確認する")
    parser.add_argument("--build", action="store_true", help="npm run build も実行する")
    parser.add_argument("--strict", action="store_true", help="版の未固定を NG として扱う")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    report = validate(project, args.stage, args.build, args.strict)
    for level, message in report.items:
        print(f"[{level}] {message}")
    print("\n結果: " + ("NG があります。解消してから進んでください。" if report.has_ng else "NG はありません。"))
    return 1 if report.has_ng else 0


if __name__ == "__main__":
    sys.exit(main())
