#!/usr/bin/env python3
"""Post-deploy regression suite for an AI teammate.

Runs in two layers, both of which must stay green after every deploy:

  Layer 1 - invariants (``--check``): deterministic, free, no agent turn. Everything that has
            silently broken at least once in practice - Always On, published access boundaries,
            a disabled agent identity, an empty ``skills/`` next to ``Skills.Enabled=true``,
            settings sections whose feature block was never scaffolded.
  Layer 2 - behaviour (``--execute``): real turns. The messaging endpoint only accepts Bot
            Framework traffic signed for that agent, so a test runner cannot call it. Cases are
            queued as ``<prefix>_evaltestresult`` rows instead and the teammate's own TestWorker
            picks up the rows carrying its agent key. That is the same path the evaluation hub's
            "auto test" page uses, so regression results and manual results land in one place.

Exit codes: 0 all green, 1 a case failed, 2 the run could not start.

Usage:
    python scripts/run_regression_tests.py --check
    python scripts/run_regression_tests.py --execute
    python scripts/run_regression_tests.py --execute --suite regression/suite.json --junit out.xml
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# A Japanese Windows console defaults to cp932 and a single non-ASCII line would abort the run.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except AttributeError:
        pass


def _resolve_auth_helper_dir() -> str:
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent.parent / "standard" / "scripts",
        here.parent,
        *[p / ".github" / "skills" / "standard" / "scripts" for p in here.parents],
    ]
    for candidate in candidates:
        if (candidate / "auth_helper.py").is_file():
            return str(candidate)
    raise ModuleNotFoundError("auth_helper.py not found (.github/skills/standard/scripts).")


sys.path.insert(0, _resolve_auth_helper_dir())
import auth_helper  # noqa: E402
from auth_helper import api_get, api_post, get_session  # noqa: E402

STATUS_WAITING, STATUS_RUNNING, STATUS_DONE, STATUS_FAILED, STATUS_CANCELLED = 1, 2, 3, 4, 5
TERMINAL_STATUSES = {STATUS_DONE, STATUS_FAILED, STATUS_CANCELLED}
STATUS_LABEL = {1: "待機中", 2: "実行中", 3: "完了", 4: "失敗", 5: "キャンセル"}

# Published Autopilot agents reject every activity unless all four are present (troubleshooting #74).
REQUIRED_ACCESS_BOUNDARIES = {
    "read.1on1.developers",
    "write.1on1.developers",
    "read.group.developers",
    "write.group.developers",
}

DEFAULT_CASE_TIMEOUT_SECONDS = 600
DEFAULT_POLL_SECONDS = 10
DEFAULT_MIN_SCORE = 3.0
FOUNDRY_SCOPE = "https://ai.azure.com/.default"
GRAPH_SCOPE = "https://graph.microsoft.com/.default"


@dataclass
class Result:
    name: str
    layer: str
    passed: bool
    detail: str = ""
    skipped: bool = False
    duration_ms: int = 0


@dataclass
class Suite:
    results: list[Result] = field(default_factory=list)

    def add(self, name: str, layer: str, passed: bool, detail: str = "", **kwargs) -> None:
        self.results.append(Result(name=name, layer=layer, passed=passed, detail=detail, **kwargs))
        mark = "SKIP" if kwargs.get("skipped") else ("PASS" if passed else "FAIL")
        line = f"  [{mark}] {name}"
        print(line if not detail else f"{line} — {detail}")

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if not r.passed and not r.skipped]


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_plan(target: Path) -> dict:
    plan_path = target / "scaffold-plan.json"
    if not plan_path.is_file():
        return {}
    try:
        return json.loads(plan_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def http_status(url: str, timeout: int = 30) -> int:
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "ai-teammate-regression"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return 0


# --------------------------------------------------------------------------- layer 1: invariants


def check_skills(target: Path, env: dict[str, str], suite: Suite) -> None:
    # Foundry Autopilot bundles skills inside the container package (src/<package>/skills).
    candidates = [target / "skills", *sorted(target.glob("src/*/skills"))]
    skills_dir = next((d for d in candidates if d.is_dir() and any(d.glob("*/SKILL.md"))), candidates[0])
    settings = target / "appsettings.json"
    enabled = True
    if settings.is_file():
        try:
            enabled = bool(
                json.loads(settings.read_text(encoding="utf-8")).get("Skills", {}).get("Enabled", True)
            )
        except json.JSONDecodeError:
            enabled = True
    if not enabled:
        suite.add("skills: 無効化されている", "invariant", True, skipped=True)
        return

    bundles = sorted(p for p in skills_dir.glob("*/SKILL.md")) if skills_dir.is_dir() else []
    suite.add(
        "skills: SKILL.md が 1 つ以上ある",
        "invariant",
        bool(bundles),
        f"{len(bundles)} 件" if bundles else "Skills.Enabled=true なのに skills/ が空です",
    )
    for bundle in bundles:
        text = bundle.read_text(encoding="utf-8", errors="replace")
        has_front_matter = text.lstrip().startswith("---")
        suite.add(
            f"skills: {bundle.parent.name} の front matter",
            "invariant",
            has_front_matter,
            "" if has_front_matter else "先頭が --- で始まっていません（ランタイムが名前を読めません）",
        )


def check_settings_blocks(target: Path, plan: dict, suite: Suite) -> None:
    settings = target / "appsettings.json"
    if not settings.is_file():
        suite.add("appsettings: 存在する", "invariant", True, skipped=True)
        return
    text = settings.read_text(encoding="utf-8")
    unresolved = sorted(set(re.findall(r"\$\{([A-Z][A-Z0-9_]*)\}", text)))
    suite.add(
        "appsettings: 未解決の ${VAR} が無い",
        "invariant",
        not unresolved,
        ", ".join(unresolved) if unresolved else "",
    )
    blocks = set(plan.get("blocks") or [])
    if blocks:
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            suite.add("appsettings: JSON として読める", "invariant", False, "パースできません")
            return
        # A section switched on without its block scaffolded is an agent that believes it can do
        # something it has no code for; it fails the request silently instead of refusing.
        sandbox_on = bool(parsed.get("Sandbox", {}).get("Enabled"))
        suite.add(
            "appsettings: Sandbox.Enabled と B12 が一致する",
            "invariant",
            (not sandbox_on) or ("B12" in blocks),
            "Sandbox.Enabled=true ですが B12 が scaffold されていません" if sandbox_on else "",
        )


def check_self_hosted(env: dict[str, str], suite: Suite) -> None:
    webapp = env.get("AGENT_WEBAPP_NAME", "").strip()
    if not webapp:
        suite.add("self-hosted: AGENT_WEBAPP_NAME", "invariant", True, skipped=True)
        return
    url = f"https://{webapp}.azurewebsites.net/"
    status = http_status(url)
    suite.add("self-hosted: ルート URL が応答する", "invariant", status and status < 500, f"HTTP {status}")

    import subprocess

    group = env.get("AZURE_RESOURCE_GROUP", "").strip()
    if not group:
        suite.add("self-hosted: Always On", "invariant", True, skipped=True)
        return
    proc = subprocess.run(
        ["az", "webapp", "config", "show", "-g", group, "-n", webapp, "--query", "alwaysOn", "-o", "tsv"],
        capture_output=True,
        text=True,
        shell=(os.name == "nt"),
    )
    always_on = proc.stdout.strip().lower() == "true"
    # Without Always On every BackgroundService stops and the first message after an idle period
    # is dropped by the cold start; the channel does not resend it.
    suite.add(
        "self-hosted: Always On が有効",
        "invariant",
        always_on,
        "" if always_on else "false です（常駐ワーカーが止まり、久しぶりの 1 通目が捨てられます）",
    )


def check_foundry_autopilot(env: dict[str, str], suite: Suite) -> None:
    endpoint = (
        env.get("FOUNDRY_PROJECT_ENDPOINT", "") or env.get("AZURE_AI_PROJECT_ENDPOINT", "")
    ).strip().rstrip("/")
    agent_name = env.get("AGENT_NAME", "").strip()
    if not endpoint or not agent_name:
        suite.add("autopilot: FOUNDRY_PROJECT_ENDPOINT", "invariant", True, skipped=True)
        return

    api_version = env.get("FOUNDRY_API_VERSION", "2025-11-15-preview")
    response = get_session(FOUNDRY_SCOPE).get(
        f"{endpoint}/agents/{agent_name}?api-version={api_version}",
        headers={"Foundry-Features": "DigitalWorker=V1Preview"},
        timeout=60,
    )
    if not response.ok:
        suite.add("autopilot: agent 定義を取得できる", "invariant", False, f"HTTP {response.status_code}")
        return
    definition = response.json()
    suite.add("autopilot: agent 定義を取得できる", "invariant", True)

    activity = (definition.get("agent_endpoint") or {}).get("protocol_configuration", {}).get("activity", {})
    boundaries = set(activity.get("access_boundaries") or [])
    missing = REQUIRED_ACCESS_BOUNDARIES - boundaries
    suite.add(
        "autopilot: access_boundaries が 4 つ揃っている",
        "invariant",
        not missing,
        f"不足: {', '.join(sorted(missing))}（発行時に accessBoundaries を送っていません）" if missing else "",
    )

    schemes = {s.get("type") for s in (definition.get("agent_endpoint") or {}).get("authorization_schemes", [])}
    suite.add(
        "autopilot: BotServiceRbac が設定されている",
        "invariant",
        "BotServiceRbac" in schemes,
        "" if "BotServiceRbac" in schemes else f"現在: {schemes or '(なし)'}",
    )

    client_id = (definition.get("instance_identity") or {}).get("client_id")
    if not client_id:
        suite.add("autopilot: agent identity が有効", "invariant", True, skipped=True)
        return
    graph = get_session(GRAPH_SCOPE).get(
        f"https://graph.microsoft.com/beta/servicePrincipals(appId='{client_id}')?$select=accountEnabled",
        timeout=60,
    )
    enabled = graph.ok and bool(graph.json().get("accountEnabled"))
    suite.add(
        "autopilot: agent identity が有効",
        "invariant",
        enabled,
        "" if enabled else "accountEnabled=false です（全トークン要求が AADSTS7000112 になります）",
    )


def check_evaluation_hub(prefix: str, agent_key: str, suite: Suite) -> None:
    try:
        rows = api_get(
            f"{prefix}_evalagents?$select={prefix}_agentkey&$filter={prefix}_agentkey eq '{agent_key}'"
        ).get("value", [])
    except Exception as exc:  # noqa: BLE001 - any Dataverse failure is a failed invariant
        suite.add("評価Hub: evalagent に自分の行がある", "invariant", False, str(exc)[:200])
        return
    suite.add("評価Hub: evalagent に自分の行がある", "invariant", bool(rows), "" if rows else f"agentkey={agent_key}")

    try:
        synced = api_get(
            f"{prefix}_skills?$select={prefix}_skillkey&$filter={prefix}_agentkey eq '{agent_key}'&$top=200"
        ).get("value", [])
    except Exception as exc:  # noqa: BLE001
        suite.add("評価Hub: スキルが同期されている", "invariant", False, str(exc)[:200])
        return
    # Skills only exist as files on the agent, so without SkillSync the hub's page is empty forever.
    suite.add(
        "評価Hub: スキルが同期されている",
        "invariant",
        bool(synced),
        f"{len(synced)} 件" if synced else "SkillSync がまだ 1 件も書いていません",
    )


# --------------------------------------------------------------------------- layer 2: behaviour


def load_suite_file(path: Path) -> list[dict]:
    if not path.is_file():
        raise SystemExit(f"回帰テスト スイートが見つかりません: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    cases = data.get("cases") if isinstance(data, dict) else data
    if not isinstance(cases, list) or not cases:
        raise SystemExit(f"{path} に cases がありません")
    for index, case in enumerate(cases):
        if not case.get("name") or not case.get("prompt"):
            raise SystemExit(f"cases[{index}] に name / prompt がありません")
    return cases


def enqueue(prefix: str, agent_key: str, run_name: str, case: dict) -> str:
    record = {
        f"{prefix}_name": case["name"][:100],
        f"{prefix}_runname": run_name,
        f"{prefix}_agentkey": agent_key,
        f"{prefix}_prompt": case["prompt"],
        f"{prefix}_status": STATUS_WAITING,
    }
    created = api_post(f"{prefix}_evaltestresults", record)
    if isinstance(created, dict) and created.get(f"{prefix}_evaltestresultid"):
        return created[f"{prefix}_evaltestresultid"]
    # Dataverse answers 204 without a body unless the caller asks for representation; fall back to
    # a lookup on the row name so polling still has an id.
    rows = api_get(
        f"{prefix}_evaltestresults?$select={prefix}_evaltestresultid"
        f"&$filter={prefix}_runname eq '{run_name}' and {prefix}_name eq '{case['name'][:100]}'"
    ).get("value", [])
    if not rows:
        raise SystemExit(f"テスト行を作成できませんでした: {case['name']}")
    return rows[0][f"{prefix}_evaltestresultid"]


def poll_case(prefix: str, row_id: str, timeout: int, poll_seconds: int) -> dict:
    select = ",".join(
        f"{prefix}_{name}"
        for name in ("status", "response", "toolcalls", "durationms", "error", "autoscore", "autosummary")
    )
    deadline = time.time() + timeout
    row: dict = {}
    while time.time() < deadline:
        row = api_get(f"{prefix}_evaltestresults({row_id})?$select={select}")
        if row.get(f"{prefix}_status") in TERMINAL_STATUSES:
            return row
        time.sleep(poll_seconds)
    row[f"{prefix}_error"] = (
        f"{timeout} 秒以内に完了しませんでした（TestWorker が動いていないか、対象の agentkey の行を拾っていません）"
    )
    return row


def evaluate_case(prefix: str, case: dict, row: dict, default_min_score: float) -> tuple[bool, str]:
    status = row.get(f"{prefix}_status")
    if status != STATUS_DONE:
        return False, f"status={STATUS_LABEL.get(status, status)} {row.get(f'{prefix}_error') or ''}".strip()

    response = row.get(f"{prefix}_response") or ""
    problems: list[str] = []

    for phrase in case.get("expectContains", []):
        if phrase.lower() not in response.lower():
            problems.append(f"応答に '{phrase}' がありません")
    for phrase in case.get("expectNotContains", []):
        if phrase.lower() in response.lower():
            problems.append(f"応答に '{phrase}' が含まれています")

    expected_tools = case.get("expectTools", [])
    if expected_tools:
        tool_calls = (row.get(f"{prefix}_toolcalls") or "").lower()
        for tool in expected_tools:
            # "a|b": the same capability is named differently per host (run_python vs code_interpreter).
            if not any(option.strip().lower() in tool_calls for option in tool.split("|")):
                problems.append(f"ツール '{tool}' が呼ばれていません")

    # A case that asked to be scored but came back unscored has not been verified, so it must
    # not be reported green. The suite-wide default is only applied when a score actually exists,
    # because the worker does not score every turn.
    explicit_min = case.get("minScore")
    score = row.get(f"{prefix}_autoscore")
    if explicit_min is not None:
        if score is None:
            problems.append(f"自動採点が行われていません（minScore={explicit_min} を要求）")
        elif float(score) < float(explicit_min):
            problems.append(f"自動採点 {score} < {explicit_min}")
    elif score is not None and float(score) < float(default_min_score):
        problems.append(f"自動採点 {score} < {default_min_score}")

    max_ms = case.get("maxDurationMs")
    duration = row.get(f"{prefix}_durationms")
    if max_ms and duration and int(duration) > int(max_ms):
        problems.append(f"所要時間 {duration}ms > {max_ms}ms")

    return not problems, "; ".join(problems)


def run_behaviour(
    prefix: str, agent_key: str, cases: list[dict], args, suite: Suite, env: dict[str, str] | None = None
) -> None:
    run_name = args.run_name or f"regression-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
    print(f"\n== 回帰テスト（run={run_name}, {len(cases)} ケース）==")

    queued: list[tuple[dict, str]] = []
    for case in cases:
        # A block can be scaffolded yet switched off at deploy time (B17 without an image model).
        missing = [key for key in case.get("requiresEnv", []) if not (env or {}).get(key, "").strip()]
        if missing:
            suite.add(case["name"], "behaviour", True, f"{', '.join(missing)} が未設定", skipped=True)
            continue
        try:
            queued.append((case, enqueue(prefix, agent_key, run_name, case)))
        except Exception as exc:  # noqa: BLE001
            suite.add(case["name"], "behaviour", False, f"キューへの登録に失敗: {exc}")

    for case, row_id in queued:
        started = time.time()
        row = poll_case(prefix, row_id, case.get("timeoutSeconds", args.timeout), args.poll_seconds)
        passed, detail = evaluate_case(prefix, case, row, args.min_score)
        suite.add(case["name"], "behaviour", passed, detail, duration_ms=int((time.time() - started) * 1000))


# --------------------------------------------------------------------------- reporting


def write_junit(path: Path, suite: Suite) -> None:
    root = ET.Element(
        "testsuite",
        name="ai-teammate-regression",
        tests=str(len(suite.results)),
        failures=str(len(suite.failed)),
        skipped=str(sum(1 for r in suite.results if r.skipped)),
    )
    for result in suite.results:
        case = ET.SubElement(root, "testcase", classname=result.layer, name=result.name)
        case.set("time", f"{result.duration_ms / 1000:.3f}")
        if result.skipped:
            ET.SubElement(case, "skipped")
        elif not result.passed:
            ET.SubElement(case, "failure", message=result.detail or "failed").text = result.detail
    path.parent.mkdir(parents=True, exist_ok=True)
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    print(f"JUnit XML: {path}")


def write_markdown(path: Path, suite: Suite) -> None:
    lines = ["# AI チームメイト回帰テスト結果", "", "| 層 | ケース | 結果 | 詳細 |", "|---|---|---|---|"]
    for result in suite.results:
        mark = "SKIP" if result.skipped else ("PASS" if result.passed else "**FAIL**")
        lines.append(f"| {result.layer} | {result.name} | {mark} | {result.detail.replace('|', '/')} |")
    lines += ["", f"合計 {len(suite.results)} 件 / 失敗 {len(suite.failed)} 件"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Markdown: {path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", type=Path, default=Path("."), help="scaffold 済みプロジェクトのディレクトリ")
    parser.add_argument("--env", type=Path, default=None, help="既定は <target>/.env")
    parser.add_argument("--check", action="store_true", help="層 1 の不変条件だけを確認する（エージェントを呼ばない）")
    parser.add_argument("--execute", action="store_true", help="層 1 + 層 2（実ターン）を実行する")
    parser.add_argument("--suite", type=Path, default=None, help="既定は <target>/regression/suite.json")
    parser.add_argument("--run-name", default=None, help="評価Hub に記録する実行名")
    parser.add_argument("--timeout", type=int, default=DEFAULT_CASE_TIMEOUT_SECONDS, help="1 ケースの既定タイムアウト秒")
    parser.add_argument("--poll-seconds", type=int, default=DEFAULT_POLL_SECONDS)
    parser.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE, help="自動採点の既定しきい値")
    parser.add_argument("--junit", type=Path, default=None, help="JUnit XML の出力先")
    parser.add_argument("--markdown", type=Path, default=None, help="Markdown サマリーの出力先")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.check and not args.execute:
        print("--check か --execute を指定してください", file=sys.stderr)
        return 2

    target = args.target.resolve()
    env = {**load_dotenv(args.env or target / ".env"), **os.environ}
    plan = load_plan(target)
    hosting = plan.get("hosting") or env.get("AGENT_HOSTING") or "self-hosted"
    prefix = env.get("PUBLISHER_PREFIX", "").strip()
    agent_key = env.get("AGENT_NAME", "").strip()
    if not agent_key:
        print("AGENT_NAME が必要です（どのチームメイトを検査するか決まりません）", file=sys.stderr)
        return 2
    # The behaviour layer runs through the evaluation hub, so it genuinely needs the prefix.
    # The invariant layer does not, and refusing to run it would hide the cheap failures too.
    if args.execute and not prefix:
        print("--execute には PUBLISHER_PREFIX が必要です（評価ハブ経由で実行するため）", file=sys.stderr)
        return 2

    # auth_helper read DATAVERSE_URL at import from the current directory, not from --env.
    dataverse_url = env.get("DATAVERSE_URL", "").strip().rstrip("/")
    if dataverse_url and not auth_helper.DATAVERSE_URL:
        auth_helper.DATAVERSE_URL = dataverse_url
        auth_helper._DEFAULT_SCOPE = f"{dataverse_url}/.default"
    suite = Suite()

    print(f"== 不変条件（hosting={hosting}）==")
    check_skills(target, env, suite)
    check_settings_blocks(target, plan, suite)
    if hosting == "foundry-autopilot":
        check_foundry_autopilot(env, suite)
    else:
        check_self_hosted(env, suite)
    if prefix:
        check_evaluation_hub(prefix, agent_key, suite)
    else:
        suite.add("評価ハブにチームメイトが登録されている", "invariant", False,
                  "PUBLISHER_PREFIX 未設定のため未検査", skipped=True)

    if args.execute:
        suite_path = args.suite or target / "regression" / "suite.json"
        run_behaviour(prefix, agent_key, load_suite_file(suite_path), args, suite, env)

    if args.junit:
        write_junit(args.junit, suite)
    if args.markdown:
        write_markdown(args.markdown, suite)

    failed = suite.failed
    print(f"\n合計 {len(suite.results)} 件 / 失敗 {len(failed)} 件")
    if failed:
        for result in failed:
            print(f"  FAIL [{result.layer}] {result.name} — {result.detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
