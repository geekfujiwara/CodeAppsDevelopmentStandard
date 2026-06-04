"""spec-to-markdown の入力を /work 配下に staging/output として出力する。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

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
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".bmp",
    ".webp",
    ".tiff",
    ".tif",
}

TEXT_EXTENSIONS = {".md", ".txt", ".html", ".htm"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tiff", ".tif"}
HASH_CHUNK_SIZE = 8192
PENDING_OCR_MARKER = "<!-- pending-ocr -->"
PENDING_SKILLS_MARKER = "<!-- pending-skills -->"
OCR_PROMPT_HINT = (
    "画像内テキストを漏れなく markdown 化し、表は markdown table を使う。"
    " 判読不能箇所は [判読不可] と明記する。"
)


@dataclass
class ConversionResult:
    source_path: Path
    relative_path: Path
    staging_path: Path
    status: str
    message: str
    sha256: str


def find_repository_root(start_path: Path) -> Path:
    for candidate in (start_path, *start_path.parents):
        if (candidate / ".git").exists():
            return candidate

    raise RuntimeError("リポジトリルートを特定できませんでした。")


REPOSITORY_ROOT = find_repository_root(Path(__file__).resolve())
DEFAULT_WORK_DIR = REPOSITORY_ROOT / "work"
DEFAULT_INPUT_DIR = DEFAULT_WORK_DIR / "input"
DEFAULT_STAGING_DIR = DEFAULT_WORK_DIR / "staging"
DEFAULT_OUTPUT_DIR = DEFAULT_WORK_DIR / "output"




def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "input フォルダの文書を /work/staging に 元ファイル名.拡張子.MD で出力し、"
            " /work/output に要件ドキュメントを出力する"
        )
    )
    parser.add_argument(
        "--input",
        help=(
            "入力ファイルまたは入力フォルダのパス。"
            f" 省略時は `{DEFAULT_INPUT_DIR}` を使用"
        ),
    )
    parser.add_argument(
        "--staging",
        help=(
            "staging 出力フォルダ。"
            f" 省略時は `{DEFAULT_STAGING_DIR}`"
        ),
    )
    parser.add_argument(
        "--output",
        help=(
            "output 出力フォルダ。"
            f" 省略時は `{DEFAULT_OUTPUT_DIR}`"
        ),
    )
    parser.add_argument(
        "--agent-ocr",
        action="store_true",
        help="画像を pending-ocr として出力し pending_ocr.json に記録する（既定: 自動判定で有効）",
    )
    return parser.parse_args()



def resolve_input_path(input_arg: str | None) -> Path:
    if input_arg:
        return Path(input_arg).expanduser().resolve()

    DEFAULT_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_INPUT_DIR



def resolve_output_path(path_arg: str | None, default_path: Path) -> Path:
    if path_arg:
        return Path(path_arg).expanduser().resolve()

    return default_path



def discover_files(input_path: Path, staging_dir: Path, output_dir: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_EXTENSIONS else []

    output_paths = {staging_dir.resolve(), output_dir.resolve()}
    files = [
        path
        for path in sorted(input_path.rglob("*"))
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_EXTENSIONS
        and all(output_path not in path.parents for output_path in output_paths)
    ]
    return files



def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(HASH_CHUNK_SIZE), b""):
            digest.update(chunk)
    return digest.hexdigest()



def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")



def sanitize_path_fragment(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-._")
    return normalized or "document"



def staging_filename(source_path: Path) -> str:
    return f"{source_path.name}.MD"



def ensure_unique_staging_path(staging_dir: Path, source_path: Path, relative_path: Path) -> Path:
    filename = staging_filename(source_path)
    target = staging_dir / filename
    if not target.exists():
        return target

    suffix = sanitize_path_fragment("__".join(relative_path.parent.parts))
    return staging_dir / f"{source_path.name}.{suffix}.MD"



def read_text_like_file(path: Path) -> str:
    return path.read_text(encoding="utf-8")



def build_pending_skills_markdown(source_path: Path) -> str:
    return f"""{PENDING_SKILLS_MARKER}
Anthropic Skills での抽出待ちです。

- Source: `{source_path}`
- 方針: 画像以外の文書は anthropics/skills で markdown 化
"""



def build_pending_ocr_markdown(source_path: Path) -> str:
    return f"""{PENDING_OCR_MARKER}
agent-ocr での抽出待ちです。

- Source: `{source_path}`
- 方針: 画像は agent-ocr で OCR 実行
- 抽出ルール: {OCR_PROMPT_HINT}
"""



def build_requirements_doc(
    title: str,
    batch_started_at: str,
    results: list[ConversionResult],
    focus_items: list[str],
) -> str:
    lines = [
        f"# {title}",
        "",
        "## 1. 変換対象ファイル",
        "",
        f"- Batch converted at: `{batch_started_at}`",
        f"- Files: {len(results)}",
        "",
        "| Source | Staging markdown | Status | Note |",
        "| --- | --- | --- | --- |",
    ]

    for item in results:
        note = item.message.replace("\n", " ")
        lines.append(
            f"| `{item.relative_path.as_posix()}` | `{item.staging_path.name}` | `{item.status}` | {note} |"
        )

    lines.extend([
        "",
        "## 2. 要件整理",
        "",
    ])
    for focus in focus_items:
        lines.extend([f"### {focus}", "- 要確認", ""])

    lines.extend([
        "## 3. 備考",
        "- `staging` の markdown を根拠に整理すること",
        "- 情報不足は推測せず `要確認` として残すこと",
        "",
    ])
    return "\n".join(lines)



def write_pending_json(path: Path, payload: list[dict[str, str]]) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))



def main() -> int:
    args = parse_args()
    input_path = resolve_input_path(args.input)
    output_staging = resolve_output_path(args.staging, DEFAULT_STAGING_DIR)
    output_dir = resolve_output_path(args.output, DEFAULT_OUTPUT_DIR)

    if not input_path.exists():
        raise SystemExit(
            "入力パスが存在しません:"
            f" {input_path}"
            f" 既定入力フォルダを使う場合は `{DEFAULT_INPUT_DIR}` にファイルを配置してください。"
        )

    files = discover_files(input_path, output_staging, output_dir)
    if not files:
        raise SystemExit(
            "変換対象ファイルが見つかりません。"
            f" 対応拡張子: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    output_staging.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    batch_started_at = datetime.now(timezone.utc).isoformat()
    agent_ocr_mode = args.agent_ocr or any(f.suffix.lower() in IMAGE_EXTENSIONS for f in files)

    if agent_ocr_mode:
        print("🖼️  画像は agent-ocr で処理します。")
    print("📄  画像以外は anthropics/skills で処理します（staging へ pending-skills を出力）。")

    base_dir = input_path if input_path.is_dir() else input_path.parent
    results: list[ConversionResult] = []
    pending_ocr_items: list[dict[str, str]] = []
    pending_skills_items: list[dict[str, str]] = []

    for source_path in files:
        relative_path = source_path.relative_to(base_dir)
        sha256 = sha256_of(source_path)
        staging_path = ensure_unique_staging_path(output_staging, source_path, relative_path)
        ext = source_path.suffix.lower()

        if ext in IMAGE_EXTENSIONS:
            write_text(staging_path, build_pending_ocr_markdown(source_path))
            pending_ocr_items.append({
                "source_path": str(source_path),
                "relative_path": relative_path.as_posix(),
                "staging_markdown_path": str(staging_path),
                "sha256": sha256,
                "processor": "agent-ocr",
                "ocr_prompt_hint": OCR_PROMPT_HINT,
            })
            results.append(
                ConversionResult(
                    source_path=source_path,
                    relative_path=relative_path,
                    staging_path=staging_path,
                    status="pending-ocr",
                    message="agent-ocr 待機",
                    sha256=sha256,
                )
            )
            print(f"⏳ pending-ocr: {relative_path.as_posix()} -> {staging_path.name}")
            continue

        if ext in TEXT_EXTENSIONS:
            try:
                text = read_text_like_file(source_path)
                write_text(staging_path, text or "_抽出結果なし_")
                results.append(
                    ConversionResult(
                        source_path=source_path,
                        relative_path=relative_path,
                        staging_path=staging_path,
                        status="success",
                        message="utf-8 text copied",
                        sha256=sha256,
                    )
                )
                print(f"✅ copied-text: {relative_path.as_posix()} -> {staging_path.name}")
                continue
            except UnicodeDecodeError:
                pass

        write_text(staging_path, build_pending_skills_markdown(source_path))
        pending_skills_items.append({
            "source_path": str(source_path),
            "relative_path": relative_path.as_posix(),
            "staging_markdown_path": str(staging_path),
            "sha256": sha256,
            "processor": "anthropics/skills",
        })
        results.append(
            ConversionResult(
                source_path=source_path,
                relative_path=relative_path,
                staging_path=staging_path,
                status="pending-skills",
                message="anthropics/skills 抽出待機",
                sha256=sha256,
            )
        )
        print(f"⏳ pending-skills: {relative_path.as_posix()} -> {staging_path.name}")

    if pending_ocr_items:
        pending_ocr_json = output_staging / "pending_ocr.json"
        write_pending_json(pending_ocr_json, pending_ocr_items)
        print(f"📝 wrote: {pending_ocr_json}")

    if pending_skills_items:
        pending_skills_json = output_staging / "pending_skills.json"
        write_pending_json(pending_skills_json, pending_skills_items)
        print(f"📝 wrote: {pending_skills_json}")

    business_doc = output_dir / "business-requirements.md"
    functional_doc = output_dir / "functional-requirements.md"
    design_doc = output_dir / "design-requirements.md"

    write_text(
        business_doc,
        build_requirements_doc(
            title="業務要件",
            batch_started_at=batch_started_at,
            results=results,
            focus_items=[
                "対象業務 / 目的",
                "利用者 / ロール",
                "業務フロー",
                "未確定事項 / 要確認事項",
            ],
        ),
    )
    write_text(
        functional_doc,
        build_requirements_doc(
            title="機能要件",
            batch_started_at=batch_started_at,
            results=results,
            focus_items=[
                "Dataverse テーブル候補",
                "主要列 / マスタ / リレーション候補",
                "Code Apps / Model-Driven Apps の UI 要件",
                "Power Automate の自動化要件",
                "Copilot Studio / AI Builder の利用余地",
                "外部連携",
            ],
        ),
    )
    write_text(
        design_doc,
        build_requirements_doc(
            title="設計要件",
            batch_started_at=batch_started_at,
            results=results,
            focus_items=[
                "Power Platform 全体構成案",
                "セキュリティ / 権限 / 監査の論点",
                "設計上のリスク",
                "Phase 0 で確認が必要な論点",
            ],
        ),
    )

    print(f"📝 wrote: {business_doc}")
    print(f"📝 wrote: {functional_doc}")
    print(f"📝 wrote: {design_doc}")
    print(f"📁 staging: {output_staging}")
    print(f"📁 output: {output_dir}")
    print("次のステップ: pending_ocr.json / pending_skills.json を処理し、staging を確定してから output を更新してください。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
