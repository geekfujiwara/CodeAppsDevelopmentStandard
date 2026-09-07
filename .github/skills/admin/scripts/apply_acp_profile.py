"""ACP（Advanced connector policies）の許可セットを推奨プロファイルで一括設定する。

ACP は default-deny の許可リストです。ここで解決した許可セットで
``AllowedConnectorList`` を **置き換える**ため、既定は dry-run です。

プロファイルは references/acp-profiles.json で定義します。
``publisher`` では第一者判定できない（Google Drive / YouTube の publisher も
Microsoft）ため、コネクタ ID のパターンで判定します。

使い方:
    # 差分を確認（読み取りのみ）
    python apply_acp_profile.py --environment-id <ENV_ID> --profile microsoft-first-party

    # 環境グループの元ポリシーへ反映（環境側は同期コピーなのでグループを更新する）
    python apply_acp_profile.py --environment-id <ENV_ID> \
        --profile microsoft-first-party --include-group --apply

    # 自前 MCP コネクタなどを追加で許可する
    python apply_acp_profile.py --environment-id <ENV_ID> \
        --profile microsoft-first-party --include-connector shared_xxx --apply
"""

from __future__ import annotations

import argparse
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
    profiles = json.loads(profile_file.read_text(encoding="utf-8")).get("profiles", {})
    if name not in profiles:
        raise SystemExit(f"プロファイル '{name}' がありません。候補: {', '.join(sorted(profiles))}")
    return profiles[name]


def resolve_allow_set(profile: dict, names: set[str], sources: dict[str, str]) -> tuple[set[str], list[str]]:
    """プロファイルとコネクタ ID 集合から許可セットを解決する。

    ``names`` にはカタログだけでなく現在 ACP で許可中の ID も含める。
    プレビューコネクタは環境のカタログに現れないことがあり、
    カタログだけで判定すると黙って取りこぼしてしまうため。
    """
    pattern = re.compile(r"^shared_(" + "|".join(profile["allowPatterns"]) + r")$")
    excluded = set(profile.get("excludeSources") or [])
    deny = set(profile.get("denyConnectors") or [])

    allow = {
        name
        for name in names
        if pattern.match(name) and name not in deny and sources.get(name, "") not in excluded
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
    rule_set = connector_rule_set(policy)
    print(f"\n=== {label}: {policy.get('name')} ({policy_id}) ===")
    if rule_set is None:
        print(f"  ConnectorManagement ルールセットがありません（ACP 未適用）。")
        return True

    current = allowed_ids(rule_set)
    final = set(target)
    kept_custom = sorted(current & custom_names) if keep_custom else []
    final |= set(kept_custom)

    added = sorted(final - current)
    removed = sorted(current - final)
    print(f"  現在の許可コネクタ数: {len(current)} -> 適用後: {len(final)}")
    if kept_custom:
        print(f"  引き継ぐカスタムコネクタ: {', '.join(kept_custom)}")
    _print_diff("追加", added, display, limit)
    _print_diff("削除", removed, display, limit)

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
        for name in sorted(final)
    ]
    patch_policy(policy_id, policy.get("name", ""), rule_set)
    print(f"\n  反映しました（許可コネクタ数 {len(final)}）。")
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
    parser.add_argument("--policy-id", help="ポリシー ID を直接指定する場合")
    parser.add_argument("--profile", default="microsoft-first-party", help="プロファイル名")
    parser.add_argument("--profile-file", type=Path, default=DEFAULT_PROFILE_FILE, help="プロファイル定義 JSON")
    parser.add_argument("--include-connector", action="append", default=[], help="追加で許可するコネクタ ID（複数可）")
    parser.add_argument("--exclude-connector", action="append", default=[], help="許可セットから外すコネクタ ID（複数可）")
    parser.add_argument("--include-group", action="store_true", help="環境グループ側のポリシーも更新する")
    parser.add_argument("--no-keep-custom", action="store_true", help="既存のカスタムコネクタ許可を引き継がない")
    parser.add_argument("--list", action="store_true", help="解決した許可セットを一覧表示して終了する")
    parser.add_argument("--limit", type=int, default=20, help="差分の表示件数")
    parser.add_argument("--apply", action="store_true", help="実際に書き込む（既定は dry-run）")
    args = parser.parse_args()

    if not args.environment_id:
        parser.error("--environment-id が必要です（コネクタ カタログの取得に使用します）。")

    profile = load_profile(args.profile_file, args.profile)
    catalog = list_connector_catalog(args.environment_id)
    display = {c.get("name"): (c.get("properties") or {}).get("displayName", "") for c in catalog}
    sources = {c.get("name"): connector_source(c) for c in catalog}
    custom_names = {name for name, source in sources.items() if source == CUSTOM_SOURCE}

    current = _current_allowed(args.environment_id, args.policy_id, args.include_group, args.environment_group_id)
    universe = set(display) | current
    target, violations = resolve_allow_set(profile, universe, sources)
    if violations:
        print("プロファイルの mustNotAllow に該当するコネクタが許可セットに入りました。")
        for name in violations:
            print(f"  {name}  ({display.get(name, '')})")
        print("allowPatterns / denyConnectors を見直してください。")
        return 2

    target |= set(args.include_connector)
    target -= set(args.exclude_connector)

    print(f"プロファイル: {args.profile} — {profile.get('displayName')}")
    print(f"判定対象 {len(universe)} 件（カタログ {len(display)} 件 + 現在の許可 {len(current)} 件）から {len(target)} 件を許可セットに解決しました。")
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

    targets: list[tuple[str, str]] = []
    if args.policy_id:
        targets.append(("ポリシー", args.policy_id))
    else:
        env_policy = assigned_policy_id("Environment", args.environment_id)
        if env_policy:
            targets.append(("環境ポリシー", env_policy))
        else:
            print("\n環境に ACP は割り当てられていません。")
        if args.include_group:
            group_id = args.environment_group_id or _environment_group_id(args.environment_id)
            group_policy = assigned_policy_id("EnvironmentGroup", group_id) if group_id else None
            if group_policy:
                targets.append(("環境グループ ポリシー", group_policy))
            else:
                print("\n環境グループのポリシーが見つかりませんでした。")

    if not targets:
        print("更新対象のポリシーがありません。")
        return 0

    ok = True
    for label, policy_id in targets:
        ok = (
            _process(
                label,
                policy_id,
                target,
                display,
                custom_names,
                not args.no_keep_custom,
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
