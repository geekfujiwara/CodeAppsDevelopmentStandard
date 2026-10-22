"""Leave Auto to the platform unless an observed configuration is supplied."""
from __future__ import annotations

import copy
import json
from pathlib import Path

DEPRECATED_SERIES = ("Sonnet46", "Sonnet5", "Opus5", "GPT4o")


def resolve_model(series: str, auto_config_file: str = "") -> dict | None:
    series = series.strip() or "Auto"
    if series in DEPRECATED_SERIES:
        raise ValueError(f"廃止モデル系列です: {series}")
    if series.casefold() != "auto":
        return {"$kind": "ModelConfig", "series": series}
    if not auto_config_file:
        return None
    record = json.loads(Path(auto_config_file).read_text(encoding="utf-8-sig"))
    if not isinstance(record, dict) or set(record) != {"selection", "model"} or record["selection"] != "Auto":
        raise ValueError("Auto 構成は selection=Auto と model のみを持つ JSON が必要です。")
    model = record["model"]
    if model is not None:
        if not isinstance(model, dict) or model.get("$kind") != "ModelConfig":
            raise ValueError("Auto の model は ModelConfig オブジェクトまたは null が必要です。")
        if model.get("series") in DEPRECATED_SERIES:
            raise ValueError("Auto 構成に廃止モデルが含まれています。UI を再確認してください。")
    return copy.deepcopy(model)


def apply_model(settings: dict, model: dict | None) -> None:
    if model is None:
        settings.pop("model", None)
    else:
        settings["model"] = copy.deepcopy(model)
