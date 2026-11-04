"""Validate or deploy the Field Service daily demo schedule replenishment flow.

The default execution validates the generated definition locally. Deployment
requires ``--apply``; ``--run`` additionally invokes the recurrence trigger
once and is never implied by deployment.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

CONNECTOR = "shared_commondataserviceforapps"
TIME_ZONE = "Tokyo Standard Time"


def _c(prefix: str, suffix: str) -> str:
    return f"{prefix}_{suffix}"


def validate_prefix(prefix: str) -> str:
    if not re.fullmatch(r"[a-z][a-z0-9]{1,7}", prefix):
        raise ValueError("PUBLISHER_PREFIX must be 2–8 lowercase letters/digits and start with a letter.")
    return prefix


def connection_reference(prefix: str) -> str:
    return f"{validate_prefix(prefix)}_fieldservicedemo_dataverse"


def _connector_action(
    operation_id: str,
    parameters: dict[str, Any],
    run_after: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    action: dict[str, Any] = {
        "type": "OpenApiConnection",
        "inputs": {
            "host": {
                "apiId": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR}",
                "connectionName": CONNECTOR,
                "operationId": operation_id,
            },
            "parameters": parameters,
            "authentication": "@parameters('$authentication')",
        },
    }
    if run_after is not None:
        action["runAfter"] = run_after
    return action


def _create_work_order_action(
    prefix: str,
    scheduled_date: str,
    navigation_properties: dict[str, str],
) -> dict[str, Any]:
    engineer_id = _c(prefix, "engineerid")
    customer_id = _c(prefix, "customerid")
    return _connector_action(
        "CreateRecord",
        {
            "entityName": _c(prefix, "workorders"),
            f"item/{_c(prefix, 'name')}": (
                f"@concat('Scheduled service | ',outputs('Compose_Customer')?['{_c(prefix, 'name')}'],' | ',"
                f"formatDateTime({scheduled_date[1:]},'yyyy/MM/dd'))"
            ),
            f"item/{navigation_properties[engineer_id]}@odata.bind": (
                f"@concat('/{_c(prefix, 'engineers')}(',"
                f"items('Apply_to_each_Engineer')?['{engineer_id}'],')')"
            ),
            f"item/{navigation_properties[customer_id]}@odata.bind": (
                f"@concat('/{_c(prefix, 'customers')}(',outputs('Compose_Customer_Id'),')')"
            ),
            f"item/{_c(prefix, 'scheduleddate')}": scheduled_date,
            f"item/{_c(prefix, 'status')}": 100000000,
            f"item/{_c(prefix, 'worktype')}": 100000001,
            f"item/{_c(prefix, 'workdetail')}": "Synthetic demo schedule: perform routine inspection and service.",
            f"item/{_c(prefix, 'faultsummary')}": "Routine inspection",
            f"item/{_c(prefix, 'installationlocation')}": (
                f"@coalesce(outputs('Compose_Customer')?['{_c(prefix, 'address')}'],'')"
            ),
            f"item/{_c(prefix, 'worktime')}": 60,
            f"item/{_c(prefix, 'traveltime')}": 30,
        },
    )


def _create_unassigned_work_order_actions(
    prefix: str,
    index: int,
    navigation_properties: dict[str, str],
) -> dict[str, Any]:
    customer_id = _c(prefix, "customerid")
    compose_index = f"Compose_Unassigned_Customer_Index_{index}"
    compose_customer = f"Compose_Unassigned_Customer_{index}"
    create_order = f"Create_Unassigned_Order_{index}"
    return {
        compose_index: {
            "type": "Compose",
            "inputs": "@mod(variables('CustomerIndex'),length(body('List_Active_Customers')?['value']))",
        },
        compose_customer: {
            "type": "Compose",
            "runAfter": {compose_index: ["Succeeded"]},
            "inputs": f"@body('List_Active_Customers')?['value'][outputs('{compose_index}')]",
        },
        create_order: {
            **_connector_action(
                "CreateRecord",
                {
                    "entityName": _c(prefix, "workorders"),
                    f"item/{_c(prefix, 'name')}": (
                        f"@concat('Unassigned service | ',outputs('{compose_customer}')?['{_c(prefix, 'name')}'],"
                        "| ',formatDateTime(utcNow(),'yyyy/MM/dd HH:mm:ss'))"
                    ),
                    f"item/{navigation_properties[customer_id]}@odata.bind": (
                        f"@concat('/{_c(prefix, 'customers')}', '(',"
                        f"outputs('{compose_customer}')?['{customer_id}'],')')"
                    ),
                    f"item/{_c(prefix, 'status')}": 100000000,
                    f"item/{_c(prefix, 'worktype')}": 100000001,
                    f"item/{_c(prefix, 'faultsummary')}": "Unassigned demo",
                    f"item/{_c(prefix, 'workdetail')}": (
                        "Synthetic unassigned order for dispatcher assignment and scheduling."
                    ),
                    f"item/{_c(prefix, 'installationlocation')}": (
                        f"@coalesce(outputs('{compose_customer}')?['{_c(prefix, 'address')}'],'')"
                    ),
                    f"item/{_c(prefix, 'worktime')}": 60,
                    f"item/{_c(prefix, 'traveltime')}": 30,
                },
                {compose_customer: ["Succeeded"]},
            ),
            "runAfter": {compose_customer: ["Succeeded"]},
        },
        f"Increment_Customer_Index_Unassigned_{index}": {
            "type": "IncrementVariable",
            "runAfter": {create_order: ["Succeeded"]},
            "inputs": {"name": "CustomerIndex", "value": 1},
        },
    }


def build_definition(
    prefix: str,
    navigation_properties: dict[str, str] | None = None,
) -> dict[str, Any]:
    validate_prefix(prefix)
    engineer_id = _c(prefix, "engineerid")
    customer_id = _c(prefix, "customerid")
    nav = navigation_properties or {engineer_id: engineer_id, customer_id: customer_id}
    for attribute in (engineer_id, customer_id):
        if not isinstance(nav.get(attribute), str) or not nav[attribute]:
            raise ValueError(f"Missing Dataverse navigation property for {attribute}.")

    now_jst = "@convertTimeZone(utcNow(),'UTC','Tokyo Standard Time')"
    next_workday_offset = (
        "@if(equals(dayOfWeek(outputs('Compose_JST_Now')),5),3,"
        "if(equals(dayOfWeek(outputs('Compose_JST_Now')),6),2,1))"
    )
    next_workday = "@addDays(outputs('Compose_JST_Now'),outputs('Compose_Next_Workday_Offset'))"
    second_workday_offset = "@if(equals(dayOfWeek(outputs('Compose_Next_Workday')),5),3,1)"
    second_workday = "@addDays(outputs('Compose_Next_Workday'),outputs('Compose_Second_Workday_Offset'))"
    first_slot_utc = (
        "@convertTimeZone(concat(formatDateTime(outputs('Compose_Next_Workday'),'yyyy-MM-dd'),"
        "'T10:00:00'),'Tokyo Standard Time','UTC','yyyy-MM-ddTHH:mm:ssZ')"
    )
    second_slot_utc = (
        "@convertTimeZone(concat(formatDateTime(outputs('Compose_Second_Workday'),'yyyy-MM-dd'),"
        "'T14:00:00'),'Tokyo Standard Time','UTC','yyyy-MM-ddTHH:mm:ssZ')"
    )
    future_order_count = "@length(body('List_Future_Assigned_Orders')?['value'])"
    first_and_second = {
        "type": "If",
        "expression": {"equals": [future_order_count, 0]},
        "actions": {
            "Create_First_Demo_Order": _create_work_order_action(prefix, first_slot_utc, nav),
            "Create_Second_Demo_Order": {
                **_create_work_order_action(prefix, second_slot_utc, nav),
                "runAfter": {"Create_First_Demo_Order": ["Succeeded"]},
            },
        },
        "else": {"actions": {
            "Create_One_Demo_Order": _create_work_order_action(prefix, second_slot_utc, nav),
        }},
    }
    apply_to_engineer = {
        "type": "Foreach",
        "foreach": "@body('List_Active_Engineers')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 1}},
        "actions": {
            "List_Future_Assigned_Orders": _connector_action(
                "ListRecords",
                {
                    "entityName": _c(prefix, "workorders"),
                    "$select": f"{_c(prefix, 'workorderid')},{_c(prefix, 'scheduleddate')},{_c(prefix, 'status')}",
                    "$filter": (
                        "statecode eq 0 and "
                        f"_{engineer_id}_value eq @{{items('Apply_to_each_Engineer')?['{engineer_id}']}} and "
                        f"{_c(prefix, 'scheduleddate')} ge @{{utcNow()}} and "
                        f"{_c(prefix, 'status')} ne 100000003"
                    ),
                    "$top": 2,
                },
            ),
            "Compose_Customer_Index": {
                "type": "Compose",
                "runAfter": {"List_Future_Assigned_Orders": ["Succeeded"]},
                "inputs": "@mod(variables('CustomerIndex'),length(body('List_Active_Customers')?['value']))",
            },
            "Compose_Customer": {
                "type": "Compose",
                "runAfter": {"Compose_Customer_Index": ["Succeeded"]},
                "inputs": "@body('List_Active_Customers')?['value'][outputs('Compose_Customer_Index')]",
            },
            "Compose_Customer_Id": {
                "type": "Compose",
                "runAfter": {"Compose_Customer": ["Succeeded"]},
                "inputs": f"@outputs('Compose_Customer')?['{customer_id}']",
            },
            "Refill_If_Below_Two": {
                "type": "If",
                "runAfter": {"Compose_Customer_Id": ["Succeeded"]},
                "expression": {"less": [future_order_count, 2]},
                "actions": {"Create_Missing_Orders": first_and_second},
                "else": {"actions": {}},
            },
            "Increment_Customer_Index": {
                "type": "IncrementVariable",
                "runAfter": {"Refill_If_Below_Two": ["Succeeded"]},
                "inputs": {"name": "CustomerIndex", "value": 1},
            },
        },
    }
    unassigned_actions: dict[str, Any] = {}
    previous_action = "List_Unassigned_Demo_Orders"
    for index in range(1, 4):
        condition = f"Ensure_Unassigned_Order_Count_{index}"
        unassigned_actions[condition] = {
            "type": "If",
            "runAfter": {previous_action: ["Succeeded"]},
            "expression": {
                "less": ["@length(body('List_Unassigned_Demo_Orders')?['value'])", index]
            },
            "actions": _create_unassigned_work_order_actions(prefix, index, nav),
            "else": {"actions": {}},
        }
        previous_action = condition

    return {
        "$schema": (
            "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/"
            "2016-06-01/workflowdefinition.json#"
        ),
        "contentVersion": "1.0.0.0",
        "parameters": {
            "$authentication": {"defaultValue": {}, "type": "SecureObject"},
            "$connections": {"defaultValue": {}, "type": "Object"},
        },
        "triggers": {
            "Recurrence": {
                "type": "Recurrence",
                "recurrence": {
                    "frequency": "Day", "interval": 1, "timeZone": TIME_ZONE,
                    "schedule": {"hours": ["6"], "minutes": [0]},
                },
            }
        },
        "actions": {
            "List_Active_Engineers": _connector_action(
                "ListRecords",
                {
                    "entityName": _c(prefix, "engineers"),
                    "$select": f"{engineer_id},{_c(prefix, 'name')}",
                    "$filter": "statecode eq 0", "$top": 1000,
                },
            ),
            "List_Active_Customers": _connector_action(
                "ListRecords",
                {
                    "entityName": _c(prefix, "customers"),
                    "$select": f"{customer_id},{_c(prefix, 'name')},{_c(prefix, 'address')}",
                    "$filter": "statecode eq 0", "$top": 1000,
                },
                {"List_Active_Engineers": ["Succeeded"]},
            ),
            "Compose_JST_Now": {"type": "Compose", "runAfter": {"List_Active_Customers": ["Succeeded"]}, "inputs": now_jst},
            "Compose_Next_Workday_Offset": {"type": "Compose", "runAfter": {"Compose_JST_Now": ["Succeeded"]}, "inputs": next_workday_offset},
            "Compose_Next_Workday": {"type": "Compose", "runAfter": {"Compose_Next_Workday_Offset": ["Succeeded"]}, "inputs": next_workday},
            "Compose_Second_Workday_Offset": {"type": "Compose", "runAfter": {"Compose_Next_Workday": ["Succeeded"]}, "inputs": second_workday_offset},
            "Compose_Second_Workday": {"type": "Compose", "runAfter": {"Compose_Second_Workday_Offset": ["Succeeded"]}, "inputs": second_workday},
            "Initialize_Customer_Index": {
                "type": "InitializeVariable", "runAfter": {"Compose_Second_Workday": ["Succeeded"]},
                "inputs": {"variables": [{"name": "CustomerIndex", "type": "integer", "value": 0}]},
            },
            "Require_Active_Customer": {
                "type": "If", "runAfter": {"Initialize_Customer_Index": ["Succeeded"]},
                "expression": {"greater": ["@length(body('List_Active_Customers')?['value'])", 0]},
                "actions": {"Apply_to_each_Engineer": apply_to_engineer},
                "else": {"actions": {"Stop_Without_Active_Customers": {
                    "type": "Terminate",
                    "inputs": {"runStatus": "Failed", "code": "NoActiveCustomers", "message": "No active sample customers are available."},
                }}},
            },
            "List_Unassigned_Demo_Orders": _connector_action(
                "ListRecords",
                {
                    "entityName": _c(prefix, "workorders"),
                    "$select": f"{_c(prefix, 'workorderid')},{_c(prefix, 'name')}",
                    "$filter": (
                        f"statecode eq 0 and _{engineer_id}_value eq null and "
                        f"{_c(prefix, 'faultsummary')} eq 'Unassigned demo'"
                    ),
                    "$top": 3,
                },
                {"Require_Active_Customer": ["Succeeded"]},
            ),
            **unassigned_actions,
        },
    }


def build_clientdata(definition: dict[str, Any], prefix: str) -> dict[str, Any]:
    connector = CONNECTOR
    return {
        "schemaVersion": "1.0.0.0",
        "properties": {
            "definition": definition,
            "connectionReferences": {
                connector: {
                    "runtimeSource": "embedded",
                    "connection": {"connectionReferenceLogicalName": connection_reference(prefix)},
                    "api": {"name": connector},
                }
            },
        },
    }


def validate_definition(definition: dict[str, Any], prefix: str) -> None:
    validate_prefix(prefix)
    recurrence = definition.get("triggers", {}).get("Recurrence", {}).get("recurrence", {})
    if recurrence.get("frequency") != "Day" or recurrence.get("timeZone") != TIME_ZONE:
        raise ValueError("The flow must recur daily in Tokyo Standard Time.")
    if recurrence.get("schedule") != {"hours": ["6"], "minutes": [0]}:
        raise ValueError("The flow must run at 06:00 JST.")
    encoded = json.dumps(definition, ensure_ascii=False)
    if "DeleteRecord" in encoded:
        raise ValueError("Demo replenishment must never delete records.")
    required = (
        _c(prefix, "engineerid"), _c(prefix, "customerid"), _c(prefix, "scheduleddate"),
        _c(prefix, "worktime"), _c(prefix, "traveltime"), "utcNow()",
        "Create_First_Demo_Order", "Create_Second_Demo_Order",
        "Ensure_Unassigned_Order_Count_1", "Ensure_Unassigned_Order_Count_2", "Ensure_Unassigned_Order_Count_3",
    )
    missing = [item for item in required if item not in encoded]
    if missing:
        raise ValueError(f"Flow definition is missing required scheduling behavior: {', '.join(missing)}")
    def strings(value: Any):
        if isinstance(value, dict):
            for key, child in value.items():
                if key != "$schema":
                    yield from strings(child)
        elif isinstance(value, list):
            for child in value:
                yield from strings(child)
        elif isinstance(value, str):
            yield value

    if any(re.search(r"\b20\d\d-\d\d-\d\d\b", value) for value in strings(definition)):
        raise ValueError("Flow definition contains a fixed historic date.")


def _find_skill_script(filename: str) -> Path:
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
            for candidate in (
                root / filename,
                root / "scripts" / filename,
                root / ".github" / "skills" / "standard" / "scripts" / filename,
                root / "standard" / "scripts" / filename,
            ):
                if candidate.is_file():
                    return candidate
    raise FileNotFoundError(f"Cannot locate {filename}; set STANDARD_ROOT to a repository root.")


def _load_auth() -> Any:
    from dotenv import load_dotenv

    # Load the consuming app's environment before importing the shared helper.
    load_dotenv(Path.cwd() / ".env")
    standard_scripts = _find_skill_script("auth_helper.py").parent
    sys.path.insert(0, str(standard_scripts))
    import auth_helper

    return auth_helper


def _metadata_navigation_properties(api: Any, prefix: str) -> dict[str, str]:
    required_columns = {
        _c(prefix, "engineer"): {_c(prefix, "engineerid"), _c(prefix, "name"), "statecode"},
        _c(prefix, "customer"): {_c(prefix, "customerid"), _c(prefix, "name"), _c(prefix, "address"), "statecode"},
        _c(prefix, "workorder"): {
            _c(prefix, "workorderid"), _c(prefix, "name"), _c(prefix, "engineerid"), _c(prefix, "customerid"),
            _c(prefix, "scheduleddate"), _c(prefix, "status"), _c(prefix, "worktype"),
            _c(prefix, "workdetail"), _c(prefix, "faultsummary"), _c(prefix, "installationlocation"),
            _c(prefix, "worktime"), _c(prefix, "traveltime"), "statecode",
        },
    }
    for table, required in required_columns.items():
        rows = api.api_get(f"EntityDefinitions(LogicalName='{table}')/Attributes?$select=LogicalName").get("value", [])
        available = {row["LogicalName"] for row in rows if row.get("LogicalName")}
        missing = sorted(required - available)
        if missing:
            raise RuntimeError(f"Dataverse table {table} is missing required columns: {', '.join(missing)}")
    source = _c(prefix, "workorder")
    relationships = api.api_get(
        f"EntityDefinitions(LogicalName='{source}')/ManyToOneRelationships"
        "?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity"
    ).get("value", [])
    result: dict[str, str] = {}
    for attribute, target in (
        (_c(prefix, "engineerid"), _c(prefix, "engineer")),
        (_c(prefix, "customerid"), _c(prefix, "customer")),
    ):
        matches = [
            row for row in relationships
            if row.get("ReferencingAttribute") == attribute and row.get("ReferencedEntity") == target
        ]
        if len(matches) != 1 or not matches[0].get("ReferencingEntityNavigationPropertyName"):
            raise RuntimeError(f"Dataverse relationship {source}.{attribute} -> {target} is missing or ambiguous.")
        result[attribute] = matches[0]["ReferencingEntityNavigationPropertyName"]
    return result


def _ensure_connection_reference(api: Any, prefix: str, solution: str, connection_id: str) -> None:
    logical_name = connection_reference(prefix)
    matches = api.api_get(
        "connectionreferences?$filter="
        f"connectionreferencelogicalname eq '{logical_name}'"
        "&$select=connectionreferenceid,connectionid"
    ).get("value", [])
    if matches:
        if matches[0].get("connectionid") != connection_id:
            raise RuntimeError(f"Connection reference {logical_name} has another connection; it was not changed.")
        return
    api.api_post(
        "connectionreferences",
        {
            "connectionreferencelogicalname": logical_name,
            "connectionreferencedisplayname": "Field Service demo schedule - Dataverse",
            "connectorid": f"/providers/Microsoft.PowerApps/apis/{CONNECTOR}",
            "connectionid": connection_id,
        },
        solution=solution,
    )


def _deploy(api: Any, definition: dict[str, Any], prefix: str, solution: str) -> str:
    name = f"Field Service {prefix} demo schedule replenishment"
    description = (
        "Maintains two future weekday appointments per active engineer and three "
        "unassigned dispatcher demo orders. Runs daily at 06:00 Japan Standard Time."
    )
    clientdata = build_clientdata(definition, prefix)
    matches = api.api_get(
        "workflows?$filter="
        f"name eq '{name}' and category eq 5"
        "&$select=workflowid,statecode,clientdata,resourceid,description"
    ).get("value", [])
    if matches:
        current = matches[0]
        try:
            same_definition = json.loads(current["clientdata"]) == clientdata
        except (KeyError, json.JSONDecodeError):
            same_definition = False
        if not same_definition:
            if current.get("description") not in {description, None, ""}:
                raise RuntimeError(f"A different flow named {name!r} exists; it was left untouched.")
            if current.get("statecode") == 1:
                api.api_patch(f"workflows({current['workflowid']})", {"statecode": 0, "statuscode": 1})
            api.api_patch(
                f"workflows({current['workflowid']})",
                {"clientdata": json.dumps(clientdata, ensure_ascii=False), "description": description},
            )
            api.api_patch(f"workflows({current['workflowid']})", {"statecode": 1, "statuscode": 2})
            current["statecode"] = 1
        workflow_id = current["workflowid"]
        if current.get("description") != description:
            api.api_patch(f"workflows({workflow_id})", {"description": description})
        if current.get("statecode") != 1:
            api.api_patch(f"workflows({workflow_id})", {"statecode": 1, "statuscode": 2})
    else:
        workflow_id = api.api_post(
            "workflows",
            {
                "name": name, "type": 1, "category": 5, "statecode": 0, "statuscode": 1,
                "primaryentity": "none", "description": description,
                "clientdata": json.dumps(clientdata, ensure_ascii=False),
            },
            solution=solution,
        )
        if not workflow_id:
            raise RuntimeError("The flow draft was created without returning a workflow ID.")
        api.api_patch(f"workflows({workflow_id})", {"statecode": 1, "statuscode": 2})
    readback = api.api_get(f"workflows({workflow_id})?$select=workflowid,statecode,resourceid")
    if readback.get("statecode") != 1:
        raise RuntimeError(f"Flow activation was not confirmed for {workflow_id}.")
    return str(readback.get("resourceid") or workflow_id)


def _run_once(api: Any, environment_id: str, resource_id: str) -> str:
    flow_path = f"/providers/Microsoft.ProcessSimple/environments/{environment_id}/flows/{resource_id}"
    prior = api.flow_api_call("GET", f"{flow_path}/runs?$top=1").get("value", [])
    prior_name = prior[0].get("name") if prior else None
    api.flow_api_call("POST", f"{flow_path}/triggers/Recurrence/run")
    for _ in range(36):
        time.sleep(5)
        runs = api.flow_api_call("GET", f"{flow_path}/runs?$top=1").get("value", [])
        if not runs or runs[0].get("name") == prior_name:
            continue
        properties = runs[0].get("properties", {})
        status = properties.get("status", "NotStarted")
        if status not in {"NotStarted", "Running", "Waiting"}:
            if status != "Succeeded":
                raise RuntimeError(f"Flow test run ended with {status}: {json.dumps(properties.get('error', {}))[:1200]}")
            return status
    raise TimeoutError("Flow test run did not finish within three minutes.")


def deploy(prefix: str, run_now: bool) -> None:
    auth = _load_auth()
    validate_prefix(prefix)
    solution = os.getenv("SOLUTION_NAME", "").strip()
    dataverse_url = getattr(auth, "DATAVERSE_URL", os.getenv("DATAVERSE_URL", "")).strip()
    parsed_url = urlparse(dataverse_url)
    if not solution or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,99}", solution):
        raise ValueError("Set a valid SOLUTION_NAME in the app .env.")
    if parsed_url.scheme != "https" or not parsed_url.netloc:
        raise ValueError("Set DATAVERSE_URL to an HTTPS organization root in the app .env.")
    solutions = auth.api_get(f"solutions?$filter=uniquename eq '{solution}'&$select=solutionid").get("value", [])
    publishers = auth.api_get(f"publishers?$filter=customizationprefix eq '{prefix}'&$select=publisherid").get("value", [])
    if not solutions:
        raise RuntimeError(f"Solution {solution!r} does not exist.")
    if not publishers:
        raise RuntimeError(f"No publisher with PUBLISHER_PREFIX={prefix!r} exists.")
    environment_id = auth.resolve_environment_id()
    expected_environment = os.getenv("ENV_ID", "").strip()
    config_path = Path.cwd() / "power.config.json"
    if config_path.is_file():
        app_config = json.loads(config_path.read_text(encoding="utf-8"))
        expected_environment = expected_environment or str(app_config.get("environmentId", ""))
    if expected_environment and expected_environment != environment_id:
        raise RuntimeError("Resolved Power Automate environment does not match the app environment.")
    navigation = _metadata_navigation_properties(auth, prefix)
    connected_id = auth.find_connection(environment_id, CONNECTOR, "Microsoft Dataverse")
    _ensure_connection_reference(auth, prefix, solution, connected_id)
    resource_id = _deploy(auth, build_definition(prefix, navigation), prefix, solution)
    print(f"Flow ready and activated: Field Service {prefix} demo schedule replenishment")
    print(f"Flow ID: {resource_id}")
    if run_now:
        print(f"Initial run: {_run_once(auth, environment_id, resource_id)}")


def main(argv: list[str] | None = None) -> int:
    from dotenv import load_dotenv

    load_dotenv(Path.cwd() / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Deploy and activate the flow.")
    parser.add_argument("--run", action="store_true", help="Run the deployed recurrence trigger once.")
    parser.add_argument("--prefix", help="Publisher prefix (defaults to PUBLISHER_PREFIX from .env).")
    args = parser.parse_args(argv)
    if args.run and not args.apply:
        parser.error("--run requires --apply.")
    prefix = (args.prefix or os.getenv("PUBLISHER_PREFIX", "")).strip()
    try:
        validate_definition(build_definition(prefix), prefix)
    except ValueError as error:
        parser.error(str(error))
    if not args.apply:
        print(
            f"Plan ({prefix}): daily at 06:00 JST; maintain two future weekday "
            "appointments for each active engineer and three unassigned demo orders."
        )
        print("Definition is valid. Use --apply to deploy; add --run only to invoke it once.")
        return 0
    deploy(prefix, run_now=args.run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
