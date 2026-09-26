"""要件 JSON から 4 役割（system of record / analytics / semantic / knowledge）のデータ基盤を決定する。

使い方:
    python recommend_platform.py --requirements spec/data-requirements.json --out spec/data-platform.json

終了コード: 0 = 決定済み / 2 = 入力エラー / 3 = 利用者の判断が必要（needsDecision）
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_platform_common import REFERENCES_DIR, print_json, read_json, write_json  # noqa: E402

MATRIX_PATH = REFERENCES_DIR / "capability-matrix.json"
DERIVED_SIGNALS = {"largeVolume"}


def known_signals(matrix: dict) -> set[str]:
    names: set[str] = set(DERIVED_SIGNALS)
    for role in ("systemOfRecord", "analytics"):
        for option in matrix[role].values():
            names.update(option["signals"])
    for role in ("semantic", "knowledge"):
        for option in matrix[role].values():
            names.update(option["when"])
    return names


def normalize_needs(requirements: dict, matrix: dict) -> dict[str, bool]:
    needs = requirements.get("needs")
    if not isinstance(needs, dict):
        raise ValueError("requirements.needs はオブジェクトで指定してください")
    unknown = sorted(set(needs) - known_signals(matrix))
    if unknown:
        raise ValueError(f"未知の signal: {', '.join(unknown)}（capability-matrix.json を参照）")
    for name, value in needs.items():
        if not isinstance(value, bool):
            raise ValueError(f"needs.{name} は true / false で指定してください")
    normalized = dict(needs)
    volume = requirements.get("dataVolumeGb", 0)
    if not isinstance(volume, (int, float)) or volume < 0:
        raise ValueError("dataVolumeGb は 0 以上の数値で指定してください")
    normalized["largeVolume"] = volume >= matrix["thresholds"]["largeVolumeGb"]
    return normalized


def score_role(options: dict, needs: dict[str, bool]) -> tuple[dict[str, int], dict[str, list[str]]]:
    scores: dict[str, int] = {}
    matched: dict[str, list[str]] = {}
    for name, option in options.items():
        hits = [signal for signal in option["signals"] if needs.get(signal)]
        scores[name] = sum(option["signals"][signal] for signal in hits)
        matched[name] = [f"{signal}(+{option['signals'][signal]})" for signal in hits]
    return scores, matched


def choose(role: str, options: dict, needs: dict, out: dict) -> str:
    scores, matched = score_role(options, needs)
    out["scores"][role] = scores
    best = max(scores.values(), default=0)
    if best == 0:
        return "none"
    leaders = sorted(name for name, score in scores.items() if score == best)
    if len(leaders) > 1:
        out["needsDecision"].append({
            "role": role,
            "candidates": leaders,
            "reason": "同点のため利用者の判断が必要",
            "evidence": {name: matched[name] for name in leaders},
        })
        return "undecided"
    winner = leaders[0]
    out["reasons"].append(f"{role}={winner}: {', '.join(matched[winner])}")
    return winner


def recommend(requirements: dict, matrix: dict) -> dict:
    needs = normalize_needs(requirements, matrix)
    out: dict = {
        "schemaVersion": "1.0",
        "matrixVersion": matrix["version"],
        "decision": {},
        "scores": {},
        "reasons": [],
        "warnings": [],
        "needsDecision": [],
        "delegates": {},
        "mcp": [],
    }
    decision = out["decision"]
    decision["systemOfRecord"] = choose("systemOfRecord", matrix["systemOfRecord"], needs, out)
    decision["analytics"] = choose("analytics", matrix["analytics"], needs, out)

    decision["semantic"] = "none"
    for name, option in matrix["semantic"].items():
        if all(needs.get(key) == value for key, value in option["when"].items()):
            if decision["analytics"] == option["requiresAnalytics"]:
                decision["semantic"] = name
                out["reasons"].append(f"semantic={name}: {', '.join(option['when'])}")
                break
    if needs.get("entityRelationshipModel") and decision["semantic"] != "fabric-ontology":
        out["warnings"].append(
            "entityRelationshipModel が必要だが analytics が fabric ではない。"
            "Fabric IQ Ontology を併用する場合は OneLake へのミラーリング / ショートカットを設計する")
    if needs.get("governedMetrics") and decision["semantic"] == "none":
        out["warnings"].append("governedMetrics が必要だが semantic 層が未決定。analytics を確定してから再判定する")

    decision["knowledge"] = "none"
    for name, option in matrix["knowledge"].items():
        if any(needs.get(key) == value for key, value in option["when"].items()):
            decision["knowledge"] = name
            out["reasons"].append(f"knowledge={name}: 文書の根拠付き回答")

    volume = requirements.get("dataVolumeGb", 0)
    if decision["systemOfRecord"] == "dataverse" and volume > matrix["thresholds"]["dataverseComfortGb"]:
        out["warnings"].append(
            f"dataVolumeGb={volume} は Dataverse に置く目安（{matrix['thresholds']['dataverseComfortGb']} GB）を超える。"
            "履歴・ログは analytics 側へ分離する")

    add_delegates_and_mcp(out, matrix, requirements)
    return out


def add_delegates_and_mcp(out: dict, matrix: dict, requirements: dict) -> None:
    decision = out["decision"]
    clients = set(requirements.get("exposure", {}).get("clients", []))
    for role in ("systemOfRecord", "analytics", "semantic", "knowledge"):
        choice = decision[role]
        if choice in {"none", "undecided"}:
            continue
        section = matrix[role]
        out["delegates"][choice] = section[choice]["skill"]
    if any(value not in {"none", "undecided"} for value in decision.values()):
        out["delegates"]["migration"] = "data-migration"

    mcp_keys = []
    if decision["systemOfRecord"] == "dataverse":
        mcp_keys.append("dataverse")
    if decision["semantic"] == "fabric-ontology":
        mcp_keys.append("fabric-ontology")
    if decision["analytics"] == "databricks":
        mcp_keys.append("databricks-genie" if decision["semantic"] == "databricks-metric-view" else "databricks-sql")
    if decision["knowledge"] == "foundry-iq":
        mcp_keys.append("foundry-iq")
    for key in mcp_keys:
        entry = dict(matrix["mcp"][key], platform=key)
        if clients:
            entry["clientSkills"] = [skill for skill in entry["clientSkills"] if _client_matches(skill, clients)] or entry["clientSkills"]
        out["mcp"].append(entry)


def _client_matches(skill: str, clients: set[str]) -> bool:
    aliases = {"copilot-studio": {"copilot-studio", "copilot-studio-v2"}, "cowork": {"cowork"}, "foundry": {"ai-teammate"}}
    return any(skill in aliases.get(client, {client}) for client in clients)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--requirements", required=True)
    parser.add_argument("--matrix", default=str(MATRIX_PATH))
    parser.add_argument("--out")
    args = parser.parse_args(argv)
    try:
        output = recommend(read_json(args.requirements), read_json(args.matrix))
    except (ValueError, KeyError) as error:
        print(f"入力エラー: {error}", file=sys.stderr)
        return 2
    if args.out:
        write_json(args.out, output)
    print_json(output)
    return 3 if output["needsDecision"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
