"""موقت: دکمه/وضعیت «تست اتصال» را به فرم تنظیمات و استایل‌ها اضافه می‌کند."""
from __future__ import annotations

from pathlib import Path

ACTIONS_OLD = """            <button class="btn primary" type="submit">ذخیره و استفاده</button>
            <button class="btn" type="button" id="disconnect">قطع اتصال</button>"""

ACTIONS_NEW = """            <button class="btn primary" type="submit">ذخیره و استفاده</button>
            <button class="btn" type="button" id="testProxy">تست اتصال</button>
            <button class="btn" type="button" id="disconnect">قطع اتصال</button>"""

FORM_END_OLD = """          </div>
        </form>

        <div class="chat-body">"""

FORM_END_NEW = """          </div>
          <p class="settings-status hidden" id="proxyStatus" role="status" aria-live="polite"></p>
        </form>

        <div class="chat-body">"""

SCRIPT_OLD = """  <script src="models.js"></script>"""
SCRIPT_NEW = """  <script src="models.js"></script>
  <script src="connect-test.js"></script>"""

CSS_OLD = ".settings-actions .small { padding: 0; color: var(--muted); flex: 1; min-width: 180px; }"

CSS_NEW = """.settings-actions .small { padding: 0; color: var(--muted); flex: 1; min-width: 180px; }
.settings-status {
  margin: 10px 0 0;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel);
  font-size: 12px;
  line-height: 1.9;
  white-space: pre-line;
}
.settings-status[data-tone="ok"] { border-color: rgba(55, 211, 153, .45); color: var(--ok); background: rgba(55, 211, 153, .07); }
.settings-status[data-tone="warn"] { border-color: rgba(255, 181, 69, .45); color: var(--warn); background: rgba(255, 181, 69, .07); }
.settings-status[data-tone="err"] { border-color: rgba(255, 107, 129, .45); color: var(--danger); background: rgba(255, 107, 129, .07); }"""


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path.name}: لنگر {count} بار پیدا شد.")
    path.write_text(text.replace(old, new), encoding="utf-8")


def apply(root: Path) -> None:
    index = root / "docs" / "index.html"
    replace_once(index, ACTIONS_OLD, ACTIONS_NEW)
    replace_once(index, FORM_END_OLD, FORM_END_NEW)
    replace_once(index, SCRIPT_OLD, SCRIPT_NEW)
    replace_once(root / "docs" / "style.css", CSS_OLD, CSS_NEW)


if __name__ == "__main__":
    apply(Path(__file__).resolve().parent.parent)
    print("دکمه و وضعیت تست اتصال اضافه شد.")
