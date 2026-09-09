"""Pure guards for a user-owned asynchronous request/result integration."""

import json
import re
from uuid import UUID

SCOPE_FIELDS = ("conversationId", "turnId", "version", "operation", "basis", "selection")
MAX_BYTES = 500000


def canonical_uuid(value):
    if not isinstance(value, str) or not re.fullmatch(
            r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", value):
        raise ValueError("Canonical UUID required")
    identifier = UUID(value)
    if identifier.int == 0:
        raise ValueError("Nonzero UUID required")
    return str(identifier)


def require_requester(created_by, owner_id, allowed_user_id):
    if canonical_uuid(created_by) != canonical_uuid(owner_id):
        raise ValueError("Request ownership differs from server CreatedBy")
    if canonical_uuid(created_by) != canonical_uuid(allowed_user_id):
        raise ValueError("Requester is not allowlisted")


def validate_envelope(client):
    if client.get("schemaVersion") != "1.0.0.0":
        raise ValueError("clientdata.schemaVersion must be 1.0.0.0")
    properties = client["properties"]
    if not isinstance(properties.get("connectionReferences"), dict):
        raise ValueError("Connection references required")
    definition = properties["definition"]
    if not isinstance(definition.get("triggers"), dict) or not definition["triggers"]:
        raise ValueError("Trigger definition required")
    if not isinstance(definition.get("actions"), dict) or not definition["actions"]:
        raise ValueError("Action definition required")


def validate_request(request, allowed_operations):
    if set(request) != {*SCOPE_FIELDS, "prompt"}:
        raise ValueError("Unexpected request fields")
    for field in ("conversationId", "turnId"):
        canonical_uuid(request[field])
    if type(request["version"]) is not int or not 1 <= request["version"] <= 2147483647:
        raise ValueError("Positive bounded integer version required")
    if request["operation"] not in allowed_operations:
        raise ValueError("Operation not allowlisted")
    for field in ("basis", "prompt", "selection"):
        value = request[field]
        if not isinstance(value, str) or (field != "selection" and not value.strip()):
            raise ValueError("Invalid request text")
    if len(request["selection"].encode("utf-8")) > 10000:
        raise ValueError("Selection too large")
    if len(json.dumps(request, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise ValueError("Request too large")


def verified_reply(request, result, request_id, created_by, result_owner, allowed_operations):
    validate_request(request, allowed_operations)
    if canonical_uuid(result["requestId"]) != canonical_uuid(request_id):
        raise ValueError("Request ID mismatch")
    if canonical_uuid(created_by) != canonical_uuid(result_owner):
        raise ValueError("Result owner mismatch")
    for field in SCOPE_FIELDS:
        if type(result.get(field)) is not type(request[field]) or result[field] != request[field]:
            raise ValueError("Result scope mismatch: " + field)
    if result.get("status") != "succeeded":
        raise ValueError("Result is not a verified success; retain receipt without resubmitting")
    reply = result.get("reply")
    if not isinstance(reply, str) or not reply.strip() or len(reply.encode("utf-8")) > MAX_BYTES:
        raise ValueError("Empty, invalid or oversized reply")
    return reply