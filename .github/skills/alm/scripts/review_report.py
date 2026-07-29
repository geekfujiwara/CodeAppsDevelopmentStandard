#!/usr/bin/env python3
"""Merge the per-agent gate verdicts into a single review report.

Each review agent writes ``.gate/<gate>.json`` (see ``gate_rules.py``). This
script folds all of them into one Markdown report so the pipeline can show a
single consolidated view instead of one card per agent:

  * the report is written to the Actions job summary (per run view), and
  * the same text becomes the release notes of the GitHub release created for
    the deployed version, so past deployments can be read as a chronological
    list on the Releases page.

Usage:
    python scripts/review_report.py --verdict-dir .gate --out .gate/review-report.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Display order and Japanese labels of the gates, keyed by rule pack name.
GATES = [
    ("quality", "1. 品質チェック"),
    ("generalization", "2. 汎用性チェック (シークレットストア)"),
    ("security", "3. セキュリティレビュー"),
    ("readability", "4. 可読性チェック"),
    ("release", "5. リリース判定"),
]


def load(verdict_dir: Path, gate: str) -> dict | None:
    path = verdict_dir / f"{gate}.json"
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def build_report(verdict_dir: Path, deploy_state: str) -> tuple[str, bool]:
    rows: list[str] = []
    findings: list[str] = []
    passed = 0
    total = 0
    all_green = True

    for gate, label in GATES:
        data = load(verdict_dir, gate)
        if data is None:
            rows.append(f"| {label} | - | **未実行** | - |")
            all_green = False
            continue

        rules = data.get("rules", [])
        ok = [r for r in rules if r.get("status") == "pass"]
        ng = [r for r in rules if r.get("status") != "pass"]
        passed += len(ok)
        total += len(rules)
        verdict = data.get("verdict", "FAIL")
        if verdict != "PASS":
            all_green = False
        failed_ids = ", ".join(f"`{r['id']}`" for r in ng) or "-"
        rows.append(f"| {label} | `{data.get('agent', '?')}` | **{verdict}** | {failed_ids} |")

        for rule in ng:
            for item in rule.get("findings", []):
                findings.append(f"- **{label}** `{rule['id']}` {item}")

    decision = "GO" if all_green else "NO-GO"
    lines = [
        f"## レビュー結果: **{decision}**（ルール {passed}/{total} PASS・デプロイ {deploy_state}）",
        "",
        "| ゲート | エージェント | 判定 | 失敗ルール |",
        "| --- | --- | --- | --- |",
        *rows,
        "",
    ]
    if findings:
        lines += ["<details><summary>指摘 " + str(len(findings)) + " 件</summary>", ""]
        lines += findings
        lines += ["", "</details>", ""]
    else:
        lines += ["指摘はありません。", ""]

    return "\n".join(lines), all_green


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verdict-dir", default=".gate",
                        help="Directory holding the per-gate verdict JSON files.")
    parser.add_argument("--out", default=".gate/review-report.md",
                        help="Path to write the consolidated report.")
    parser.add_argument("--deploy-state", default="未実行",
                        help="Result of the deploy job, shown in the header.")
    args = parser.parse_args()

    report, all_green = build_report(Path(args.verdict_dir), args.deploy_state)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(report, encoding="utf-8")
    print(report)
    # Reporting never fails the run; blocking is the gates' responsibility.
    print(f"::notice title=Review result::{'GO' if all_green else 'NO-GO'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
