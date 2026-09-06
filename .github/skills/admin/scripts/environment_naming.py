"""環境名をルールベースで生成する。

environment-strategy.json の namingConvention に従って表示名とドメイン名（URL の一部）を決める。
create_environments.py から利用するほか、単体で名前だけを確認することもできる。

使い方:
    python environment_naming.py --workload KBMGR --group "AI CoE 内製開発グループ" --stage Dev
    python environment_naming.py --preview          # ブループリントの全環境の名前を一覧する
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_BLUEPRINT = Path(__file__).resolve().parent.parent / "references" / "environment-strategy.json"

_INVALID = re.compile(r"[^0-9A-Za-z-]")


def load_blueprint(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def group_code(blueprint: dict, group_name: str) -> str:
    for group in blueprint.get("groups", []):
        if group.get("name") == group_name:
            return group.get("code") or ""
    raise ValueError(f"ブループリントに無い環境グループです: {group_name}")


def stage_code(blueprint: dict, stage: str) -> str:
    codes = blueprint.get("namingConvention", {}).get("stageCodes", {})
    for key, value in codes.items():
        if key.lower() == stage.lower():
            return value
    raise ValueError(f"未知のステージです: {stage}（利用可能: {', '.join(codes)}）")


def _sanitize(text: str) -> str:
    return _INVALID.sub("", text.upper())


def build_names(blueprint: dict, workload: str, group_name: str, stage: str) -> dict[str, str]:
    convention = blueprint.get("namingConvention") or {}
    values = {
        "orgCode": _sanitize(convention.get("orgCode", "ORG")),
        "groupCode": _sanitize(group_code(blueprint, group_name)),
        "workload": _sanitize(workload),
        "stageCode": _sanitize(stage_code(blueprint, stage)),
    }
    if not values["workload"]:
        raise ValueError("workload には英数字を 1 文字以上含めてください。")

    display_name = convention.get("displayNamePattern", "{orgCode}-{groupCode}-{workload}-{stageCode}").format(**values)
    domain_name = convention.get("domainNamePattern", "{orgcode}{groupcode}{workload}{stagecode}").format(
        **{key.lower(): value.lower() for key, value in values.items()}
    )
    domain_name = _INVALID.sub("", domain_name).lower()

    max_display = int(convention.get("maxDisplayNameLength", 64))
    max_domain = int(convention.get("maxDomainNameLength", 32))
    if len(display_name) > max_display:
        raise ValueError(f"表示名が {max_display} 文字を超えます: {display_name}")

    return {"displayName": display_name, "domainName": domain_name[:max_domain]}


def preview(blueprint: dict) -> None:
    convention = blueprint.get("namingConvention") or {}
    print(f"表示名パターン: {convention.get('displayNamePattern')}")
    print(f"ドメイン名パターン: {convention.get('domainNamePattern')}\n")
    for group in blueprint.get("groups", []):
        print(f"[{group.get('name')}]（code={group.get('code')}）")
        for environment in group.get("environments", []):
            stage = environment.get("stage")
            if not stage:
                print(f"  {environment.get('name')}: 自動命名または改名しないため対象外")
                continue
            workload = _sanitize(environment.get("workload") or "SAMPLE")
            try:
                names = build_names(blueprint, workload, group.get("name"), stage)
            except ValueError as error:
                print(f"  {environment.get('name')}: {error}")
                continue
            print(f"  {environment.get('name')} -> {names['displayName']}（{names['domainName']}.crm.dynamics.com）")
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description="環境名をルールベースで生成する")
    parser.add_argument("--blueprint", default=str(DEFAULT_BLUEPRINT), help="ブループリントのパス")
    parser.add_argument("--workload", help="業務・製品の略号（例 KBMGR）")
    parser.add_argument("--group", help="環境グループ名")
    parser.add_argument("--stage", help="Dev / Test / Prod / Sandbox / Trial")
    parser.add_argument("--preview", action="store_true", help="ブループリントの全環境の名前を一覧する")
    args = parser.parse_args()

    blueprint = load_blueprint(Path(args.blueprint))

    if args.preview:
        preview(blueprint)
        return 0

    if not (args.workload and args.group and args.stage):
        print("エラー: --workload / --group / --stage を指定するか、--preview を使ってください。")
        return 2

    names = build_names(blueprint, args.workload, args.group, args.stage)
    print(f"表示名  : {names['displayName']}")
    print(f"ドメイン名: {names['domainName']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
