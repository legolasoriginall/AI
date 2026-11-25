"""تست‌های اسکریپت استقرار Worker: نحو، dry-run و اینکه کلید هیچ‌جا لو نمی‌رود."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "deploy_worker.sh"

pytestmark = pytest.mark.skipif(shutil.which("bash") is None, reason="bash در دسترس نیست")


def run_script(*args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(SCRIPT), *args],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=ROOT,
        env={"PATH": "/usr/local/bin:/usr/bin:/bin", **(env or {})},
    )


def test_script_exists_and_is_valid_bash():
    assert SCRIPT.is_file()
    result = subprocess.run(["bash", "-n", str(SCRIPT)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr


def test_dry_run_lists_all_four_steps():
    result = run_script("--dry-run")
    assert result.returncode == 0, result.stderr
    out = result.stdout
    assert "[1/4]" in out and "whoami" in out
    assert "[2/4]" in out and "secret list" in out and "secret put NUMES_API_KEY" in out
    assert "[3/4]" in out and "deploy" in out
    assert "[4/4]" in out and "node worker/smoke.mjs" in out


def test_dry_run_needs_no_node_or_wrangler():
    # PATH عمداً خالی از node/npx است؛ dry-run نباید به آن‌ها نیاز داشته باشد.
    result = run_script("--dry-run", env={"PATH": "/usr/bin:/bin"})
    assert result.returncode == 0, result.stderr


def test_dry_run_honours_custom_secret_and_skip_smoke():
    result = run_script("--dry-run", "--secret", "MY_KEY", "--skip-smoke")
    assert result.returncode == 0, result.stderr
    assert "secret put MY_KEY" in result.stdout
    assert "MY_KEY" in result.stdout


def test_invalid_secret_name_is_rejected():
    result = run_script("--dry-run", "--secret", "bad-name")
    assert result.returncode == 2
    assert "Secret" in result.stderr


def test_unknown_flag_is_rejected():
    result = run_script("--nope")
    assert result.returncode == 2
    assert "ناشناخته" in result.stderr


def test_help_documents_options():
    result = run_script("--help")
    assert result.returncode == 0
    for needle in ("--dry-run", "--skip-smoke", "--secret"):
        assert needle in result.stdout


def test_key_is_piped_not_passed_as_argument():
    text = SCRIPT.read_text(encoding="utf-8")
    # کلید باید از stdin برود، نه argv (argv در ps دیده می‌شود).
    assert "printf '%s' \"${!SECRET_NAME}\" |" in text
    assert 'secret put "$SECRET_NAME"' in text


def test_script_never_writes_key_to_a_file():
    text = SCRIPT.read_text(encoding="utf-8")
    for leaked in (".dev.vars", ">> .env", "> .env"):
        assert leaked not in text


def test_script_prefixes_every_call_with_worker_dir():
    text = SCRIPT.read_text(encoding="utf-8")
    assert 'cd "$WORKER_DIR"' in text


def test_full_flow_with_fake_wrangler(tmp_path):
    """whoami → secret put (از stdin) → deploy → smoke، همه با wrangler و node جعلی."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "calls.log"

    wrangler = bin_dir / "wrangler"
    wrangler.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f'echo "WRANGLER $*" >> "{log}"\n'
        'case "$1" in\n'
        '  whoami) echo "logged in" ;;\n'
        '  secret)\n'
        '    if [ "$2" = "list" ]; then echo \'[{"name":"OTHER_KEY"}]\'; else\n'
        '      value="$(cat)"; echo "SECRET_STDIN_LEN=${#value}" >> "' + str(log) + '"\n'
        '    fi ;;\n'
        '  deploy)\n'
        '    echo "Deployed"; echo "https://ai-assistant-proxy.test.workers.dev" ;;\n'
        "esac\n",
        encoding="utf-8",
    )
    wrangler.chmod(0o755)

    node = bin_dir / "node"
    node.write_text(
        "#!/usr/bin/env bash\n" + f'echo "NODE $* WORKER_URL=${{WORKER_URL:-}}" >> "{log}"\n' + "exit 0\n",
        encoding="utf-8",
    )
    node.chmod(0o755)

    npx = bin_dir / "npx"
    npx.write_text("#!/usr/bin/env bash\nexit 1\n", encoding="utf-8")
    npx.chmod(0o755)

    key = "test-key-1234567890"
    result = subprocess.run(
        ["bash", str(SCRIPT)],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=ROOT,
        env={"PATH": f"{bin_dir}:/usr/bin:/bin", "WRANGLER": str(wrangler), "NUMES_API_KEY": key},
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "https://ai-assistant-proxy.test.workers.dev" in result.stdout
    calls = log.read_text(encoding="utf-8")
    assert "WRANGLER whoami" in calls
    assert "secret list" in calls
    assert "secret put NUMES_API_KEY" in calls
    assert f"SECRET_STDIN_LEN={len(key)}" in calls
    assert "WRANGLER deploy" in calls
    assert "smoke.mjs" in calls and "ai-assistant-proxy.test.workers.dev" in calls
    # کلید نباید در argv (و در نتیجه در لاگ/ps) دیده شود.
    assert key not in calls
    assert key not in result.stdout + result.stderr
