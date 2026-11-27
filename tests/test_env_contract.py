"""قرارداد .env: cli.py خودش فایل را می‌خواند و OLLAMA_MODEL/OLLAMA_URL را اعمال می‌کند."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = ["cli.py", "agent.py", "providers.py", "store.py", "tools.py"]


def test_dotenv_values_reach_the_cli(tmp_path):
    for name in MODULES:
        shutil.copy(ROOT / name, tmp_path / name)
    (tmp_path / ".env").write_text(
        "OLLAMA_URL=http://127.0.0.1:9\nOLLAMA_MODEL=qwen2.5:3b\n", encoding="utf-8"
    )

    env = {key: value for key, value in os.environ.items() if key not in {"OLLAMA_MODEL", "OLLAMA_URL"}}
    env["PYTHONPATH"] = str(tmp_path)
    proc = subprocess.run(
        [sys.executable, "cli.py"],
        cwd=tmp_path,
        env=env,
        input="/status\n/models\n/exit\n",
        text=True,
        capture_output=True,
        timeout=90,
    )

    assert proc.returncode == 0, proc.stderr
    # متغیرهای شل از محیط فرزند حذف شده‌اند؛ پس هرچه دیده می‌شود از .env آمده است.
    assert "مدل محلی فعال: qwen2.5:3b" in proc.stdout
    assert "Ollama: http://127.0.0.1:9" in proc.stdout
