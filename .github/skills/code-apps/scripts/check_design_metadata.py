import argparse
import json
import os
from pathlib import Path
import re
import sys


def validate_metadata(tables, design_lookup, revision_column):
    for kind, metadata in tables.items():
        for required in ("LogicalName", "EntitySetName", "PrimaryIdAttribute"):
            if not metadata.get(required):
                raise ValueError(f"Missing {kind} metadata: {required}")
    revision = tables["revision"]
    columns = {column["LogicalName"] for column in revision.get("Attributes", [])}
    if not {design_lookup, revision_column}.issubset(columns):
        raise ValueError("Revision key columns are missing")
    keys = revision.get("Keys", [])
    if not any(set(key.get("KeyAttributes", [])) == {design_lookup, revision_column} and key.get("EntityKeyIndexStatus") == "Active" for key in keys):
        raise ValueError("Design/revision alternate key must be Active before saving")
    for kind in ("revision", "proposal"):
        if not any(relation.get("ReferencingAttribute") == design_lookup and relation.get("ReferencedEntity") == tables["design"]["LogicalName"] and relation.get("ReferencingEntityNavigationPropertyName") for relation in tables[kind].get("ManyToOneRelationships", [])):
            raise ValueError(f"Missing {kind} design lookup navigation property")


def design_settings(environment):
    required = ["PLANT_DESIGN_TABLE", "PLANT_REVISION_TABLE", "PLANT_PROPOSAL_TABLE", "PLANT_DESIGN_LOOKUP", "PLANT_REVISION_COLUMN"]
    missing = [key for key in required if not environment.get(key, "").strip()]
    if missing:
        raise ValueError("Missing required environment variables: " + ", ".join(missing))
    names = {kind: environment[f"PLANT_{kind.upper()}_TABLE"].strip() for kind in ("design", "revision", "proposal")}
    lookup = environment["PLANT_DESIGN_LOOKUP"].strip()
    revision_column = environment["PLANT_REVISION_COLUMN"].strip()
    if not all(re.fullmatch(r"[a-z][a-z0-9_]*", name) for name in [*names.values(), lookup, revision_column]):
        raise ValueError("Use logical names, not placeholders or OData fragments")
    return names, lookup, revision_column


def main():
    parser = argparse.ArgumentParser(description="Read-only design metadata readiness check")
    parser.add_argument("--out", required=True)
    parser.add_argument("--env-file", default=".env")
    args = parser.parse_args()
    from dotenv import load_dotenv
    load_dotenv(args.env_file)
    names, lookup, revision_column = design_settings(os.environ)
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard/scripts"))
    from auth_helper import api_get
    tables = {}
    for kind, logical in names.items():
        tables[kind] = api_get(f"EntityDefinitions(LogicalName='{logical}')?$select=LogicalName,EntitySetName,PrimaryIdAttribute&$expand=Attributes($select=LogicalName),Keys($select=KeyAttributes,EntityKeyIndexStatus),ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName)")
    validate_metadata(tables, lookup, revision_column)
    mapping = {"tables": {kind: {"logicalName": meta["LogicalName"], "entitySetName": meta["EntitySetName"], "primaryId": meta["PrimaryIdAttribute"], "columns": [column["LogicalName"] for column in meta["Attributes"]], "lookups": {relation["ReferencingAttribute"]: relation["ReferencingEntityNavigationPropertyName"] for relation in meta["ManyToOneRelationships"] if relation.get("ReferencingEntityNavigationPropertyName")}} for kind, meta in tables.items()}}
    with Path(args.out).open("x", encoding="utf-8") as output:
        json.dump(mapping, output, indent=2)
    print("Verified Active revision key and design lookups; created table map without modifying Dataverse")


if __name__ == "__main__":
    main()