"""Safely read and update Standard GPT component model metadata."""

from __future__ import annotations

import re


MODEL_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9._-]{0,99}$")
TOP_LEVEL_PATTERN = re.compile(r"^[A-Za-z$][A-Za-z0-9$]*:")
MODEL_HINT_PATTERN = re.compile(r"^(?P<indent>[ \t]+)modelNameHint:[ \t]*(?P<value>[^\r\n]*)$")
MODEL_KEY_PATTERN = re.compile(r"^(?P<indent>[ \t]+)model:[ \t]*$")


def _line_ending(data: str) -> str:
    return "\r\n" if "\r\n" in data else "\n"


def _section_bounds(lines: list[str], key: str) -> tuple[int, int] | None:
    start = next((index for index, line in enumerate(lines) if line.rstrip("\r\n") == f"{key}:"), None)
    if start is None:
        return None
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if TOP_LEVEL_PATTERN.match(lines[index].rstrip("\r\n")):
            end = index
            break
    return start, end


def current_model_name(data: str) -> str | None:
    lines = data.splitlines(keepends=True)
    bounds = _section_bounds(lines, "aISettings")
    if bounds is None:
        return None
    start, end = bounds
    for line in lines[start + 1 : end]:
        match = MODEL_HINT_PATTERN.match(line.rstrip("\r\n"))
        if match:
            return match.group("value").strip() or None
    return None


def set_model_name(data: str, model_name: str) -> str:
    if not MODEL_NAME_PATTERN.fullmatch(model_name):
        raise ValueError("model name must be 1-100 alphanumeric, dot, underscore, or hyphen characters")
    newline = _line_ending(data)
    lines = data.splitlines(keepends=True)
    bounds = _section_bounds(lines, "aISettings")
    if bounds is None:
        suffix = "" if not data or data.endswith(("\n", "\r")) else newline
        separator = "" if not data else newline
        return f"{data}{suffix}{separator}aISettings:{newline}  model:{newline}    modelNameHint: {model_name}{newline}"

    start, end = bounds
    model_index = None
    model_indent = None
    for index in range(start + 1, end):
        match = MODEL_KEY_PATTERN.match(lines[index].rstrip("\r\n"))
        if match:
            model_index = index
            model_indent = match.group("indent")
            break
    if model_index is None or model_indent is None:
        lines.insert(start + 1, f"  model:{newline}")
        lines.insert(start + 2, f"    modelNameHint: {model_name}{newline}")
        return "".join(lines)

    child_indent = f"{model_indent}  "
    model_end = end
    for index in range(model_index + 1, end):
        raw = lines[index].rstrip("\r\n")
        if not raw.strip():
            continue
        indent = raw[: len(raw) - len(raw.lstrip(" \t"))]
        if len(indent) <= len(model_indent):
            model_end = index
            break
    for index in range(model_index + 1, model_end):
        match = MODEL_HINT_PATTERN.match(lines[index].rstrip("\r\n"))
        if match and len(match.group("indent")) > len(model_indent):
            ending = newline if lines[index].endswith(("\n", "\r")) else ""
            lines[index] = f"{match.group('indent')}modelNameHint: {model_name}{ending}"
            return "".join(lines)

    lines.insert(model_index + 1, f"{child_indent}modelNameHint: {model_name}{newline}")
    return "".join(lines)