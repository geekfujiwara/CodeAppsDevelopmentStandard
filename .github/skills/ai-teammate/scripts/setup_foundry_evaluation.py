"""Turn on Foundry's own continuous evaluation for the teammate.

The evaluation hub in Dataverse answers "did this teammate do the job" in business terms. Foundry's
built-in evaluators answer a different question - groundedness, task adherence, tool-call accuracy,
harmful content - against *every* sampled production turn, without anyone writing a test case.
Both views are worth having, and this script wires up the second one so live Teams traffic shows
up under the agent's Monitor tab.

Two stages, as everywhere else in this skill:

    python scripts/setup_foundry_evaluation.py --check
    python scripts/setup_foundry_evaluation.py --execute

``--check`` reads the project, reports the evaluators it would attach, and writes nothing.

Prerequisite: the Foundry project's managed identity needs the **Foundry User** role on the
project. Without it the rule is created but never runs, and the Monitor tab silently stays empty.
``publish_foundry_autopilot.py`` already grants this to the agent instance identity.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

DEFAULT_EVALUATORS = (
    # Did the agent actually do what it was asked, using the tools correctly, without
    # inventing facts or producing harmful content?
    "builtin.task_adherence",
    "builtin.tool_call_accuracy",
    "builtin.intent_resolution",
    "builtin.violence",
)
DEFAULT_MAX_HOURLY_RUNS = 100
DATA_SOURCE_CONFIG = {"type": "azure_ai_source", "scenario": "responses"}
# Safety evaluators run on the Azure AI Content Safety service and reject a deployment name;
# every other built-in evaluator is model-graded and requires one.
SAFETY_EVALUATORS = frozenset(
    {
        "builtin.violence",
        "builtin.sexual",
        "builtin.self_harm",
        "builtin.hate_unfairness",
        "builtin.protected_material",
        "builtin.indirect_attack",
        "builtin.code_vulnerability",
        "builtin.ungrounded_attributes",
    }
)


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def resolve(env: dict[str, str], *names: str) -> str:
    for name in names:
        value = (env.get(name) or "").strip()
        if value:
            return value
    return ""


def rule_id(agent_name: str) -> str:
    return f"{agent_name}-continuous-eval"


def testing_criteria(evaluators: list[str], judge_deployment: str) -> list[dict[str, object]]:
    criteria: list[dict[str, object]] = []
    for name in evaluators:
        criterion: dict[str, object] = {
            "type": "azure_ai_evaluator",
            "name": name.removeprefix("builtin."),
            "evaluator_name": name,
        }
        if name not in SAFETY_EVALUATORS:
            criterion["initialization_parameters"] = {"deployment_name": judge_deployment}
        criteria.append(criterion)
    return criteria


def run_check(
    endpoint: str, agent_name: str, evaluators: list[str], max_hourly_runs: int, judge: str
) -> int:
    from azure.ai.projects import AIProjectClient
    from azure.identity import DefaultAzureCredential

    print("== Foundry 継続評価の事前チェック ==")
    print(f"  プロジェクト : {endpoint}")
    print(f"  エージェント : {agent_name}")
    print(f"  ルール ID    : {rule_id(agent_name)}")
    print(f"  評価器       : {', '.join(evaluators)}")
    print(f"  判定モデル   : {judge}")
    print(f"  上限         : {max_hourly_runs} 実行/時")

    with DefaultAzureCredential() as credential, AIProjectClient(
        endpoint=endpoint, credential=credential
    ) as project_client:
        try:
            versions = list(project_client.agents.list_versions(agent_name=agent_name))
        except Exception as error:  # noqa: BLE001 - reported, not raised
            print(f"  NG エージェント定義を読めません: {error}", file=sys.stderr)
            return 2
        if not versions:
            print(f"  NG エージェント {agent_name} にバージョンがありません", file=sys.stderr)
            return 2
        print(f"  OK エージェント定義 {len(versions)} バージョン")

        existing = None
        try:
            existing = project_client.evaluation_rules.get(rule_id(agent_name))
        except Exception:  # noqa: BLE001 - absence is the normal first-run case
            pass
        print(
            f"  {'既存ルールを更新します' if existing else '新しいルールを作成します'}"
            " （--check のため書き込みません）"
        )
    return 0


def find_existing_eval(openai_client, name: str) -> str:
    """Reuse the eval object we created last time instead of piling up duplicates."""
    try:
        for item in openai_client.evals.list(limit=100).data:
            if getattr(item, "name", "") == name:
                return item.id
    except Exception:  # noqa: BLE001 - listing is an optimisation, not a requirement
        pass
    return ""


def ensure_eval(openai_client, agent_name: str, evaluators: list[str], judge: str) -> str:
    name = f"{agent_name} continuous evaluation"
    existing = find_existing_eval(openai_client, name)
    if existing:
        print(f"  評価定義（再利用）: {existing}")
        return existing
    evaluation = openai_client.evals.create(
        name=name,
        data_source_config=DATA_SOURCE_CONFIG,  # type: ignore[arg-type]
        testing_criteria=testing_criteria(evaluators, judge),  # type: ignore[arg-type]
    )
    print(f"  評価定義: {evaluation.id}")
    return evaluation.id


def create_continuous_rule(project_client, agent_name: str, eval_id: str, max_hourly_runs: int):
    from azure.ai.projects.models import (
        ContinuousEvaluationRuleAction,
        EvaluationRule,
        EvaluationRuleEventType,
        EvaluationRuleFilter,
    )

    return project_client.evaluation_rules.create_or_update(
        id=rule_id(agent_name),
        evaluation_rule=EvaluationRule(
            display_name=f"{agent_name} continuous evaluation",
            description="Teams からの実トラフィックを継続評価し、Monitor タブにスコアを出す",
            action=ContinuousEvaluationRuleAction(
                eval_id=eval_id, max_hourly_runs=max_hourly_runs
            ),
            event_type=EvaluationRuleEventType.RESPONSE_COMPLETED,
            filter=EvaluationRuleFilter(agent_name=agent_name),
            enabled=True,
        ),
    )


def create_trace_schedule(
    project_client, agent_name: str, eval_id: str, hour: int, max_traces: int, window_days: int
):
    """Daily evaluation over the agent's App Insights traces.

    This is the path that works for Foundry-hosted agents, which the continuous rule rejects.
    The window is expressed in epoch seconds - the service parses these fields as Int64 and
    returns a type-conversion error for ISO-8601 strings.
    """
    from datetime import datetime, timedelta, timezone

    from azure.ai.projects.models import (
        DailyRecurrenceSchedule,
        EvaluationScheduleTask,
        RecurrenceTrigger,
        Schedule,
    )

    now = datetime.now(timezone.utc)
    eval_run = {
        "eval_id": eval_id,
        "name": f"{agent_name}-trace-eval",
        "data_source": {
            "type": "azure_ai_trace_data_source_preview",
            "trace_source": {
                "type": "agent_filter",
                "agent_name": agent_name,
                "start_time": int((now - timedelta(days=window_days)).timestamp()),
                "end_time": int(now.timestamp()),
                "max_traces": max_traces,
            },
        },
    }
    return project_client.beta.schedules.create_or_update(
        schedule_id=f"{agent_name}-trace-eval",
        schedule=Schedule(
            display_name=f"{agent_name} trace evaluation",
            enabled=True,
            trigger=RecurrenceTrigger(interval=1, schedule=DailyRecurrenceSchedule(hours=[hour])),
            task=EvaluationScheduleTask(eval_id=eval_id, eval_run=eval_run),
        ),
    )


def run_execute(
    endpoint: str,
    agent_name: str,
    evaluators: list[str],
    max_hourly_runs: int,
    judge: str,
    mode: str,
    hour: int,
    max_traces: int,
    window_days: int,
) -> int:
    from azure.ai.projects import AIProjectClient
    from azure.identity import DefaultAzureCredential

    print("== Foundry 評価を設定します ==")
    with DefaultAzureCredential() as credential, AIProjectClient(
        endpoint=endpoint, credential=credential
    ) as project_client, project_client.get_openai_client() as openai_client:
        eval_id = ensure_eval(openai_client, agent_name, evaluators, judge)

        used = mode
        if mode in ("auto", "continuous"):
            try:
                rule = create_continuous_rule(
                    project_client, agent_name, eval_id, max_hourly_runs
                )
                print(f"  継続評価ルール: {rule.id}")
                used = "continuous"
            except Exception as error:  # noqa: BLE001 - inspected, then handled or re-raised
                if mode == "continuous" or not _is_hosted_agent_rejection(error):
                    raise
                # Foundry-hosted (Autopilot) agents are rejected by the continuous rule API, so
                # the trace-based schedule is the only way to get their turns into Foundry Evals.
                print("  継続評価はホスト型エージェント非対応のため、トレース評価に切り替えます")
                used = "scheduled"

        if used == "scheduled":
            schedule = create_trace_schedule(
                project_client, agent_name, eval_id, hour, max_traces, window_days
            )
            schedule_id = getattr(schedule, "schedule_id", None) or getattr(schedule, "id", "")
            print(f"  トレース評価スケジュール: {schedule_id}（毎日 {hour}:00 UTC）")

    print()
    print("OK Foundry の Evaluations / Monitor にスコアが出るようになります。")
    print("   反映には実トラフィックが必要です。Teams で数ターン話しかけてから確認してください。")
    print("   スコアが出ない場合は、プロジェクトのマネージド ID に Foundry User ロールがあるか確認します。")
    return 0


def _is_hosted_agent_rejection(error: Exception) -> bool:
    message = str(error)
    return "not supported for evaluation rules" in message or "is of kind 'hosted'" in message


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path("."), help="Scaffolded project directory")
    parser.add_argument("--env", type=Path, default=None, help="Defaults to <target>/.env")
    parser.add_argument("--check", action="store_true", help="Stage 1: report only, write nothing")
    parser.add_argument("--execute", action="store_true", help="Stage 2: create the rule")
    parser.add_argument("--agent-name", default="", help="Overrides AGENT_NAME")
    parser.add_argument(
        "--evaluator", action="append", default=[],
        help="Built-in evaluator to attach (repeatable). Defaults to the four below.",
    )
    parser.add_argument(
        "--max-hourly-runs", type=int, default=DEFAULT_MAX_HOURLY_RUNS,
        help="Evaluation runs per hour. Turns above this are skipped, not queued.",
    )
    parser.add_argument(
        "--judge-deployment", default="",
        help="Model deployment used to grade. Defaults to EVALUATION_JUDGE_DEPLOYMENT, "
             "then the agent's own ModelDeployment.",
    )
    parser.add_argument(
        "--mode", choices=("auto", "continuous", "scheduled"), default="auto",
        help="auto: continuous rule, falling back to a daily trace evaluation for "
             "Foundry-hosted agents, which the continuous rule API rejects.",
    )
    parser.add_argument("--hour", type=int, default=9, help="UTC hour for the daily trace evaluation")
    parser.add_argument("--max-traces", type=int, default=50, help="Traces graded per scheduled run")
    parser.add_argument(
        "--window-days", type=int, default=1,
        help="How far back the scheduled trace evaluation looks",
    )
    return parser.parse_args()


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    args = parse_args()
    if args.check == args.execute:
        print("ERROR: pass exactly one of --check or --execute", file=sys.stderr)
        return 2

    target = args.target.resolve()
    env = {**load_dotenv(args.env or (target / ".env")), **os.environ}
    endpoint = resolve(env, "FOUNDRY_PROJECT_ENDPOINT", "AZURE_AI_PROJECT_ENDPOINT")
    agent_name = args.agent_name.strip() or resolve(env, "AGENT_NAME")
    if not endpoint or not agent_name:
        print(
            "ERROR: FOUNDRY_PROJECT_ENDPOINT (or AZURE_AI_PROJECT_ENDPOINT) and AGENT_NAME "
            "are required.",
            file=sys.stderr,
        )
        return 2

    evaluators = args.evaluator or list(DEFAULT_EVALUATORS)
    if args.max_hourly_runs < 1:
        print("ERROR: --max-hourly-runs must be 1 or more", file=sys.stderr)
        return 2
    judge = args.judge_deployment.strip() or resolve(
        env, "EVALUATION_JUDGE_DEPLOYMENT", "ModelDeployment", "AZURE_OPENAI_DEPLOYMENT", "MODEL_NAME"
    )
    if not judge and any(name not in SAFETY_EVALUATORS for name in evaluators):
        print(
            "ERROR: model-graded evaluators need a judge deployment. Set "
            "EVALUATION_JUDGE_DEPLOYMENT or pass --judge-deployment.",
            file=sys.stderr,
        )
        return 2

    try:
        if args.check:
            return run_check(endpoint, agent_name, evaluators, args.max_hourly_runs, judge)
        return run_execute(
            endpoint,
            agent_name,
            evaluators,
            args.max_hourly_runs,
            judge,
            args.mode,
            args.hour,
            args.max_traces,
            args.window_days,
        )
    except ImportError as error:
        print(f"ERROR: azure-ai-projects>=2.4.0 が必要です ({error})", file=sys.stderr)
        return 2
    except Exception as error:  # noqa: BLE001 - surfaced as a non-zero exit, not a traceback
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
