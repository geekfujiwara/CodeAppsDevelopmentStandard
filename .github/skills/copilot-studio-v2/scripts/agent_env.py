"""deploy_agent.py / update_agent.py / attach_skill.py が共有する入力の扱い。

- --env-file: エージェントごとの設定ファイル（KEY=VALUE）を読み、そのフォルダを作業フォルダにする。
  相対パス（instructions.md / prompts.json / skills）と agent_botid.txt がそのフォルダ基準になる。
  プロジェクト直下の .env（認証・DATAVERSE_URL）より優先する。
- SKILL_DIR が SKILL.md を持たず、直下のフォルダが SKILL.md を持つ場合は、各フォルダを 1 スキルとして添付する。
- SKILL_DESCRIPTION が無ければ SKILL.md の frontmatter の description を使う。
"""
from __future__ import annotations

import os
import re
from pathlib import Path


def load_env_file(argv: list[str]) -> list[str]:
    """argv の --env-file <path> を取り除いて読み込む。残りの引数を返す。"""
    if "--env-file" not in argv:
        return argv
    i = argv.index("--env-file")
    if i + 1 >= len(argv):
        raise SystemExit("--env-file にファイルのパスを指定してください。")
    path = Path(argv[i + 1]).resolve()
    if not path.is_file():
        raise SystemExit(f"--env-file が見つかりません: {path}")
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip("'\"")
    os.chdir(path.parent)
    print(f"設定ファイル: {path}（作業フォルダ: {path.parent}）")
    return argv[:i] + argv[i + 2:]


def skill_dirs(skill_dir: Path) -> list[Path]:
    """添付するスキルのフォルダ。SKILL_DIR 自体がスキルならそれだけ、親フォルダなら SKILL.md を持つ子すべて。"""
    if not skill_dir.is_dir():
        return []
    if (skill_dir / "SKILL.md").is_file():
        return [skill_dir]
    return sorted(p for p in skill_dir.iterdir() if p.is_dir() and (p / "SKILL.md").is_file())


def skill_description(skill_md: Path) -> str:
    """frontmatter の description（1 行・ブロック `|` / `>` の両方）を 1 行にして返す。無ければ空。"""
    text = skill_md.read_text(encoding="utf-8")
    m = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.S)
    if not m:
        return ""
    lines = m.group(1).splitlines()
    for i, line in enumerate(lines):
        dm = re.match(r"^description:\s*(.*)$", line)
        if not dm:
            continue
        head = dm.group(1).strip()
        if head and head not in ("|", ">", "|-", ">-"):
            return head.strip("'\"")
        body = []
        for nxt in lines[i + 1:]:
            if nxt and not nxt[0].isspace():
                break
            body.append(nxt.strip())
        return " ".join(b for b in body if b)
    return ""


def attach_env(skill: Path, multi: bool) -> dict[str, str]:
    """attach_skill.py に渡す環境変数。複数スキルのときは名前と説明をフォルダから決める。"""
    env = os.environ.copy()
    env["SKILL_DIR"] = str(skill)
    if multi or not env.get("SKILL_NAME"):
        env["SKILL_NAME"] = skill.name
    if multi:
        env.pop("SKILL_DESCRIPTION", None)
    return env
