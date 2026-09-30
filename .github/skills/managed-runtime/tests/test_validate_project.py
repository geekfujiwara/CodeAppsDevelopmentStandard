import importlib.util
import json
import subprocess
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


validate_project = load("validate_project")


def make_project(root: Path, dependencies=None, files=None, config=None):
    root.mkdir(parents=True, exist_ok=True)
    (root / "ms.config.json").write_text(json.dumps(config or {"repoType": "native"}), encoding="utf-8")
    package = {"dependencies": dependencies if dependencies is not None else {"@microsoft/managed-apps": "0.5.18"}}
    (root / "package.json").write_text(json.dumps(package), encoding="utf-8")
    (root / ".gitignore").write_text("node_modules\ndist\n.env\n", encoding="utf-8")
    for relative, text in (files or {}).items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    return root


def levels(report, level):
    return [message for item_level, message in report.items if item_level == level]


def test_clean_project_has_no_ng_or_warn(tmp_path):
    report = validate_project.validate(make_project(tmp_path))
    assert not report.has_ng
    assert levels(report, "WARN") == []


def test_missing_config_is_ng(tmp_path):
    project = make_project(tmp_path)
    (project / "ms.config.json").unlink()
    assert validate_project.validate(project).has_ng


def test_code_apps_mix_is_ng(tmp_path):
    project = make_project(
        tmp_path,
        dependencies={"@microsoft/managed-apps": "0.5.18", "@microsoft/power-apps": "1.2.5"},
        files={"power.config.json": "{}"},
    )
    ng = levels(validate_project.validate(project), "NG")
    assert any("power-apps" in message for message in ng)
    assert any("power.config.json" in message for message in ng)


def test_missing_sdk_is_ng(tmp_path):
    project = make_project(tmp_path, dependencies={"react": "19.2.6"})
    assert any("@microsoft/managed-apps" in message for message in levels(validate_project.validate(project), "NG"))


def test_caret_version_warns_and_strict_promotes(tmp_path):
    project = make_project(tmp_path, dependencies={"@microsoft/managed-apps": "^0.5.0"})
    assert levels(validate_project.validate(project), "WARN")
    assert validate_project.validate(project, strict=True).has_ng


def test_direct_external_fetch_warns_but_links_do_not(tmp_path):
    project = make_project(
        tmp_path,
        files={
            "src/api.ts": "export const load = () => fetch('https://api.example.com/items');\n",
            "src/App.tsx": "export const A = () => <a href=\"https://learn.microsoft.com\">docs</a>;\n",
            "generated/services/x.ts": "fetch('https://ignored.example.com')\n",
        },
    )
    warns = levels(validate_project.validate(project), "WARN")
    assert len(warns) == 1
    assert "api.example.com" in warns[0]
    assert "ignored.example.com" not in warns[0]
    assert "learn.microsoft.com" not in warns[0]


def test_relative_fetch_is_not_flagged(tmp_path):
    project = make_project(tmp_path, files={"src/api.ts": "fetch('/api/items'); fetch(`${base}/x`);\n"})
    assert levels(validate_project.validate(project), "WARN") == []


def test_external_script_in_index_html_warns(tmp_path):
    project = make_project(tmp_path, files={"index.html": '<script src="https://cdn.example.com/lib.js"></script>'})
    assert any("cdn.example.com" in message for message in levels(validate_project.validate(project), "WARN"))


def git(project, *args):
    subprocess.run(["git", "-C", str(project), *args], check=True, capture_output=True)


def init_repo(project):
    git(project, "init", "-q", "-b", "main")
    git(project, "config", "user.email", "dev@example.com")
    git(project, "config", "user.name", "dev")
    git(project, "add", ".")
    git(project, "commit", "-q", "-m", "init")


def test_tracked_env_is_ng(tmp_path):
    project = make_project(tmp_path, files={".env": "SECRET=x\n"})
    init_repo(project)
    git(project, "add", "-f", ".env")
    git(project, "commit", "-q", "-m", "env")
    assert any(".env" in message for message in levels(validate_project.validate(project), "NG"))


def test_deploy_stage_requires_upstream_and_clean_tree(tmp_path):
    project = make_project(tmp_path)
    init_repo(project)
    (project / "src.ts").write_text("x", encoding="utf-8")
    ng = levels(validate_project.validate(project, stage="deploy"), "NG")
    assert any("未 commit" in message for message in ng)
    assert any("上流" in message for message in ng)


def test_deploy_stage_skips_git_for_repo_type_none(tmp_path):
    project = make_project(tmp_path, config={"repoType": "none"})
    assert not validate_project.validate(project, stage="deploy").has_ng


def shared_config(reference):
    return {"repoType": "none", "connectionReferences": {"shared_x": {"sharedConnectionId": "abc", **reference}}}


def test_shared_action_connector_without_allowed_actions(tmp_path):
    project = make_project(tmp_path, config=shared_config({}))
    assert not validate_project.validate(project, stage="push").has_ng
    assert any("allowedActions" in message for message in levels(validate_project.validate(project), "WARN"))
    assert validate_project.validate(project, stage="deploy").has_ng


def test_shared_action_connector_with_allowed_actions_passes(tmp_path):
    project = make_project(tmp_path, config=shared_config({"allowedActions": ["SendEmailV2"]}))
    assert not validate_project.validate(project, stage="deploy").has_ng


def test_shared_tabular_reference_requires_every_table(tmp_path):
    reference = {
        "dataSets": {
            "default": {
                "dataSources": {
                    "Orders": {"allowedActions": ["get", "patch"]},
                    "Customers": {},
                }
            }
        }
    }
    ng = "\n".join(levels(validate_project.validate(make_project(tmp_path, config=shared_config(reference)), stage="deploy"), "NG"))
    assert "Customers" in ng
    assert "Orders" not in ng


def test_shared_table_rejects_operation_ids(tmp_path):
    reference = {"dataSets": {"default": {"dataSources": {"Orders": {"allowedActions": ["GetItems"]}}}}}
    project = make_project(tmp_path, config=shared_config(reference))
    assert validate_project.validate(project, stage="deploy").has_ng


def test_non_shared_reference_is_ignored(tmp_path):
    config = {"repoType": "none", "connectionReferences": {"a": {"sharedConnectionId": "  "}, "b": {}}}
    assert not validate_project.validate(make_project(tmp_path, config=config), stage="deploy").has_ng
