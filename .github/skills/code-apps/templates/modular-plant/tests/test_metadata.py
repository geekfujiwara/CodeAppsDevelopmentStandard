import copy
import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/check_design_metadata.py"
SPEC = importlib.util.spec_from_file_location("check_design_metadata", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MetadataTests(unittest.TestCase):
    def test_configuration_is_checked_before_authentication(self):
        with self.assertRaisesRegex(ValueError, "Missing required environment variables: PLANT_DESIGN_TABLE"):
            MODULE.design_settings({})
        settings = {f"PLANT_{kind.upper()}_TABLE": f"sample_{kind}" for kind in ("design", "revision", "proposal")}
        settings.update(PLANT_DESIGN_LOOKUP="sample_designid", PLANT_REVISION_COLUMN="sample_revision")
        self.assertEqual(MODULE.design_settings(settings)[0]["design"], "sample_design")
        settings["PLANT_DESIGN_TABLE"] = "{prefix}_plantdesign"
        with self.assertRaisesRegex(ValueError, "logical names"):
            MODULE.design_settings(settings)

    def test_active_key_and_navigation_are_required(self):
        tables = {kind: {"LogicalName": f"sample_{kind}", "EntitySetName": f"sample_{kind}s", "PrimaryIdAttribute": f"sample_{kind}id", "Attributes": [{"LogicalName": "sample_designid"}, {"LogicalName": "sample_revision"}], "ManyToOneRelationships": [{"ReferencingAttribute": "sample_designid", "ReferencedEntity": "sample_design", "ReferencingEntityNavigationPropertyName": "sample_designid"}]} for kind in ("design", "revision", "proposal")}
        tables["revision"]["Keys"] = [{"KeyAttributes": ["sample_designid", "sample_revision"], "EntityKeyIndexStatus": "Active"}]
        MODULE.validate_metadata(tables, "sample_designid", "sample_revision")
        for status in ("Pending", "InProgress", "Failed", None):
            invalid = copy.deepcopy(tables)
            invalid["revision"]["Keys"][0]["EntityKeyIndexStatus"] = status
            with self.assertRaisesRegex(ValueError, "Active"):
                MODULE.validate_metadata(invalid, "sample_designid", "sample_revision")
        tables["proposal"]["ManyToOneRelationships"] = []
        with self.assertRaisesRegex(ValueError, "lookup"):
            MODULE.validate_metadata(tables, "sample_designid", "sample_revision")