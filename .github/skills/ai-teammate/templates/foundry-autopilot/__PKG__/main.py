# Overlay file - replaces the quickstart entry point so the host runs the teammate agent.

"""Entry point - starts the activity-protocol host with :class:`TeammateAgent`.

Only the agent class changes; ``host_agent_server.py`` stays exactly as shipped by the
quickstart so future upstream fixes can be picked up by re-running
``fetch_autopilot_quickstart.py``.
"""

from __future__ import annotations

import logging
import os
import sys

from .host_agent_server import create_and_run_host
from .teammate_agent import TeammateAgent

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


def main() -> int:
    try:
        print(f"Starting {os.getenv('AGENT_DISPLAY_NAME', 'AI teammate')} host...")
        create_and_run_host(TeammateAgent)
    except Exception as ex:  # noqa: BLE001 - surfaced in container logs
        print(f"Failed to start server: {ex}")
        import traceback

        traceback.print_exc()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
