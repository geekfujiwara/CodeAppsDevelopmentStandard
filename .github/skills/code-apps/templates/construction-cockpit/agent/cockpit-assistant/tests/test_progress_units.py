"""progress_units.py の換算が、アプリの 3D 表示（project-model-3d.tsx の partVisual）と一致することを確かめる。

    python -m pytest agent/cockpit-assistant/tests -q
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "skills" / "progress-3d-report"))

from progress_units import built_units, percent_from_completed  # noqa: E402


def app_states(count: int, percent: int) -> list[str]:
    """project-model-3d.tsx の partVisual（segment あり）を写したもの"""
    built = percent / 100 * count
    tol = max(0.05, count / 200) + 1e-6
    states = []
    for index in range(count):
        if built >= index + 1 - tol:
            states.append("done")
        elif built > index + tol:
            states.append("active")
        else:
            states.append("planned")
    return states


@pytest.mark.parametrize("count", range(1, 61))
def test_completed_count_round_trips_for_every_unit_count(count: int) -> None:
    units = [f"Level_{index + 1}" for index in range(count)]
    for completed in range(count + 1):
        percent = percent_from_completed(units, completed)
        result = built_units(units, percent)
        assert len(result["done"]) == completed, (count, completed, percent)
        assert result["active"] is None, (count, completed, percent)
        assert app_states(count, percent) == ["done"] * completed + ["planned"] * (count - completed)


@pytest.mark.parametrize("count", [1, 3, 4, 7, 24, 60])
def test_built_units_matches_app_for_every_percent(count: int) -> None:
    units = [f"U{index}" for index in range(count)]
    for percent in range(101):
        result = built_units(units, percent)
        states = app_states(count, percent)
        assert states.count("done") == len(result["done"]), (count, percent)
        assert (result["active"] is not None) == ("active" in states), (count, percent)
        if result["active"]:
            assert states.index("active") == units.index(result["active"])


def test_unit_name_matching() -> None:
    units = ["IfcSlab_Level_1", "IfcSlab_Level_2", "IfcSlab_Level_3", "IfcSlab_Level_4"]
    assert percent_from_completed(units, "IfcSlab Level 3") == 75
    assert percent_from_completed(units, "level_2") == 50
    assert percent_from_completed(units, "4") == 100
    with pytest.raises(ValueError, match="見つかりません"):
        percent_from_completed(units, "Level_9")
    with pytest.raises(ValueError, match="複数"):
        percent_from_completed(units, "IfcSlab")
    with pytest.raises(ValueError):
        percent_from_completed([], 1)
