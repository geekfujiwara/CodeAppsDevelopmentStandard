"""SKILL.md をセクション（## 見出し）単位でトークン概算し、分割候補を提示する。

本文が Anthropic 上限（5,000 語 ≈ 6,500 トークン）を超えたとき、どのセクションを
references/ へ逃がせばよいか（progressive disclosure）を判断するために使う。
トークン概算は validate_skill.py の estimate_tokens を共有する（ASCII≈4文字/トークン、
日本語等の非 ASCII≈1文字/トークン）。

使い方:
  python section_tokens.py <skill-dir|SKILL.md>     # 例: .github/skills/architecture
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_skill import estimate_tokens  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
except Exception:
    pass

BUDGET = 6500  # Anthropic 上限（5,000 語 ≈ 6,500 トークン）


def main() -> int:
    arg = sys.argv[1] if len(sys.argv) > 1 else "."
    p = Path(arg)
    md = p if p.is_file() else p / "SKILL.md"
    if not md.is_file():
        print(f"SKILL.md が見つからない: {md}", file=sys.stderr)
        return 2

    text = md.read_text(encoding="utf-8")
    m = re.match(r"^---\n.*?\n---", text, re.DOTALL)
    body = text[m.end():] if m else text

    # ## 見出しで分割（[前文, "## A", bodyA, "## B", bodyB, ...]）
    parts = re.split(r"(?m)^(##\s+.*)$", body)
    sections: list[tuple[str, int]] = []
    if parts[0].strip():
        sections.append(("（前文）", estimate_tokens(parts[0])))
    for i in range(1, len(parts), 2):
        head = parts[i].strip()
        sec_body = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append((head, estimate_tokens(parts[i] + sec_body)))

    total = estimate_tokens(body)
    status = "超過" if total > BUDGET else "OK"
    print(f"{md} — 本文 約 {total} トークン（上限 {BUDGET}）: {status}")
    if total > BUDGET:
        print(f"  → 約 {total - BUDGET} トークン超過。下の大きいセクションから references/ へ分割を検討。")
    print()
    print(f"  {'tokens':>6}  section")
    print(f"  {'-'*6}  {'-'*40}")
    for head, tok in sorted(sections, key=lambda s: -s[1]):
        print(f"  {tok:6d}  {head[:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
