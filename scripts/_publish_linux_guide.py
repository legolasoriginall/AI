"""ساخت صفحهٔ راهنمای لینوکس از بستهٔ فشرده و لینک‌کردن آن از صفحهٔ راه‌اندازی (اجرای یک‌باره در CI)."""
from __future__ import annotations

import base64
import gzip
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BUNDLE = ROOT / ".publish" / "linux-cli.html.gz.b64"

html = gzip.decompress(base64.b64decode(BUNDLE.read_text(encoding="utf-8").strip())).decode("utf-8")
(DOCS / "linux-cli.html").write_text(html, encoding="utf-8")
print(f"wrote docs/linux-cli.html ({len(html)} chars)")

setup = DOCS / "setup.html"
s = setup.read_text(encoding="utf-8")
original = s

nav_anchor = '      <a href="setup.html" aria-current="page">راه‌اندازی</a>\n'
banner_anchor = '    <section class="section">\n      <div class="tabs" role="tablist" aria-label="روش‌های راه‌اندازی">'
run_anchor = '<pre><code id="cmd-flask-run">python server.py</code></pre>\n        </div>'
next_anchor = '        <a class="btn" href="https://github.com/legolasoriginall/AI" target="_blank" rel="noopener">کد منبع ↗</a>'

if 'href="linux-cli.html"' not in s:
    banner = '''    <section class="section linux-strip">
      <div class="linux-banner">
        <div>
          <strong>فقط ترمینال؟ راهنمای کامل لینوکس</strong>
          <p class="muted small">
            از نصب Ollama و ساخت venv تا systemd، سرور واسط، تونل HTTPS و عیب‌یابی — همهٔ دستورها برای خط فرمان لینوکس،
            با دکمهٔ کپی. بخش Flask این راهنما در یک محیط تازه اجرا و تأیید شده است.
          </p>
        </div>
        <a class="btn primary" href="linux-cli.html">راهنمای لینوکس (CLI) ←</a>
      </div>
    </section>

'''
    assert nav_anchor in s, "nav anchor missing"
    s = s.replace(nav_anchor, nav_anchor + '      <a href="linux-cli.html">لینوکس</a>\n', 1)

    assert banner_anchor in s, "tabs anchor missing"
    s = s.replace(
        banner_anchor,
        banner + '    <section class="section linux-strip">\n      <div class="tabs" role="tablist" aria-label="روش‌های راه‌اندازی">',
        1,
    )

    assert run_anchor in s, "flask run anchor missing"
    new_run = (
        '<pre><code id="cmd-flask-run">set -a; . ./.env; set +a      # server.py خودش .env را نمی‌خواند\n'
        'python server.py</code></pre>\n        </div>\n'
        '        <p class="muted small">\n'
        '          بدون خط اول، متغیرهای <code>.env</code> خوانده نمی‌شوند و مدل خالی می‌ماند. جزئیات بیشتر در\n'
        '          <a href="linux-cli.html">راهنمای لینوکس</a>.\n'
        '        </p>'
    )
    s = s.replace(run_anchor, new_run, 1)

    assert next_anchor in s, "setup-next anchor missing"
    s = s.replace(next_anchor, '        <a class="btn" href="linux-cli.html">راهنمای لینوکس (CLI)</a>\n' + next_anchor, 1)

if s != original:
    setup.write_text(s, encoding="utf-8")
    print("patched docs/setup.html")
else:
    print("setup page unchanged")

css = DOCS / "setup.css"
c = css.read_text(encoding="utf-8")
if ".linux-banner" not in c:
    c += '''
/* نوار معرفی راهنمای لینوکس */
.linux-strip { padding-top: 0; }
.linux-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba(108, 140, 255, .35);
  background: linear-gradient(180deg, rgba(108, 140, 255, .12), rgba(108, 140, 255, .04));
  border-radius: var(--radius);
  padding: 16px 18px;
}
.linux-banner p { margin: 4px 0 0; max-width: 70ch; }
.linux-banner .btn { flex: none; }

@media (max-width: 640px) {
  .linux-banner { flex-direction: column; align-items: flex-start; }
}
'''
    css.write_text(c, encoding="utf-8")
    print("patched docs/setup.css")
else:
    print("setup.css unchanged")

shutil.rmtree(ROOT / ".publish", ignore_errors=True)
print("done")
