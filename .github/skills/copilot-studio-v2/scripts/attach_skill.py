"""
フラット Python スキルバンドルを cliagent エージェントに添付する。

ソース解析で判明した構造を再現する:
  - type=9  InlineAgentSkill（スキル本体, data 列）   親 = parentbotid → /bots(...)
  - type=14 FileAttachmentComponent（同梱ファイル）   親 = ParentBotComponentId → /botcomponents(skill)
            filedata は PATCH /botcomponents({id})/filedata に生バイト + x-ms-file-name で投入

フラット構成: サブフォルダなし。SKILL_DIR 直下のファイルをすべて同一階層で同梱する。

.env / 引数:
  AGENT_BOTID         対象 Bot の botid（未指定なら agent_botid.txt を読む）
  SKILL_DIR           スキルディレクトリ（既定: skill）
  SKILL_NAME          スキル名（既定: ディレクトリ名）
  SKILL_DESCRIPTION   スキルの説明（任意）
  AGENT_SCHEMA        Bot スキーマ名（skill コンポーネント schemaname 生成に使用）
  PUBLISHER_PREFIX    file コンポーネント schemaname の prefix（既定: geek）

実行: python attach_skill.py [SKILL_DIR]
"""
from __future__ import annotations

import os
import re
import sys
import uuid
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
_STD = Path(__file__).resolve().parents[2] / "standard" / "scripts"
sys.path.insert(0, str(_STD))
from auth_helper import get_session, DATAVERSE_URL  # noqa: E402

API = f"{DATAVERSE_URL}/api/data/v9.2"

BOT_ID = os.getenv("AGENT_BOTID") or (
    Path("agent_botid.txt").read_text(encoding="utf-8").strip()
    if Path("agent_botid.txt").exists()
    else ""
)
SKILL_DIR = Path(sys.argv[1] if len(sys.argv) > 1 else os.getenv("SKILL_DIR", "skill"))
SKILL_NAME = os.getenv("SKILL_NAME") or SKILL_DIR.name
SKILL_DESC = os.getenv("SKILL_DESCRIPTION", f"{SKILL_NAME} (flat Python skill)")
BOT_SCHEMA = os.getenv("AGENT_SCHEMA", "geek_agent")
PREFIX = os.getenv("PUBLISHER_PREFIX", "geek")

# 同梱対象（フラット）: SKILL.md 必須 + .py / 画像など。__pycache__ は除外
INCLUDE_EXT = {".md", ".py", ".png", ".jpg", ".jpeg", ".json", ".txt", ".csv"}


def hx(n: int = 12) -> str:
    return uuid.uuid4().hex[:n]


def sanitize(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def collect_files() -> list[Path]:
    files: list[Path] = []
    for p in sorted(SKILL_DIR.iterdir()):
        if p.is_file() and p.suffix.lower() in INCLUDE_EXT:
            files.append(p)
    if not any(f.name == "SKILL.md" for f in files):
        print(f"⚠️ {SKILL_DIR}/SKILL.md が見つかりません", file=sys.stderr)
    return files


def cleanup(sess) -> None:
    """同名スキル（type=9）と子（type=14）を削除して冪等にする。"""
    q = (
        f"{API}/botcomponents?$select=botcomponentid&"
        f"$filter=_parentbotid_value eq {BOT_ID} and name eq '{SKILL_NAME}' and componenttype eq 9"
    )
    for comp in sess.get(q).json().get("value", []):
        sid = comp["botcomponentid"]
        kids = sess.get(
            f"{API}/botcomponents?$select=botcomponentid&$filter=_parentbotcomponentid_value eq {sid}"
        ).json().get("value", [])
        for k in kids:
            sess.delete(f"{API}/botcomponents({k['botcomponentid']})")
        sess.delete(f"{API}/botcomponents({sid})")
        print(f"  🧹 既存スキル削除: {sid}")


def main() -> None:
    if not BOT_ID:
        print("AGENT_BOTID 未設定。agent_botid.txt も無し。", file=sys.stderr)
        sys.exit(1)
    if not SKILL_DIR.is_dir():
        print(f"スキルディレクトリが無い: {SKILL_DIR}", file=sys.stderr)
        sys.exit(1)

    sess = get_session()
    cleanup(sess)
    bundle_id = f"crskill_{sanitize(SKILL_NAME)}_zip_{hx(12)}"

    # 1) skill コンポーネント（type=9 InlineAgentSkill）
    skill_schema = f"{BOT_SCHEMA}.skill.{sanitize(SKILL_NAME)}_{hx(3)}"
    skill_body = {
        "name": SKILL_NAME,
        "schemaname": skill_schema,
        "componenttype": 9,
        "description": SKILL_DESC,
        "data": f"kind: InlineAgentSkill\r\ncontent: <!-- bic:bundle={bundle_id} -->",
        "parentbotid@odata.bind": f"/bots({BOT_ID})",
    }
    r = sess.post(f"{API}/botcomponents", json=skill_body, headers={"Prefer": "return=representation"})
    if r.status_code not in (200, 201):
        print("skill 作成失敗:", r.status_code, r.text[:1500], file=sys.stderr)
        sys.exit(1)
    skill_id = r.json()["botcomponentid"]
    print(f"✅ skill コンポーネント: {skill_id} ({skill_schema})")

    # 2) 各ファイルを type=14 として作成 + filedata アップロード
    for path in collect_files():
        fname = path.name
        data = path.read_bytes()
        file_schema = f"{PREFIX}_{sanitize(fname)}_{hx(12)}"
        file_body = {
            "name": fname,
            "schemaname": file_schema,
            "componenttype": 14,
            "parentbotid@odata.bind": f"/bots({BOT_ID})",
            "ParentBotComponentId@odata.bind": f"/botcomponents({skill_id})",
        }
        rr = sess.post(f"{API}/botcomponents", json=file_body, headers={"Prefer": "return=representation"})
        if rr.status_code not in (200, 201):
            print(f"  file 作成失敗 {fname}:", rr.status_code, rr.text[:1000], file=sys.stderr)
            sys.exit(1)
        comp_id = rr.json()["botcomponentid"]

        up = sess.patch(
            f"{API}/botcomponents({comp_id})/filedata",
            data=data,
            headers={"Content-Type": "application/octet-stream", "x-ms-file-name": fname},
        )
        if up.status_code not in (200, 204):
            print(f"  filedata アップロード失敗 {fname}:", up.status_code, up.text[:800], file=sys.stderr)
            sys.exit(1)
        print(f"  ✅ {fname}  -> {comp_id}  ({len(data)} bytes)")

    print(f"\n✅ スキル '{SKILL_NAME}' を添付完了。bot={BOT_ID}")
    print("検証: python verify_agent.py")


if __name__ == "__main__":
    main()
