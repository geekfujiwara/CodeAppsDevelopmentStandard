"""Deploy standard opportunity rules and immutable history to the approved CRM solution.

Default is a read-only plan. Build the signed plugin before --apply.
Business data and security role assignments are not modified.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import subprocess
from pathlib import Path
import time
from requests.exceptions import HTTPError

import setup_crm_dataverse as schema
from auth_helper import api_get, api_patch, api_post, retry_metadata

P, SOLUTION, c = schema.P, schema.SOLUTION, schema.c
OPPORTUNITY, HISTORY = c("crmopportunity"), c("crmstagehistory")
TYPE = "SalesCrm.Plugins.OpportunityRules"
ASSEMBLY = "SalesCrm.Plugins"
DLL = Path(__file__).resolve().parents[1] / "server" / ASSEMBLY / "bin" / "Release" / "net462" / f"{ASSEMBLY}.dll"


def preflight() -> None:
    for table in (OPPORTUNITY, HISTORY):
        schema.table_exists(table)
    schema.validate_stage_column()
    if schema.table_exists(HISTORY) and c("historypermit") in schema.attribute_names(HISTORY):
        meta = api_get(f"EntityDefinitions(LogicalName='{HISTORY}')"
                       f"/Attributes(LogicalName='{c('historypermit')}')"
                       "/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=AttributeType,MaxLength")
        if meta.get("AttributeType") != "String" or meta.get("MaxLength", 0) < 128:
            raise ValueError("Existing history request proof must be String with length >= 128.")
    existing = api_get(f"pluginassemblies?$filter=name eq '{ASSEMBLY}'"
                       "&$select=pluginassemblyid,publickeytoken,version")["value"]
    if len(existing) > 1:
        raise ValueError("Ambiguous CRM plugin assembly; stop before deployment.")
    if not existing:
        return
    types = api_get(f"plugintypes?$filter=_pluginassemblyid_value eq {existing[0]['pluginassemblyid']}"
                    "&$select=typename")["value"]
    if any(row["typename"] != TYPE for row in types):
        raise ValueError("Existing assembly contains other plugins. Preserve their sources and deployment "
                         "pipeline; do not overwrite it with the scaffold's stage-only assembly.")
    if DLL.is_file():
        script = ("$ErrorActionPreference='Stop';"
                  "$a=[Reflection.AssemblyName]::GetAssemblyName($env:CRM_PLUGIN_DLL);"
                  "[BitConverter]::ToString($a.GetPublicKeyToken()).Replace('-','').ToLowerInvariant()")
        result = subprocess.run(["powershell", "-NoProfile", "-Command",
                                 script], env={**os.environ, "CRM_PLUGIN_DLL": str(DLL)},
                                check=True, capture_output=True, text=True)
        if result.stdout.strip() != existing[0]["publickeytoken"]:
            raise ValueError("Plugin signing identity differs. Restore the existing assembly's original key.")


def one(entity: str, query: str, key: str) -> str | None:
    rows = api_get(f"{entity}?{query}")["value"]
    if len(rows) > 1:
        raise ValueError(f"Ambiguous {entity}: {query}")
    return rows[0][key] if rows else None


def create(entity: str, body: dict) -> str:
    record_id = api_post(entity, body, solution=SOLUTION)
    if not record_id:
        raise RuntimeError(f"No created ID returned for {entity}; inspect read-back before resuming.")
    return record_id


def component(record_id: str, kind: int) -> None:
    api_post("AddSolutionComponent", {
        "ComponentId": record_id, "ComponentType": kind,
        "SolutionUniqueName": SOLUTION, "AddRequiredComponents": False,
    })


def ensure_schema() -> None:
    preflight()
    schema.BASE_LANG, schema.LANGS = schema.languages()
    column = next(col for table in schema.TABLES if table["name"] == OPPORTUNITY
                  for col in table["columns"] if col["name"] == c("lossreason"))
    if c("lossreason") not in schema.attribute_names(OPPORTUNITY):
        retry_metadata(lambda: create(f"EntityDefinitions(LogicalName='{OPPORTUNITY}')/Attributes",
                                      schema.column_body(column)), "CRM loss reason")
        time.sleep(5)
    if not schema.table_exists(HISTORY):
        create("EntityDefinitions", {
            "@odata.type": "#Microsoft.Dynamics.CRM.EntityMetadata", "SchemaName": HISTORY,
            "EntitySetName": c("crmstagehistories"),
            "DisplayName": schema.label("CRM Stage History", "商談進捗履歴"),
            "DisplayCollectionName": schema.label("CRM Stage Histories", "商談進捗履歴"),
            "OwnershipType": "UserOwned", "IsBPFEntity": False, "IsActivity": False,
            "HasActivities": False, "HasNotes": False,
            "PrimaryNameAttribute": c("name"),
            "Attributes": [{"@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
                            "SchemaName": c("name"), "DisplayName": schema.label("Name", "名前"),
                            "IsPrimaryName": True, "MaxLength": 100,
                            "RequiredLevel": {"Value": "ApplicationRequired"},
                            "FormatName": {"Value": "Text"}}],
        })
        time.sleep(10)
    columns = [
        schema.picklist("fromstage", "Previous Stage", "変更前", schema.STAGES),
        schema.picklist("tostage", "New Stage", "変更後", schema.STAGES),
        {"name": c("lossreason"), "type": "Memo", "en": "Loss Reason", "ja": "失注理由"},
    ]
    attributes = schema.attribute_names(HISTORY)
    for column in columns:
        if column["name"] not in attributes:
            retry_metadata(lambda col=column: create(f"EntityDefinitions(LogicalName='{HISTORY}')/Attributes",
                                                     schema.column_body(col)), column["name"])
            time.sleep(5)
    permit_name = c("historypermit")
    if permit_name not in attributes:
        retry_metadata(lambda: create(f"EntityDefinitions(LogicalName='{HISTORY}')/Attributes", {
            "@odata.type": "#Microsoft.Dynamics.CRM.StringAttributeMetadata",
            "SchemaName": permit_name,
            "DisplayName": schema.label("History Request Proof", "履歴要求の署名"),
            "Description": schema.label(
                "Server request proof consumed before persistence; do not populate from clients.",
                "保存前にサーバーが除去する要求署名。クライアントから設定しないでください。"),
            "RequiredLevel": {"Value": "None"},
            "MaxLength": 128, "FormatName": {"Value": "Text"},
            "IsAuditEnabled": {"Value": False},
        }), "History request proof")
        time.sleep(5)
    permit_metadata = api_get(
        f"EntityDefinitions(LogicalName='{HISTORY}')/Attributes(LogicalName='{permit_name}')"
        "/Microsoft.Dynamics.CRM.StringAttributeMetadata?$select=AttributeType,MaxLength")
    if permit_metadata["AttributeType"] != "String" or permit_metadata["MaxLength"] < 128:
        raise ValueError("History request proof column must be String with length >= 128.")
    if c("opportunityid") not in schema.attribute_names(HISTORY):
        create("RelationshipDefinitions", {
            "@odata.type": "#Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
            "SchemaName": c("crmopportunity_stagehistory"), "ReferencedEntity": OPPORTUNITY,
            "ReferencingEntity": HISTORY,
            "CascadeConfiguration": {"Assign": "Cascade", "Delete": "Cascade", "Merge": "NoCascade",
                                     "Reparent": "Cascade", "Share": "Cascade", "Unshare": "Cascade"},
            "Lookup": {"@odata.type": "#Microsoft.Dynamics.CRM.LookupAttributeMetadata",
                       "SchemaName": c("opportunityid"), "DisplayName": schema.label("Opportunity", "商談"),
                       "RequiredLevel": {"Value": "ApplicationRequired"}},
        })
    for table in (OPPORTUNITY, HISTORY):
        meta = api_get(f"EntityDefinitions(LogicalName='{table}')?$select=MetadataId,EntitySetName")
        if table == HISTORY and meta["EntitySetName"] != c("crmstagehistories"):
            raise ValueError("History EntitySetName differs from the UI contract.")
        component(meta["MetadataId"], 1)
    retry_metadata(lambda: api_post("PublishAllXml", {}), "Publish CRM schema")
    print("PASS: loss reason, stage history, parent relationship and solution membership.")


def ensure_history_signing_config() -> str:
    steps = api_get(
        "sdkmessageprocessingsteps?$filter=startswith(name,'SalesCrm: ')"
        "&$select=name,_sdkmessageprocessingstepsecureconfigid_value")["value"]
    ids = {row["_sdkmessageprocessingstepsecureconfigid_value"] for row in steps
           if row["name"].startswith((f"SalesCrm: {OPPORTUNITY} ", f"SalesCrm: {HISTORY} "))
           and row.get("_sdkmessageprocessingstepsecureconfigid_value")}
    if len(ids) > 1:
        raise ValueError("Conflicting history signing secure configurations; stop before deployment.")
    if ids:
        secure_id = ids.pop()
        config = api_get(f"sdkmessageprocessingstepsecureconfigs({secure_id})?$select=secureconfig")
        if len(base64.b64decode(config["secureconfig"], validate=True)) != 32:
            raise ValueError("Invalid history signing secure configuration.")
        return secure_id
    return create("sdkmessageprocessingstepsecureconfigs", {
        "secureconfig": base64.b64encode(secrets.token_bytes(32)).decode("ascii")})


def register() -> None:
    preflight()
    if c("historypermit") not in schema.attribute_names(HISTORY):
        raise ValueError("Create and publish the approved history request proof column before registration.")
    secure_id = ensure_history_signing_config()
    assembly_id = one("pluginassemblies", f"$filter=name eq '{ASSEMBLY}'&$select=pluginassemblyid", "pluginassemblyid")
    content = base64.b64encode(DLL.read_bytes()).decode("ascii")
    if assembly_id:
        api_patch(f"pluginassemblies({assembly_id})", {"content": content})
    else:
        assembly_id = create("pluginassemblies", {
            "name": ASSEMBLY, "content": content, "isolationmode": 2, "sourcetype": 0,
        })
    component(assembly_id, 91)
    type_id = one("plugintypes", f"$filter=typename eq '{TYPE}'&$select=plugintypeid", "plugintypeid")
    if not type_id:
        type_id = create("plugintypes", {
            "typename": TYPE, "name": TYPE, "friendlyname": TYPE,
            "pluginassemblyid@odata.bind": f"/pluginassemblies({assembly_id})",
        })
    image_fields = ",".join(c(s) for s in ("stage", "lossreason", "probability", "actualclosedate")) + ",ownerid"
    definitions = [(OPPORTUNITY, message, stage) for message in ("Create", "Update") for stage in (20, 40)]
    definitions += [(HISTORY, message, 20) for message in ("Create", "Update", "Delete")]
    steps = []
    history_writers = []
    for table, message, stage in definitions:
        message_id = one("sdkmessages", f"$filter=name eq '{message}'&$select=sdkmessageid", "sdkmessageid")
        filter_id = one("sdkmessagefilters", f"$filter=_sdkmessageid_value eq {message_id} and "
                        f"primaryobjecttypecode eq '{table}'&$select=sdkmessagefilterid", "sdkmessagefilterid")
        if not message_id or not filter_id:
            raise ValueError(f"Message filter missing: {table} {message}")
        name = f"SalesCrm: {table} {message} {stage}"
        step_id = one("sdkmessageprocessingsteps",
                      f"$filter=name eq '{name}'&$select=sdkmessageprocessingstepid", "sdkmessageprocessingstepid")
        configuration = "|".join([P, *history_writers]) if table == HISTORY else P
        body = {
            "name": name, "stage": stage, "mode": 0, "rank": 1, "supporteddeployment": 0,
            "configuration": configuration,
            "eventhandler_plugintype@odata.bind": f"/plugintypes({type_id})",
            "sdkmessageid@odata.bind": f"/sdkmessages({message_id})",
            "sdkmessagefilterid@odata.bind": f"/sdkmessagefilters({filter_id})",
            "sdkmessageprocessingstepsecureconfigid@odata.bind":
                f"/sdkmessageprocessingstepsecureconfigs({secure_id})",
        }
        if step_id:
            api_patch(f"sdkmessageprocessingsteps({step_id})", body)
        else:
            step_id = create("sdkmessageprocessingsteps", body)
        component(step_id, 92)
        images = []
        if table == OPPORTUNITY and message == "Update":
            images.append(("Before", 0))
        if table == OPPORTUNITY and stage == 40:
            images.append(("After", 1))
        for alias, image_type in images:
            image_id = one("sdkmessageprocessingstepimages",
                           f"$filter=_sdkmessageprocessingstepid_value eq {step_id} and entityalias eq '{alias}'"
                           "&$select=sdkmessageprocessingstepimageid", "sdkmessageprocessingstepimageid")
            image = {"name": alias, "entityalias": alias, "imagetype": image_type,
                     "messagepropertyname": "Id" if message == "Create" else "Target", "attributes": image_fields}
            if image_id:
                existing = api_get(f"sdkmessageprocessingstepimages({image_id})"
                                   "?$select=name,entityalias,imagetype,messagepropertyname,attributes")
                if any(existing.get(key) != value for key, value in image.items() if key != "attributes"):
                    raise ValueError(f"Existing image identity differs: {name}/{alias}; inspect before changing registration.")
                if set(existing["attributes"].split(",")) != set(image_fields.split(",")):
                    api_patch(f"sdkmessageprocessingstepimages({image_id})", {"attributes": image_fields})
            else:
                create("sdkmessageprocessingstepimages", {
                    **image, "sdkmessageprocessingstepid@odata.bind": f"/sdkmessageprocessingsteps({step_id})",
                })
        actual = api_get(f"sdkmessageprocessingsteps({step_id})?$select=stage,mode,statecode,configuration,"
                         "_sdkmessageprocessingstepsecureconfigid_value")
        if actual != {**actual, "stage": stage, "mode": 0, "statecode": 0, "configuration": configuration,
                      "_sdkmessageprocessingstepsecureconfigid_value": secure_id}:
            raise ValueError(f"Registration read-back failed: {name}")
        if table == OPPORTUNITY and stage == 40:
            history_writers.append(step_id)
        steps.append({"name": name, "id": step_id, "stage": stage, "mode": 0})
    destination = Path(__file__).resolve().parents[1] / "server" / "opportunity-rules-registration.json"
    destination.write_text(json.dumps({"assembly": assembly_id, "steps": steps}, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(steps)} synchronous caller-context steps registered and read back.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-url", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if os.environ["DATAVERSE_URL"].rstrip("/").lower() != args.expected_url.rstrip("/").lower():
        raise ValueError("Approved target differs from .env.")
    if not api_get(f"solutions?$filter=uniquename eq '{SOLUTION}'&$select=solutionid")["value"]:
        raise ValueError("Approved solution is missing.")
    if not schema.table_exists(OPPORTUNITY):
        raise ValueError("Existing CRM opportunity table is missing.")
    preflight()
    print(f"Plan: {SOLUTION}; lossreason column, user-owned stage history, "
          f"{c('historypermit')} String(128) request-proof column, 7 synchronous steps. "
          "Proof is stripped before persistence; signing key is reused.")
    if not args.apply:
        return
    if not DLL.is_file():
        raise FileNotFoundError(f"Build the signed plugin first: {DLL}")
    ensure_schema()
    register()


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        print(error.response.text)
        raise
