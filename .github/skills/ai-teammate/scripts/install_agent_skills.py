"""Install Agent Skills (SKILL.md bundles) into a scaffolded AI teammate.

The Copilot SDK runtime can load skills from a directory, but host discovery is deliberately off
(``EnableConfigDiscovery = false``): an agent must never inherit whatever happens to sit on the
machine it runs on. So skills are *shipped with the agent* - downloaded here, copied into
``<target>/skills/``, and published to App Service as part of the app.

Source of truth is a GitHub release. Preferred path is one ``skills-manifest.json`` asset that
lists every skill with a sha256; that makes the install deterministic and verifiable. Releases
published before the manifest existed are still supported through the releases API.

Usage:
    python scripts/install_agent_skills.py --target .
    python scripts/install_agent_skills.py --target . --check
    python scripts/install_agent_skills.py --target . --only powerpoint-builder --only daily-brief
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

DEFAULT_REPO = "geekfujiwara/copilot-cowork-skills"
MANIFEST_ASSET = "skills-manifest.json"
STATE_FILE = ".installed.json"
USER_AGENT = "ai-teammate-skill-installer"
# A skill folder without this file is not a skill; the runtime would silently ignore it.
SKILL_ENTRY = "SKILL.md"


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def fetch(url: str) -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    # A token lifts the 60 req/hr anonymous API limit. Never required, never logged.
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token and "api.github.com" in url:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def release_manifest(repo: str, tag: str) -> tuple[str, list[dict]]:
    """Returns (tag, skills). Uses the manifest asset when the release publishes one."""
    base = f"https://github.com/{repo}/releases"
    manifest_url = (
        f"{base}/latest/download/{MANIFEST_ASSET}" if tag == "latest"
        else f"{base}/download/{tag}/{MANIFEST_ASSET}"
    )
    try:
        manifest = json.loads(fetch(manifest_url).decode("utf-8"))
        return str(manifest.get("tag", tag)), list(manifest.get("skills", []))
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError):
        pass

    api = f"https://api.github.com/repos/{repo}/releases"
    api_url = f"{api}/latest" if tag == "latest" else f"{api}/tags/{tag}"
    try:
        release = json.loads(fetch(api_url).decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise SystemExit(
            f"Could not read release {tag!r} from {repo}: HTTP {error.code}. "
            "Check the repository name, or set GITHUB_TOKEN if the API is rate limiting you."
        )
    skills = [
        {"name": asset["name"][: -len(".zip")], "zip": asset["name"], "url": asset["browser_download_url"]}
        for asset in release.get("assets", [])
        if asset.get("name", "").endswith(".zip") and asset["name"] != "skills-all.zip"
    ]
    if not skills:
        raise SystemExit(f"Release {release.get('tag_name', tag)!r} of {repo} publishes no skill ZIPs.")
    return str(release.get("tag_name", tag)), skills


def asset_url(repo: str, tag: str, skill: dict) -> str:
    if skill.get("url"):
        return str(skill["url"])
    return f"https://github.com/{repo}/releases/download/{tag}/{skill['zip']}"


def extract(payload: bytes, destination: Path) -> None:
    """Zip entries are attacker-controlled input as far as this process is concerned: a crafted
    name like ``../../appsettings.json`` would otherwise overwrite the agent's own files."""
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        members = []
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                raise SystemExit(f"Refusing unsafe path in {destination.name}.zip: {info.filename}")
            members.append((info, name))
        if destination.exists():
            shutil.rmtree(destination)
        for info, name in members:
            path = destination / name
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, path.open("wb") as target:
                shutil.copyfileobj(source, target)


def install(
    repo: str, tag: str, skills: list[dict], root: Path, wanted: set[str], skipped: set[str]
) -> list[str]:
    installed: list[str] = []
    root.mkdir(parents=True, exist_ok=True)
    for skill in skills:
        name = str(skill["name"])
        if wanted and name not in wanted:
            continue
        if name in skipped:
            continue
        payload = fetch(asset_url(repo, tag, skill))
        expected = str(skill.get("sha256", ""))
        if expected:
            actual = hashlib.sha256(payload).hexdigest()
            if actual != expected:
                raise SystemExit(f"{name}.zip failed its sha256 check (manifest {expected}, got {actual}).")
        destination = root / name
        extract(payload, destination)
        if not (destination / SKILL_ENTRY).is_file():
            raise SystemExit(f"{name}.zip does not contain {SKILL_ENTRY}; the runtime would ignore it.")
        installed.append(name)
    return installed


def read_state(root: Path) -> dict:
    path = root / STATE_FILE
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_state(root: Path, repo: str, tag: str, installed: list[str]) -> None:
    (root / STATE_FILE).write_text(
        json.dumps({"repo": repo, "tag": tag, "skills": sorted(installed)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def check(root: Path, repo: str, tag: str, skills: list[dict]) -> int:
    """Drift here is silent at runtime: the agent still answers, just without the procedure the
    prompt assumes it has."""
    state = read_state(root)
    problems: list[str] = []
    if not state:
        problems.append(f"{root}/{STATE_FILE} is missing; run install_agent_skills.py first")
    else:
        if state.get("repo") != repo:
            problems.append(f"installed from {state.get('repo')}, expected {repo}")
        if state.get("tag") != tag:
            problems.append(f"installed tag {state.get('tag')}, latest is {tag}")
    available = {str(skill["name"]) for skill in skills}
    on_disk = {path.name for path in root.glob("*") if (path / SKILL_ENTRY).is_file()}
    for name in sorted(on_disk - available):
        problems.append(f"{name} is installed but no longer published by {repo}")
    for name in sorted(set(state.get("skills", [])) - on_disk):
        problems.append(f"{name} is recorded as installed but {SKILL_ENTRY} is missing on disk")

    print(f"repo   : {repo}")
    print(f"tag    : {tag}")
    print(f"skills : {len(on_disk)} installed ({', '.join(sorted(on_disk)) or 'none'})")
    for problem in problems:
        print(f"NG: {problem}")
    return 1 if problems else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default=".", help="Scaffolded agent directory.")
    parser.add_argument("--repo", help=f"owner/name publishing skill ZIPs. Default {DEFAULT_REPO}.")
    parser.add_argument("--tag", help="Release tag, or 'latest'. Default latest.")
    parser.add_argument("--only", action="append", default=[], help="Install just this skill. Repeatable.")
    parser.add_argument("--skip", action="append", default=[], help="Do not install this skill. Repeatable.")
    parser.add_argument("--check", action="store_true", help="Report drift without downloading anything.")
    parser.add_argument("--env", default=".env")
    args = parser.parse_args()

    load_env(Path(args.env))
    repo = args.repo or os.environ.get("AGENT_SKILLS_REPO") or DEFAULT_REPO
    tag = args.tag or os.environ.get("AGENT_SKILLS_TAG") or "latest"
    root = Path(args.target).resolve() / "skills"

    resolved_tag, skills = release_manifest(repo, tag)

    if args.check:
        return check(root, repo, resolved_tag, skills)

    installed = install(repo, resolved_tag, skills, root, set(args.only), set(args.skip))
    write_state(root, repo, resolved_tag, installed)
    print(f"Installed {len(installed)} skills from {repo}@{resolved_tag} into {root}")
    for name in sorted(installed):
        print(f"  + {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
