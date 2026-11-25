"""اعمال تغییرات ماندگاری مدل فعال روی docs/models.js و web/app.js.

این اسکریپت فقط جای مشخصی را عوض می‌کند و اگر الگو پیدا نشود با خطا متوقف می‌شود،
تا اشتباه روی فایل‌ها نوشته نشود. اجرای دوباره بی‌خطر است (idempotent).
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        print(f"::error::pattern not found: {label}")
        sys.exit(1)
    return text.replace(old, new, 1)


def patch(path: str, pairs):
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    original = text
    for label, old, new in pairs:
        text = replace_once(text, old, new, f"{path}: {label}")
    if text != original:
        target.write_text(text, encoding="utf-8")
        print(f"patched {path}")
    else:
        print(f"unchanged {path}")


MODELS_VERIFY = '''    await Promise.all(jobs);
    render();
    verifySavedModel();
  }

  /* مدل فعال ذخیره‌شده پس از باز کردن دوبارهٔ صفحه هم باید همان مدل باشد؛
     اگر دیگر نصب نباشد، پیام روشن می‌دهیم تا کاربر مدل تازه‌ای انتخاب کند. */
  function savedActive() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
    } catch {
      return null;
    }
  }

  function verifySavedModel() {
    const saved = savedActive();
    if (!saved || !saved.id || saved.kind !== "ollama") return;
    if (settings().model !== saved.id) return;
    if (!state.ollama.online) {
      setStatus("مدل فعال «" + saved.id + "» در دسترس نیست: Ollama پاسخ نمی‌دهد. Ollama را اجرا کنید یا مدل دیگری انتخاب کنید.", "fail");
      log("⚠ مدل فعال «" + saved.id + "» در دسترس نیست؛ Ollama پاسخ نداد.");
      return;
    }
    const installed = state.ollama.models.some(
      (item) => item.id === saved.id || item.id === saved.id + ":latest" || saved.id === item.id + ":latest"
    );
    if (!installed) {
      setStatus(
        "مدل فعال «" + saved.id + "» دیگر نصب نیست. یکی از مدل‌های زیر را انتخاب کنید یا همان مدل را دوباره دانلود کنید؛ تا آن موقع پاسخ‌های چت با خطا روبه‌رو می‌شوند.",
        "fail"
      );
      log("⚠ مدل فعال «" + saved.id + "» روی این دستگاه نصب نیست.");
    }
  }
'''

MODELS_USE = '''    log("مدل فعال: " + entry.id + " · " + LABEL[entry.source]);
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({ kind: entry.source, id: entry.id, base: entry.base }));
    } catch {
      /* حالت خصوصی */
    }
  }
'''

MODELS_ROW_OLD = '''    list.innerHTML = all
      .map(
        (entry, index) => `<li class="model-row">
          <span class="model-src ${entry.source}">${LABEL[entry.source]}</span>
          <strong class="model-name" dir="ltr">${esc(entry.id)}</strong>
          <span class="muted small model-meta">${esc([formatBytes(entry.size), entry.params].filter(Boolean).join(" · ") || "آماده")}</span>
'''

MODELS_ROW_NEW = '''    list.innerHTML = all
      .map((entry, index) => {
        const active = Boolean(settings().model) && entry.id === settings().model;
        return `<li class="model-row">
          <span class="model-src ${entry.source}">${LABEL[entry.source]}</span>
          <strong class="model-name" dir="ltr">${esc(entry.id)}</strong>
          <span class="muted small model-meta">${esc([active ? "فعال" : "", formatBytes(entry.size), entry.params].filter(Boolean).join(" · ") || "آماده")}</span>
'''

MODELS_ROW_END_OLD = '''        </li>`
      )
      .join("");
'''

MODELS_ROW_END_NEW = '''        </li>`;
      })
      .join("");
'''

APP_STATUS_OLD = '''    els.modelLabel.textContent = data.ollama_model || data.model || '';
  } catch {
'''

APP_STATUS_NEW = '''    els.modelLabel.textContent = data.ollama_model || data.model || '';
    if (data.ollama_model_missing) {
      els.statusText.textContent = data.ollama_ready
        ? `مدل فعال «${data.active_model}» نصب نیست`
        : `Ollama در دسترس نیست (مدل فعال: ${data.active_model})`;
      els.providerLabel.textContent = 'مدل فعال آماده نیست';
    }
  } catch {
'''

patch(
    "docs/models.js",
    [
        (
            "active key",
            '  const OLLAMA_KEY = "assistant.ollama.url.v1";\n',
            '  const OLLAMA_KEY = "assistant.ollama.url.v1";\n  const ACTIVE_KEY = "assistant.activeModel.v1";\n',
        ),
        ("verify saved model", "    await Promise.all(jobs);\n    render();\n  }\n", MODELS_VERIFY),
        ("remember choice", '    log("مدل فعال: " + entry.id + " · " + LABEL[entry.source]);\n  }\n', MODELS_USE),
        ("active badge", MODELS_ROW_OLD, MODELS_ROW_NEW),
        ("map close", MODELS_ROW_END_OLD, MODELS_ROW_END_NEW),
    ],
)

patch(
    "web/app.js",
    [
        (
            "missing model banner",
            APP_STATUS_OLD,
            APP_STATUS_NEW,
        ),
    ],
)

print("done")
