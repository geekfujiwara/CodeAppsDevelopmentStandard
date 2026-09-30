import importlib.util
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


create_app = load("create_app")


def test_accepts_github_and_ghe_urls():
    assert create_app.validate_repo_url("https://github.com/org/repo") == []
    assert create_app.validate_repo_url("https://tenant.ghe.com/org/repo") == []


def test_rejects_bare_host_and_http():
    assert create_app.validate_repo_url("tenant.ghe.com/org/repo")
    assert create_app.validate_repo_url("http://github.com/org/repo")


def test_rejects_azure_devops_with_specific_message():
    errors = create_app.validate_repo_url("https://dev.azure.com/org/project/_git/repo")
    assert len(errors) == 1
    assert "Azure DevOps" in errors[0]


def test_rejects_enterprise_server_host():
    errors = create_app.validate_repo_url("https://git.example.internal/org/repo")
    assert any("github.com" in error for error in errors)


def test_rejects_url_without_owner_and_repo():
    assert create_app.validate_repo_url("https://github.com/org")


def test_owner_repo_strips_git_suffix():
    assert create_app.owner_repo("https://github.com/org/repo.git") == ("github.com", "org", "repo")


def test_build_command_platform_mode_omits_repo():
    command = create_app.build_command("My App", "./my-app", "platform")
    assert command[:4] == ["ms", "app", "create", "./my-app"]
    assert "--repo" not in command
    assert command[-1] == "--non-interactive"


def test_build_command_github_and_none_modes():
    github = create_app.build_command("My App", "./a", "github", "https://github.com/org/repo")
    assert github[github.index("--repo") + 1] == "https://github.com/org/repo"
    none = create_app.build_command("My App", "./a", "none", environment_id="env")
    assert none[none.index("--repo") + 1] == "none"
    assert none[none.index("--environment-id") + 1] == "env"


def test_target_must_be_empty(tmp_path):
    assert create_app.check_target(tmp_path / "new") == []
    assert create_app.check_target(tmp_path) == []
    (tmp_path / "file.txt").write_text("x", encoding="utf-8")
    assert create_app.check_target(tmp_path)


def test_existing_app_blocks_recreate_with_fetch_hint(tmp_path):
    (tmp_path / "ms.config.json").write_text("{}", encoding="utf-8")
    errors = create_app.check_target(tmp_path)
    assert any("git fetch origin" in error for error in errors)


def test_nested_app_is_rejected(tmp_path):
    (tmp_path / "ms.config.json").write_text("{}", encoding="utf-8")
    errors = create_app.check_target(tmp_path / "child")
    assert any("入れ子" in error for error in errors)
