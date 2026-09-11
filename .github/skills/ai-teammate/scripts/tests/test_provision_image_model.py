"""Unit tests for provision_image_model.py without Azure calls."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT_PATH = Path(__file__).resolve().parents[1] / "provision_image_model.py"

_spec = importlib.util.spec_from_file_location("provision_image_model", SCRIPT_PATH)
provision_image_model = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = provision_image_model
assert _spec.loader is not None
_spec.loader.exec_module(provision_image_model)


class AzureCommandTests(unittest.TestCase):
    @patch.object(provision_image_model.shutil, "which", return_value="C:/tools/az.cmd")
    @patch.object(provision_image_model.subprocess, "run")
    def test_run_az_uses_argv_without_shell(self, run_mock, _which_mock) -> None:
        run_mock.return_value = subprocess.CompletedProcess([], 0, stdout="[]", stderr="")

        provision_image_model.run_az("account", "show")

        command = run_mock.call_args.args[0]
        self.assertEqual(command[0], "C:/tools/az.cmd")
        self.assertEqual(command[-2:], ["--output", "json"])
        self.assertFalse(run_mock.call_args.kwargs["shell"])

    @patch.object(provision_image_model, "run_az")
    def test_available_versions_filters_requested_model(self, run_az_mock) -> None:
        run_az_mock.return_value = [
            {"model": {"name": "gpt-image-1.5", "version": "2026-01-01", "format": "OpenAI"}},
            {"model": {"name": "other-model", "version": "2026-08-01", "format": "OpenAI"}},
            {"model": {"name": "gpt-image-1.5", "version": "2026-06-01", "format": "OpenAI"}},
        ]

        versions = provision_image_model.available_versions("rg-test", "ai-test", "gpt-image-1.5")

        self.assertEqual(versions, [("2026-06-01", "OpenAI"), ("2026-01-01", "OpenAI")])

    @patch.object(provision_image_model.shutil, "which", return_value=None)
    def test_missing_azure_cli_fails_before_subprocess(self, _which_mock) -> None:
        with self.assertRaisesRegex(RuntimeError, "not found"):
            provision_image_model.run_az("account", "show")

    @patch.object(provision_image_model, "run_az")
    @patch.object(provision_image_model, "parse_args")
    def test_create_uses_selected_version_and_numeric_capacity(self, parse_args_mock, run_az_mock) -> None:
        parse_args_mock.return_value = type("Args", (), {
            "env": "missing.env",
            "resource_group": "rg-test",
            "account": "ai-test",
            "model": "gpt-image-1.5",
            "model_version": None,
            "deployment": "image-test",
            "sku": "GlobalStandard",
            "capacity": 2,
            "check": False,
        })()
        run_az_mock.side_effect = [
            [{"model": {"name": "gpt-image-1.5", "version": "2026-06-01", "format": "OpenAI"}}],
            RuntimeError("ResourceNotFound"),
            {
                "properties": {"model": {"name": "gpt-image-1.5", "version": "2026-06-01"}},
                "sku": {"name": "GlobalStandard", "capacity": 2},
            },
        ]

        self.assertEqual(provision_image_model.main(), 0)

        create_command = run_az_mock.call_args_list[-1].args
        self.assertIn("--model-version", create_command)
        self.assertEqual(create_command[create_command.index("--model-version") + 1], "2026-06-01")
        self.assertEqual(create_command[create_command.index("--sku-capacity") + 1], "2")


if __name__ == "__main__":
    unittest.main()