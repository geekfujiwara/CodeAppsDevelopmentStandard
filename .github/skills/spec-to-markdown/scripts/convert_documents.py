"""MarkItDown ベースで仕様書を markdown / factsheet / document に変換する。"""

from __future__ import annotations

import argparse
import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

try:
    from markitdown import MarkItDown
except ImportError as exc:  # pragma: no cover - import guard
    raise SystemExit(
        "markitdown が未インストールです。"
        " `pip install -r .github/skills/spec-to-markdown/scripts/requirements.txt` を実行してください。"
    ) from exc


SUPPORTED_EXTENSIONS = {
    ".pdf",
    ".ppt",
    ".pptx",
    ".xls",
    ".xlsx",
    ".doc",
    ".docx",
    ".md",
    ".txt",
    ".html",
    ".htm",
}


def find_repository_root(start_path: Path) -> Path:
    for candidate in (start_path, *start_path.parents):
        if (candidate / ".git").exists():
            return candidate

    raise RuntimeError("リポジトリルートを特定できませんでした。")


REPOSITORY_ROOT = find_repository_root(Path(__file__).resolve())
DEFAULT_WORK_DIR = REPOSITORY_ROOT / "work" / "spec-to-markdown"
DEFAULT_INPUT_DIR = DEFAULT_WORK_DIR / "input"
DEFAULT_OUTPUT_ROOT = DEFAULT_WORK_DIR / "output"
HASH_CHUNK_SIZE = 8192


@dataclass
class ConversionResult:
    source_path: Path
    relative_path: Path
    slug: str
    raw_markdown_path: Path | None
    factsheet_path: Path
    status: str
    message: str
    sha256: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="input フォルダ内の仕様書を raw markdown / factsheet / document.md に変換する"
    )
    parser.add_argument(
        "--input",
        help=(
            "入力ファイルまたは入力フォルダのパス。"
            f" 省略時は `{DEFAULT_INPUT_DIR}` を使用"
        ),
    )
    parser.add_argument(
        "--output",
        help=(
            "出力フォルダのパス。"
            f" 省略時は `{DEFAULT_OUTPUT_ROOT}/<input-set>-<timestamp>/` を使用"
        ),
    )
    return parser.parse_args()


def resolve_input_path(input_arg: str | None) -> Path:
    if input_arg:
        return Path(input_arg).expanduser().resolve()

    DEFAULT_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_INPUT_DIR


def sanitize_path_fragment(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-._").lower()
    return normalized or "batch"


def infer_input_set_name(input_path: Path) -> str:
    if input_path.is_file():
        return sanitize_path_fragment(input_path.stem)

    if input_path == DEFAULT_INPUT_DIR:
        return "batch"

    try:
        relative_to_default = input_path.relative_to(DEFAULT_INPUT_DIR)
    except ValueError:
        return sanitize_path_fragment(input_path.name)

    if not relative_to_default.parts:
        return "batch"

    return sanitize_path_fragment("__".join(relative_to_default.parts))


def resolve_output_dir(output_arg: str | None, input_path: Path) -> Path:
    if output_arg:
        return Path(output_arg).expanduser().resolve()

    DEFAULT_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H-%M-%S")
    input_set_name = infer_input_set_name(input_path)
    return DEFAULT_OUTPUT_ROOT / f"{input_set_name}-{timestamp}"


def discover_files(input_path: Path, output_dir: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_EXTENSIONS else []

    files = [
        path
        for path in sorted(input_path.rglob("*"))
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and output_dir not in path.parents
    ]
    return files


def build_slug(relative_path: Path) -> str:
    joined = "__".join(relative_path.with_suffix("").parts)
    return sanitize_path_fragment(joined)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_directories(output_dir: Path) -> tuple[Path, Path]:
    raw_dir = output_dir / "raw"
    factsheet_dir = output_dir / "factsheets"
    raw_dir.mkdir(parents=True, exist_ok=True)
    factsheet_dir.mkdir(parents=True, exist_ok=True)
    return raw_dir, factsheet_dir


def convert_file(converter: MarkItDown, source_path: Path) -> str:
    result = converter.convert(str(source_path))
    text = getattr(result, "text_content", "")
    return text.strip()


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")


def escape_markdown_table(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def build_factsheet(
    source_path: Path,
    relative_path: Path,
    sha256: str,
    batch_started_at: str,
    extracted_markdown: str,
    status: str,
    message: str,
) -> str:
    title = source_path.stem
    body = extracted_markdown or "_抽出結果なし_"

    return f"""# {title} factsheet

## 1. Source
- File: `{source_path.name}`
- Relative path: `{relative_path.as_posix()}`
- Extension: `{source_path.suffix.lower()}`
- SHA256: `{sha256}`
- Batch converted at: `{batch_started_at}`
- Status: `{status}`
- Message: {message}

## 2. Power Platform requirement summary
### Business objective
- 要確認

### Users / roles
- 要確認

### Dataverse tables
- 要確認

### Main columns / master data
- 要確認

### UI / app requirements
- 要確認

### Automations
- 要確認

### Agent / AI opportunities
- 要確認

### External integrations
- 要確認

### Security / compliance
- 要確認

### Open questions
- 要確認

## 3. Extracted markdown

{body}
"""


def build_document(
    input_path: Path,
    output_dir: Path,
    batch_started_at: str,
    results: Iterable[ConversionResult],
) -> str:
    results = list(results)
    success_count = sum(1 for item in results if item.status == "success")
    failure_count = len(results) - success_count

    table_lines = [
        "| Source | Factsheet | Raw markdown | Status | Notes |",
        "| --- | --- | --- | --- | --- |",
    ]
    factsheet_lines = []

    for item in results:
        factsheet_rel = item.factsheet_path.relative_to(output_dir).as_posix()
        raw_rel = item.raw_markdown_path.relative_to(output_dir).as_posix() if item.raw_markdown_path else "-"
        raw_link = f"[raw]({raw_rel})" if item.raw_markdown_path else "-"
        table_lines.append(
            f"| `{item.relative_path.as_posix()}` | [factsheet]({factsheet_rel}) | {raw_link} | {item.status} | {escape_markdown_table(item.message)} |"
        )
        factsheet_lines.append(f"- [{item.relative_path.as_posix()}]({factsheet_rel})")

    return f"""# Power Platform requirements document

## 1. Conversion summary

- Input: `{input_path}`
- Output: `{output_dir}`
- Batch converted at: `{batch_started_at}`
- Files: {len(results)}
- Success: {success_count}
- Failure: {failure_count}

## 2. Source documents

{chr(10).join(table_lines)}

## 3. Cross-document requirements summary

### Business scope
- 要確認

### Users / roles
- 要確認

### Dataverse design candidates
- 要確認

### App design candidates
- 要確認

### Automation candidates
- 要確認

### Agent / AI candidates
- 要確認

### Integration candidates
- 要確認

### Risks / open questions
- 要確認

## 4. Factsheet index

{chr(10).join(factsheet_lines) if factsheet_lines else "- なし"}
"""


def main() -> int:
    args = parse_args()
    input_path = resolve_input_path(args.input)
    output_dir = resolve_output_dir(args.output, input_path)

    if not input_path.exists():
        raise SystemExit(
            "入力パスが存在しません:"
            f" {input_path}"
            f" 既定入力フォルダを使う場合は `{DEFAULT_INPUT_DIR}` にファイルを配置してください。"
        )

    files = discover_files(input_path, output_dir)
    if not files:
        raise SystemExit(
            "変換対象ファイルが見つかりません。"
            f" 対応拡張子: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    raw_dir, factsheet_dir = ensure_directories(output_dir)
    batch_started_at = datetime.now(timezone.utc).isoformat()
    converter = MarkItDown()
    base_dir = input_path if input_path.is_dir() else input_path.parent

    results: list[ConversionResult] = []

    for source_path in files:
        relative_path = source_path.relative_to(base_dir)
        slug = build_slug(relative_path)
        sha256 = sha256_of(source_path)
        raw_markdown_path = raw_dir / f"{slug}.md"
        factsheet_path = factsheet_dir / f"{slug}.md"

        try:
            markdown = convert_file(converter, source_path)
            write_text(raw_markdown_path, markdown or "_抽出結果なし_")
            factsheet = build_factsheet(
                source_path=source_path,
                relative_path=relative_path,
                sha256=sha256,
                batch_started_at=batch_started_at,
                extracted_markdown=markdown,
                status="success",
                message="converted",
            )
            write_text(factsheet_path, factsheet)
            results.append(
                ConversionResult(
                    source_path=source_path,
                    relative_path=relative_path,
                    slug=slug,
                    raw_markdown_path=raw_markdown_path,
                    factsheet_path=factsheet_path,
                    status="success",
                    message="converted",
                    sha256=sha256,
                )
            )
            print(f"✅ converted: {relative_path.as_posix()}")
        except Exception as exc:  # pragma: no cover - external converter failures vary
            factsheet = build_factsheet(
                source_path=source_path,
                relative_path=relative_path,
                sha256=sha256,
                batch_started_at=batch_started_at,
                extracted_markdown="",
                status="failed",
                message=str(exc).replace("\n", " "),
            )
            write_text(factsheet_path, factsheet)
            results.append(
                ConversionResult(
                    source_path=source_path,
                    relative_path=relative_path,
                    slug=slug,
                    raw_markdown_path=None,
                    factsheet_path=factsheet_path,
                    status="failed",
                    message=str(exc).replace("\n", " "),
                    sha256=sha256,
                )
            )
            print(f"❌ failed: {relative_path.as_posix()} -> {exc}")

    document_path = output_dir / "document.md"
    write_text(document_path, build_document(input_path, output_dir, batch_started_at, results))
    print(f"📝 wrote: {document_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
