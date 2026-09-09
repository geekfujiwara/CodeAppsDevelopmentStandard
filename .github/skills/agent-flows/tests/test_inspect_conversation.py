import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from inspect_conversation import inspect


class InspectConversationTests(unittest.TestCase):
    def setUp(self):
        self.request_id, self.owner = str(uuid4()), str(uuid4())
        self.request = {"conversationId": str(uuid4()), "turnId": str(uuid4()), "version": 1,
                        "operation": "design", "basis": "{}", "selection": "", "prompt": "Arrange"}
        self.row = {"sample_requestid": self.request_id, "sample_requestjson": json.dumps(self.request),
                    "_createdby_value": self.owner, "_ownerid_value": self.owner}
        result = {**self.request, "requestId": self.request_id, "status": "succeeded", "reply": "{}"}
        del result["prompt"]
        self.result = {"sample_resultjson": json.dumps(result), "_ownerid_value": self.owner,
                       "_sample_requestid_value": self.request_id}

    def run_inspection(self, get):
        return inspect(get, self.request_id, "sample_request", "sample_requests", "sample_results",
                       "sample_requestjson", "sample_resultjson", "sample_requestid", self.owner, "design")

    def test_reads_only_bound_request_and_unique_result(self):
        get = Mock(side_effect=[self.row, {"value": [self.result]}])
        self.assertTrue(self.run_inspection(get)["verified"])
        self.assertEqual(get.call_count, 2)
        self.assertIn(self.request_id, get.call_args_list[1].args[0])

    def test_no_result_is_pending_without_resubmission(self):
        get = Mock(side_effect=[self.row, {"value": []}])
        self.assertEqual(self.run_inspection(get)["status"], "pending")
        self.assertEqual(get.call_count, 2)

    def test_wrong_owner_stops_before_result_read(self):
        get = Mock(return_value={**self.row, "_ownerid_value": str(uuid4())})
        with self.assertRaises(ValueError):
            self.run_inspection(get)
        self.assertEqual(get.call_count, 1)

    def test_duplicate_and_wrong_lookup_results_are_rejected(self):
        for rows in ([self.result, self.result], [{**self.result, "_sample_requestid_value": str(uuid4())}]):
            with self.subTest(count=len(rows)), self.assertRaises(ValueError):
                self.run_inspection(Mock(side_effect=[self.row, {"value": rows}]))


if __name__ == "__main__":
    unittest.main()