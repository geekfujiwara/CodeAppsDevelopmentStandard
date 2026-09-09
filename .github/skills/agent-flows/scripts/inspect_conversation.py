"""Read and verify one existing request/result; never invoke an agent or write data."""

import argparse
import json
import os
import re
import sys
from pathlib import Path

from conversation_contract import canonical_uuid, require_requester, validate_request, verified_reply

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "standard/scripts"))


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9_]*", value):
        raise ValueError("Dataverse logical name required")
    return value


def inspect(get, request_id, request_table, request_set, result_set, request_json, result_json,
            result_lookup, allowed_user_id, allowed_operation):
    request_id = canonical_uuid(request_id)
    for value in (request_table, request_set, result_set, request_json, result_json, result_lookup):
        identifier(value)
    row = get(f"{request_set}({request_id})?$select={request_table}id,{request_json},_createdby_value,_ownerid_value")
    if canonical_uuid(row[request_table + "id"]) != request_id:
        raise ValueError("Request row mismatch")
    require_requester(row["_createdby_value"], row["_ownerid_value"], allowed_user_id)
    request = json.loads(row[request_json])
    validate_request(request, {allowed_operation})
    rows = get(f"{result_set}?$select={result_json},_ownerid_value,_{result_lookup}_value"
               f"&$filter=_{result_lookup}_value eq {request_id}&$top=2").get("value", [])
    if not rows:
        return {"status": "pending", "verified": False}
    if len(rows) != 1 or canonical_uuid(rows[0][f"_{result_lookup}_value"]) != request_id:
        raise ValueError("Result lookup or uniqueness mismatch")
    result = json.loads(rows[0][result_json])
    reply = verified_reply(request, result, request_id, row["_createdby_value"],
                           rows[0]["_ownerid_value"], {allowed_operation})
    return {"status": "reply-envelope-verified", "verified": True,
            "replyBytes": len(reply.encode("utf-8")), "domainValidation": "required-separately"}


def main():
    from auth_helper import api_get
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request-id", required=True)
    parser.add_argument("--request-table", default=os.getenv("CONVERSATION_REQUEST_TABLE"))
    parser.add_argument("--request-set", default=os.getenv("CONVERSATION_REQUEST_SET"))
    parser.add_argument("--result-set", default=os.getenv("CONVERSATION_RESULT_SET"))
    parser.add_argument("--request-json", default=os.getenv("CONVERSATION_REQUEST_JSON_COLUMN"))
    parser.add_argument("--result-json", default=os.getenv("CONVERSATION_RESULT_JSON_COLUMN"))
    parser.add_argument("--result-lookup", default=os.getenv("CONVERSATION_RESULT_LOOKUP"))
    parser.add_argument("--allowed-user-id", default=os.getenv("CONVERSATION_ALLOWED_USER_ID"))
    parser.add_argument("--operation", default=os.getenv("CONVERSATION_ALLOWED_OPERATION"))
    args = parser.parse_args()
    try:
        if not args.operation:
            raise ValueError("Allowed operation required")
        report = inspect(api_get, args.request_id, args.request_table, args.request_set, args.result_set,
                         args.request_json, args.result_json, args.result_lookup, args.allowed_user_id, args.operation)
        print(json.dumps(report))
        return 0 if report["verified"] else 2
    except Exception as error:
        print(json.dumps({"status": "unverified", "errorType": type(error).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())