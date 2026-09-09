"""クラシック DLP（データ ポリシー）の設定を ACP（Advanced connector policies）へ移行する。

クラシック DLP は「グループ分け（Business / Non-business / Blocked）」、
ACP は「default-deny の許可リスト」で、意味論が異なります。
このスクリプトは機械的に移せる部分だけを移し、判断が必要な点は
``未確定事項`` として出力します。呼び出し側（エージェント）は AskUserQuestion で
回答を得てから、``--decision-file`` または個別オプションを付けて再実行してください。

既定は dry-run。実際に書き込むには --apply を付けます。

使い方:
    # 現状分析と未確定事項の出力
    python migrate_dlp_to_acp.py --environment-id <ENV_ID> --report-file report.json

    # 回答を反映して適用（環境グループの元ポリシーを更新する）
    python migrate_dlp_to_acp.py --environment-id <ENV_ID> \
        --allow-group Confidential --allow-group General \
        --keep-custom --include-group --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import (  # noqa: E402
    CLASSIFICATION_LABELS,
    applied_policies,
    connector_source,
    list_connector_catalog,
    list_url_rules,
)
from set_acp_connector import (  # noqa: E402
    CONNECTOR_PREFIX,
    _environment_group_id,
    allowed_ids,
    assert_not_denied,
    assigned_policy_id,
    connector_rule_set,
    denied_connectors,
    get_policy,
    patch_policy,
)

CUSTOM_SOURCE = "powerapps-user-defined"


def policy_classification(policies: list[dict]) -> tuple[dict[str, str], dict[str, str]]:
    """コネクタ ID -> 分類、およびポリシー名 -> 既定分類 を返す。

    複数ポリシーが適用される場合、より制限の厳しい分類（Blocked > Confidential > General）を採用する。
    """
    severity = {"General": 0, "Confidential": 1, "Blocked": 2}
    classification: dict[str, str] = {}
    defaults: dict[str, str] = {}
    for policy in policies:
        defaults[policy.get("displayName") or policy.get("name", "")] = (
            policy.get("defaultConnectorsClassification") or "General"
        )
        for group in policy.get("connectorGroups") or []:
            group_name = group.get("classification")
            if group_name not in severity:
                continue
            for connector in group.get("connectors") or []:
                name = (connector.get("id") or "").rsplit("/", 1)[-1] or connector.get("name", "")
                if not name:
                    continue
                current = classification.get(name)
                if current is None or severity[group_name] > severity[current]:
                    classification[name] = group_name
    return classification, defaults


def build_report(environment_id: str, tenant_id: str | None) -> dict:
    policies = applied_policies(environment_id)
    classification, defaults = policy_classification(policies)
    catalog = list_connector_catalog(environment_id)
    display = {c.get("name"): (c.get("properties") or {}).get("displayName", "") for c in catalog}
    custom_names = {c.get("name") for c in catalog if connector_source(c) == CUSTOM_SOURCE}

    counts = {group: 0 for group in ("Confidential", "General", "Blocked")}
    for group in classification.values():
        counts[group] += 1

    url_rules: list[dict] = []
    if tenant_id:
        for policy in policies:
            try:
                url_rules.extend(list_url_rules(tenant_id, policy.get("name", "")) or [])
            except Exception:  # noqa: BLE001  # URL 規則が無いポリシーは 404 になり得る
                continue

    open_questions = []
    non_default = {name: value for name, value in defaults.items() if value != "Blocked"}
    if non_default:
        open_questions.append(
            {
                "id": "default-classification",
                "question": "DLP の未分類コネクタは既定で許可扱いです。ACP でも許可しますか？",
                "detail": {name: CLASSIFICATION_LABELS.get(v, v) for name, v in non_default.items()},
                "options": ["許可しない（推奨・default-deny を維持）", "許可する"],
                "option_flag": "--allow-unclassified",
            }
        )
    if counts["Confidential"] and counts["General"]:
        open_questions.append(
            {
                "id": "allow-groups",
                "question": "ACP の許可リストに移すグループを選んでください。",
                "detail": {CLASSIFICATION_LABELS[g]: counts[g] for g in ("Confidential", "General")},
                "options": ["Business と Non-business の両方", "Business のみ"],
                "option_flag": "--allow-group",
            }
        )
    if custom_names:
        open_questions.append(
            {
                "id": "custom-connectors",
                "question": "カスタムコネクタを ACP の許可リストに含めますか？",
                "detail": sorted(custom_names),
                "note": "管理センター UI ではカスタムコネクタは未対応だが、API では許可リストに登録でき、実際に有効になる。",
                "options": ["含める（--keep-custom）", "含めない"],
                "option_flag": "--keep-custom",
            }
        )
    if url_rules:
        open_questions.append(
            {
                "id": "url-rules",
                "question": "DLP の Host URL 規則には ACP の等価機能がありません。対象コネクタを個別に許可しますか？",
                "detail": [
                    f"{CLASSIFICATION_LABELS.get(r.get('customConnectorRuleClassification'), '?')}"
                    f" <- {r.get('pattern')}"
                    for r in url_rules
                ],
                "options": ["対象コネクタを --include-connector で許可する", "扱わない"],
                "option_flag": "--include-connector",
            }
        )

    return {
        "environmentId": environment_id,
        "appliedPolicies": [
            {"name": p.get("name"), "displayName": p.get("displayName"), "environmentType": p.get("environmentType")}
            for p in policies
        ],
        "defaultClassification": defaults,
        "classifiedCounts": counts,
        "customConnectors": sorted(custom_names),
        "urlRules": url_rules,
        "openQuestions": open_questions,
        "_classification": classification,
        "_display": display,
    }


def target_allow_set(report: dict, allow_groups: set[str], allow_unclassified: bool, keep_custom: bool) -> set[str]:
    classification: dict[str, str] = report["_classification"]
    allow = {name for name, group in classification.items() if group in allow_groups}
    if allow_unclassified:
        allow |= {name for name in report["_display"] if name not in classification}
    if keep_custom:
        allow |= set(report["customConnectors"])
    else:
        allow -= set(report["customConnectors"])
    # DLP は既定許可のためレガシー コネクタを含み得る。ACP へは持ち込まない。
    return allow - denied_connectors()


def _process(label: str, policy_id: str, target: set[str], display: dict, limit: int, apply: bool) -> bool:
    policy = get_policy(policy_id)
    rule_set = connector_rule_set(policy)
    print(f"\n=== {label}: {policy.get('name')} ({policy_id}) ===")
    if rule_set is None:
        print("  ConnectorManagement ルールセットがありません（ACP 未適用）。")
        return True

    current = allowed_ids(rule_set)
    added = sorted(target - current)
    removed = sorted(current - target)
    print(f"  現在の許可コネクタ数: {len(current)} -> 適用後: {len(target)}")
    for name, items in (("追加", added), ("削除", removed)):
        if not items:
            continue
        print(f"\n  {name}: {len(items)} 件")
        for item in items[:limit]:
            print(f"    {item}  ({display.get(item, '不明')})")
        if len(items) > limit:
            print(f"    ... 他 {len(items) - limit} 件")

    if not added and not removed:
        print("  変更はありません。")
        return True
    if not apply:
        print("\n  [dry-run] 実際に反映するには --apply を付けてください。")
        return False

    rule_set.setdefault("inputs", {})["AllowedConnectorList"] = [
        {
            "AllowedConnector": f"{CONNECTOR_PREFIX}{name}",
            "AllowedActionsMode": "AllAllowed",
            "AllowedConnectionTypesMode": "AllAllowed",
        }
        for name in sorted(target)
    ]
    patch_policy(policy_id, policy.get("name", ""), rule_set)
    print(f"\n  反映しました（許可コネクタ数 {len(target)}）。")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="クラシック DLP の設定を ACP へ移行する")
    parser.add_argument("--environment-id", default=os.environ.get("ENV_ID"), help="対象環境 ID")
    parser.add_argument("--tenant-id", default=os.environ.get("TENANT_ID"), help="Host URL 規則の取得に使用")
    parser.add_argument("--environment-group-id", help="環境グループ ID（未指定なら環境から解決）")
    parser.add_argument("--policy-id", help="ACP ポリシー ID を直接指定する場合")
    parser.add_argument(
        "--allow-group",
        action="append",
        default=[],
        choices=["Confidential", "General"],
        help="ACP へ移す DLP グループ（既定: Confidential のみ）",
    )
    parser.add_argument("--allow-unclassified", action="store_true", help="DLP 未分類のコネクタも許可する")
    parser.add_argument("--keep-custom", action="store_true", help="カスタムコネクタを許可リストに含める")
    parser.add_argument("--include-connector", action="append", default=[], help="追加で許可するコネクタ ID（複数可）")
    parser.add_argument("--exclude-connector", action="append", default=[], help="許可セットから外すコネクタ ID（複数可）")
    parser.add_argument("--include-group", action="store_true", help="環境グループ側のポリシーも更新する")
    parser.add_argument("--report-file", type=Path, help="分析結果を JSON で書き出す")
    parser.add_argument("--report-only", action="store_true", help="分析だけして差分を計算しない")
    parser.add_argument("--allow-empty", action="store_true", help="許可セットが 0 件でも続行する")
    parser.add_argument("--limit", type=int, default=20, help="差分の表示件数")
    parser.add_argument("--apply", action="store_true", help="実際に書き込む（既定は dry-run）")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id が必要です。")

    report = build_report(args.environment_id, args.tenant_id)
    print(f"適用中の DLP ポリシー: {len(report['appliedPolicies'])} 件")
    for policy in report["appliedPolicies"]:
        print(f"  {policy['displayName']} ({policy['environmentType']})")
    print(f"分類済みコネクタ: {report['classifiedCounts']}")

    if report["openQuestions"]:
        print("\n--- 未確定事項（AskUserQuestion で確認する）---")
        for question in report["openQuestions"]:
            print(f"\n[{question['id']}] {question['question']}")
            print(f"  現状: {json.dumps(question['detail'], ensure_ascii=False)}")
            if question.get("note"):
                print(f"  補足: {question['note']}")
            print(f"  選択肢: {' / '.join(question['options'])}  -> {question['option_flag']}")

    if args.report_file:
        payload = {k: v for k, v in report.items() if not k.startswith("_")}
        args.report_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n分析結果を書き出しました: {args.report_file}")

    if args.report_only:
        return 0

    allow_groups = set(args.allow_group) or {"Confidential"}
    assert_not_denied(args.include_connector)
    target = target_allow_set(report, allow_groups, args.allow_unclassified, args.keep_custom)
    target |= set(args.include_connector)
    target -= set(args.exclude_connector)
    print(f"\nACP へ移す許可セット: {len(target)} 件（対象グループ: {', '.join(sorted(allow_groups))}）")
    if not target and not args.allow_empty:
        print("許可セットが 0 件です。このまま適用すると全コネクタがブロックされます。")
        print("--allow-group / --allow-unclassified / --include-connector を見直すか、")
        print("意図した上で進めるなら --allow-empty を付けてください。")
        return 1

    targets: list[tuple[str, str]] = []
    if args.policy_id:
        targets.append(("ポリシー", args.policy_id))
    else:
        env_policy = assigned_policy_id("Environment", args.environment_id)
        if env_policy:
            targets.append(("環境ポリシー", env_policy))
        else:
            print("環境に ACP は割り当てられていません。先に管理センターで ACP を作成してください。")
        if args.include_group:
            group_id = args.environment_group_id or _environment_group_id(args.environment_id)
            group_policy = assigned_policy_id("EnvironmentGroup", group_id) if group_id else None
            if group_policy:
                targets.append(("環境グループ ポリシー", group_policy))
            else:
                print("環境グループのポリシーが見つかりませんでした。")

    if not targets:
        return 0

    ok = True
    for label, policy_id in targets:
        ok = _process(label, policy_id, target, report["_display"], args.limit, args.apply) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
