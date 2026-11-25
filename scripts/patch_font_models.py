"""موقت: فونت محلی و بارگذاری تنبل models.js را به سایت استاتیک اضافه می‌کند."""
from __future__ import annotations

from pathlib import Path

FONT_LINK_OLD = """  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;600;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="style.css" />"""

FONT_LINK_NEW = """  <link rel="preload" href="fonts/vazirmatn-arabic.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="style.css" />"""

SCRIPT_OLD = "  <script src=\"models.js\"></script>\n"
SCRIPT_NEW = ""

CSS_OLD = """  --max: 1140px;
}"""

CSS_NEW = """  --max: 1140px;
}

/* فونت فارسی به‌صورت محلی (زیرمجموعهٔ عربی/فارسی)، بدون درخواست به Google Fonts */
@font-face {
  font-family: "Vazirmatn";
  src: url("fonts/vazirmatn-arabic.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFF;
}"""

APP_OLD = """  /* ------------------------------------------------------------ آغاز */
  loadSettings();
  loadWorkspace();
  renderWorkspace();
  if (window.DemoModels) window.DemoModels.init();
})();"""

APP_NEW = """  /* ------------------------------------------- بارگذاری تنبل مدیر مدل‌ها */
  let modelsPromise = null;
  let modelsStarted = false;

  function startModels() {
    if (modelsStarted || !window.DemoModels) return;
    modelsStarted = true;
    window.DemoModels.init();
  }

  function loadModels() {
    if (window.DemoModels) {
      startModels();
      return Promise.resolve();
    }
    if (modelsPromise) return modelsPromise;
    modelsPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "models.js";
      script.async = true;
      script.onload = () => {
        startModels();
        resolve();
      };
      script.onerror = () => {
        modelsPromise = null;
        reject(new Error("models.js بارگذاری نشد"));
      };
      document.head.appendChild(script);
    });
    return modelsPromise;
  }

  const modelsSection = $("#models");
  if (modelsSection && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          loadModels().catch(() => {});
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(modelsSection);
  }

  document.querySelectorAll('a[href="#models"], #openModels').forEach((link) => {
    link.addEventListener("click", () => {
      loadModels()
        .then(() => {
          if (modelsSection) modelsSection.scrollIntoView({ behavior: "smooth", block: "start" });
        })
        .catch(() => {
          sysNotice("مدیر مدل‌ها بارگذاری نشد؛ اتصال شبکه را بررسی کنید.", true);
        });
    });
  });

  /* ------------------------------------------------------------ آغاز */
  loadSettings();
  loadWorkspace();
  renderWorkspace();
})();"""


def patch(path: Path, pairs: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    # اول همهٔ لنگرها را بررسی می‌کنیم تا فایل نیمه‌کاره نوشته نشود.
    for old, _ in pairs:
        count = text.count(old)
        if count != 1:
            raise SystemExit(f"{path.name}: لنگر {count} بار پیدا شد: {old.splitlines()[0][:60]!r}")
    for old, new in pairs:
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")


def apply(root: Path) -> None:
    patch(
        root / "docs" / "index.html",
        [(FONT_LINK_OLD, FONT_LINK_NEW), (SCRIPT_OLD, SCRIPT_NEW)],
    )
    patch(root / "docs" / "style.css", [(CSS_OLD, CSS_NEW)])
    patch(root / "docs" / "app.js", [(APP_OLD, APP_NEW)])


if __name__ == "__main__":
    apply(Path(__file__).resolve().parent.parent)
    print("فونت محلی و بارگذاری تنبل models.js اعمال شد.")
