"""スキルを PR 先リポジトリへ公開する（clone → branch → copy → validate → commit → push → PR）。

作業ディレクトリ（スキルを編集している場所）と PR 先リポジトリが**別**でも動く。
PR 先リポジトリを一時 clone し、対象スキルディレクトリと指定の集約ファイルをコピーして PR を作る。
既存の同名ブランチ/PR があれば**更新**する（新規 PR を切らない）。

前提: Git / GitHub CLI（gh, 認証済み）/ Python 3。`validate_skill.py` と同じフォルダに置く。

使い方:
  python publish_skill.py --skill copilot-studio-v2
  python publish_skill.py --skill copilot-studio-v2 --extra .github/skills/README.md --extra .github/agents/Foo.agent.md
  python publish_skill.py --skill copilot-studio-v2 --dry-run     # push/PR せず検証まで

設定（引数 > .env > 既定）:
  SKILL_PR_REPO        PR 先 owner/repo（必須）
  SKILL_PR_BASE_BRANCH ベースブランチ（既定 main）
  SKILLS_DIR           スキル配置ディレクトリ（既定 .github/skills）

終了コード: 成功 0 / 検証エラー・前提不足 1。
"""

from __future__ import annotations

import argparse
import os
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

DEFAULT_SKILLS_DIR = ".github/skills"
DEFAULT_BASE = "main"
HERE = Path(__file__).resolve().parent


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


def run(args: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    res = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if check and res.returncode != 0:
        sys.exit(f"コマンド失敗: {' '.join(args)}\n{res.stderr.strip() or res.stdout.strip()}")
    return res


def gh(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    exe = shutil.which("gh")
    if not exe:
        sys.exit("GitHub CLI(gh) が見つかりません。'gh auth login' を確認してください。")
    return run([exe, *args], check=check)


def git_identity() -> tuple[str, str]:
    """gh のログインユーザーから commit 用の name / noreply email を解決する。"""
    try:
        login = gh(["api", "user", "--jq", ".login"]).stdout.strip()
        uid = gh(["api", "user", "--jq", ".id"]).stdout.strip()
        if login:
            return login, f"{uid}+{login}@users.noreply.github.com" if uid else f"{login}@users.noreply.github.com"
    except SystemExit:
        pass
    return "skill-bot", "skill-bot@users.noreply.github.com"


def remote_branch_exists(repo: str, branch: str) -> bool:
    res = gh(["api", f"repos/{repo}/branches/{branch}", "--silent"], check=False)
    return res.returncode == 0


def main() -> int:
    ap = argparse.ArgumentParser(description="スキルを PR 先リポジトリへ公開する")
    ap.add_argument("--skill", required=True, help="公開するスキル名（フォルダ名）")
    ap.add_argument("--repo", help="PR 先 owner/repo（既定: .env SKILL_PR_REPO）")
    ap.add_argument("--base", help="ベースブランチ（既定: SKILL_PR_BASE_BRANCH または main）")
    ap.add_argument("--branch", help="作業ブランチ名（既定: skill/<skill>）")
    ap.add_argument("--skills-dir", help="スキル配置ディレクトリ（既定: SKILLS_DIR または .github/skills）")
    ap.add_argument("--extra", action="append", default=[], help="同時に反映する集約ファイル（リポジトリルート相対。複数可）")
    ap.add_argument("--title", help="PR タイトル（既定: 自動生成）")
    ap.add_argument("--body", help="PR 本文（既定: 自動生成）")
    ap.add_argument("--dry-run", action="store_true", help="push / PR を行わず検証まで")
    args = ap.parse_args()

    here = Path.cwd()
    load_env(here)
    repo = args.repo or os.environ.get("SKILL_PR_REPO", "")
    base = args.base or os.environ.get("SKILL_PR_BASE_BRANCH", DEFAULT_BASE)
    skills_dir = Path(args.skills_dir or os.environ.get("SKILLS_DIR", DEFAULT_SKILLS_DIR))
    branch = args.branch or f"skill/{args.skill}"

    if not repo or "/" not in repo:
        sys.exit("SKILL_PR_REPO（または --repo）に owner/repo を指定してください。")

    src_skill = skills_dir / args.skill
    if not (src_skill / "SKILL.md").is_file():
        sys.exit(f"スキルが見つからない: {src_skill}/SKILL.md")

    # 1) ローカル検証（push 前に必ず）
    print(f"[1/6] ローカル検証: {src_skill}")
    vres = run([sys.executable, str(HERE / "validate_skill.py"), str(src_skill)], check=False)
    print(vres.stdout.strip())
    if vres.returncode != 0:
        sys.exit("検証エラーがあります。修正してから再実行してください。")

    # 2) PR 先を一時 clone
    tmp = Path(tempfile.mkdtemp(prefix="skillpr_"))
    clone = tmp / "repo"
    print(f"[2/6] clone {repo} → {clone}")
    gh(["repo", "clone", repo, str(clone), "--", "--depth", "1", "--branch", base])

    # 3) ブランチ作成 or 既存更新
    exists = remote_branch_exists(repo, branch)
    if exists:
        print(f"[3/6] 既存ブランチを更新: {branch}")
        run(["git", "fetch", "origin", branch], cwd=clone)
        run(["git", "checkout", branch], cwd=clone)
    else:
        print(f"[3/6] 新規ブランチ: {branch}")
        run(["git", "checkout", "-b", branch], cwd=clone)

    # 4) スキル + 集約ファイルをコピー
    print("[4/6] 差分を反映")
    dst_skill = clone / skills_dir / args.skill
    if dst_skill.exists():
        shutil.rmtree(dst_skill)
    shutil.copytree(src_skill, dst_skill, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for extra in args.extra:
        srcf = here / extra
        if not srcf.is_file():
            sys.exit(f"--extra のファイルが無い: {srcf}")
        dstf = clone / extra
        dstf.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(srcf, dstf)
        print(f"   + {extra}")

    # 5) clone 側で再検証（push 前スキャン）
    print("[5/6] clone 側で再検証")
    vres2 = run([sys.executable, str(HERE / "validate_skill.py"), str(dst_skill)], check=False)
    print(vres2.stdout.strip())
    if vres2.returncode != 0:
        sys.exit("clone 側の検証でエラー。push を中止しました。")

    name, email = git_identity()
    run(["git", "-c", f"user.name={name}", "-c", f"user.email={email}", "add", "-A"], cwd=clone)
    status = run(["git", "status", "--short"], cwd=clone).stdout.strip()
    if not status:
        print("変更がありません（既に最新）。終了します。")
        shutil.rmtree(tmp, ignore_errors=True)
        return 0
    print(status)

    title = args.title or f"skill({args.skill}): スキルを追加/更新"
    run(["git", "-c", f"user.name={name}", "-c", f"user.email={email}",
         "commit", "-m", title], cwd=clone)

    if args.dry_run:
        print(f"[6/6] --dry-run: push / PR はスキップ。作業 clone: {clone}")
        return 0

    # 6) push + PR
    print(f"[6/6] push → PR ({repo})")
    run(["git", "push", "-u", "origin", branch], cwd=clone)
    if exists:
        pr = gh(["pr", "view", branch, "--repo", repo, "--json", "url", "--jq", ".url"], check=False)
        print("既存 PR を更新しました:", pr.stdout.strip() or f"(branch {branch})")
    else:
        body = args.body or f"スキル `{args.skill}` を追加/更新します。\n\n- validate_skill.py PASS\n- マージ順: 単独 PR（他のオープン PR と無関係なら番号順で可）"
        pr = gh(["pr", "create", "--repo", repo, "--base", base, "--head", branch,
                 "--title", title, "--body", body])
        print("PR を作成しました:", pr.stdout.strip())

    shutil.rmtree(tmp, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
