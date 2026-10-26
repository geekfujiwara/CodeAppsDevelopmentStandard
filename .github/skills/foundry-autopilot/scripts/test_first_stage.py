#!/usr/bin/env python3
"""Real Teams Graph conversations plus correlated evaluation-Hub evidence.

Never substitute a headless test for a Teams conversation. Exit 2 means unmeasured,
not passed. --execute sends test messages only to the selected hired teammate.
"""
from __future__ import annotations

import argparse
import base64
import html
import importlib
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlparse

from requests import RequestException

GRAPH = "https://graph.microsoft.com/v1.0"
ARM = "https://management.azure.com"


def require(condition: bool, detail: str) -> None:
    if not condition:
        raise ValueError(detail)


def plain(value: str) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", value))
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    return " ".join(re.sub(r"[*_`#]", "", text).split())


def escaped(value: str) -> str:
    return value.replace("'", "''")


def assert_case(case: dict, turn: dict, prefix: str, marker: str) -> None:
    response = turn.get(f"{prefix}_response") or ""
    require(bool(response.strip()), "The Hub turn has an empty response.")
    require(marker in (turn.get(f"{prefix}_query") or ""), "Hub log does not match this run.")
    calls = turn.get(f"{prefix}_toolcalls") or "[]"
    require(isinstance(json.loads(calls), list), "Hub tool calls must be a JSON array.")
    for alternatives in case.get("tools", []):
        require(any(name.lower() in calls.lower() for name in alternatives.split("|")),
                f"{case['id']}: required tool not invoked: {alternatives}")
    if case["id"] == "workiq-calendar":
        require(len(re.findall(r"\d{1,2}:\d{2}", response)) >= 2, "No two concrete meeting times.")
        require(bool(re.search(r"JST|日本時間|UTC\+0?9|Asia/Tokyo", response)), "No meeting timezone.")
    if case.get("links"):
        require(bool(re.search(r"https://[^\s<>\"')]+", response)), "No news source link.")


def assert_html(content: str, marker: str) -> None:
    require(marker in content, "Downloaded document does not belong to this test.")
    require(not re.search(r"<script\b|javascript:", content, re.I), "Active script in the document.")
    for pattern, label in ((r"<html\b", "HTML"), (r"<h[12]\b", "heading"),
                           (r"<table\b", "comparison table"), (r"<style\b|style=", "styling"),
                           (r"<meta[^>]+viewport", "responsive viewport"), (r"<a\b[^>]+href=", "source link")):
        require(bool(re.search(pattern, content, re.I)), f"Document missing {label}.")


class Acceptance:
    def __init__(self, env: dict[str, str], auth, timeout: int = 900, poll: int = 5):
        self.env, self.auth, self.timeout, self.poll = env, auth, timeout, poll
        self.graph = auth.get_session("https://graph.microsoft.com/.default")
        self.dv = auth.get_session(env["DATAVERSE_URL"].rstrip("/") + "/.default")
        self.arm = auth.get_session(f"{ARM}/.default")
        self.prefix = env["PUBLISHER_PREFIX"]
        self.agent = env["AGENTIC_USER_ID"]
        self.key = env["EVAL_AGENT_KEY"]
        self.chat = ""
        self.run_id = "accept-" + uuid.uuid4().hex

    def request(self, session, method: str, url: str, **kwargs):
        response = session.request(method, url, timeout=60, **kwargs)
        response.raise_for_status()
        return response.json() if response.content and response.headers.get("Content-Type", "").startswith("application/json") else {}

    def collection(self, session, url: str, **kwargs) -> list[dict]:
        origin = urlparse(url).netloc
        rows = []
        while url:
            require(urlparse(url).scheme == "https" and urlparse(url).netloc == origin,
                    "Refusing a cross-origin continuation URL.")
            body = self.request(session, "GET", url, **kwargs)
            rows.extend(body.get("value", []))
            url = body.get("@odata.nextLink", "")
            kwargs = {}
        return rows

    def hub(self, table: str, expression: str) -> list[dict]:
        return self.collection(
            self.dv, f"{self.env['DATAVERSE_URL'].rstrip('/')}/api/data/v9.2/{self.prefix}_{table}",
            params={"$filter": expression, "$top": 100},
        )

    def connect(self) -> None:
        me = self.request(self.graph, "GET", f"{GRAPH}/me")
        require(me["id"] == self.env["AGENT_OWNER_ID"], "The signed-in test account is not the selected owner.")
        agent = self.request(self.graph, "GET", f"https://graph.microsoft.com/beta/users/{self.agent}")
        require(bool(agent.get("identityParentId")), "Not a hired agent user.")
        require(agent["identityParentId"] == self.env["AGENT_INSTANCE_APP_ID"], "Hired identity does not match configuration.")
        members = [{"@odata.type": "#microsoft.graph.aadUserConversationMember", "roles": ["owner"],
                    "user@odata.bind": f"{GRAPH}/users('{identifier}')"} for identifier in (me["id"], self.agent)]
        self.chat = self.request(self.graph, "POST", f"{GRAPH}/chats",
                                 json={"chatType": "oneOnOne", "members": members})["id"]
        p = self.prefix
        rows = self.hub("evalagents", f"{p}_agentkey eq '{escaped(self.key)}'")
        require(len(rows) == 1, "Hub must contain exactly one master row for this teammate.")
        require(bool(self.hub("skills", f"{p}_agentkey eq '{escaped(self.key)}'")), "Skills have not synced to the Hub.")

    def wait_turn(self, marker: str, source: str = "chat") -> dict:
        p = self.prefix
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            turns = self.hub("evalturns", f"{p}_agentkey eq '{escaped(self.key)}' and "
                            f"{p}_source eq '{source}' and contains({p}_query,'{escaped(marker)}')")
            if turns:
                require(len(turns) == 1, "Multiple matching Hub turns; correlation is ambiguous.")
                return turns[0]
            time.sleep(self.poll)
        raise TimeoutError(f"No {source} Hub log for {marker} within {self.timeout}s.")

    def wait_reply(self, turn: dict, sent_at: str) -> dict:
        deadline = time.monotonic() + self.timeout
        expected = plain(turn[f"{self.prefix}_response"])
        require(bool(expected), "No final answer in Hub log.")
        while time.monotonic() < deadline:
            messages = self.collection(self.graph, f"{GRAPH}/chats/{quote(self.chat, safe='')}/messages",
                                       params={"$top": 50})
            for message in messages:
                sender = (message.get("from") or {}).get("user") or {}
                body = (message.get("body") or {}).get("content") or ""
                # A typing/progress acknowledgement cannot satisfy the final-answer check.
                if (sender.get("id") == self.agent and message.get("createdDateTime", "") >= sent_at
                        and expected in plain(body)):
                    return message
            time.sleep(self.poll)
        raise TimeoutError("Hub has a result, but no matching final reply arrived from the agent user in Teams.")

    def document(self, turn: dict, marker: str) -> None:
        text = turn[f"{self.prefix}_response"]
        links = re.findall(r"https://[^\s<>\"')\]]+", text)
        share_links = [link for link in links if urlparse(link).hostname and
                       (urlparse(link).hostname.endswith(".sharepoint.com") or urlparse(link).hostname == "1drv.ms")]
        require(bool(share_links), "No OneDrive sharing link in the final answer.")
        token = "u!" + base64.urlsafe_b64encode(share_links[0].encode()).decode().rstrip("=")
        item = self.request(self.graph, "GET", f"{GRAPH}/shares/{token}/driveItem")
        require(bool(item.get("file")) and str(item.get("name", "")).endswith(".html"), "The link is not an HTML file.")
        drive = quote(item["parentReference"]["driveId"], safe="")
        item_id = quote(item["id"], safe="")
        permissions = self.collection(self.graph, f"{GRAPH}/drives/{drive}/items/{item_id}/permissions")
        scopes = {permission["link"].get("scope") for permission in permissions if permission.get("link")}
        require("organization" in scopes and "anonymous" not in scopes, "Sharing is not organization-only.")
        response = self.graph.get(f"{GRAPH}/drives/{drive}/items/{item_id}/content", timeout=60)
        response.raise_for_status()
        require(len(response.content) <= 5_000_000, "HTML artifact exceeds acceptance-test size limit.")
        assert_html(response.content.decode("utf-8-sig"), marker)

    def meeting(self, marker: str) -> None:
        owner = self.env["AGENT_OWNER_UPN"]
        create_marker = marker + "-create"
        created = {
            "id": "meeting-create", "tools": ["Calendar"],
            "prompt": (
                "先ほどの会議候補の先頭で、あなたと私の30分の会議を実際に作成し、私を招待してください。"
                f"私のメールアドレスは {owner} です。私は本人として日程と招待を承認します。"
                f"会議件名は正確に {create_marker} とし、回答にも {{marker}} を含めてください。"
                "第三者は招待しません。"
            ),
        }
        self.case(created)
        event = None
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            events = self.collection(self.graph, f"{GRAPH}/me/events",
                                     params={"$filter": f"subject eq '{escaped(self.run_id + '-meeting-create')}'"})
            if events:
                require(len(events) == 1, "Multiple test meetings were created.")
                event = events[0]
                break
            time.sleep(self.poll)
        require(event is not None, "The test meeting invitation never arrived in the owner's calendar.")
        organizer = (event.get("organizer") or {}).get("emailAddress") or {}
        require(organizer.get("address", "").lower() == self.env["AGENT_UPN"].lower(),
                "Meeting was not organized by the AI teammate.")
        require(bool(event.get("start", {}).get("dateTime")) and bool(event.get("end", {}).get("dateTime")),
                "Meeting has no scheduled start/end.")
        start = datetime.fromisoformat(event["start"]["dateTime"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(event["end"]["dateTime"].replace("Z", "+00:00"))
        require((end - start).total_seconds() == 1800, "Test meeting must last exactly 30 minutes.")
        attendees = {(item.get("emailAddress") or {}).get("address", "").lower()
                     for item in event.get("attendees", [])}
        require(owner.lower() in attendees and attendees <= {owner.lower(), self.env["AGENT_UPN"].lower()},
                "Test meeting must invite the owner only, not third parties.")
        cleanup = {
            "id": "meeting-cancel", "tools": ["Calendar"],
            "prompt": f"受入テスト会議 {self.run_id}-meeting-create を実際に取り消してください。"
                      "取り消しを承認します。他の予定は変更しません。回答に {marker} を含めてください。",
        }
        self.case(cleanup)
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            response = self.graph.get(f"{GRAPH}/me/events/{quote(event['id'], safe='')}", timeout=60)
            if response.status_code == 404:
                return
            response.raise_for_status()
            if response.json().get("isCancelled") is True:
                return
            time.sleep(self.poll)
        raise TimeoutError("The test meeting was not cancelled; inspect the marked calendar event.")

    def schedule(self, marker: str, sent_at: str) -> None:
        # Invoke the real Logic App trigger, not a direct Foundry invocation under the developer's identity.
        time.sleep(150)
        name = self.env.get("SCHEDULE_LOGIC_APP_NAME") or f"{self.env['AGENT_NAME']}-schedule"
        workflow = (f"{ARM}/subscriptions/{self.env['AZURE_SUBSCRIPTION_ID']}/resourceGroups/"
                    f"{self.env['AZURE_RESOURCE_GROUP']}/providers/Microsoft.Logic/workflows/{name}")
        started = datetime.now(timezone.utc).isoformat()
        self.request(self.arm, "POST", f"{workflow}/triggers/Every_tick/run?api-version=2016-06-01")
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            runs = self.collection(self.arm, f"{workflow}/runs?api-version=2016-06-01&$top=10")
            if any(run.get("properties", {}).get("status") == "Succeeded"
                   and run["properties"].get("startTime", "") >= started for run in runs):
                turn = self.wait_turn(marker, "schedule")
                assert_case({"id": "schedule-run", "tools": ["search|browse|web"], "links": True},
                            turn, self.prefix, marker)
                self.wait_reply(turn, sent_at)
                return
            time.sleep(self.poll)
        raise TimeoutError("No successful Logic App run and correlated schedule result.")

    def case(self, case: dict) -> dict:
        marker = self.run_id + "-" + case["id"]
        prompt = case["prompt"].replace("{marker}", marker)
        sent = self.request(self.graph, "POST", f"{GRAPH}/chats/{quote(self.chat, safe='')}/messages",
                            json={"body": {"contentType": "text", "content": prompt}})
        turn = self.wait_turn(marker)
        assert_case(case, turn, self.prefix, marker)
        reply = self.wait_reply(turn, sent["createdDateTime"])
        if case.get("document"):
            self.document(turn, marker)
        if case.get("image"):
            messages = self.collection(self.graph, f"{GRAPH}/chats/{quote(self.chat, safe='')}/messages",
                                       params={"$top": 50})
            require(any(
                (message.get("from") or {}).get("user", {}).get("id") == self.agent
                and message.get("createdDateTime", "") >= sent["createdDateTime"]
                and (message.get("attachments") or "<img" in (message.get("body") or {}).get("content", "").lower())
                for message in messages),
                    "Image tool ran but the image was not delivered to Teams.")
        if case.get("schedule"):
            self.schedule(marker, sent["createdDateTime"])
        return {"id": case["id"], "status": "passed", "marker": marker,
                "messageId": sent["id"], "replyId": reply["id"], "hubTurn": turn[f"{self.prefix}_name"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--env", type=Path)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    target = args.target.resolve()
    report = {"status": "unmeasured", "results": []}
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from run_first_stage import approval, skill_root

        root = skill_root(target)
        sys.path.insert(0, str(root / "scripts"))
        from scaffold_ai_teammate import load_dotenv

        env = load_dotenv(args.env or target / ".env")
        cases = json.loads((target / "regression" / "first-stage.json").read_text(encoding="utf-8"))["cases"]
        required = {"conversation", "workiq-calendar", "news-web", "skills-document", "schedule", "image"}
        require({case["id"] for case in cases} == required and len(cases) == len(required),
                "First-stage suite must contain every mandatory acceptance case, exactly once.")
        require(all(not case.get("enabledBy") for case in cases if case["id"] != "image"),
                "Mandatory acceptance cases cannot be disabled.")
        require(args.timeout > 0, "--timeout must be positive.")
        if not args.execute:
            print(json.dumps(cases, ensure_ascii=False, indent=2))
            return 0
        evidence = approval(target)
        require(evidence["hiredUserId"] == env.get("AGENTIC_USER_ID"), "Approval belongs to another agent user.")
        for key in ("AGENTIC_USER_ID", "AGENT_INSTANCE_APP_ID", "AGENT_OWNER_ID", "AGENT_OWNER_UPN", "AGENT_UPN", "DATAVERSE_URL",
                    "PUBLISHER_PREFIX", "EVAL_AGENT_KEY", "AZURE_SUBSCRIPTION_ID", "AZURE_RESOURCE_GROUP", "AGENT_NAME"):
            require(bool(env.get(key)), f"Missing {key}")
        require(bool(re.fullmatch(r"[a-z][a-z0-9_]*", env["PUBLISHER_PREFIX"])), "Invalid publisher prefix.")
        require(env.get("IMAGE_GENERATION_ENABLED", "").lower() in {"true", "false"},
                "IMAGE_GENERATION_ENABLED must record the user's explicit answer.")
        os.environ.update(env)
        sys.path.insert(0, str(root.parent / "standard" / "scripts"))
        auth = importlib.import_module("auth_helper")
        test = Acceptance(env, auth, args.timeout)
        test.connect()
        for case in cases:
            if case.get("enabledBy") and env.get(case["enabledBy"], "").lower() != "true":
                report["results"].append({"id": case["id"], "status": "disabled-by-user"})
                continue
            report["results"].append(test.case(case))
            if case["id"] == "workiq-calendar":
                test.meeting(test.run_id + "-meeting")
                report["results"].append({"id": "meeting-create-cancel", "status": "passed"})
        presence = test.request(test.graph, "GET", f"{GRAPH}/users/{test.agent}/presence")
        require(presence.get("availability") in ("Available", "Busy", "DoNotDisturb"),
                f"Teams presence is not online: {presence.get('availability')}")
        report["results"].append({"id": "presence", "status": "passed", "availability": presence["availability"]})
        report["status"] = "passed"
        return 0
    except (OSError, ValueError, KeyError, RuntimeError, RequestException) as exc:
        report["error"] = str(exc)
        print(f"NOT COMPLETE: {exc}", file=sys.stderr)
        return 2
    finally:
        if args.execute:
            destination = target / "regression" / "first-stage-results.json"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
