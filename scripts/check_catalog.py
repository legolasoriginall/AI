"""بررسی هم‌خوانی کاتالوگ مدل‌ها بین providers.py و docs/models.js.

اجرا: python scripts/check_catalog.py
اگر شناسه‌ها یا برچسب‌ها یکی نباشند با کد خروج ۱ تمام می‌شود تا CI قرمز شود.
توضیح هر مدل (note) می‌تواند متفاوت باشد؛ فقط شناسه و برچسب مقایسه می‌شوند.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from providers import MODEL_CATALOG  # noqa: E402

CATALOG_BLOCK_RE = re.compile(r"const CATALOG = \[(.*?)\n  \];", re.S)
ENTRY_RE = re.compile(r'\{\s*id: "([^"]+)",\s*label: "([^"]+)"')


def demo_catalog(docs_path: Optional[Path] = None) -> List[Tuple[str, str]]:
    text = (docs_path or ROOT / "docs" / "models.js").read_text(encoding="utf-8")
    block = CATALOG_BLOCK_RE.search(text)
    if not block:
        raise RuntimeError("بلوک CATALOG در docs/models.js پیدا نشد.")
    return ENTRY_RE.findall(block.group(1))


def compare_catalog(docs_path: Optional[Path] = None) -> List[str]:
    python_entries = [(item["id"], item["label"]) for item in MODEL_CATALOG]
    demo_entries = demo_catalog(docs_path)
    problems: List[str] = []

    if [entry[0] for entry in python_entries] != [entry[0] for entry in demo_entries]:
        problems.append(
            "فهرست شناسه‌ها یکی نیست:\n"
            f"  providers.py : {[entry[0] for entry in python_entries]}\n"
            f"  docs/models.js: {[entry[0] for entry in demo_entries]}"
        )
        return problems

    for (model_id, py_label), (_, demo_label) in zip(python_entries, demo_entries):
        if py_label != demo_label:
            problems.append(
                f"برچسب «{model_id}» یکی نیست: providers.py={py_label!r} docs/models.js={demo_label!r}"
            )
    return problems


def main() -> int:
    try:
        problems = compare_catalog()
    except RuntimeError as exc:
        print(f"خطا: {exc}")
        return 1
    if problems:
        print("ناسازگاری کاتالوگ مدل‌ها:")
        for problem in problems:
            print(f" - {problem}")
        return 1
    print(f"کاتالوگ هم‌خوان است ({len(MODEL_CATALOG)} مدل).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
