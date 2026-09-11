"""List Teams and channels available to the cached Power Platform identity (GET only)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = next(path for path in SCRIPT_DIR.parents if (path / ".git").exists())
sys.path.insert(0, str(REPO_ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import get_session  # noqa: E402


def main() -> int:
    session = get_session("https://graph.microsoft.com/.default")
    response = session.get("https://graph.microsoft.com/v1.0/me/joinedTeams", timeout=60)
    response.raise_for_status()
    output = []
    for team in response.json().get("value", []):
        team_id = team["id"]
        channels_response = session.get(
            f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels",
            timeout=60,
        )
        channels_response.raise_for_status()
        output.append(
            {
                "teamId": team_id,
                "team": team.get("displayName", ""),
                "channels": [
                    {
                        "channelId": channel["id"],
                        "channel": channel.get("displayName", ""),
                        "type": channel.get("membershipType", ""),
                    }
                    for channel in channels_response.json().get("value", [])
                ],
            }
        )
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())