#!/usr/bin/env python3
"""Retired ordinary-agent deployment entrypoint; no Azure resources are changed.

Creating a Foundry version alone does not publish an Autopilot Agent template.
Use publish_foundry_autopilot.py --check / --execute --env <.env> instead.
"""
from __future__ import annotations

import sys


def main() -> int:
    print(
        "Blocked: deploy.py only created an ordinary Foundry agent, not an Agent template.\n"
        "Use publish_foundry_autopilot.py --check --env <.env>, then "
        "--execute --env <.env> to create and publish an Autopilot Agent template.\n"
        "No deployment was performed. There is no ordinary-agent fallback.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
