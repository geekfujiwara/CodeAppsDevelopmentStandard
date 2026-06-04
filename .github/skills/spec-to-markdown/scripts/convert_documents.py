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
DEFAULT_DOCS_DIR = DEFAULT_WORK_DIR / "docs"
DEFAULT_CHECKLIST_PATH = DEFAULT_WORK_DIR / "conversion-checklist.json"




def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "input フォルダの文書を /work/staging に 元ファイル名.拡張子.MD で出力し、"
            " /work/docs に要件ドキュメントを出力する"
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
        "--docs",
        help=(
            "docs 出力フォルダ。"
            f" 省略時は `{DEFAULT_DOCS_DIR}`"
        ),
    )
    parser.add_argument(
        "--output",
        help="後方互換オプション（`--docs` と同義）",
    )
    parser.add_argument(
        "--agent-ocr",
        action="store_true",
        help="画像を pending-ocr として出力し pending_ocr.json に記録する（既定: 自動判定で有効）",
    )
    parser.add_argument(
        "--checklist",
        help=(
            "conversion チェックリスト JSON のパス。"
            f" 省略時は `{DEFAULT_CHECKLIST_PATH}`"
        ),
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



def discover_files(input_path: Path, staging_dir: Path, docs_dir: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path] if input_path.suffix.lower() in SUPPORTED_EXTENSIONS else []

    output_paths = {staging_dir.resolve(), docs_dir.resolve()}
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


def read_json_list(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []

    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def is_staging_completed(staging_path: Path) -> bool:
    if not staging_path.exists():
        return False
    text = staging_path.read_text(encoding="utf-8")
    return PENDING_OCR_MARKER not in text and PENDING_SKILLS_MARKER not in text


def normalize_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return False


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
        "## 4. 要件変更履歴",
        "- 記載ルール: 変更内容と理由を必ず併記する（例: `2026-06-04: xxx を変更（理由: xxx）`）",
        "",
    ])
    return "\n".join(lines)



def write_pending_json(path: Path, payload: list[dict[str, str]]) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))



def main() -> int:
    args = parse_args()
    input_path = resolve_input_path(args.input)
    output_staging = resolve_output_path(args.staging, DEFAULT_STAGING_DIR)
    docs_dir = resolve_output_path(args.docs or args.output, DEFAULT_DOCS_DIR)
    checklist_path = resolve_output_path(args.checklist, DEFAULT_CHECKLIST_PATH)

    if not input_path.exists():
        raise SystemExit(
            "入力パスが存在しません:"
            f" {input_path}"
            f" 既定入力フォルダを使う場合は `{DEFAULT_INPUT_DIR}` にファイルを配置してください。"
        )

    files = discover_files(input_path, output_staging, docs_dir)
    if not files:
        raise SystemExit(
            "変換対象ファイルが見つかりません。"
            f" 対応拡張子: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        )

    output_staging.mkdir(parents=True, exist_ok=True)
    docs_dir.mkdir(parents=True, exist_ok=True)

    batch_started_at = datetime.now(timezone.utc).isoformat()
    agent_ocr_mode = args.agent_ocr or any(f.suffix.lower() in IMAGE_EXTENSIONS for f in files)

    if agent_ocr_mode:
        print("🖼️  画像は agent-ocr で処理します。")
    print("📄  画像以外は anthropics/skills で処理します（staging へ pending-skills を出力）。")

    base_dir = input_path if input_path.is_dir() else input_path.parent
    results: list[ConversionResult] = []
    pending_ocr_items: list[dict[str, str]] = []
    pending_skills_items: list[dict[str, str]] = []
    processed_count = 0

    existing_checklist = read_json_list(checklist_path)
    checklist_by_relative: dict[str, dict[str, object]] = {}
    for item in existing_checklist:
        relative = item.get("relative_path")
        if isinstance(relative, str) and relative:
            checklist_by_relative[relative] = item
    updated_checklist: list[dict[str, object]] = []

    for source_path in files:
        relative_path = source_path.relative_to(base_dir)
        relative_key = relative_path.as_posix()
        sha256 = sha256_of(source_path)
        previous = checklist_by_relative.get(relative_key, {})
        previous_staging = previous.get("staging_markdown_path")
        if isinstance(previous_staging, str) and previous_staging:
            staging_path = Path(previous_staging)
        else:
            staging_path = ensure_unique_staging_path(output_staging, source_path, relative_path)
        ext = source_path.suffix.lower()
        previous_sha256 = previous.get("source_sha256")
        previous_completed = normalize_bool(previous.get("is_completed"))
        actual_completed = previous_completed and is_staging_completed(staging_path)
        should_reprocess = (
            not actual_completed
            or previous_sha256 != sha256
            or not staging_path.exists()
        )

        processor = "anthropics/skills"
        status = "pending-skills"
        message = "anthropics/skills 抽出待機"
        is_completed = False

        if not should_reprocess:
            status = "already-completed"
            message = "既存 staging を再利用"
            is_completed = True
            if ext in IMAGE_EXTENSIONS:
                processor = "agent-ocr"
            elif ext in TEXT_EXTENSIONS:
                processor = "inline-text-copy"

            results.append(
                ConversionResult(
                    source_path=source_path,
                    relative_path=relative_path,
                    staging_path=staging_path,
                    status=status,
                    message=message,
                    sha256=sha256,
                )
            )
            updated_checklist.append({
                "source_path": str(source_path),
                "relative_path": relative_key,
                "staging_markdown_path": str(staging_path),
                "source_sha256": sha256,
                "processor": processor,
                "is_completed": is_completed,
                "updated_at": batch_started_at,
            })
            print(f"✅ already-completed: {relative_key} -> {staging_path.name}")
            continue

        if ext in IMAGE_EXTENSIONS:
            write_text(staging_path, build_pending_ocr_markdown(source_path))
            pending_ocr_items.append({
                "source_path": str(source_path),
                "relative_path": relative_key,
                "staging_markdown_path": str(staging_path),
                "sha256": sha256,
                "processor": "agent-ocr",
                "ocr_prompt_hint": OCR_PROMPT_HINT,
            })
            processor = "agent-ocr"
            status = "pending-ocr"
            message = "agent-ocr 待機"
            is_completed = False
            print(f"⏳ pending-ocr: {relative_key} -> {staging_path.name}")
        elif ext in TEXT_EXTENSIONS:
            try:
                text = read_text_like_file(source_path)
                write_text(staging_path, text or "_抽出結果なし_")
                processor = "inline-text-copy"
                status = "success"
                message = "utf-8 text copied"
                is_completed = True
                print(f"✅ copied-text: {relative_key} -> {staging_path.name}")
            except UnicodeDecodeError:
                write_text(staging_path, build_pending_skills_markdown(source_path))
                pending_skills_items.append({
                    "source_path": str(source_path),
                    "relative_path": relative_key,
                    "staging_markdown_path": str(staging_path),
                    "sha256": sha256,
                    "processor": "anthropics/skills",
                })
                processor = "anthropics/skills"
                status = "pending-skills"
                message = "anthropics/skills 抽出待機"
                is_completed = False
                print(f"⏳ pending-skills: {relative_key} -> {staging_path.name}")
        else:
            write_text(staging_path, build_pending_skills_markdown(source_path))
            pending_skills_items.append({
                "source_path": str(source_path),
                "relative_path": relative_key,
                "staging_markdown_path": str(staging_path),
                "sha256": sha256,
                "processor": "anthropics/skills",
            })
            processor = "anthropics/skills"
            status = "pending-skills"
            message = "anthropics/skills 抽出待機"
            is_completed = False
            print(f"⏳ pending-skills: {relative_key} -> {staging_path.name}")

        results.append(
            ConversionResult(
                source_path=source_path,
                relative_path=relative_path,
                staging_path=staging_path,
                status=status,
                message=message,
                sha256=sha256,
            )
        )
        updated_checklist.append({
            "source_path": str(source_path),
            "relative_path": relative_key,
            "staging_markdown_path": str(staging_path),
            "source_sha256": sha256,
            "processor": processor,
            "is_completed": is_completed,
            "updated_at": batch_started_at,
        })
        processed_count += 1

    pending_ocr_json = output_staging / "pending_ocr.json"
    if pending_ocr_items:
        write_pending_json(pending_ocr_json, pending_ocr_items)
        print(f"📝 wrote: {pending_ocr_json}")
    elif pending_ocr_json.exists():
        pending_ocr_json.unlink()
        print(f"🧹 removed: {pending_ocr_json}")

    pending_skills_json = output_staging / "pending_skills.json"
    if pending_skills_items:
        write_pending_json(pending_skills_json, pending_skills_items)
        print(f"📝 wrote: {pending_skills_json}")
    elif pending_skills_json.exists():
        pending_skills_json.unlink()
        print(f"🧹 removed: {pending_skills_json}")

    checklist_path.parent.mkdir(parents=True, exist_ok=True)
    write_text(
        checklist_path,
        json.dumps(
            sorted(updated_checklist, key=lambda item: str(item["relative_path"])),
            ensure_ascii=False,
            indent=2,
        ),
    )
    print(f"📝 wrote: {checklist_path}")

    business_doc = docs_dir / "business-requirements.md"
    functional_doc = docs_dir / "functional-requirements.md"
    design_doc = docs_dir / "design-requirements.md"

    if processed_count > 0 or not (business_doc.exists() and functional_doc.exists() and design_doc.exists()):
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
    else:
        print(f"✅ 未完了変換はありません。既存の `{docs_dir}` を参照して開発を進めてください。")

    print(f"📁 staging: {output_staging}")
    print(f"📁 docs: {docs_dir}")
    print(f"📋 checklist: {checklist_path}")
    print("次のステップ: checklist で is_completed=false の項目を解消し、必要時のみ docs を更新してください。")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
