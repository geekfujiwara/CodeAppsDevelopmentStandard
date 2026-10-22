"""Non-secret browser preferences; tokens remain in each client's encrypted cache."""

from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import webbrowser

from dotenv import set_key


def interactive_allowed(explicit: bool = False) -> bool:
    mode = os.getenv("PP_AUTH_MODE", "browser")
    if mode != "browser":
        raise ValueError("PP_AUTH_MODE must be browser; device-code is not supported.")
    saved = os.getenv("PP_AUTH_ALLOW_INTERACTIVE", "false").lower()
    if saved not in ("true", "false"):
        raise ValueError("PP_AUTH_ALLOW_INTERACTIVE must be true or false.")
    if saved == "true":
        validate_preferences(os.getenv("PP_AUTH_ACCOUNT", ""), os.getenv("PP_AUTH_EDGE_PROFILE", ""))
    ci = any(os.getenv(key, "").lower() not in ("", "0", "false")
             for key in ("CI", "GITHUB_ACTIONS", "TF_BUILD"))
    return not ci and (explicit or saved == "true")


def validate_preferences(account: str, profile: str) -> None:
    if not re.fullmatch(r"[^@\s]+@[^@\s]+", account):
        raise ValueError("An approved account UPN is required.")
    if not re.fullmatch(r"Default|Profile \d+", profile):
        raise ValueError("Use the Edge profile directory (Default or Profile N), not its display name.")


def save_preferences(env: Path, account: str, profile: str, approved: bool) -> None:
    validate_preferences(account, profile)
    if not approved:
        raise ValueError("Confirm the account/profile and approve continuing browser authentication first.")
    if not env.is_file():
        raise ValueError("Create the project .env with environment settings before saving preferences.")
    repository = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, check=False)
    if repository.returncode == 0:
        ignored = subprocess.run(["git", "check-ignore", "--quiet", str(env)], check=False)
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", str(env)],
                                 capture_output=True, check=False)
        if ignored.returncode != 0 or tracked.returncode == 0:
            raise ValueError(".env must be ignored and untracked before saving authentication preferences.")
    values = {"PP_AUTH_MODE": "browser", "PP_AUTH_ACCOUNT": account,
              "PP_AUTH_EDGE_PROFILE": profile, "PP_AUTH_ALLOW_INTERACTIVE": "true"}
    for key, value in values.items():
        set_key(str(env), key, value, quote_mode="always")
        os.environ[key] = value


def configure_python_browser() -> None:
    profile = os.getenv("PP_AUTH_EDGE_PROFILE", "")
    if not profile:
        return
    validate_preferences(os.getenv("PP_AUTH_ACCOUNT", ""), profile)
    if os.name != "nt":
        raise ValueError("Explicit Edge profile launching is currently supported only on Windows.")
    user_data = Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "Edge" / "User Data"
    if not (user_data / profile).is_dir():
        raise ValueError("The approved Edge profile directory does not exist; no alternative profile will be used.")
    candidates = [Path(os.environ.get(key, "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe"
                  for key in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA")]
    edge = next((path for path in candidates if path.is_absolute() and path.is_file()), None)
    if edge is None:
        raise ValueError("Microsoft Edge was not found; no alternative browser will be used.")

    class ProfileBrowser(webbrowser.BaseBrowser):
        def open(self, url, new=0, autoraise=True):
            subprocess.Popen([str(edge), f"--profile-directory={profile}", url])
            return True

    webbrowser.register("power-platform-edge", None, ProfileBrowser(), preferred=True)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Save approved browser preferences before the first sign-in; never authenticate.")
    parser.add_argument("--account", required=True)
    parser.add_argument("--edge-profile", required=True)
    parser.add_argument("--approve-interactive", action="store_true")
    args = parser.parse_args()
    save_preferences(Path.cwd() / ".env", args.account, args.edge_profile, args.approve_interactive)
    print("Saved non-secret authentication preferences. No browser opened; no tokens written.")
