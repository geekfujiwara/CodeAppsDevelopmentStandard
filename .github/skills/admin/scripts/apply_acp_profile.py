"""ACP（Advanced connector policies）の許可セットを推奨プロファイルで一括設定する。

ACP は default-deny の許可リストです。ここで解決した許可セットで
``AllowedConnectorList`` を **置き換える**ため、既定は dry-run です。

プロファイルは references/acp-profiles.json で定義します。
``publisher`` では第一者判定できない（Google Drive / YouTube の publisher も
Microsoft）ため、コネクタ ID と公開元の両方で判定します。

使い方:
    # 差分を確認（読み取りのみ）
    python apply_acp_profile.py --environment-id <ENV_ID> --profile microsoft-first-party

    # 環境グループの元ポリシーへ反映（既定はグループのみを更新する）
    python apply_acp_profile.py --environment-id <ENV_ID> \
        --profile microsoft-first-party --include-group --apply

    # 全カタログを許可する承認済みグループ（レガシーは除外）
    python apply_acp_profile.py --environment-id <ENV_ID> \
        --profile all-supported --apply
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dlp_helper import connector_source, list_connector_catalog  # noqa: E402
from set_acp_connector import (  # noqa: E402
    CONNECTOR_PREFIX,
    _environment_group_id,
    allowed_ids,
    assigned_policy_id,
    connector_rule_set,
    get_policy,
    patch_policy,
)

DEFAULT_PROFILE_FILE = Path(__file__).resolve().parents[1] / "references" / "acp-profiles.json"
CUSTOM_SOURCE = "powerapps-user-defined"


def load_profile(profile_file: Path, name: str) -> dict:
    document = json.loads(profile_file.read_text(encoding="utf-8"))
    profiles = document.get("profiles", {})
    if name not in profiles:
        raise SystemExit(f"プロファイル '{name}' がありません。候補: {', '.join(sorted(profiles))}")
    profile = profiles[name]
    profile["denyConnectors"] = sorted(set(profile.get("denyConnectors", [])) | set(document.get("legacyConnectors", [])))
    return profile


def deprecated_connector(item: dict) -> bool:
    properties = item.get("properties") or {}
    metadata = properties.get("metadata") or {}
    flags = [properties.get(key) for key in ("isDeprecated", "deprecated", "isLegacy")]
    flags += [metadata.get(key) for key in ("isDeprecated", "deprecated", "isLegacy")]
    labels = " ".join(str(properties.get(key) or "") for key in ("displayName", "status"))
    return any(str(flag).lower() == "true" for flag in flags) or bool(
        re.search(r"\b(legacy|deprecated|retired)\b|レガシー|非推奨|廃止", labels, re.IGNORECASE)
    )


def resolve_catalog_set(profile: dict, catalog: list[dict], include=(), exclude=()) -> set[str]:
    names = {item["name"] for item in catalog}
    sources = {item["name"]: connector_source(item) for item in catalog}
    publishers = {item["name"]: (item.get("properties") or {}).get("publisher", "") for item in catalog}
    checked = copy.deepcopy(profile)
    checked["denyConnectors"] = sorted(set(checked.get("denyConnectors", [])) | {
        item["name"] for item in catalog if deprecated_connector(item)
    })
    allowed, violations = resolve_allow_set(checked, names, sources, publishers)
    if violations or not set(include) <= allowed:
        raise ValueError("追加 ID または許可セットがプロファイルの安全条件に違反しています。")
    allowed -= set(exclude)
    missing = set(profile.get("requiredCatalogConnectors", [])) - allowed
    if missing:
        raise ValueError(f"必須コネクタが未確認または除外されています: {', '.join(sorted(missing))}")
    if not allowed and not profile.get("blockAll"):
        raise ValueError("許可セットが空です。全ブロックには block-all を指定してください。")
    return allowed


def resolve_allow_set(
    profile: dict, names: set[str], sources: dict[str, str], publishers: dict[str, str] | None = None
) -> tuple[set[str], list[str]]:
    """プロファイルとコネクタ ID 集合から許可セットを解決する。

    ``names`` は取得したカタログの ID。カタログ未掲載のプレビューは
    プロファイルの検証済み明示 ID だけを候補に加え、既存許可は自動継承しない。
    """
    pattern = re.compile(r"^shared_(" + "|".join(profile["allowPatterns"]) + r")$")
    excluded = set(profile.get("excludeSources") or [])
    deny = set(profile.get("denyConnectors") or [])
    verified_ids = set(profile.get("allowConnectors") or [])
    allowed_publishers = set(profile.get("allowedPublishers") or [])
    publishers = publishers or {}
    if profile.get("blockAll"):
        return set(), []

    allow = {
        name
        for name in names | verified_ids
        if (pattern.match(name) or name in verified_ids)
        and name not in deny
        and sources.get(name, "") not in excluded
        and (
            not allowed_publishers
            or publishers.get(name) in allowed_publishers
            or (name in verified_ids and name not in publishers)
        )
    }
    violations = sorted(allow & set(profile.get("mustNotAllow") or []))
    return allow, violations


def _print_diff(label: str, names: list[str], display: dict[str, str], limit: int) -> None:
    if not names:
        return
    print(f"\n  {label}: {len(names)} 件")
    for name in names[:limit]:
        print(f"    {name}  ({display.get(name, '不明')})")
    if len(names) > limit:
        print(f"    ... 他 {len(names) - limit} 件")


def resolve_policy_targets(environment_id, group_id=None, policy_id=None, environment_only=False):
    if environment_only:
        raise ValueError("個別環境への設定は禁止です。環境グループを指定してください。")
    resolved_group = group_id or _environment_group_id(environment_id)
    if not resolved_group:
        raise ValueError("環境グループがありません。所属を確認してください。環境への自動フォールバックはしません。")
    target = assigned_policy_id("EnvironmentGroup", resolved_group)
    if not target:
        raise ValueError("グループポリシーがありません。作成・割り当てを別途承認してください。")
    if policy_id and policy_id != target:
        raise ValueError("指定ポリシーは対象グループのポリシーではありません。")
    return [("環境グループ ポリシー", target)]


def _process(
    label: str,
    policy_id: str,
    target: set[str],
    display: dict[str, str],
    custom_names: set[str],
    keep_custom: bool,
    limit: int,
    apply: bool,
) -> bool:
    policy = get_policy(policy_id)
    rule_set = copy.deepcopy(connector_rule_set(policy))
    initializing = rule_set is None
    print(f"\n=== {label}: {policy.get('name')} ({policy_id}) ===")
    if rule_set is None:
        print("  ConnectorManagement を初期作成します（現在 ACP 未適用）。")
        rule_set = {"id": "ConnectorManagement", "version": "1.0", "inputs": {"AllowedConnectorList": []}}

    current = allowed_ids(rule_set)
    final = set(target)
    kept_custom = []
    final |= set(kept_custom)

    added = sorted(final - current)
    removed = sorted(current - final)
    print(f"  現在の許可コネクタ数: {len(current)} -> 適用後: {len(final)}")
    if kept_custom:
        print(f"  引き継ぐカスタムコネクタ: {', '.join(kept_custom)}")
    _print_diff("追加", added, display, limit)
    _print_diff("削除", removed, display, limit)

    if not added and not removed and not initializing:
        print("  変更はありません。")
        return True
    if not apply:
        print("\n  [dry-run] 実際に反映するには --apply を付けてください。")
        return False

    entries = {entry["AllowedConnector"].rsplit("/", 1)[-1]: entry for entry in rule_set.get("inputs", {}).get("AllowedConnectorList", [])}
    rule_set.setdefault("inputs", {})["AllowedConnectorList"] = [
        entries.get(name, {
            "AllowedConnector": f"{CONNECTOR_PREFIX}{name}",
            "AllowedActionsMode": "AllAllowed",
            "AllowedConnectionTypesMode": "AllAllowed",
        })
        for name in sorted(final)
    ]
    patch_policy(policy_id, policy.get("name", ""), rule_set)
    actual = get_policy(policy_id)
    actual_rule = connector_rule_set(actual)
    if not actual_rule or actual_rule.get("inputs") != rule_set["inputs"]:
        raise ValueError("ACP 読み戻しが一致しません。公開・再適用を停止してください。")
    before_other = {rule["id"]: rule.get("inputs") for rule in policy.get("ruleSets", []) if rule["id"] != "ConnectorManagement"}
    after_other = {rule["id"]: rule.get("inputs") for rule in actual.get("ruleSets", []) if rule["id"] != "ConnectorManagement"}
    if before_other != after_other:
        raise ValueError("他のグループルールに差があります。公開を停止して確認してください。")
    print(f"\n  反映しました（許可コネクタ数 {len(final)}）。")
    print("  保存内容を検証済み。グループのルール公開と配下全環境・実行時の検証を別途確認してください。")
    return True


def _current_allowed(environment_id: str, policy_id: str | None, include_group: bool, group_id: str | None) -> set[str]:
    """判定対象を広げるため、現在 ACP で許可中の ID を集める。"""
    ids: set[str] = set()
    policy_ids = [policy_id] if policy_id else [assigned_policy_id("Environment", environment_id)]
    if include_group and not policy_id:
        resolved = group_id or _environment_group_id(environment_id)
        if resolved:
            policy_ids.append(assigned_policy_id("EnvironmentGroup", resolved))
    for candidate in policy_ids:
        if not candidate:
            continue
        rule_set = connector_rule_set(get_policy(candidate))
        if rule_set:
            ids |= allowed_ids(rule_set)
    return ids


def main() -> int:
    parser = argparse.ArgumentParser(description="ACP の許可セットを推奨プロファイルで設定する")
    parser.add_argument("--environment-id", default=os.environ.get("ENV_ID"), help="対象環境 ID")
    parser.add_argument("--environment-group-id", help="環境グループ ID（未指定なら環境から解決）")
    parser.add_argument("--policy-id", help="対象グループから解決したポリシー ID との一致検査用")
    parser.add_argument("--profile", default="microsoft-first-party", help="プロファイル名")
    parser.add_argument("--profile-file", type=Path, default=DEFAULT_PROFILE_FILE, help="プロファイル定義 JSON")
    parser.add_argument("--include-connector", action="append", default=[], help="追加で許可するコネクタ ID（複数可）")
    parser.add_argument("--exclude-connector", action="append", default=[], help="許可セットから外すコネクタ ID（複数可）")
    parser.add_argument("--include-group", action="store_true", help="互換オプション（既定でグループだけを更新）")
    parser.add_argument("--environment-only", action="store_true", help="非対応。指定時は個別環境への書き込みを拒否")
    parser.add_argument("--no-keep-custom", action="store_true", help="互換オプション。既存許可の自動継承は常に行わない")
    parser.add_argument("--list", action="store_true", help="解決した許可セットを一覧表示して終了する")
    parser.add_argument("--limit", type=int, default=20, help="差分の表示件数")
    parser.add_argument("--apply", action="store_true", help="実際に書き込む（既定は dry-run）")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id が必要です（コネクタ カタログの取得に使用します）。")
    if args.environment_only and (args.include_group or args.environment_group_id or args.policy_id):
        parser.error("--environment-only はグループ指定・--policy-id と併用できません。")

    profile = load_profile(args.profile_file, args.profile)
    catalog = list_connector_catalog(args.environment_id)
    display = {c.get("name"): (c.get("properties") or {}).get("displayName", "") for c in catalog}
    target = resolve_catalog_set(profile, catalog, args.include_connector, args.exclude_connector)

    print(f"プロファイル: {args.profile} — {profile.get('displayName')}")
    print(f"カタログ {len(display)} 件から {len(target)} 件を許可セットに解決しました。")
    review = [n for n in profile.get("reviewConnectors") or [] if n in target]
    if review:
        print("\n利用有無をユーザーに確認すべきコネクタ（不要なら --exclude-connector で外す）:")
        for name in review:
            print(f"  {name}  ({display.get(name, '')}) — {(profile.get('reviewReasons') or {}).get(name, '')}")

    if args.list:
        print("\n--- 許可セット ---")
        for name in sorted(target):
            print(f"  {name}  ({display.get(name, '')})")
        return 0

    targets = resolve_policy_targets(args.environment_id, args.environment_group_id, args.policy_id, args.environment_only)
    if profile.get("allowedPublishers"):
        print("第一者限定プロファイル: 独自コネクタは自動引き継ぎしません。配下各環境の削除差分を確認してください。")

    ok = True
    for label, policy_id in targets:
        ok = (
            _process(
                label,
                policy_id,
                target,
                display,
                set(),
                False,
                args.limit,
                args.apply,
            )
            and ok
        )
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
