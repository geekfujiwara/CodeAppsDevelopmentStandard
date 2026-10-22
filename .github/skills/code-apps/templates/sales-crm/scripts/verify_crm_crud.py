"""Check CRM metadata; --apply creates isolated test records and removes them."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv(Path.cwd() / ".env")
for root in (Path.cwd(), *Path.cwd().parents):
    candidate = root / ".github" / "skills" / "standard" / "scripts"
    if (candidate / "auth_helper.py").is_file():
        sys.path.insert(0, str(candidate))
        break
else:
    raise SystemExit("NG: standard/scripts/auth_helper.py is required.")

from auth_helper import api_get, get_credential  # noqa: E402


def validate_name(value: str, maximum: int) -> None:
    if len(value) > maximum or len(value + "-UPDATED") > maximum:
        raise ValueError(f"Test name/update exceeds metadata MaxLength={maximum}.")


def resolve_lookup(relations: list[dict], target: str, expected: str) -> tuple[str, str]:
    matches = [row for row in relations if row["ReferencedEntity"] == target
               and row["ReferencingEntityNavigationPropertyName"].lower() == expected.lower()]
    if len(matches) != 1:
        raise ValueError(f"Cannot uniquely resolve lookup {expected} -> {target}.")
    return matches[0]["ReferencingEntityNavigationPropertyName"], matches[0]["ReferencingAttribute"]


def read_records(client, table: str, key: str, record_id: str, columns: list[str]):
    # SDK list() returns flat QueryResult records, not pages like legacy get().
    return list(client.records.list(
        table, select=list(dict.fromkeys([key, *columns])), filter=f"{key} eq {record_id}",
    ))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-url", required=True, help="Explicitly approved target URL")
    parser.add_argument("--apply", action="store_true", help="Approve temporary create/update/delete")
    args = parser.parse_args()
    url = os.environ["DATAVERSE_URL"]
    if url.rstrip("/").lower() != args.expected_url.rstrip("/").lower():
        raise ValueError("Target differs from the approved URL.")
    prefix = os.environ["PUBLISHER_PREFIX"]
    marker = f"CRM-TEST-{uuid4().hex[:16]}"
    tables = ["account", "contact"] + [f"{prefix}_{suffix}" for suffix in (
        "crmfiscalperiod", "crmsalestarget", "crmlead", "crmopportunity", "crmactivity")]
    metadata = {}
    lookups = {}
    for table in tables:
        meta = api_get(f"EntityDefinitions(LogicalName='{table}')"
                       "?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute")
        write_name = "lastname" if table == "contact" else meta["PrimaryNameAttribute"]
        name_meta = api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes"
                            f"(LogicalName='{write_name}')/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=MaxLength")
        validate_name(marker, name_meta["MaxLength"])
        meta["WriteName"] = write_name
        metadata[table] = meta
        target = expected = None
        if table == "contact":
            target, expected = "account", "parentcustomerid_account"
        elif table.endswith("crmsalestarget"):
            target, expected = f"{prefix}_crmfiscalperiod", f"{prefix}_fiscalperiodid"
        elif table.endswith("crmopportunity"):
            target, expected = "account", f"{prefix}_accountid"
        elif table.endswith("crmactivity"):
            target, expected = f"{prefix}_crmopportunity", f"{prefix}_opportunityid"
        if target:
            relations = api_get(f"EntityDefinitions(LogicalName='{table}')/ManyToOneRelationships"
                                "?$select=ReferencedEntity,ReferencingEntityNavigationPropertyName,ReferencingAttribute")["value"]
            nav, attribute = resolve_lookup(relations, target, expected)
            lookups[table] = (target, nav, attribute)
    print("PASS: all name lengths, entity sets, keys and lookup metadata checked before writes.")
    if not args.apply:
        print("Read-only check complete. Use --apply only after temporary CRUD approval.")
        return

    from PowerPlatform.Dataverse.client import DataverseClient

    created = []
    ids = {}
    cleanup_errors = []
    with DataverseClient(base_url=url, credential=get_credential()) as client:
        def read(table, record_id, columns):
            key = metadata[table]["PrimaryIdAttribute"]
            return read_records(client, table, key, record_id, columns)

        try:
            for table in tables:
                meta = metadata[table]
                payload = {meta["WriteName"]: marker}
                expected_values = dict(payload)
                if table in lookups:
                    target, nav, attribute = lookups[table]
                    payload[f"{nav}@odata.bind"] = f"/{metadata[target]['EntitySetName']}({ids[target]})"
                    expected_values[f"_{attribute}_value"] = ids[target]
                if table.endswith("crmsalestarget"):
                    payload[f"{prefix}_targetamount"] = 100
                    expected_values[f"{prefix}_targetamount"] = 100
                if table.endswith("crmopportunity"):
                    for field, value in (("amount", 100), ("stage", 100000000), ("probability", 10)):
                        payload[f"{prefix}_{field}"] = value
                        expected_values[f"{prefix}_{field}"] = value
                record_id = str(client.records.create(table, payload))
                created.append((table, record_id))
                ids[table] = record_id
                rows = read(table, record_id, list(expected_values))
                if len(rows) != 1 or any(rows[0].get(key) != value for key, value in expected_values.items()):
                    raise AssertionError(f"Create/field/lookup read-back mismatch: {table}")
                updated = marker + "-UPDATED"
                client.records.update(table, record_id, {meta["WriteName"]: updated})
                rows = read(table, record_id, [meta["WriteName"]])
                if len(rows) != 1 or rows[0][meta["WriteName"]] != updated:
                    raise AssertionError(f"Update read-back mismatch: {table}")
                print(f"PASS: create/read/update {table}", flush=True)
        finally:
            for table, record_id in reversed(created):
                try:
                    client.records.delete(table, record_id)
                    if read(table, record_id, []):
                        raise AssertionError("Deleted record still exists.")
                    print(f"PASS: delete/read-back {table}", flush=True)
                except Exception as exc:
                    cleanup_errors.append(f"{table}({record_id}): {exc}")
                    print(f"ERROR: cleanup failed: {cleanup_errors[-1]}", file=sys.stderr)
            if cleanup_errors:
                raise RuntimeError("Cleanup failed: " + "; ".join(cleanup_errors))
    print("PASS: backend CRUD only; all test records removed. Player/UI CRUD remains a separate gate.")


if __name__ == "__main__":
    main()
