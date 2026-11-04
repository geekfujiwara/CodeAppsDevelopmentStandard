"""Validate or provision the reusable Field Service Dataverse schema.

The default execution is read-only. Add ``--apply`` to create missing
metadata, and ``--apply --seed-demo`` to add synthetic sample records.
Configuration is read from the current app's .env (or process environment).
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


def _column(suffix: str, kind: str, **kwargs: Any) -> dict[str, Any]:
    return {"suffix": suffix, "type": kind, **kwargs}


def schema_for(prefix: str) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Return all schema metadata using the caller's publisher prefix."""
    p = lambda suffix: f"{prefix}_{suffix}"
    tables = [
        {"suffix": "customer", "display": "Customer", "plural": "Customers", "columns": [
            _column("address", "String", maxLength=300), _column("phone", "String", maxLength=50),
            _column("email", "String", maxLength=100),
            _column("satier", "Picklist", options=[(100000000, "Premium"), (100000001, "Standard"), (100000002, "Economy")]),
        ]},
        {"suffix": "engineer", "display": "Engineer", "plural": "Engineers", "columns": [
            _column("area", "String", maxLength=100), _column("skill", "Memo", maxLength=2000),
            _column("skilllevel", "Picklist", options=[(100000000, "Junior"), (100000001, "Standard"), (100000002, "Senior"), (100000003, "Expert")]),
            _column("workstatus", "Picklist", options=[(100000000, "Idle"), (100000001, "Working"), (100000002, "Moving"), (100000003, "Break")]),
        ]},
        {"suffix": "area", "display": "Service Area", "plural": "Service Areas", "columns": [
            _column("description", "String", maxLength=500),
        ]},
        {"suffix": "equipment", "display": "Equipment", "plural": "Equipment", "columns": [
            _column("model", "String", maxLength=100), _column("serialno", "String", maxLength=100),
            _column("location", "String", maxLength=300),
            _column("status", "Picklist", options=[(100000000, "Active"), (100000001, "Stopped"), (100000002, "Retired")]),
            _column("installdate", "DateTime", format="DateOnly"), _column("eoldate", "DateTime", format="DateOnly"),
            _column("remainingyears", "Decimal", minValue=0, maxValue=30, precision=1),
            _column("monthlyvolume", "Integer", minValue=0, maxValue=2000000),
            _column("totalcount", "Integer", minValue=0, maxValue=2000000000),
            _column("lifecycleaction", "Picklist", options=[(100000000, "Continue"), (100000001, "ConsiderReplace"), (100000002, "RecommendReplace")]),
        ]},
        {"suffix": "maintenancecontract", "display": "Maintenance Contract", "plural": "Maintenance Contracts", "columns": [
            _column("contracttype", "Picklist", options=[(100000000, "Maintenance"), (100000001, "One Shot"), (100000002, "Subscription")]),
            _column("slacondition", "Memo", maxLength=2000), _column("startdate", "DateTime", format="DateOnly"),
            _column("enddate", "DateTime", format="DateOnly"),
        ]},
        {"suffix": "call", "display": "Service Call", "plural": "Service Calls", "columns": [
            _column("channel", "Picklist", options=[(100000000, "Phone"), (100000001, "Web"), (100000002, "Alert")]),
            _column("description", "Memo", maxLength=4000),
            _column("priority", "Picklist", options=[(100000000, "Critical"), (100000001, "High"), (100000002, "Medium"), (100000003, "Low")]),
            _column("status", "Picklist", options=[(100000000, "Received"), (100000001, "InProgress"), (100000002, "Dispatched"), (100000003, "Completed"), (100000004, "Closed")]),
            _column("receiveddate", "DateTime"),
        ]},
        {"suffix": "workorder", "display": "Work Order", "plural": "Work Orders", "columns": [
            _column("worktype", "Picklist", options=[(100000000, "Repair"), (100000001, "Maintenance"), (100000002, "Installation")]),
            _column("scheduleddate", "DateTime"),
            _column("status", "Picklist", options=[(100000000, "NotStarted"), (100000001, "Dispatched"), (100000002, "Working"), (100000003, "Completed")]),
            _column("workdetail", "Memo", maxLength=4000),
            _column("faultsummary", "String", maxLength=500), _column("installationlocation", "String", maxLength=300),
            _column("modeltype", "String", maxLength=100), _column("serialnumber", "String", maxLength=100),
            _column("symptoms", "Memo", maxLength=4000), _column("errorcode", "String", maxLength=100),
            _column("faultpart", "String", maxLength=200), _column("estimatedcause", "Memo", maxLength=2000),
            _column("countermeasure", "Memo", maxLength=4000), _column("replacedparts", "Memo", maxLength=2000),
            _column("workstart", "DateTime"), _column("workend", "DateTime"),
            _column("worktime", "Integer", minValue=0, maxValue=1440),
            _column("traveltime", "Integer", minValue=0, maxValue=1440),
            _column("visittime", "DateTime"), _column("prevention", "Memo", maxLength=2000),
            _column("satisfaction", "Integer", minValue=1, maxValue=5),
            _column("notes", "Memo", maxLength=4000), _column("customersigned", "Boolean"),
        ]},
        {"suffix": "maintenancereport", "display": "Maintenance Report", "plural": "Maintenance Reports", "columns": [
            _column("workcontent", "Memo", maxLength=4000), _column("partsused", "Memo", maxLength=2000),
            _column("completeddate", "DateTime"), _column("customersigned", "Boolean"),
        ]},
        {"suffix": "dailyreport", "display": "Daily Report", "plural": "Daily Reports", "columns": [
            _column("reportdate", "DateTime", format="DateOnly"), _column("department", "String", maxLength=200),
            _column("weather", "Picklist", options=[(100000000, "Sunny"), (100000001, "Cloudy"), (100000002, "Rainy"), (100000003, "Snowy")]),
            _column("approvalstatus", "Picklist", options=[(100000000, "Draft"), (100000001, "Submitted"), (100000002, "Approved"), (100000003, "Returned")]),
            _column("approvalcomment", "Memo", maxLength=4000),
            _column("visitcount", "Integer", minValue=0, maxValue=100000),
            _column("completedcount", "Integer", minValue=0, maxValue=100000),
            _column("revisitcount", "Integer", minValue=0, maxValue=100000),
            _column("partsexchangecount", "Integer", minValue=0, maxValue=100000),
            _column("totalworktime", "Integer", minValue=0, maxValue=1000000),
            _column("avgsatisfaction", "Decimal", minValue=0, maxValue=5, precision=2),
        ]},
        {"suffix": "consumptionrecord", "display": "Consumption Record", "plural": "Consumption Records", "columns": [
            _column("yearmonth", "String", maxLength=10), _column("printcount", "Integer", minValue=0, maxValue=2000000),
            _column("tonercount", "Integer", minValue=0, maxValue=10000), _column("papercount", "Integer", minValue=0, maxValue=100000),
            _column("consumablecost", "Integer", minValue=0, maxValue=100000000),
        ]},
        {"suffix": "annualkpi", "display": "Annual KPI", "plural": "Annual KPIs", "columns": [
            _column("targetyear", "Integer", minValue=2000, maxValue=2100), _column("requestcount", "Integer", minValue=0, maxValue=100000),
            _column("slaachievement", "Decimal", minValue=0, maxValue=100, precision=1),
            _column("avgresponse", "Integer", minValue=0, maxValue=100000), _column("avgresolution", "Integer", minValue=0, maxValue=1000000),
            _column("uptimerate", "Decimal", minValue=0, maxValue=100, precision=2),
            _column("satisfaction", "Decimal", minValue=0, maxValue=5, precision=1),
            _column("downtimehours", "Decimal", minValue=0, maxValue=100000, precision=1),
            _column("maintenancecost", "Integer", minValue=0, maxValue=1000000000),
        ]},
        {"suffix": "recommendation", "display": "Recommendation", "plural": "Recommendations", "columns": [
            _column("category", "Picklist", options=[(100000000, "EquipmentRenewal"), (100000001, "OperationImprovement"), (100000002, "CostOptimization"), (100000003, "SlaReview")]),
            _column("detail", "Memo", maxLength=4000), _column("expectedeffect", "Memo", maxLength=2000),
            _column("priority", "Picklist", options=[(100000000, "High"), (100000001, "Medium"), (100000002, "Low")]),
            _column("targetperiod", "String", maxLength=50),
        ]},
    ]
    for table in tables:
        table["logical"] = p(table["suffix"])
        for column in table["columns"]:
            column["logical"] = p(column["suffix"])

    lookup_specs = [
        ("equipment", "customer", "customerid", "Customer"),
        ("customer", "systemuser", "sauserid", "Sales Associate"),
        ("engineer", "systemuser", "userid", "User"),
        ("engineer", "area", "areaid", "Service Area"),
        ("maintenancecontract", "customer", "customerid", "Customer"),
        ("maintenancecontract", "equipment", "equipmentid", "Equipment"),
        ("call", "customer", "customerid", "Customer"),
        ("call", "equipment", "equipmentid", "Equipment"),
        ("workorder", "call", "callid", "Service Call"),
        ("workorder", "engineer", "engineerid", "Engineer"),
        ("workorder", "customer", "customerid", "Customer"),
        ("workorder", "equipment", "equipmentid", "Equipment"),
        ("workorder", "dailyreport", "dailyreportid", "Daily Report"),
        ("maintenancereport", "workorder", "workorderid", "Work Order"),
        ("dailyreport", "engineer", "engineerid", "Engineer"),
        ("consumptionrecord", "equipment", "equipmentid", "Equipment"),
        ("annualkpi", "customer", "customerid", "Customer"),
        ("recommendation", "customer", "customerid", "Customer"),
        ("recommendation", "equipment", "equipmentid", "Equipment"),
    ]
    lookups = [
        {
            "schema": f"{p(source)}_{p(target)}" if target != "systemuser" else f"{p(source)}_systemuser",
            "source": p(source), "target": "systemuser" if target == "systemuser" else p(target),
            "attribute": p(attribute), "display": display,
        }
        for source, target, attribute, display in lookup_specs
    ]
    return tables, lookups


def validate_prefix(prefix: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9]{1,7}", prefix):
        raise ValueError("PUBLISHER_PREFIX must be 2–8 lowercase letters/digits and start with a letter.")
    tables, lookups = schema_for(prefix)
    table_names = [table["logical"] for table in tables]
    if len(table_names) != len(set(table_names)):
        raise ValueError("The schema contains duplicate table names.")
    for table in tables:
        attributes = [f"{prefix}_name", *(column["logical"] for column in table["columns"])]
        if len(attributes) != len(set(attributes)):
            raise ValueError(f"{table['logical']} contains duplicate column names.")
    lookup_keys = [(lookup["source"], lookup["attribute"]) for lookup in lookups]
    if len(lookup_keys) != len(set(lookup_keys)):
        raise ValueError("The schema contains duplicate lookup attributes on a table.")
    logical_names = table_names + [
        column["logical"] for table in tables for column in table["columns"]
    ] + [lookup["attribute"] for lookup in lookups]
    if any(not name.startswith(f"{prefix}_") or len(name) > 100 for name in logical_names):
        raise ValueError("Schema logical names must use the configured publisher prefix and fit Dataverse limits.")
    for table in tables:
        for column in table["columns"]:
            if column["type"] == "Picklist":
                values = [value for value, _ in column["options"]]
                if len(values) != len(set(values)) or not all(isinstance(value, int) for value in values):
                    raise ValueError(f"{table['logical']}.{column['logical']} has invalid choice values.")
    seed_choices = {
        ("customer", "satier"): 100000001,
        ("engineer", "skilllevel"): 100000001,
        ("engineer", "workstatus"): 100000000,
        ("equipment", "status"): 100000000,
        ("equipment", "lifecycleaction"): 100000000,
    }
    for (table_suffix, column_suffix), seed_value in seed_choices.items():
        table = next(item for item in tables if item["suffix"] == table_suffix)
        column = next(item for item in table["columns"] if item["suffix"] == column_suffix)
        if seed_value not in {value for value, _ in column["options"]}:
            raise ValueError(f"Synthetic seed uses an undefined choice for {table['logical']}.{column['logical']}.")
    return prefix


def _find_skill_script(skill: str, filename: str) -> Path:
    starts = [Path.cwd(), Path(__file__).resolve().parent]
    configured = os.getenv("STANDARD_ROOT", "").strip()
    if configured:
        starts.insert(0, Path(configured).expanduser().resolve())
    visited: set[Path] = set()
    for start in starts:
        for root in (start, *start.parents):
            if root in visited:
                continue
            visited.add(root)
            candidates = [
                root / filename,
                root / "scripts" / filename,
                root / ".github" / "skills" / skill / "scripts" / filename,
                root / skill / "scripts" / filename,
            ]
            for candidate in candidates:
                if candidate.is_file():
                    return candidate
    raise FileNotFoundError(
        f"Cannot locate {filename}; set STANDARD_ROOT to a repository root containing .github/skills."
    )


def _load_auth() -> Any:
    from dotenv import load_dotenv

    load_dotenv(Path.cwd() / ".env")
    standard_scripts = _find_skill_script("standard", "auth_helper.py").parent
    sys.path.insert(0, str(standard_scripts))
    import auth_helper

    return auth_helper


def _is_missing(error: Exception) -> bool:
    from requests.exceptions import HTTPError

    return isinstance(error, HTTPError) and error.response is not None and error.response.status_code == 404


def _label(text: str, language: int) -> dict[str, Any]:
    return {"LocalizedLabels": [{"Label": text, "LanguageCode": language}]}


def _column_body(column: dict[str, Any], language: int) -> dict[str, Any]:
    kind = column["type"]
    body: dict[str, Any] = {
        "SchemaName": column["logical"], "DisplayName": _label(column["suffix"].replace("_", " ").title(), language),
        "RequiredLevel": {"Value": "None"},
    }
    if kind == "String":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata", "FormatName": {"Value": "Text"}, "MaxLength": column.get("maxLength", 200)})
    elif kind == "Memo":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.MemoAttributeMetadata", "Format": "Text", "MaxLength": column.get("maxLength", 4000)})
    elif kind == "Picklist":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.PicklistAttributeMetadata", "OptionSet": {
            "@odata.type": "#Microsoft.Dynamics.CRM.OptionSetMetadata", "IsGlobal": False, "OptionSetType": "Picklist",
            "Options": [{"Value": value, "Label": _label(label, language)} for value, label in column["options"]],
        }})
    elif kind == "DateTime":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DateTimeAttributeMetadata", "Format": column.get("format", "DateAndTime")})
    elif kind == "Integer":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.IntegerAttributeMetadata", "MinValue": column.get("minValue", 0), "MaxValue": column.get("maxValue", 2000000000)})
    elif kind == "Decimal":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.DecimalAttributeMetadata", "MinValue": column.get("minValue", 0), "MaxValue": column.get("maxValue", 100000), "Precision": column.get("precision", 1)})
    elif kind == "Boolean":
        body.update({"@odata.type": "#Microsoft.Dynamics.CRM.BooleanAttributeMetadata", "OptionSet": {
            "@odata.type": "#Microsoft.Dynamics.CRM.BooleanOptionSetMetadata",
            "TrueOption": {"Value": 1, "Label": _label("Yes", language)},
            "FalseOption": {"Value": 0, "Label": _label("No", language)},
        }})
    else:
        raise ValueError(f"Unsupported field type: {kind}")
    return body


def _metadata_snapshot(api: Any, prefix: str, tables: list[dict[str, Any]], lookups: list[dict[str, str]]) -> dict[str, Any]:
    snapshot: dict[str, Any] = {"tables": {}, "attributes": {}, "relationships": {}}
    for table in tables:
        logical = table["logical"]
        try:
            metadata = api.api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName,EntitySetName,IsBPFEntity,IsActivity,TableType")
        except Exception as error:
            if _is_missing(error):
                snapshot["tables"][logical] = None
                continue
            raise
        if metadata.get("IsBPFEntity") is True or metadata.get("IsActivity") is True or metadata.get("TableType") not in (None, "Standard"):
            raise ValueError(f"{logical} exists but is not a standard non-activity table; it was not changed.")
        snapshot["tables"][logical] = metadata
        attrs = api.api_get(f"EntityDefinitions(LogicalName='{logical}')/Attributes?$select=LogicalName").get("value", [])
        snapshot["attributes"][logical] = {row["LogicalName"].lower() for row in attrs if row.get("LogicalName")}
    for lookup in lookups:
        source = lookup["source"]
        if snapshot["tables"].get(source) is None:
            snapshot["relationships"][lookup["attribute"]] = None
            continue
        rows = api.api_get(
            f"EntityDefinitions(LogicalName='{source}')/ManyToOneRelationships"
            "?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName"
        ).get("value", [])
        found = [row for row in rows if row.get("ReferencingAttribute", "").lower() == lookup["attribute"].lower()]
        if found and any(row.get("ReferencedEntity") != lookup["target"] for row in found):
            raise ValueError(f"{source}.{lookup['attribute']} already references a different table.")
        snapshot["relationships"][lookup["attribute"]] = found
    return snapshot


def _missing_items(tables: list[dict[str, Any]], lookups: list[dict[str, str]], snapshot: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    for table in tables:
        logical = table["logical"]
        if snapshot["tables"].get(logical) is None:
            missing.append(f"table {logical}")
            continue
        attributes = snapshot["attributes"][logical]
        for attribute in [f"{logical.rsplit('_', 1)[0]}_name", *(column["logical"] for column in table["columns"])]:
            if attribute.lower() not in attributes:
                missing.append(f"column {logical}.{attribute}")
    for lookup in lookups:
        if snapshot["tables"].get(lookup["source"]) is not None and snapshot["relationships"].get(lookup["attribute"]) == []:
            missing.append(f"lookup {lookup['source']}.{lookup['attribute']} -> {lookup['target']}")
    return missing


def _validate_config(prefix: str, solution: str, dataverse_url: str) -> None:
    validate_prefix(prefix)
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,99}", solution):
        raise ValueError("SOLUTION_NAME must be a Dataverse unique name (letters, digits, underscores).")
    parsed = urlparse(dataverse_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("DATAVERSE_URL must be an HTTPS organization root URL.")


def _create_table(api: Any, table: dict[str, Any], prefix: str, solution: str, language: int) -> None:
    logical = table["logical"]
    name = f"{prefix}_name"
    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata",
        "SchemaName": logical, "DisplayName": _label(table["display"], language),
        "DisplayCollectionName": _label(table["plural"], language),
        "OwnershipType": "UserOwned", "IsActivity": False, "IsBPFEntity": False,
        "HasActivities": False, "HasNotes": False, "PrimaryNameAttribute": name,
        "Attributes": [{
            "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata", "SchemaName": name,
            "DisplayName": _label("Name", language), "IsPrimaryName": True,
            "RequiredLevel": {"Value": "ApplicationRequired"}, "FormatName": {"Value": "Text"}, "MaxLength": 200,
        }],
    }
    api.retry_metadata(lambda: api.api_post("EntityDefinitions", body, solution=solution), f"table {logical}")


def _create_lookup(api: Any, lookup: dict[str, str], solution: str, language: int) -> None:
    body = {
        "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
        "SchemaName": lookup["schema"], "ReferencedEntity": lookup["target"], "ReferencingEntity": lookup["source"],
        "Lookup": {
            "@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
            "SchemaName": lookup["attribute"], "DisplayName": _label(lookup["display"], language),
            "RequiredLevel": {"Value": "None"},
        },
    }
    api.retry_metadata(lambda: api.api_post("RelationshipDefinitions", body, solution=solution), f"lookup {lookup['schema']}")


def _nav_property(api: Any, source: str, target: str, attribute: str) -> str:
    rows = api.api_get(
        f"EntityDefinitions(LogicalName='{source}')/ManyToOneRelationships"
        f"?$filter=ReferencedEntity eq '{target}' and ReferencingAttribute eq '{attribute}'"
        "&$select=ReferencingEntityNavigationPropertyName"
    ).get("value", [])
    if len(rows) != 1 or not rows[0].get("ReferencingEntityNavigationPropertyName"):
        raise RuntimeError(f"Could not resolve relationship navigation property for {source}.{attribute}.")
    return rows[0]["ReferencingEntityNavigationPropertyName"]


def _seed_demo(api: Any, prefix: str) -> None:
    def entity_set(suffix: str) -> str:
        return api.api_get(f"EntityDefinitions(LogicalName='{prefix}_{suffix}')?$select=EntitySetName")["EntitySetName"]

    def find_or_create(suffix: str, name: str, values: dict[str, Any]) -> str:
        set_name = entity_set(suffix)
        safe = name.replace("'", "''")
        rows = api.api_get(f"{set_name}?$filter={prefix}_name eq '{safe}'&$select={prefix}_{suffix}id&$top=1").get("value", [])
        if rows:
            return rows[0][f"{prefix}_{suffix}id"]
        return api.api_post(set_name, {f"{prefix}_name": name, **values})

    area_set = entity_set("area")
    customer_set = entity_set("customer")
    engineer_set = entity_set("engineer")
    equipment_set = entity_set("equipment")
    area_nav = _nav_property(api, f"{prefix}_engineer", f"{prefix}_area", f"{prefix}_areaid")
    customer_nav = _nav_property(api, f"{prefix}_equipment", f"{prefix}_customer", f"{prefix}_customerid")
    for index in range(1, 4):
        number = f"{index:02d}"
        area_id = find_or_create("area", f"Sample Service Area {number}", {f"{prefix}_description": f"Synthetic service area {number}"})
        customer_id = find_or_create("customer", f"Sample Customer {number}", {
            f"{prefix}_address": f"Service Zone {number}", f"{prefix}_phone": f"000-000-{index:04d}",
            f"{prefix}_email": f"contact{number}@example.invalid", f"{prefix}_satier": 100000001,
        })
        find_or_create("engineer", f"Demo Engineer {number}", {
            f"{prefix}_area": f"Service Zone {number}", f"{prefix}_skill": "Synthetic demo service skills",
            f"{prefix}_skilllevel": 100000001, f"{prefix}_workstatus": 100000000,
            f"{area_nav}@odata.bind": f"/{area_set}({area_id})",
        })
        find_or_create("equipment", f"Sample Equipment {number}", {
            f"{prefix}_model": f"MODEL-DEMO-{number}", f"{prefix}_serialno": f"DEMO-SERIAL-{number}",
            f"{prefix}_location": f"Service Zone {number}", f"{prefix}_status": 100000000,
            f"{prefix}_remainingyears": 6.0, f"{prefix}_monthlyvolume": 1000,
            f"{prefix}_totalcount": 12000, f"{prefix}_lifecycleaction": 100000000,
            f"{customer_nav}@odata.bind": f"/{customer_set}({customer_id})",
        })
    print("  Synthetic demo customers, engineers, areas, and equipment are present.")


def run(apply: bool, seed_demo: bool) -> int:
    from dotenv import load_dotenv

    load_dotenv(Path.cwd() / ".env")
    prefix = os.getenv("PUBLISHER_PREFIX", "").strip()
    solution = os.getenv("SOLUTION_NAME", "").strip()
    auth = _load_auth()
    dataverse_url = getattr(auth, "DATAVERSE_URL", os.getenv("DATAVERSE_URL", "")).strip().rstrip("/")
    _validate_config(prefix, solution, dataverse_url)
    tables, lookups = schema_for(prefix)
    # Read every target table, column, relationship, and solution before any metadata writes.
    snapshot = _metadata_snapshot(auth, prefix, tables, lookups)
    solution_rows = auth.api_get(f"solutions?$filter=uniquename eq '{solution}'&$select=solutionid").get("value", [])
    if not solution_rows:
        raise RuntimeError(f"Solution {solution!r} does not exist. Create it before provisioning this schema.")
    publishers = auth.api_get(f"publishers?$filter=customizationprefix eq '{prefix}'&$select=publisherid").get("value", [])
    if not publishers:
        raise RuntimeError(f"No publisher with PUBLISHER_PREFIX={prefix!r} exists in this environment.")
    missing = _missing_items(tables, lookups, snapshot)
    print(f"Dataverse: {dataverse_url}")
    print(f"Schema: {len(tables)} tables, {len(lookups)} lookups; {len(missing)} missing component(s).")
    for item in missing:
        print(f"  - {item}")
    if not apply:
        print("Read-only plan complete. Use --apply to create missing metadata.")
        return 1 if missing else 0

    language = auth.api_get("organizations?$select=languagecode").get("value", [{}])[0].get("languagecode", 1033)
    for table in tables:
        logical = table["logical"]
        if snapshot["tables"].get(logical) is None:
            _create_table(auth, table, prefix, solution, language)
            time.sleep(2)
            snapshot["tables"][logical] = {"LogicalName": logical}
            snapshot["attributes"][logical] = {f"{prefix}_name".lower()}
        attributes = snapshot["attributes"][logical]
        for column in table["columns"]:
            if column["logical"].lower() in attributes:
                continue
            auth.retry_metadata(
                lambda t=logical, c=column: auth.api_post(
                    f"EntityDefinitions(LogicalName='{t}')/Attributes",
                    _column_body(c, language), solution=solution,
                ),
                f"column {column['logical']}",
            )
            attributes.add(column["logical"].lower())
    for lookup in lookups:
        if snapshot["tables"].get(lookup["source"]) is None:
            continue
        if snapshot["relationships"].get(lookup["attribute"]) in (None, []):
            _create_lookup(auth, lookup, solution, language)
    auth.retry_metadata(lambda: auth.api_post("PublishAllXml", {}), "PublishAllXml")
    if seed_demo:
        _seed_demo(auth, prefix)
    print("Schema provisioning complete.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Create missing schema metadata.")
    parser.add_argument("--seed-demo", action="store_true", help="Add synthetic demo rows (requires --apply).")
    args = parser.parse_args(argv)
    if args.seed_demo and not args.apply:
        parser.error("--seed-demo requires --apply.")
    return run(apply=args.apply, seed_demo=args.seed_demo)


if __name__ == "__main__":
    raise SystemExit(main())
