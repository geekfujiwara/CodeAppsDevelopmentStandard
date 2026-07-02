"""対象スキルに触れているオープン PR を検出し、更新/新規とマージ順を提示する。

GitHub CLI（gh、認証済み）を使う read-only ツール。git や PR の変更は行わない。
判定結果は SKILL.md の Step 5 / references/pr-strategy.md に従って人間（エージェント）が実行する。

使い方:
  python manage_skill_pr.py --skill <skill-name>
  python manage_skill_pr.py --skill <skill-name> --repo owner/repo
  python manage_skill_pr.py --list            # オープン PR 一覧のみ

設定（引数 > .env > 既定）:
  SKILL_PR_REPO        対象リポジトリ owner/repo
  SKILL_PR_BASE_BRANCH ベースブランチ（既定 main）
  SKILLS_DIR           スキル配置ディレクトリ（既定 .github/skills）
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_SKILLS_DIR = ".github/skills"
DEFAULT_BASE = "main"


def load_env(start: Path) -> None:
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


def gh(args: list[str]) -> str:
    exe = shutil.which("gh")
    if not exe:
        sys.exit("GitHub CLI(gh) が見つかりません。インストールと 'gh auth login' を確認してください。")
    res = subprocess.run([exe, *args], capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"gh 失敗: {' '.join(args)}\n{res.stderr.strip()}")
    return res.stdout


def list_open_prs(repo: str) -> list[dict]:
    out = gh([
        "pr", "list", "--repo", repo, "--state", "open",
        "--json", "number,title,headRefName,baseRefName,updatedAt,files",
        "--limit", "100",
    ])
    return json.loads(out or "[]")


def main() -> int:
    ap = argparse.ArgumentParser(description="スキルに関連するオープン PR を検出し更新/新規を提案")
    ap.add_argument("--skill", help="対象スキル名（kebab-case）")
    ap.add_argument("--repo", help="owner/repo（既定: .env SKILL_PR_REPO）")
    ap.add_argument("--skills-dir", help="スキル配置ディレクトリ（既定: .env SKILLS_DIR）")
    ap.add_argument("--list", action="store_true", help="オープン PR 一覧のみ表示")
    args = ap.parse_args()

    load_env(Path.cwd())
    repo = args.repo or os.environ.get("SKILL_PR_REPO")
    if not repo:
        sys.exit("対象リポジトリが未指定です（--repo または .env の SKILL_PR_REPO）。")
    base = os.environ.get("SKILL_PR_BASE_BRANCH", DEFAULT_BASE)
    skills_dir = args.skills_dir or os.environ.get("SKILLS_DIR", DEFAULT_SKILLS_DIR)

    prs = list_open_prs(repo)
    print(f"リポジトリ: {repo} / ベース: {base} / オープン PR: {len(prs)} 件\n")

    if args.list or not args.skill:
        for p in prs:
            print(f"  #{p['number']} [{p['headRefName']}] {p['title']}  ({len(p.get('files', []))} files)")
        if not args.skill:
            print("\n--skill <name> を指定すると更新/新規の判定を表示します。")
        return 0

    skill_path = f"{skills_dir.rstrip('/')}/{args.skill}/"
    related: list[dict] = []
    others: list[dict] = []
    for p in prs:
        paths = [f.get("path", "") for f in p.get("files", [])]
        if any(fp.startswith(skill_path) for fp in paths):
            related.append(p)
        else:
            others.append(p)

    print(f"対象スキルパス: {skill_path}\n")
    if related:
        print("=== 関連するオープン PR（→ 更新を推奨） ===")
        for p in related:
            print(f"  #{p['number']} [{p['headRefName']}] {p['title']}")
        rec = related[0]
        print("\n判定: 既存 PR を更新（新規ブランチを切らない）")
        print(f"  対象ブランチ: {rec['headRefName']}（PR #{rec['number']}）")
        print("  手順: git fetch → checkout <branch> → 変更反映 → validate_skill.py → git push")
    else:
        print("=== 関連するオープン PR: なし → 新規 PR で OK ===")
        print(f"  推奨ブランチ名: feat/skill-{args.skill}")
        print(f"  gh pr create --repo {repo} --base {base} --head feat/skill-{args.skill}")
        if others:
            print("\nマージ順の提案（無関係 PR がある場合の目安）:")
            print("  - 小さく独立した PR / 共通ファイル（README 等）に触れる PR を先にマージ")
            for p in others:
                touches_readme = any(
                    f.get("path", "").endswith("README.md") for f in p.get("files", [])
                )
                tag = " (共通ファイルに触れる→先行推奨)" if touches_readme else ""
                print(f"    1. #{p['number']} {p['title']}{tag}")
            print(f"    2. （本スキル feat/skill-{args.skill} は上記マージ後にリベース）")

    print("\n詳細な戦略: references/pr-strategy.md を参照。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
