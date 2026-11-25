"""تست هم‌خوانی کاتالوگ مدل‌ها بین providers.py و دموی استاتیک."""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _load_checker():
    spec = importlib.util.spec_from_file_location(
        "check_catalog", ROOT / "scripts" / "check_catalog.py"
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_catalog_is_consistent():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "check_catalog.py")],
        capture_output=True,
        text=True,
        cwd=ROOT,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "هم‌خوان است" in result.stdout


def test_checker_detects_a_mismatched_model(tmp_path):
    checker = _load_checker()
    source = (ROOT / "docs" / "models.js").read_text(encoding="utf-8")
    broken = source.replace('{ id: "gemma2:2b"', '{ id: "gemma2:9b"')
    assert broken != source
    target = tmp_path / "models.js"
    target.write_text(broken, encoding="utf-8")
    problems = checker.compare_catalog(target)
    assert problems
    assert "gemma2" in " ".join(problems)


def test_checker_detects_a_mismatched_label(tmp_path):
    checker = _load_checker()
    source = (ROOT / "docs" / "models.js").read_text(encoding="utf-8")
    broken = source.replace('label: "Qwen 2.5 3B"', 'label: "Qwen 3B"')
    assert broken != source
    target = tmp_path / "models.js"
    target.write_text(broken, encoding="utf-8")
    problems = checker.compare_catalog(target)
    assert any("برچسب" in problem for problem in problems)


def test_demo_catalog_parses_all_models():
    checker = _load_checker()
    entries = checker.demo_catalog()
    assert len(entries) == len(checker.MODEL_CATALOG)
    for model_id, label in entries:
        assert model_id and label


@pytest.mark.skipif(shutil.which("node") is None, reason="node در این محیط نصب نیست")
@pytest.mark.parametrize("path", ["docs/models.js", "docs/app.js", "web/app.js"])
def test_js_files_parse_with_node(path):
    result = subprocess.run(
        ["node", "--check", str(ROOT / path)], capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
