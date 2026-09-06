"""スキャン結果とブループリントから `admin-migration-plan.md` を生成する。

`scan_environment_strategy.py --report-file` の JSON を入力に、現状とのギャップ・
実行手順・ロールバック・未確定事項を 1 枚の Markdown にまとめる。**環境は変更しない。**

使い方:
    python scan_environment_strategy.py --tenant-id <ID> --report-file scan.json
    python generate_migration_plan.py --scan-file scan.json --output admin-migration-plan.md
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"


def _sharing(value) -> str:
    return "無制限" if value in (None, -1) else f"{value} 名まで"


def build(scan: dict, blueprint: dict, decisions: dict) -> str:
    lines: list[str] = []
    add = lines.append
    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")

    add("# Power Platform 環境戦略 移行プラン")
    add("")
    add(f"- 作成日時: {now}")
    add(f"- テナント ID: `{scan['tenantId']}`")
    add(f"- 既存環境: {len(scan['environments'])} 件 / 既存環境グループ: {len(scan['environmentGroups'])} 件")
    add("")
    add("> このプランはレビュー用です。承認されるまで環境への変更は行いません。")
    add("")

    add("## 1. 目指す姿")
    add("")
    add("| 環境グループ | 目的 | 共有上限 | Code Apps | Copilot クレジット |")
    add("| --- | --- | --- | --- | --- |")
    for group in blueprint["groups"]:
        rules = group["rules"]
        add(
            f"| {group['name']} | {group['purpose']} | {_sharing(rules.get('sharingLimitUsers'))} | "
            f"{'可' if rules.get('codeApps') else '不可'} | {'有効' if rules.get('copilotCredits') else '無効'} |"
        )
    add("")
    for group in blueprint["groups"]:
        add(f"### {group['name']}")
        add("")
        add("| 環境 | 種類 | ライフサイクル | 共有上限 | 備考 |")
        add("| --- | --- | --- | --- | --- |")
        for environment in group["environments"]:
            limit = environment.get("sharingLimitUsers", group["rules"].get("sharingLimitUsers"))
            name = environment["name"] + ("（任意）" if environment.get("optional") else "")
            add(
                f"| {name} | {environment['type']} | {environment['lifecycle']} | "
                f"{_sharing(limit)} | {environment.get('note', '-')} |"
            )
        add("")
        production = group.get("productionPolicy")
        if production:
            add(f"**本番環境の方針**: {production['why']}")
            add("")
            add(f"- 検証（UAT）環境: {production['validationWhy']}")
            if production.get("adoptExistingWhenBlockUnmanaged"):
                add(f"- 例外: {production['adoptExistingWhy']}")
            add("")

    add("## 2. 現状とのギャップ")
    add("")
    add("### 2-1. 環境グループ")
    add("")
    if scan["missingGroups"]:
        for name in scan["missingGroups"]:
            add(f"- [ ] `{name}` を新規作成する")
    else:
        add("- 推奨グループはすべて存在します。")
    reclaimable = scan.get("reclaimableStorageMb") or 0
    candidates = scan.get("unusedEnvironmentCandidates") or []
    if candidates:
        add(
            f"- [ ] **グループへ入れる前に、使われていない {len(candidates)} 環境を削除する（Dataverse 容量を "
            f"{reclaimable:g}MB 削減できます）** → 詳細は 2-6"
        )
    if scan["ungroupedEnvironments"]:
        add(f"- [ ] どのグループにも属していない環境を割り当てる: {', '.join(scan['ungroupedEnvironments'])}")
    if scan["unmanagedEnvironments"]:
        add(
            f"- [ ] マネージド環境化が必要（グループにはマネージド環境しか入らない）: "
            f"{', '.join(scan['unmanagedEnvironments'])}"
        )
    add("")

    add("### 2-2. 環境ごとの現状")
    add("")
    add("| 環境 | SKU | マネージド | アプリ | フロー | 容量(MB) | 現グループ | ACP 許可数 | Copilot クレジット |")
    add("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    for environment in scan["environments"]:
        add(
            f"| {environment['displayName']} | {environment['sku']} | "
            f"{'はい' if environment['managed'] else '**いいえ**'} | "
            f"{environment.get('appCount') if environment.get('appCount') is not None else '-'} | "
            f"{environment.get('flowCount') if environment.get('flowCount') is not None else '-'} | "
            f"{environment.get('storageMb', 0):g} | "
            f"{environment['group'] or '-'} | {environment['acpAllowedCount'] or '-'} | "
            f"{environment['copilotCredits'] if environment['copilotCredits'] is not None else '-'} |"
        )
    add("")

    add("### 2-3. テナント設定")
    add("")
    if scan["tenantSettingGaps"]:
        add("| 設定 | 現在 | 推奨 | 理由 |")
        add("| --- | --- | --- | --- |")
        for gap in scan["tenantSettingGaps"]:
            add(f"| {gap['label']} | `{gap['actual']}` | `{gap['expected']}` | {gap['why']} |")
    else:
        add("- 推奨値との差分はありません。")
    add("")

    add("### 2-4. コネクタ ポリシー")
    add("")
    policy = blueprint["connectorPolicy"]
    add(f"- 適用中のクラシック DLP: {', '.join(p['displayName'] for p in scan['classicDlpPolicies']) or 'なし'}")
    add(f"- 目標: **{policy['mode']}**（プロファイル `{policy['profile']}`）")
    add(f"- 理由: {policy['why']}")
    add(f"- 注意: {policy['note']}")
    add("")

    add("### 2-5. ライセンス")
    add("")
    licenses = scan.get("licenses") or {}
    if licenses.get("error"):
        add(f"- 取得できませんでした（{licenses['error']}）。管理センターで手動確認してください。")
    else:
        premium = licenses.get("premiumLikeSkus") or []
        copilot = licenses.get("copilotStudioSkus") or []
        if premium:
            add("| SKU | 消費 / 保有 |")
            add("| --- | --- |")
            for sku in premium:
                add(f"| {sku['skuPartNumber']} | {sku['consumed']} / {sku['enabled']} |")
        else:
            add("- **不足**: Power Apps Premium 等のスタンドアロン ライセンスが見つかりません。")
        add("")
        add(f"- {blueprint['licenses']['why']}")
        if copilot:
            for sku in copilot:
                add(f"- Copilot Studio: `{sku['skuPartNumber']}` {sku['consumed']} / {sku['enabled']}")
        else:
            add("- Copilot Studio のライセンスが見つかりません。クレジットを割り当てる環境を絞る必要があります。")
        allocated = sum(e["copilotCredits"] or 0 for e in scan["environments"])
        add(f"- Copilot クレジット割り当て済み合計: {allocated}（テナント購入数は管理センターで確認）")
    add("")

    add("### 2-6. 使われていない環境（削除候補）")
    add("")
    criteria = blueprint["lifecyclePolicy"]["unusedEnvironment"]
    add(
        f"判定基準: アプリ {criteria['maxApps']} 件以下かつフロー {criteria['maxFlows']} 件以下、"
        f"かつ最終更新から {criteria['inactiveDays']} 日以上経過。"
    )
    add("")
    if candidates:
        add("| 環境 | SKU | アプリ | フロー | 最終更新 | 解放される容量(MB) |")
        add("| --- | --- | --- | --- | --- | --- |")
        for candidate in candidates:
            add(
                f"| {candidate['displayName']} | {candidate['sku']} | "
                f"{candidate['appCount'] if candidate['appCount'] is not None else '-'} | "
                f"{candidate['flowCount'] if candidate['flowCount'] is not None else '-'} | "
                f"{(candidate['lastActivity'] or '-')[:10]} | {candidate['storageMb']:g} |"
            )
        add("")
        add(
            f"- **環境グループへ追加するフェーズの前にこの {len(candidates)} 環境を削除すると、"
            f"Dataverse 容量を {reclaimable:g}MB 削減できます。**"
        )
        add(f"- {blueprint['lifecyclePolicy']['why']}")
        add(f"- 手順: {criteria['action']}")
        add(f"- 注意: {criteria['note']}")
    else:
        add("- 削除候補はありません。")
    add("")

    add("### 2-7. 既存環境の割り当て提案")
    add("")
    recommendations = scan.get("groupRecommendations") or []
    if recommendations:
        add("| 環境 | 提案する環境グループ | 段階 | 理由 |")
        add("| --- | --- | --- | --- |")
        for item in recommendations:
            add(f"| {item['displayName']} | {item['group']} | {item['stage']} | {item['reason']} |")
    else:
        add("- 既存環境をそのまま採用する提案はありません。")
    add("")
    unknown = scan.get("blockUnmanagedUnknown") or []
    if unknown:
        add(
            f"- 「アンマネージド カスタマイズ不可」を API で読み取れなかった環境が {len(unknown)} 件あります: "
            f"{', '.join(unknown)}"
        )
        add(f"- {blueprint['lifecyclePolicy']['blockUnmanagedCustomizations']['fallback']}")
        add("")

    add("## 3. 実行手順")
    add("")
    add("設定は環境グループのルールで行うのが原則。グループ ルールに無い項目だけを手順 5 以降で補う。")
    add("すべて非対話スクリプトで実行でき、`--apply` を付けるまでは dry-run。")
    add("")
    add("| # | 作業 | 手段 | 影響 |")
    add("| --- | --- | --- | --- |")
    if candidates:
        add(
            f"| 0 | 使われていない環境を削除（{len(candidates)} 件 / {reclaimable:g}MB 削減） | "
            "管理センターまたは `DELETE {bap}/.../environments/{id}` | 元に戻せない。所有者の承認とバックアップが必須 |"
        )
    add("| 1 | 対象環境をマネージド環境化 | `set_managed_environment.py --apply` | Premium ライセンスが必要。グループへ入れる前提条件 |")
    add("| 2 | 不足している環境グループを作成 | `apply_environment_strategy.py --groups-only --apply` | 追加のみ。既存環境に影響なし |")
    add("| 3 | 環境をグループへ割り当て | `PATCH {bap}/.../environments/{id}` の `parentEnvironmentGroup`（既定環境は `apply_environment_strategy.py --apply` が実施） | グループのルールを継承する |")
    add("| 4 | グループのルールを設定して発行 | `apply_environment_strategy.py --rules-only --apply` | 環境側の設定がロックされる |")
    add("| 5 | テナント設定（ルーティング / Teams 禁止 / 共有制限 / レポート公開） | `apply_environment_strategy.py --tenant-settings-only --apply` | テナント全体に即時反映 |")
    add("| 6 | Dataverse 検索を有効化 | `enable_dataverse_search.py --apply` | インデックス作成に数時間かかる |")
    add("| 7 | ACP 推奨プロファイルを適用 | `apply_acp_profile.py --include-group --apply` | 許可リストを置換。事前に dry-run で差分確認 |")
    add("| 8 | Copilot クレジットを配分 | `set_environment_capacity.py --environment-id <ENV> --quantity <N> --apply` | 環境ごとの上限。合計が保有数を超えないこと |")
    add("| 9 | 利用ガイドラインを SharePoint に公開 | `sharepoint` スキル | 読み取り専用の情報ページ |")
    add("| 10 | ガイドライン URL をウェルカム コンテンツへ設定 | `set_environment_group_rules.py --welcome-markdown-file <FILE> --welcome-url <URL> --apply` | メーカーに表示される |")
    add("| 11 | AI CoE 内製開発の本番環境を新規作成 | `create_environments.py --apply` | 原則新規作成。既にアンマネージド不可の環境があれば 2-7 の提案に従って採用 |")
    add("| 12 | 開発 → テスト → 本番 のパイプラインを構成 | `setup_pipeline.py --apply` | 手動インポートを禁止し、変更の経路を 1 本にする |")
    add("")
    add("> 手順 4 の既知の制限: グループのルールを発行すると、環境側で設定済みの共有上限・ウェルカム コンテンツ・")
    add("> ソリューション チェッカー・使用状況分析・バックアップ保持・生成 AI 設定はグループの値で上書きされます。")
    add("")

    add("## 4. ロールバック")
    add("")
    add("- グループ ルール: 変更前に `set_environment_group_rules.py --environment-group-id <ID> --list` の出力を保存し、")
    add("  差し戻しは同じスクリプトの `--rule` / `--policy-rule` で元の値を再適用する。")
    add("- テナント設定: 変更前の値を `apply_environment_strategy.py --tenant-settings-only`（dry-run）の差分表示で控えておく。")
    add("- ACP: 適用前の許可リストを `apply_acp_profile.py --list` の出力として保存し、差し戻しは同じスクリプトで再適用する。")
    add("- ACP 専用モード: グループ ルール `AdvancedConnectorPoliciesOnly` を false に戻すとクラシック DLP の評価が復活する（DLP は削除しない）。")
    add("- 環境グループ: 環境をグループから外すと直前の設定を保持したままロックが解除される。")
    add("- マネージド環境: 無効化できるが、グループに属したままにはできない。")
    add("- Copilot クレジット: `set_environment_capacity.py` の一覧出力で変更前の割り当て数を控えておく。")
    add("")

    add("## 5. 未確定事項（承認前に決める）")
    add("")
    questions = decisions.get("openQuestions") or [
        "既存の `Dev` / `Production` グループを推奨グループへ名称変更するか、新規に作り直すか",
        "2-6 の削除候補を実際に削除するか（所有者への確認とバックアップの有無）",
        "AI CoE 内製開発の本番環境を新規作成するか、アンマネージド不可の既存環境を採用するか",
        "AI CoE 内製開発に検証（UAT）環境を作るか（オプション）",
        "既定環境（Contoso）をどのグループに入れるか、グループ外のままにするか",
        "個人の開発者環境の作成を全メーカーに開放するか、セキュリティ グループで絞るか",
        "ACP の許可セットから外れるコネクタのうち、業務で必要なものはあるか（申請フローで個別追加）",
        "Copilot クレジットを各環境へどう配分するか",
        "トレーニング環境のリセット周期（例: 90 日）",
    ]
    for question in questions:
        add(f"- [ ] {question}")
    add("")

    add("## 6. ガイドライン ページの構成")
    add("")
    for section in blueprint["guideline"]["sections"]:
        add(f"- {section}")
    add("")
    add(f"配布方法: {blueprint['guideline']['distribution']}")
    add("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="環境戦略の移行プランを生成する")
    parser.add_argument("--scan-file", type=Path, required=True, help="scan_environment_strategy.py の JSON")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--decisions-file", type=Path, help="AskUserQuestion の結果を入れた JSON（任意）")
    parser.add_argument("--output", type=Path, default=Path("admin-migration-plan.md"), help="出力先")
    args = parser.parse_args()

    scan = json.loads(args.scan_file.read_text(encoding="utf-8"))
    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    decisions = json.loads(args.decisions_file.read_text(encoding="utf-8")) if args.decisions_file else {}

    args.output.write_text(build(scan, blueprint, decisions), encoding="utf-8")
    print(f"移行プランを生成しました: {args.output}")
    print("内容をユーザーと確認し、承認を得てから適用手順へ進んでください。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
