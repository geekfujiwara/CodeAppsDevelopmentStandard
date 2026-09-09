import copy
import sys
import unittest
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from conversation_contract import canonical_uuid, require_requester, validate_envelope, validate_request, verified_reply


class ConversationContractTests(unittest.TestCase):
    def setUp(self):
        self.owner = str(uuid4())
        self.request_id = str(uuid4())
        self.request = {"conversationId": str(uuid4()), "turnId": str(uuid4()), "version": 1,
                        "operation": "design", "basis": "{}", "selection": "", "prompt": "Arrange"}
        self.result = {**self.request, "requestId": self.request_id, "status": "succeeded", "reply": "{}"}
        del self.result["prompt"]

    def verify(self, result):
        return verified_reply(self.request, result, self.request_id, self.owner, self.owner, {"design"})

    def test_valid_round_trip(self):
        self.assertEqual(self.verify(self.result), "{}")

    def test_identity_is_server_owned_and_fail_closed(self):
        require_requester(self.owner.upper(), self.owner, self.owner)
        for identity in (str(uuid4()), "", "user@example.com", None):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                require_requester(identity, self.owner, self.owner)
        with self.assertRaises(ValueError):
            require_requester(self.owner, str(uuid4()), self.owner)

    def test_canonical_uuid(self):
        for identifier in (self.owner.replace("-", ""), "{" + self.owner + "}", str(uuid4()) + "x", "0" * 36):
            with self.subTest(identifier=identifier), self.assertRaises(ValueError):
                canonical_uuid(identifier)

    def test_every_scope_field_is_required(self):
        for field in ("conversationId", "turnId", "version", "operation", "basis", "selection", "requestId"):
            result = copy.deepcopy(self.result)
            result[field] = str(uuid4()) if field != "version" else 2
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify(result)
        with self.assertRaises(ValueError):
            self.verify({**self.result, "version": True})

    def test_pending_failure_and_empty_output_are_not_success(self):
        for state in ("pending", "running", "failed", "cancelled", "Completed", None):
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.verify({**self.result, "status": state})
        for reply in (None, {}, "", "  ", "x" * 500001):
            with self.subTest(reply_type=type(reply)), self.assertRaises(ValueError):
                self.verify({**self.result, "reply": reply})

    def test_payload_operations_sizes_and_extra_fields(self):
        for changes in ({"version": True}, {"version": 0}, {"operation": "knowledge"}, {"prompt": ""},
                        {"createdBy": self.owner}, {"selection": "x" * 10001}, {"prompt": "x" * 500000}):
            with self.subTest(keys=list(changes)), self.assertRaises(ValueError):
                validate_request({**self.request, **changes}, {"design"})

    def test_result_ownership(self):
        with self.assertRaises(ValueError):
            verified_reply(self.request, self.result, self.request_id, self.owner, str(uuid4()), {"design"})

    def test_envelope_requires_schema_version(self):
        client = {"schemaVersion": "1.0.0.0", "properties": {"connectionReferences": {},
                  "definition": {"triggers": {"request": {}}, "actions": {"agent": {}}}}}
        validate_envelope(client)
        for version in (None, "1", "2.0.0.0"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                validate_envelope({**client, "schemaVersion": version})


if __name__ == "__main__":
    unittest.main()