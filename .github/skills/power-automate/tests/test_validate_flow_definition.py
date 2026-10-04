import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_flow_definition.py"
SPEC = importlib.util.spec_from_file_location("validate_flow_definition", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


def dataverse_action(operation_id, parameters):
    return {
        "actions": {
            "Dataverse_record": {
                "type": "OpenApiConnection",
                "inputs": {
                    "host": {
                        "apiId": (
                            "/providers/Microsoft.PowerApps/apis/"
                            "shared_commondataserviceforapps"
                        ),
                        "connectionName": "shared_commondataserviceforapps",
                        "operationId": operation_id,
                    },
                    "parameters": parameters,
                },
            }
        }
    }


class FlatDataverseItemParameterTests(unittest.TestCase):
    def test_rejects_nested_create_record_item(self):
        definition = dataverse_action(
            "CreateRecord",
            {"entityName": "accounts", "item": {"name": "Example"}},
        )

        with self.assertRaisesRegex(ValueError, "item/name"):
            MODULE.assert_flat_dataverse_item_parameters(definition)

    def test_rejects_nested_update_record_item(self):
        definition = dataverse_action(
            "UpdateRecord",
            {
                "entityName": "accounts",
                "recordId": "00000000-0000-0000-0000-000000000000",
                "item": {"name": "Example"},
            },
        )

        with self.assertRaisesRegex(ValueError, "item/name"):
            MODULE.assert_flat_dataverse_item_parameters(definition)

    def test_accepts_flat_item_parameters(self):
        definition = dataverse_action(
            "CreateRecord",
            {"entityName": "accounts", "item/name": "Example"},
        )

        MODULE.assert_flat_dataverse_item_parameters(definition)


if __name__ == "__main__":
    unittest.main()
