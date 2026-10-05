"""templates/agm-qa-author のスキルが、cowork の templates/agm-qa-plugin と同期しているかを確かめる。

Copilot Studio 版のスキルは Cowork 版と同じ手順で、違いは次だけにする（手で二重管理しない）:
  - ツールが使えないときの案内（Customize → Plugins ではなく、エージェントの Dataverse MCP ツールの接続）
  - 作成元の値（Cowork → Copilot Studio。更新してよい下書きは両方）
  - 作成者の変数名（COWORK_DEVELOPER_NAME → APP_DEVELOPER_NAME）

Cowork 版を直したら、次で Copilot Studio 版を作り直す:
  python .github/skills/copilot-studio-v2/tests/test_agm_qa_author_template.py --write
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

SKILLS = Path(__file__).resolve().parents[2]
COWORK = SKILLS / "cowork" / "templates" / "agm-qa-plugin" / "skills"
STUDIO = SKILLS / "copilot-studio-v2" / "templates" / "agm-qa-author" / "skills"
P = "${PUBLISHER_PREFIX}"

STOP_COWORK = re.compile(r"Cowork の Customize → Plugins → AGM Q&A Author で Dataverse MCP が(「接続済み」|接続済み)かを確認し、"
                         r"新しいタスクでやり直してください")
STOP_STUDIO = ("Copilot Studio のエージェント「AGM Q&A Author」で Dataverse MCP ツールの接続（自分の接続）が有効かを確認し、"
               "新しい会話でやり直してください")
REPLACEMENTS = [
    ("${COWORK_DEVELOPER_NAME}", "${APP_DEVELOPER_NAME}"),
    ("（コネクタはサーバーの全ツールを見せるため）", "（エージェントでは無効にしてあるが、見えても呼ばない）"),
    ("`_createdvia` が `Cowork` で `_status` が `下書き` の行だけ",
     "`_createdvia` が `Copilot Studio` または `Cowork` で `_status` が `下書き` の行だけ"),
    (f"`{P}_createdvia` = `Cowork`", f"`{P}_createdvia` = `Copilot Studio`"),
    ("`_createdvia` は `Cowork`", "`_createdvia` は `Copilot Studio`"),
    ("ラベル「下書き」「Cowork」", "ラベル「下書き」「Copilot Studio」"),
    (f'"{P}_createdvia": "Cowork"', f'"{P}_createdvia": "Copilot Studio"'),
    ("作成元は `Cowork`", "作成元は `Copilot Studio`"),
    ("既存が Cowork の下書きなら", "既存が Copilot Studio または Cowork で作った下書きなら"),
]


def port(text: str) -> str:
    text, n = STOP_COWORK.subn(STOP_STUDIO, text)
    if n != 1:
        raise ValueError(f"停止時の案内が 1 か所ではありません（{n} か所）。Cowork 版の文言が変わった可能性があります")
    for old, new in REPLACEMENTS:
        text = text.replace(old, new)
    return text


def expected() -> dict[str, str]:
    return {p.parent.name: port(p.read_text(encoding="utf-8")) for p in sorted(COWORK.glob("*/SKILL.md"))}


class AgmQaAuthorTemplateTests(unittest.TestCase):
    def test_same_skill_set(self):
        self.assertEqual(sorted(expected()), sorted(p.parent.name for p in STUDIO.glob("*/SKILL.md")))

    def test_skills_are_ported_from_cowork(self):
        for name, text in expected().items():
            with self.subTest(skill=name):
                self.assertEqual((STUDIO / name / "SKILL.md").read_text(encoding="utf-8"), text,
                                 "Cowork 版との差分があります。--write で作り直してください")

    def test_no_cowork_only_wording_left(self):
        for name, text in expected().items():
            leftovers = [line.strip() for line in text.splitlines()
                         if "Cowork" in line and "Copilot Studio" not in line]
            with self.subTest(skill=name):
                self.assertEqual(leftovers, [], "Cowork 固有の文言が残っています。REPLACEMENTS に追加してください")


if __name__ == "__main__":
    if "--write" in sys.argv:
        for name, text in expected().items():
            target = STUDIO / name / "SKILL.md"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding="utf-8")
            print(f"wrote {target.relative_to(SKILLS)}")
    else:
        unittest.main()
