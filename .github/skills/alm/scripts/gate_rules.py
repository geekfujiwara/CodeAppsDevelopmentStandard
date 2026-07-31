#!/usr/bin/env python3
"""Rule engine backing the autonomous review agents in the deploy pipeline.

Each gate in the deploy workflow is owned by a custom prompt agent in
``.github/prompts/``. The agents are *rule based*: they must evaluate exactly the
rules implemented here, so the verdict is deterministic and no human approval
(HITL) is required. This script is both the fallback executor (when the Copilot
CLI is unavailable) and the ground truth the agents are told to reproduce.

The rules are product agnostic. Which paths hold templates, scripts and the
secret catalogue comes from ``alm.config.json`` (see ``alm_config.py``).

Gates:
    quality         static quality of templates, scripts and workflows
    generalization  every environment-specific value comes from the secret store
    security        workflow supply-chain / injection / permission hardening
    readability     naming, comments, line length of the pipeline sources
    release         aggregates the four gate verdicts into a go / no-go

Usage:
    python scripts/gate_rules.py --gate quality --out .gate/quality.json
    python scripts/gate_rules.py --gate release --verdict-dir .gate
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from alm_config import load_config

REPO = Path(__file__).resolve().parent.parent
CFG = load_config(REPO)

PLACEHOLDER = re.compile(r"\$\{([A-Z0-9_]+)\}")
GUID = re.compile(r"\b[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\b")
ZERO_GUID = re.compile(r"^0+(-0+)*$")
# Untrusted event data that must never be interpolated into a `run:` block.
UNTRUSTED = re.compile(r"\$\{\{\s*github\.event\.[^}]*"
                       r"(body|title|message|name|label|ref|head_ref)[^}]*\}\}")
DEPLOY_WORKFLOW = REPO / ".github" / "workflows" / "deploy.yml"


@dataclass
class Rule:
    """One deterministic check with its human readable findings."""

    id: str
    title: str
    findings: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        return "fail" if self.findings else "pass"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def env_example_vars() -> set[str]:
    path = CFG.env_example_path()
    if not path.is_file():
        return set()
    names: set[str] = set()
    for raw in read(path).splitlines():
        line = raw.strip().lstrip("#").strip()
        if "=" in line:
            names.add(line.split("=", 1)[0].strip())
    return names


def rel(path: Path) -> str:
    return CFG.rel(path)


# --------------------------------------------------------------------------- #
# Gate: quality
# --------------------------------------------------------------------------- #
def gate_quality() -> list[Rule]:
    q1 = Rule("Q1", "Workflow files are valid YAML")
    for wf in CFG.workflow_files():
        try:
            yaml.safe_load(read(wf))
        except yaml.YAMLError as exc:
            q1.findings.append(f"{rel(wf)}: invalid YAML ({exc.__class__.__name__}).")

    q2 = Rule("Q2", "Templates render to valid YAML / JSON")
    for tpl in CFG.template_files():
        rendered = PLACEHOLDER.sub("placeholder-value", read(tpl))
        try:
            if tpl.suffix == ".json":
                json.loads(rendered)
            else:
                yaml.safe_load(rendered)
        except (yaml.YAMLError, json.JSONDecodeError) as exc:
            q2.findings.append(f"{rel(tpl)}: does not parse after rendering ({exc.__class__.__name__}).")

    q3 = Rule("Q3", "Every ${VAR} placeholder is documented in .env.example")
    known = env_example_vars()
    for tpl in CFG.template_files():
        for name in sorted(set(PLACEHOLDER.findall(read(tpl)))):
            if name not in known:
                q3.findings.append(f"{rel(tpl)}: ${{{name}}} is missing from {CFG.env_example}.")

    q4 = Rule("Q4", "Pipeline scripts compile")
    for script in CFG.script_files():
        try:
            ast.parse(read(script), filename=str(script))
        except SyntaxError as exc:
            q4.findings.append(f"{rel(script)}:{exc.lineno}: syntax error ({exc.msg}).")

    q5 = Rule("Q5", "Runtime dependencies declare a version constraint")
    req = REPO / "requirements.txt"
    if req.is_file():
        for line in read(req).splitlines():
            spec = line.split("#", 1)[0].strip()
            if spec and not re.search(r"[=<>~!]=|>=|<=", spec):
                q5.findings.append(f"requirements.txt: '{spec}' has no version constraint.")

    return [q1, q2, q3, q4, q5]


# --------------------------------------------------------------------------- #
# Gate: generalization
# --------------------------------------------------------------------------- #
def gate_generalization() -> list[Rule]:
    g1 = Rule("G1", "Sanitization review passes (no real secrets, templates generalized)")
    proc = subprocess.run([sys.executable, str(Path(__file__).with_name("review_sanitization.py"))],
                          cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        for line in (proc.stderr or proc.stdout).splitlines():
            if line.strip().startswith("-"):
                g1.findings.append(line.strip().lstrip("- "))
        if not g1.findings:
            g1.findings.append("scripts/review_sanitization.py exited non-zero.")

    deploy_text = read(DEPLOY_WORKFLOW) if DEPLOY_WORKFLOW.is_file() else ""

    g2 = Rule("G2", "Every secret placeholder is injected from the secret store")
    needed: set[str] = set()
    for tpl in CFG.template_files():
        needed |= set(PLACEHOLDER.findall(read(tpl)))
    for name in sorted(needed - set(CFG.non_secret_vars)):
        if f"secrets.{name}" not in deploy_text and f"${{{name}}}" not in deploy_text:
            g2.findings.append(
                f".github/workflows/deploy.yml: {name} is not wired to ${{{{ secrets.{name} }}}}."
            )

    g3 = Rule("G3", "Workflows contain no environment-specific literals")
    for wf in CFG.workflow_files():
        for number, line in enumerate(read(wf).splitlines(), start=1):
            code = line.split("#", 1)[0]
            match = GUID.search(code)
            if match and not ZERO_GUID.match(match.group(0)):
                g3.findings.append(f"{rel(wf)}:{number}: hardcoded GUID (use a secret).")
            if "/subscriptions/" in code:
                g3.findings.append(f"{rel(wf)}:{number}: hardcoded ARM resource path (use a secret).")
            if re.search(r"https://[a-z0-9-]+\.(services\.ai|azurewebsites|vault|crm\d?)\.", code):
                g3.findings.append(f"{rel(wf)}:{number}: hardcoded environment endpoint (use a secret).")

    g4 = Rule("G4", "Secret-bearing env values are only read from secrets or vars")
    for wf in CFG.workflow_files():
        for number, line in enumerate(read(wf).splitlines(), start=1):
            match = re.match(r"\s{6,}([A-Z][A-Z0-9_]{3,}):\s*(\S.*)$", line)
            if not match:
                continue
            name, value = match.group(1), match.group(2).strip()
            if name in set(CFG.non_secret_vars) or name.startswith(("GATE_", "PIPELINE_")):
                continue
            if "${{" not in value:
                g4.findings.append(f"{rel(wf)}:{number}: {name} is assigned a literal value.")

    return [g1, g2, g3, g4]


# --------------------------------------------------------------------------- #
# Gate: security
# --------------------------------------------------------------------------- #
def gate_security() -> list[Rule]:
    s1 = Rule("S1", "Workflows declare least-privilege permissions")
    for wf in CFG.workflow_files():
        doc = yaml.safe_load(read(wf)) or {}
        top = doc.get("permissions")
        jobs = doc.get("jobs") or {}
        scoped = all("permissions" in (job or {}) for job in jobs.values())
        if top is None and not scoped:
            s1.findings.append(f"{rel(wf)}: no `permissions:` block (defaults are too broad).")
        named_scopes = [("workflow", top)] + \
            [(job_id, (job or {}).get("permissions")) for job_id, job in jobs.items()]
        for owner, scope in named_scopes:
            if scope in ("write-all", "read-all"):
                s1.findings.append(f"{rel(wf)}: `permissions: {scope}` is too broad.")
            if isinstance(scope, dict) and scope.get("contents") == "write" \
                    and owner not in set(CFG.contents_write_jobs):
                s1.findings.append(
                    f"{rel(wf)}: `contents: write` on '{owner}' is not required by this pipeline."
                )

    s2 = Rule("S2", "No pull_request_target trigger")
    for wf in CFG.workflow_files():
        doc = yaml.safe_load(read(wf)) or {}
        # PyYAML parses the bare `on:` key as the boolean True.
        triggers = doc.get(True, doc.get("on"))
        keys = triggers if isinstance(triggers, dict) else \
            {triggers: None} if isinstance(triggers, str) else dict.fromkeys(triggers or [])
        if "pull_request_target" in keys:
            s2.findings.append(f"{rel(wf)}: pull_request_target runs untrusted code with write scope.")

    s3 = Rule("S3", "Actions come from the allow list and are version pinned")
    for wf in CFG.workflow_files():
        for number, line in enumerate(read(wf).splitlines(), start=1):
            match = re.search(r"uses:\s*([^\s#]+)", line)
            if not match:
                continue
            ref = match.group(1).strip("\"'")
            if ref.startswith("./"):
                continue
            if "@" not in ref:
                s3.findings.append(f"{rel(wf)}:{number}: action '{ref}' is not version pinned.")
                continue
            name = ref.split("@", 1)[0]
            if name not in set(CFG.allowed_actions):
                s3.findings.append(f"{rel(wf)}:{number}: action '{name}' is not on the allow list.")

    s4 = Rule("S4", "No secret exfiltration or unsafe shell patterns")
    unsafe = {
        r"curl[^\n|]*\|\s*(ba)?sh": "pipes a downloaded script into a shell",
        r"--no-verify": "bypasses commit hooks",
        r"echo\s+[\"']?\$\{\{\s*secrets\.": "prints a secret to the log",
        r"\bcurl\b[^\n]*\$\{\{\s*secrets\.": "sends a secret to an external endpoint",
    }
    for wf in CFG.workflow_files():
        for number, line in enumerate(read(wf).splitlines(), start=1):
            for pattern, reason in unsafe.items():
                if re.search(pattern, line):
                    s4.findings.append(f"{rel(wf)}:{number}: {reason}.")

    s5 = Rule("S5", "Review gates run without access to deployment secrets")
    if DEPLOY_WORKFLOW.is_file():
        doc = yaml.safe_load(read(DEPLOY_WORKFLOW)) or {}
        for name, job in (doc.get("jobs") or {}).items():
            if not name.startswith("gate-"):
                continue
            if (job or {}).get("secrets") == "inherit":
                s5.findings.append(f".github/workflows/deploy.yml: job '{name}' inherits all secrets.")
            env = json.dumps((job or {}).get("env") or {})
            if "secrets." in env:
                s5.findings.append(f".github/workflows/deploy.yml: job '{name}' reads deployment secrets.")

    s6 = Rule("S6", "No untrusted event data interpolated into shell commands")
    for wf in CFG.workflow_files():
        for number, line in enumerate(read(wf).splitlines(), start=1):
            if UNTRUSTED.search(line):
                s6.findings.append(f"{rel(wf)}:{number}: script injection risk from untrusted event data.")

    return [s1, s2, s3, s4, s5, s6]


# --------------------------------------------------------------------------- #
# Gate: readability
# --------------------------------------------------------------------------- #
def gate_readability() -> list[Rule]:
    r1 = Rule("R1", "Workflows start with an explanatory comment")
    for wf in CFG.workflow_files():
        head = [line for line in read(wf).splitlines()[:12] if line.strip()]
        if not any(line.lstrip().startswith("#") for line in head):
            r1.findings.append(f"{rel(wf)}: add a header comment explaining what the workflow does.")

    r2 = Rule("R2", "Jobs and executable steps are named")
    for wf in CFG.workflow_files():
        doc = yaml.safe_load(read(wf)) or {}
        for job_id, job in (doc.get("jobs") or {}).items():
            job = job or {}
            if not job.get("name"):
                r2.findings.append(f"{rel(wf)}: job '{job_id}' has no `name:` (shown on the run card).")
            for index, step in enumerate(job.get("steps") or [], start=1):
                if "run" in (step or {}) and not (step or {}).get("name"):
                    r2.findings.append(f"{rel(wf)}: job '{job_id}' step {index} has no `name:`.")

    r3 = Rule("R3", f"Lines stay within {CFG.max_line} characters")
    for path in CFG.workflow_files() + CFG.script_files():
        for number, line in enumerate(read(path).splitlines(), start=1):
            if len(line) > CFG.max_line:
                r3.findings.append(f"{rel(path)}:{number}: line is {len(line)} characters.")

    r4 = Rule("R4", "No leftover TODO / FIXME markers")
    self_path = Path(__file__).resolve()
    for path in CFG.workflow_files() + CFG.script_files():
        if path.resolve() == self_path:
            continue  # This file defines the markers it searches for.
        for number, line in enumerate(read(path).splitlines(), start=1):
            marker = re.search(r"\b(TODO|FIXME|XXX)\b", line)
            if marker:
                r4.findings.append(f"{rel(path)}:{number}: unresolved {marker.group(0)}.")

    r5 = Rule("R5", "Pipeline scripts document their purpose")
    for script in CFG.script_files():
        text = read(script)
        body = text.split("\n", 1)[1] if text.startswith("#!") else text
        if not body.lstrip().startswith(('"""', "'''")):
            r5.findings.append(f"{rel(script)}: missing module docstring.")

    return [r1, r2, r3, r4, r5]


# --------------------------------------------------------------------------- #
# Gate: release (aggregation)
# --------------------------------------------------------------------------- #
def gate_release(verdict_dir: Path) -> list[Rule]:
    required = ["quality", "generalization", "security", "readability"]
    rule = Rule("A1", "All upstream gates reported PASS")
    for gate in required:
        path = verdict_dir / f"{gate}.json"
        if not path.is_file():
            rule.findings.append(f"missing verdict for the '{gate}' gate.")
            continue
        data = json.loads(read(path))
        if data.get("verdict") != "PASS":
            failed = [r["id"] for r in data.get("rules", []) if r.get("status") == "fail"]
            rule.findings.append(
                f"gate '{gate}' returned {data.get('verdict')} (rules: {', '.join(failed) or 'n/a'})."
            )
    return [rule]


GATES = {
    "quality": ("quality-inspector", gate_quality),
    "generalization": ("generalization-auditor", gate_generalization),
    "security": ("security-reviewer", gate_security),
    "readability": ("readability-editor", gate_readability),
    "release": ("release-gatekeeper", None),
}


def to_markdown(payload: dict) -> str:
    icon = "PASS" if payload["verdict"] == "PASS" else "FAIL"
    lines = [f"## {payload['agent']} - {icon}", "", "| Rule | Check | Result |", "| --- | --- | --- |"]
    for rule in payload["rules"]:
        lines.append(f"| `{rule['id']}` | {rule['title']} | {rule['status'].upper()} |")
    findings = [f for rule in payload["rules"] for f in rule["findings"]]
    if findings:
        lines += ["", "### Findings", ""] + [f"- {f}" for f in findings]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gate", required=True, choices=sorted(GATES))
    parser.add_argument("--out", help="Path to write the JSON verdict.")
    parser.add_argument("--summary", help="Path to write the Markdown summary.")
    parser.add_argument("--verdict-dir", default=".gate", help="Directory holding upstream gate verdicts.")
    args = parser.parse_args()

    agent, runner = GATES[args.gate]
    rules = gate_release(Path(args.verdict_dir)) if runner is None else runner()

    payload = {
        "gate": args.gate,
        "agent": agent,
        "verdict": "FAIL" if any(rule.status == "fail" for rule in rules) else "PASS",
        "rules": [{"id": r.id, "title": r.title, "status": r.status, "findings": r.findings} for r in rules],
    }

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    markdown = to_markdown(payload)
    if args.summary:
        summary = Path(args.summary)
        summary.parent.mkdir(parents=True, exist_ok=True)
        summary.write_text(markdown, encoding="utf-8")
    print(markdown)

    return 0 if payload["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
