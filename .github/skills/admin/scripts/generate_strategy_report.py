"""スキャン結果から、合意形成用のインタラクティブ HTML レポートを生成する。

`scan_environment_strategy.py --report-file` の JSON とブループリントを入力に、
組織戦略・環境戦略・現状・ギャップ・リスク・実行プランを 1 枚の HTML にまとめる。
適用後は `--results-file` を渡すと「適用結果」タブが追加される。**環境は変更しない。**

使い方:
    python scan_environment_strategy.py --tenant-id <ID> --report-file scan.json
    python generate_strategy_report.py --scan-file scan.json --output admin-strategy-report.html
    python generate_strategy_report.py --scan-file scan.json --results-file results.json --output admin-strategy-report.html
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from datetime import datetime
from pathlib import Path

BLUEPRINT = Path(__file__).resolve().parents[1] / "references" / "environment-strategy.json"
CITIZEN_GROUPS = ("市民開発者環境グループ", "個人開発者環境グループ")


def _finding(severity: str, category: str, title: str, detail: str, action: str) -> dict:
    return {"severity": severity, "category": category, "title": title, "detail": detail, "action": action}


def organization_findings(scan: dict, blueprint: dict) -> list[dict]:
    """組織戦略（誰が何を作るか）とのギャップを判定する。"""
    strategy = blueprint["organizationStrategy"]
    threshold = strategy["reviewThresholds"]["citizenBusinessSystemApps"]
    findings = []
    for environment in scan["environments"]:
        assets = (environment.get("appCount") or 0) + (environment.get("flowCount") or 0)
        if environment.get("group") in CITIZEN_GROUPS and assets >= threshold:
            findings.append(
                _finding(
                    "high",
                    "組織戦略",
                    f"{environment['displayName']}: 市民開発者向けの環境に資産が {assets} 件",
                    "市民開発が作るのは Copilot Cowork のスキル（保守不要）で、保守が必要な業務システムは AI CoE が開発する方針。"
                    f"アプリ {environment.get('appCount')} 件 / フロー {environment.get('flowCount')} 件は業務システムが育っている兆候。",
                    "利用状況を棚卸しし、業務システムに該当するものは AI CoE 内製開発グループへ移管する。"
                    "残すものは Cowork スキルへ置き換えられないか検討する。",
                )
            )
    ungrouped = scan.get("ungroupedEnvironments") or []
    if ungrouped:
        findings.append(
            _finding(
                "high",
                "組織戦略",
                f"統制外の環境が {len(ungrouped)} 件",
                f"どの環境グループにも属していないため、誰が何を作ってよいかのルールが適用されていない: {', '.join(ungrouped)}",
                "役割に合うグループへ割り当てる。開発実態が無ければ削除する。",
            )
        )
    for item in scan.get("groupRecommendations") or []:
        findings.append(
            _finding(
                "info",
                "組織戦略",
                f"{item['displayName']} を {item['group']} / {item['stage']} へ",
                item["reason"],
                "AI CoE 内製開発グループへ割り当て、パイプラインで下流へ流す形に整える。"
                if item["stage"] != "Prod"
                else "本番環境として採用し、新規作成は行わない。",
            )
        )
    findings.append(
        _finding(
            "info",
            "組織戦略",
            "市民開発者の例外開発は条件付きで許可",
            strategy["citizenDeveloperExceptions"]["policy"],
            " / ".join(strategy["citizenDeveloperExceptions"]["conditions"]),
        )
    )
    return findings


def environment_findings(scan: dict, blueprint: dict) -> list[dict]:
    """環境戦略とのギャップ・リスクを判定する。"""
    findings = []
    unmanaged = scan.get("unmanagedEnvironments") or []
    if unmanaged:
        findings.append(
            _finding(
                "high",
                "環境グループ",
                f"マネージド環境ではない環境が {len(unmanaged)} 件",
                f"環境グループにはマネージド環境しか入れられないため、統制の対象外になる: {', '.join(unmanaged)}",
                "`set_managed_environment.py --apply` でマネージド環境化する（Premium ライセンスが必要）。",
            )
        )
    missing = scan.get("missingGroups") or []
    if missing:
        findings.append(
            _finding(
                "medium",
                "環境グループ",
                f"推奨グループが {len(missing)} 件未作成",
                ", ".join(missing),
                "`apply_environment_strategy.py --groups-only --apply` で作成する。",
            )
        )
    candidates = scan.get("unusedEnvironmentCandidates") or []
    if candidates:
        criteria = blueprint["lifecyclePolicy"]["unusedEnvironment"]
        findings.append(
            _finding(
                "medium",
                "ライフサイクル",
                f"使われていない環境が {len(candidates)} 件（{scan.get('reclaimableStorageMb', 0):g}MB 削減可能）",
                f"アプリ {criteria['maxApps']} 件以下・フロー {criteria['maxFlows']} 件以下で "
                f"{criteria['inactiveDays']} 日以上更新されていない: "
                + ", ".join(c["displayName"] for c in candidates),
                f"{criteria['action']}。{criteria['note']}",
            )
        )
    for gap in scan.get("tenantSettingGaps") or []:
        findings.append(
            _finding(
                "medium",
                "テナント設定",
                gap["label"],
                f"現在 `{gap['actual']}` / 推奨 `{gap['expected']}`。{gap['why']}",
                "`apply_environment_strategy.py --tenant-settings-only --apply` で反映する。",
            )
        )
    if scan.get("classicDlpPolicies"):
        policy = blueprint["connectorPolicy"]
        findings.append(
            _finding(
                "medium",
                "コネクタ",
                "クラシック DLP が適用されたまま",
                f"クラシック DLP は既定許可のため、新しいコネクタが自動で使えてしまう。{policy['why']}",
                f"`apply_acp_profile.py --include-group --apply` で {policy['profile']} プロファイルへ移行する。",
            )
        )
    licenses = scan.get("licenses") or {}
    if licenses.get("error"):
        findings.append(
            _finding(
                "medium",
                "ライセンス",
                "ライセンス情報を取得できませんでした",
                str(licenses["error"]),
                "Microsoft Graph の権限を確認するか、管理センターで手動確認する。",
            )
        )
    elif not licenses.get("premiumLikeSkus"):
        findings.append(
            _finding(
                "high",
                "ライセンス",
                "スタンドアロン ライセンスが見つかりません",
                blueprint["licenses"]["why"],
                "マネージド環境化の前に必要数を確保する。",
            )
        )
    allocated = sum(e.get("copilotCredits") or 0 for e in scan["environments"])
    entitled = scan.get("copilotCreditsEntitled")
    if entitled is not None and allocated > entitled:
        findings.append(
            _finding(
                "high",
                "ライセンス",
                "Copilot クレジットの割り当てが保有数を超過",
                f"保有 {entitled:g} に対して割り当て合計 {allocated:g}。",
                "`set_environment_capacity.py --environment-id <ENV> --quantity <N> --apply` で調整する。",
            )
        )
    unknown = scan.get("blockUnmanagedUnknown") or []
    if unknown:
        findings.append(
            _finding(
                "info",
                "環境設定",
                f"「アンマネージド カスタマイズ不可」を確認できない環境が {len(unknown)} 件",
                blueprint["lifecyclePolicy"]["blockUnmanagedCustomizations"]["why"],
                blueprint["lifecyclePolicy"]["blockUnmanagedCustomizations"]["fallback"],
            )
        )
    return findings


def plan_steps(scan: dict) -> list[dict]:
    candidates = scan.get("unusedEnvironmentCandidates") or []
    steps = []
    if candidates:
        steps.append(
            {
                "title": f"使われていない環境を削除（{len(candidates)} 件 / {scan.get('reclaimableStorageMb', 0):g}MB 削減）",
                "command": "管理センター、または DELETE {bap}/scopes/admin/environments/{envId}",
                "impact": "元に戻せない。所有者の承認とバックアップが必須",
            }
        )
    steps += [
        {"title": "対象環境をマネージド環境化", "command": "set_managed_environment.py --apply", "impact": "Premium ライセンスが必要"},
        {"title": "不足している環境グループを作成", "command": "apply_environment_strategy.py --groups-only --apply", "impact": "追加のみ"},
        {"title": "環境をグループへ割り当て", "command": "apply_environment_strategy.py --apply", "impact": "グループのルールを継承"},
        {"title": "グループのルールを設定して発行", "command": "apply_environment_strategy.py --rules-only --apply", "impact": "環境側の設定がロックされる"},
        {"title": "テナント設定を反映", "command": "apply_environment_strategy.py --tenant-settings-only --apply", "impact": "テナント全体に即時反映"},
        {"title": "Dataverse 検索を有効化", "command": "enable_dataverse_search.py --apply", "impact": "インデックス作成に数時間"},
        {"title": "ACP 推奨プロファイルを適用", "command": "apply_acp_profile.py --include-group --apply", "impact": "許可リストを置換"},
        {"title": "Copilot クレジットを配分", "command": "set_environment_capacity.py --environment-id <ENV> --quantity <N> --apply", "impact": "合計が保有数を超えないこと"},
        {"title": "AI CoE 内製開発の本番環境を作成", "command": "create_environments.py --apply", "impact": "原則新規作成"},
        {"title": "開発 → テスト → 本番のパイプラインを構成", "command": "setup_pipeline.py --apply", "impact": "手動インポートを禁止"},
    ]
    return steps


def build_payload(scan: dict, blueprint: dict, results: dict | None) -> dict:
    findings = organization_findings(scan, blueprint) + environment_findings(scan, blueprint)
    return {
        "generatedAt": datetime.now().astimezone().strftime("%Y-%m-%d %H:%M"),
        "scan": scan,
        "organizationStrategy": blueprint["organizationStrategy"],
        "groups": blueprint["groups"],
        "connectorPolicy": blueprint["connectorPolicy"],
        "lifecyclePolicy": blueprint["lifecyclePolicy"],
        "namingConvention": blueprint["namingConvention"],
        "guideline": blueprint["guideline"],
        "findings": findings,
        "steps": plan_steps(scan),
        "results": results,
    }


HTML_TEMPLATE = """<!doctype html>
<html lang="ja" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Power Platform 環境戦略レポート</title>
<style>
:root{--bg:#0f1117;--panel:#171a23;--panel2:#1e222d;--line:#2a2f3d;--fg:#e6e9ef;--muted:#9aa3b2;
--accent:#6aa6ff;--high:#ff6b6b;--medium:#ffb454;--info:#5ad19b;--shadow:0 8px 24px rgba(0,0,0,.35)}
html[data-theme=light]{--bg:#f5f6f8;--panel:#fff;--panel2:#f0f2f6;--line:#dfe3ea;--fg:#1b1f28;--muted:#5c6575;
--accent:#2563eb;--high:#d92d20;--medium:#b54708;--info:#067647;--shadow:0 8px 24px rgba(16,24,40,.08)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"Segoe UI","Yu Gothic UI",system-ui,sans-serif;line-height:1.7}
header{padding:28px 32px 20px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end;justify-content:space-between}
h1{margin:0;font-size:24px;letter-spacing:.02em}
h2{font-size:19px;margin:32px 0 12px;padding-left:10px;border-left:4px solid var(--accent)}
h3{font-size:15px;margin:22px 0 8px;color:var(--muted);letter-spacing:.04em}
.sub{color:var(--muted);font-size:13px;margin-top:6px}
main{padding:0 32px 80px;max-width:1280px;margin:0 auto}
nav{display:flex;gap:6px;flex-wrap:wrap;padding:14px 32px;position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);z-index:10}
nav button{background:transparent;border:1px solid transparent;color:var(--muted);padding:8px 14px;border-radius:999px;cursor:pointer;font-size:13px;font-family:inherit}
nav button:hover{color:var(--fg);background:var(--panel2)}
nav button[aria-selected=true]{background:var(--accent);color:#fff;border-color:var(--accent)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:14px 0;box-shadow:var(--shadow)}
.grid{display:grid;gap:14px}
.kpis{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.cards{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.kpi .v{font-size:30px;font-weight:600;letter-spacing:-.02em}
.kpi .l{color:var(--muted);font-size:12px;margin-top:2px}
.kpi.warn .v{color:var(--medium)} .kpi.bad .v{color:var(--high)} .kpi.good .v{color:var(--info)}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}
th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600;font-size:12px;cursor:pointer;user-select:none;white-space:nowrap}
th:hover{color:var(--fg)}
tbody tr:hover{background:var(--panel2)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid;white-space:nowrap}
.b-high{color:var(--high);border-color:var(--high);background:color-mix(in srgb,var(--high) 12%,transparent)}
.b-medium{color:var(--medium);border-color:var(--medium);background:color-mix(in srgb,var(--medium) 12%,transparent)}
.b-info{color:var(--info);border-color:var(--info);background:color-mix(in srgb,var(--info) 12%,transparent)}
.b-mute{color:var(--muted);border-color:var(--line)}
.finding{border:1px solid var(--line);border-left:4px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0;background:var(--panel)}
.finding.high{border-left-color:var(--high)} .finding.medium{border-left-color:var(--medium)} .finding.info{border-left-color:var(--info)}
.finding .t{font-weight:600;margin:6px 0 4px}
.finding .a{margin-top:8px;font-size:13px;color:var(--muted)}
.finding .a b{color:var(--fg)}
code,.mono{font-family:Consolas,"Cascadia Mono",monospace;font-size:12px;background:var(--panel2);padding:2px 6px;border-radius:6px}
ul{margin:6px 0;padding-left:20px} li{margin:4px 0}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:8px 0 4px}
input[type=search],select{background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:7px 10px;font-family:inherit;font-size:13px}
.iconbtn{background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:13px}
.iconbtn:hover{border-color:var(--accent)}
.hidden{display:none}
.step{display:flex;gap:12px;align-items:flex-start;padding:11px 0;border-bottom:1px solid var(--line)}
.step .n{flex:0 0 26px;height:26px;border-radius:50%;background:var(--panel2);border:1px solid var(--line);display:grid;place-items:center;font-size:12px;color:var(--muted)}
.bar{height:8px;border-radius:999px;background:var(--panel2);overflow:hidden;margin-top:6px}
.bar > i{display:block;height:100%;background:var(--accent)}
.note{border:1px dashed var(--line);border-radius:10px;padding:12px 14px;color:var(--muted);font-size:13px;margin-top:10px}
.role td:first-child{font-weight:600;white-space:nowrap}
footer{color:var(--muted);font-size:12px;padding:20px 32px;border-top:1px solid var(--line)}
@media print{nav,.toolbar,.iconbtn{display:none}.panel{break-inside:avoid}section[hidden]{display:block!important}}
</style>
</head>
<body>
<header>
  <div>
    <h1>Power Platform 環境戦略レポート</h1>
    <div class="sub" id="meta"></div>
  </div>
  <div class="toolbar">
    <button class="iconbtn" id="themeBtn">テーマ切り替え</button>
    <button class="iconbtn" onclick="window.print()">印刷 / PDF</button>
  </div>
</header>
<nav id="tabs"></nav>
<main id="main"></main>
<footer>このレポートは読み取り専用のスキャン結果から生成されています。適用は承認後に別途スクリプトで実行します。</footer>
<script type="application/json" id="payload">__PAYLOAD__</script>
<script>
const D = JSON.parse(document.getElementById('payload').textContent);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => (v === null || v === undefined) ? '-' : (typeof v === 'number' ? (+v.toFixed(1)).toLocaleString() : v);
const sevLabel = {high:'要対応', medium:'確認', info:'情報'};

document.getElementById('meta').textContent =
  `生成: ${D.generatedAt}　テナント: ${D.scan.tenantId}　環境 ${D.scan.environments.length} 件 / グループ ${D.scan.environmentGroups.length} 件`;

const TABS = [
  ['summary', 'サマリー'],
  ['org', '組織戦略'],
  ['env', '環境戦略'],
  ['current', '現状スキャン'],
  ['gaps', 'ギャップとリスク'],
  ['plan', '実行プランと合意'],
];
if (D.results) TABS.push(['results', '適用結果']);

const counts = sev => D.findings.filter(f => f.severity === sev).length;

function kpi(v, l, cls) { return `<div class="kpi ${cls||''}"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`; }

function summary() {
  const s = D.scan;
  const allocated = s.environments.reduce((a, e) => a + (e.copilotCredits || 0), 0);
  const storage = s.environments.reduce((a, e) => a + (e.storageMb || 0), 0);
  return `
  <h2>現状のサマリー</h2>
  <div class="grid kpis">
    ${kpi(s.environments.length, '環境')}
    ${kpi(s.environmentGroups.length, '環境グループ')}
    ${kpi((s.unmanagedEnvironments||[]).length, 'マネージド環境ではない', (s.unmanagedEnvironments||[]).length ? 'bad' : 'good')}
    ${kpi((s.ungroupedEnvironments||[]).length, 'グループ未所属', (s.ungroupedEnvironments||[]).length ? 'bad' : 'good')}
    ${kpi((s.unusedEnvironmentCandidates||[]).length, '削除候補の環境', (s.unusedEnvironmentCandidates||[]).length ? 'warn' : 'good')}
    ${kpi(num(s.reclaimableStorageMb) + ' MB', '削除で削減できる容量', (s.reclaimableStorageMb||0) > 0 ? 'warn' : '')}
    ${kpi(num(storage) + ' MB', 'Dataverse 消費量の合計')}
    ${kpi(num(allocated) + ' / ' + num(s.copilotCreditsEntitled), 'Copilot クレジット', allocated > (s.copilotCreditsEntitled ?? Infinity) ? 'bad' : '')}
  </div>
  <h2>指摘の内訳</h2>
  <div class="grid kpis">
    ${kpi(counts('high'), '要対応', counts('high') ? 'bad' : 'good')}
    ${kpi(counts('medium'), '確認', counts('medium') ? 'warn' : 'good')}
    ${kpi(counts('info'), '情報')}
  </div>
  <div class="panel">
    <h3>このレポートの読み方</h3>
    <ul>
      <li><b>組織戦略</b>: 誰が何を作るかの方針。ここが決まらないと環境設計は決まらない。</li>
      <li><b>環境戦略</b>: 方針を実現する 5 つの環境グループと、それぞれのルール。</li>
      <li><b>ギャップとリスク</b>: 現状と方針の差分。<span class="badge b-high">要対応</span> から順に潰す。</li>
      <li><b>実行プランと合意</b>: 承認後に実行するスクリプトの順序。<b>合意するまで環境には一切変更を加えません。</b></li>
    </ul>
  </div>`;
}

function org() {
  const o = D.organizationStrategy;
  const f = D.findings.filter(x => x.category === '組織戦略');
  return `
  <h2>組織戦略 — 誰が何を作るか</h2>
  <div class="note">${esc(o.why)}</div>
  <div class="grid cards" style="margin-top:14px">
    ${o.principles.map((p, i) => `<div class="panel"><div class="badge b-mute">方針 ${i+1}</div>
      <div class="finding-t" style="font-weight:600;margin:8px 0 4px">${esc(p.title)}</div>
      <div class="sub" style="color:var(--muted)">${esc(p.detail)}</div></div>`).join('')}
  </div>
  <h2>役割分担</h2>
  <div class="panel"><table class="role">
    <thead><tr><th>役割</th><th>作るもの</th><th>使うツール</th><th>GitHub Copilot</th><th>保守</th><th>所属グループ</th></tr></thead>
    <tbody>${o.roles.map(r => `<tr><td>${esc(r.role)}</td><td>${esc(r.develops)}</td><td>${esc(r.tools)}</td>
      <td><span class="badge ${r.githubCopilot ? 'b-info' : 'b-high'}">${r.githubCopilot ? '利用する' : '利用しない'}</span></td>
      <td>${esc(r.maintenance)}</td><td>${esc(r.group)}</td></tr>`).join('')}</tbody>
  </table></div>
  <h2>市民開発者の例外</h2>
  <div class="panel">
    <p>${esc(o.citizenDeveloperExceptions.policy)}</p>
    <h3>許可の条件</h3>
    <ul>${o.citizenDeveloperExceptions.conditions.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
    <div class="note">${esc(o.citizenDeveloperExceptions.escalation)}</div>
  </div>
  <h2>組織戦略に対するレビュー結果</h2>
  ${f.length ? f.map(finding).join('') : '<div class="panel">方針との差分は検出されませんでした。</div>'}`;
}

function envStrategy() {
  return `
  <h2>環境グループ構成</h2>
  <div class="grid cards">
    ${D.groups.map(g => `<div class="panel">
      <span class="badge b-mute">${esc(g.code)}</span>
      <div style="font-weight:600;margin:8px 0 4px">${esc(g.name)}</div>
      <div class="sub" style="color:var(--muted)">${esc(g.purpose)}</div>
      <table><tbody>
        <tr><th>共有上限</th><td>${g.rules.sharingLimitUsers == null ? '無制限' : esc(g.rules.sharingLimitUsers) + ' 名'}</td></tr>
        <tr><th>Code Apps</th><td>${g.rules.codeApps ? '可' : '不可'}</td></tr>
        <tr><th>Copilot クレジット</th><td>${g.rules.copilotCredits ? '有効' : '無効'}</td></tr>
        <tr><th>ソリューション チェッカー</th><td>${esc(g.rules.solutionCheckerMode)}</td></tr>
      </tbody></table>
      <h3>環境</h3>
      <ul>${g.environments.map(e => `<li>${esc(e.name)}${e.optional ? '（任意）' : ''} — ${esc(e.type)}${e.note ? '<br><span style="color:var(--muted);font-size:12px">' + esc(e.note) + '</span>' : ''}</li>`).join('')}</ul>
      ${g.productionPolicy ? `<div class="note"><b>本番環境の方針:</b> ${esc(g.productionPolicy.why)}<br>
        検証環境: ${esc(g.productionPolicy.validationWhy)}<br>
        例外: ${esc(g.productionPolicy.adoptExistingWhy)}</div>` : ''}
    </div>`).join('')}
  </div>
  <h2>コネクタ ポリシー</h2>
  <div class="panel">
    <p><b>${esc(D.connectorPolicy.mode)}</b>（プロファイル <code>${esc(D.connectorPolicy.profile)}</code>）</p>
    <p style="color:var(--muted)">${esc(D.connectorPolicy.why)}</p>
    <div class="note">${esc(D.connectorPolicy.note)}</div>
  </div>
  <h2>環境の命名規則</h2>
  <div class="panel">
    <table><tbody>
      <tr><th>表示名</th><td><code>${esc(D.namingConvention.displayNamePattern)}</code></td></tr>
      <tr><th>ドメイン名</th><td><code>${esc(D.namingConvention.domainNamePattern)}</code></td></tr>
      <tr><th>例</th><td>${D.namingConvention.examples.map(e => `<code>${esc(e)}</code>`).join(' ')}</td></tr>
    </tbody></table>
    <ul>${D.namingConvention.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
  </div>
  <h2>使われていない環境の棚卸し基準</h2>
  <div class="panel">
    <p style="color:var(--muted)">${esc(D.lifecyclePolicy.why)}</p>
    <table><tbody>
      <tr><th>アプリ数</th><td>${esc(D.lifecyclePolicy.unusedEnvironment.maxApps)} 件以下</td></tr>
      <tr><th>フロー数</th><td>${esc(D.lifecyclePolicy.unusedEnvironment.maxFlows)} 件以下</td></tr>
      <tr><th>未使用期間</th><td>${esc(D.lifecyclePolicy.unusedEnvironment.inactiveDays)} 日以上</td></tr>
    </tbody></table>
  </div>`;
}

function current() {
  const s = D.scan;
  const maxStorage = Math.max(1, ...s.environments.map(e => e.storageMb || 0));
  const rows = s.environments.map(e => {
    const flag = (s.unusedEnvironmentCandidates || []).some(c => c.id === e.id);
    return `<tr data-name="${esc((e.displayName||'') + ' ' + (e.group||'') + ' ' + (e.sku||''))}">
      <td>${esc(e.displayName)}${flag ? ' <span class="badge b-medium">削除候補</span>' : ''}${e.isDefault ? ' <span class="badge b-mute">既定</span>' : ''}</td>
      <td>${esc(e.sku)}</td>
      <td>${e.managed ? '<span class="badge b-info">はい</span>' : '<span class="badge b-high">いいえ</span>'}</td>
      <td>${esc(e.group || '-')}</td>
      <td class="num" data-v="${e.appCount ?? -1}">${num(e.appCount)}</td>
      <td class="num" data-v="${e.flowCount ?? -1}">${num(e.flowCount)}</td>
      <td class="num" data-v="${e.storageMb || 0}">${num(e.storageMb)}<div class="bar"><i style="width:${((e.storageMb||0)/maxStorage*100).toFixed(1)}%"></i></div></td>
      <td class="num" data-v="${e.acpAllowedCount ?? -1}">${num(e.acpAllowedCount)}</td>
      <td class="num" data-v="${e.copilotCredits ?? -1}">${num(e.copilotCredits)}</td>
      <td>${(e.lastActivity || '-').slice(0, 10)}</td>
    </tr>`;
  }).join('');
  const settings = Object.entries(s.tenantSettings).map(([k, v]) => {
    const gap = (s.tenantSettingGaps || []).find(g => g.setting === k);
    return `<tr><td>${esc(gap ? gap.label : k)}</td><td><code>${esc(v)}</code></td>
      <td>${gap ? '<span class="badge b-medium">推奨 ' + esc(gap.expected) + '</span>' : '<span class="badge b-info">OK</span>'}</td></tr>`;
  }).join('');
  const lic = s.licenses || {};
  const licRows = [...(lic.premiumLikeSkus || []), ...(lic.copilotStudioSkus || [])]
    .map(x => `<tr><td><code>${esc(x.skuPartNumber)}</code></td><td class="num">${esc(x.consumed)}</td><td class="num">${esc(x.enabled)}</td></tr>`).join('');
  return `
  <h2>環境の一覧</h2>
  <div class="toolbar">
    <input type="search" id="envFilter" placeholder="環境名 / グループ / SKU で絞り込み" size="34">
    <span class="sub">列見出しをクリックすると並び替えできます</span>
  </div>
  <div class="panel"><table id="envTable">
    <thead><tr><th>環境</th><th>SKU</th><th>マネージド</th><th>グループ</th><th>アプリ</th><th>フロー</th><th>容量(MB)</th><th>ACP 許可</th><th>Copilot</th><th>最終更新</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <h2>テナント設定</h2>
  <div class="panel"><table><thead><tr><th>設定</th><th>現在値</th><th>判定</th></tr></thead><tbody>${settings}</tbody></table></div>
  <h2>コネクタ ポリシー（適用中）</h2>
  <div class="panel">${(s.classicDlpPolicies || []).length
    ? '<ul>' + s.classicDlpPolicies.map(p => `<li>${esc(p.displayName)} <span class="badge b-mute">${esc(p.type)}</span></li>`).join('') + '</ul>'
    : 'クラシック DLP は適用されていません。'}</div>
  <h2>ライセンス</h2>
  <div class="panel">${lic.error ? esc(lic.error)
    : `<table><thead><tr><th>SKU</th><th>消費</th><th>保有</th></tr></thead><tbody>${licRows || '<tr><td colspan="3">該当なし</td></tr>'}</tbody></table>`}</div>`;
}

function finding(f) {
  return `<div class="finding ${f.severity}" data-sev="${f.severity}">
    <span class="badge b-${f.severity}">${sevLabel[f.severity]}</span>
    <span class="badge b-mute">${esc(f.category)}</span>
    <div class="t">${esc(f.title)}</div>
    <div>${esc(f.detail)}</div>
    <div class="a"><b>対応:</b> ${esc(f.action)}</div>
  </div>`;
}

function gaps() {
  const order = {high: 0, medium: 1, info: 2};
  const sorted = [...D.findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return `
  <h2>ギャップとリスク</h2>
  <div class="toolbar">
    <select id="sevFilter">
      <option value="">すべて（${sorted.length}）</option>
      <option value="high">要対応（${counts('high')}）</option>
      <option value="medium">確認（${counts('medium')}）</option>
      <option value="info">情報（${counts('info')}）</option>
    </select>
  </div>
  <div id="findingList">${sorted.map(finding).join('') || '<div class="panel">ギャップは検出されませんでした。</div>'}</div>`;
}

function plan() {
  return `
  <h2>実行プラン</h2>
  <div class="note">承認をいただくまで環境には一切変更を加えません。各スクリプトは <code>--apply</code> を付けるまで dry-run です。</div>
  <div class="panel">
    ${D.steps.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div>
      <div style="font-weight:600">${esc(s.title)}</div>
      <div class="mono" style="display:inline-block;margin:4px 0">${esc(s.command)}</div>
      <div class="sub">影響: ${esc(s.impact)}</div>
    </div></div>`).join('')}
  </div>
  <h2>合意したい内容</h2>
  <div class="panel">
    <ul>
      <li>組織戦略（市民開発は Cowork スキル / 業務システムは AI CoE が開発・保守）に合意すること</li>
      <li>削除候補の環境を削除してよいか（所有者の確認とバックアップの担当）</li>
      <li>AI CoE 内製開発の本番環境を新規作成するか、既存を採用するか</li>
      <li>検証（UAT）環境を作るか</li>
      <li>ACP 専用モードへ移行してよいか</li>
      <li>Copilot クレジットの配分</li>
    </ul>
    <div class="note">合意後、上の順序でスクリプトを実行し、結果をこのレポートの「適用結果」タブに追記します。</div>
  </div>
  <h2>ガイドラインの公開</h2>
  <div class="panel">
    <ul>${D.guideline.sections.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="note">${esc(D.guideline.distribution)}</div>
  </div>`;
}

function results() {
  const r = D.results || {};
  const items = r.steps || [];
  return `
  <h2>適用結果</h2>
  <div class="sub">実行日時: ${esc(r.appliedAt || '-')}　実行者: ${esc(r.appliedBy || '-')}</div>
  <div class="panel">${items.length ? `<table><thead><tr><th>作業</th><th>結果</th><th>備考</th></tr></thead><tbody>
    ${items.map(s => `<tr><td>${esc(s.title)}</td>
      <td><span class="badge ${s.status === 'ok' ? 'b-info' : s.status === 'skipped' ? 'b-mute' : 'b-high'}">${esc(s.status)}</span></td>
      <td>${esc(s.note || '')}</td></tr>`).join('')}</tbody></table>` : '結果はまだ記録されていません。'}</div>
  ${r.summary ? `<div class="note">${esc(r.summary)}</div>` : ''}`;
}

const RENDER = {summary, org, env: envStrategy, current, gaps, plan, results};
const nav = document.getElementById('tabs');
const main = document.getElementById('main');
TABS.forEach(([id, label]) => {
  const b = document.createElement('button');
  b.textContent = label; b.dataset.tab = id; b.setAttribute('aria-selected', 'false');
  b.onclick = () => show(id);
  nav.appendChild(b);
  const sec = document.createElement('section');
  sec.id = 'tab-' + id; sec.hidden = true;
  main.appendChild(sec);
});

function show(id) {
  TABS.forEach(([t]) => {
    document.getElementById('tab-' + t).hidden = t !== id;
    nav.querySelector(`[data-tab="${t}"]`).setAttribute('aria-selected', String(t === id));
  });
  const sec = document.getElementById('tab-' + id);
  if (!sec.dataset.rendered) { sec.innerHTML = RENDER[id](); sec.dataset.rendered = '1'; wire(id); }
  location.hash = id;
}

function wire(id) {
  if (id === 'current') {
    const filter = document.getElementById('envFilter');
    filter.oninput = () => {
      const q = filter.value.toLowerCase();
      document.querySelectorAll('#envTable tbody tr').forEach(tr => {
        tr.classList.toggle('hidden', !tr.dataset.name.toLowerCase().includes(q));
      });
    };
    document.querySelectorAll('#envTable th').forEach((th, i) => {
      th.onclick = () => {
        const tbody = th.closest('table').tBodies[0];
        const asc = th.dataset.asc !== '1';
        th.dataset.asc = asc ? '1' : '0';
        [...tbody.rows].sort((a, b) => {
          const av = a.cells[i].dataset.v, bv = b.cells[i].dataset.v;
          const cmp = (av !== undefined && bv !== undefined)
            ? (+av) - (+bv)
            : a.cells[i].textContent.localeCompare(b.cells[i].textContent, 'ja');
          return asc ? cmp : -cmp;
        }).forEach(tr => tbody.appendChild(tr));
      };
    });
  }
  if (id === 'gaps') {
    const sel = document.getElementById('sevFilter');
    sel.onchange = () => {
      document.querySelectorAll('#findingList .finding').forEach(el => {
        el.classList.toggle('hidden', sel.value && el.dataset.sev !== sel.value);
      });
    };
  }
}

document.getElementById('themeBtn').onclick = () => {
  const html = document.documentElement;
  html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
};

show(TABS.some(([t]) => t === location.hash.slice(1)) ? location.hash.slice(1) : 'summary');
</script>
</body>
</html>
"""


def render(payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    return HTML_TEMPLATE.replace("__PAYLOAD__", data)


def assert_openable(output: Path, allow_outside: bool) -> None:
    """VS Code の統合ブラウザは信頼されたフォルダー外の file:// を Forbidden で拒否するため、生成前に弾く。"""
    if allow_outside:
        return
    resolved = output.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    if resolved == temp_root or temp_root in resolved.parents:
        raise SystemExit(
            f"出力先が一時ディレクトリ配下です: {resolved}\n"
            "VS Code の統合ブラウザはこの場所を 'Forbidden. File does not reside within a trusted folder.' で"
            "拒否するため、レポートを開けません。--output にワークスペース内のパスを指定してください\n"
            "（ブラウザで開かないことが確定している場合は --allow-outside-workspace）。"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="スキャン結果からインタラクティブ HTML レポートを生成する")
    parser.add_argument("--scan-file", type=Path, required=True, help="scan_environment_strategy.py の JSON")
    parser.add_argument("--blueprint", type=Path, default=BLUEPRINT, help="ブループリント JSON")
    parser.add_argument("--results-file", type=Path, help="適用結果の JSON（適用後に渡すと「適用結果」タブが増える）")
    parser.add_argument("--output", type=Path, default=Path("admin-strategy-report.html"), help="出力先 HTML")
    parser.add_argument(
        "--allow-outside-workspace",
        action="store_true",
        help="一時ディレクトリなど統合ブラウザで開けない場所への出力を許可する",
    )
    args = parser.parse_args()

    assert_openable(args.output, args.allow_outside_workspace)

    scan = json.loads(args.scan_file.read_text(encoding="utf-8"))
    blueprint = json.loads(args.blueprint.read_text(encoding="utf-8"))
    results = json.loads(args.results_file.read_text(encoding="utf-8")) if args.results_file else None

    payload = build_payload(scan, blueprint, results)
    args.output.write_text(render(payload), encoding="utf-8")
    print(f"レポートを生成しました: {args.output.resolve()}")
    print(f"指摘: 要対応 {sum(1 for f in payload['findings'] if f['severity'] == 'high')} 件 / "
          f"確認 {sum(1 for f in payload['findings'] if f['severity'] == 'medium')} 件 / "
          f"情報 {sum(1 for f in payload['findings'] if f['severity'] == 'info')} 件")
    print("ブラウザで開いてユーザーと内容を確認し、合意を得てから適用手順へ進んでください。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"エラー: {error}")
        sys.exit(2)
