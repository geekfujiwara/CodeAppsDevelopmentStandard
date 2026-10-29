"""Verify stage-only updates, including a null stage, without touching real opportunities."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4

from deploy_opportunity_rules import c, OPPORTUNITY, HISTORY
from auth_helper import api_get, DATAVERSE_URL, get_credential, get_token


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-url", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if DATAVERSE_URL.rstrip("/").lower() != args.expected_url.rstrip("/").lower():
        raise RuntimeError("Approved target differs from configured environment")
    if not args.apply:
        print("Plan: isolated synthetic opportunity, stage updates, history protection, cleanup.")
        return
    from PowerPlatform.Dataverse.client import DataverseClient

    get_token()
    record_id = str(uuid4())
    primary, history_primary = c("crmopportunityid"), c("crmstagehistoryid")
    opportunity_set = api_get(
        f"EntityDefinitions(LogicalName='{OPPORTUNITY}')?$select=EntitySetName")["EntitySetName"]
    history_set = api_get(
        f"EntityDefinitions(LogicalName='{HISTORY}')?$select=EntitySetName")["EntitySetName"]
    checks = []
    with DataverseClient(base_url=DATAVERSE_URL, credential=get_credential()) as client:
        def rows(table, **options):
            return [dict(row) for row in client.records.list(table, **options)]

        def opportunity():
            found = rows(OPPORTUNITY, filter=f"{primary} eq {record_id}")
            assert len(found) == 1
            return found[0]

        def history():
            entries = rows(HISTORY, filter=f"_{c('opportunityid')}_value eq {record_id}")
            for entry in entries:
                proof = api_get(f"{history_set}({entry[history_primary]})?$select={c('historypermit')}")
                assert proof[c("historypermit")] is None, "Request proof must never persist"
            return entries

        def passed(message):
            checks.append(message)
            print("PASS:", message, flush=True)

        try:
            for initial, expected in ((None, 100000000), (100000002, 100000002)):
                client.records.create(OPPORTUNITY, {
                    primary: record_id, c("name"): "CRM-STAGE-TEST explicit", c("stage"): initial})
                assert opportunity()[c("stage")] == expected
                entries = history()
                assert len(entries) == 1
                assert entries[0].get(c("fromstage")) is None and entries[0][c("tostage")] == expected
                client.records.delete(OPPORTUNITY, record_id)
                assert not history()
            passed("Explicit null defaults to Prospect; explicitly supplied Negotiation is preserved with initial history.")
            client.records.create(OPPORTUNITY, {primary: record_id, c("name"): "CRM-STAGE-TEST"})
            assert opportunity()[c("stage")] == 100000000
            assert len(history()) == 1 and history()[0].get(c("fromstage")) is None
            assert history()[0][c("tostage")] == 100000000
            passed("Omitted stage defaults to Prospect and initial history commits atomically.")
            previous = 100000000
            for stage in (100000001, 100000002, 100000003):
                old_count = len(history())
                client.records.update(OPPORTUNITY, record_id, {c("stage"): stage})
                assert opportunity()[c("stage")] == stage
                entries = history()
                assert len(entries) == old_count + 1
                assert sum(entry.get(c("fromstage")) == previous and entry[c("tostage")] == stage
                           for entry in entries) == 1
                previous = stage
            passed("Prospect -> Proposal -> Negotiation -> Won works through stage-only updates with automatic history.")
            won = opportunity()
            assert won[c("probability")] == 100 and won[c("actualclosedate")]
            passed("Won automatically sets probability and close date.")
            count = len(history())
            client.records.update(OPPORTUNITY, record_id, {c("stage"): 100000003})
            assert len(history()) == count
            passed("Same-stage retry creates no duplicate history.")
            try:
                client.records.update(OPPORTUNITY, record_id, {c("stage"): 100000004})
            except Exception as error:
                if "失注理由" not in str(error):
                    raise
            else:
                raise AssertionError("Lost without a reason unexpectedly succeeded")
            assert opportunity()[c("stage")] == 100000003 and len(history()) == count
            passed("Lost without reason rolls back opportunity and history.")
            client.records.update(OPPORTUNITY, record_id, {
                c("stage"): 100000004, c("lossreason"): "Synthetic approved loss reason"})
            assert opportunity()[c("probability")] == 0 and len(history()) == count + 1
            passed("Lost plus reason in a single update succeeds.")
            entry = history()[0]
            forged_id = str(uuid4())
            try:
                client.records.create(HISTORY, {
                    history_primary: forged_id, c("name"): "Forbidden direct history",
                    f"{c('opportunityid')}@odata.bind":
                        f"/{opportunity_set}({record_id})",
                    c("fromstage"): 100000000, c("tostage"): 100000001})
            except Exception as error:
                if "直接変更できません" not in str(error):
                    raise
            else:
                raise AssertionError("Direct history create unexpectedly succeeded")
            assert not rows(HISTORY, filter=f"{history_primary} eq {forged_id}")
            passed("Direct history create with valid parent and stages remains prohibited.")
            try:
                client.records.create(HISTORY, {
                    history_primary: forged_id, c("name"): "Forbidden forged proof",
                    f"{c('opportunityid')}@odata.bind": f"/{opportunity_set}({record_id})",
                    c("fromstage"): 100000000, c("tostage"): 100000001,
                    c("historypermit"): "crm-history-v1:0:forged"})
            except Exception as error:
                if "直接変更できません" not in str(error):
                    raise
            else:
                raise AssertionError("Forged history request proof unexpectedly succeeded")
            assert not rows(HISTORY, filter=f"{history_primary} eq {forged_id}")
            passed("Caller-supplied forged request proof is rejected with no partial history.")
            try:
                client.records.update(HISTORY, entry[history_primary], {c("name"): "Forbidden"})
            except Exception as error:
                if "直接変更できません" not in str(error):
                    raise
            else:
                raise AssertionError("History edit unexpectedly succeeded")
            passed("Direct history edit remains prohibited; this does not prohibit opportunity stage updates.")
            client.records.update(OPPORTUNITY, record_id, {c("stage"): 100000001})
            assert opportunity()[c("actualclosedate")] is None
            passed("Reopening clears the actual close date automatically.")
            assert history()
            passed("Request proof is explicitly read as null in every persisted synthetic history.")
        finally:
            if rows(OPPORTUNITY, filter=f"{primary} eq {record_id}"):
                client.records.delete(OPPORTUNITY, record_id)
            assert not rows(OPPORTUNITY, filter=f"{primary} eq {record_id}") and not history()
        passed("Synthetic opportunity and its history removed; no real business record changed.")
    result = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "environment": DATAVERSE_URL,
              "checks": checks, "copilotMcpConversationVerified": False, "pluginChanged": True,
              "defaultStageOnCreate": 100000000}
    target = Path(__file__).resolve().parents[1] / "server" / "stage-update-verification.json"
    target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
