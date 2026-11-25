/* صفحهٔ راه‌اندازی: تب‌ها و دکمه‌های کپی. */
(() => {
  "use strict";

  /* ------------------------------------------------------------ تب‌ها */
  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((tab) => document.getElementById(tab.getAttribute("aria-controls")));

  function selectTab(index, focus = true) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      if (panels[i]) panels[i].hidden = !active;
    });
    if (focus) tabs[index].focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(index, false));
    tab.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowLeft") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowRight") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(next);
    });
  });

  const fromHash = () => {
    const id = (location.hash || "").replace(/^#/, "");
    return tabs.findIndex((tab) => tab.id === id);
  };
  const initial = fromHash();
  if (initial > 0) selectTab(initial, false);

  /* --------------------------------------------------------- دکمهٔ کپی */
  const status = document.getElementById("copyStatus");
  let statusTimer = 0;

  function announce(text) {
    if (!status) return;
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ""; }, 2600);
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    document.body.removeChild(area);
    return ok;
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        /* برخی مرورگرها اجازه نمی‌دهند؛ سراغ روش جایگزین می‌رویم. */
      }
    }
    return fallbackCopy(text);
  }

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const target = document.querySelector(button.getAttribute("data-copy"));
      if (!target) return;
      const text = target.textContent.replace(/\n+$/, "");
      const ok = await copyText(text);
      button.classList.toggle("done", ok);
      button.textContent = ok ? "کپی شد ✓" : "کپی نشد";
      announce(ok ? "دستور در کلیپ‌بورد کپی شد." : "مرورگر اجازهٔ کپی نداد؛ متن را دستی انتخاب کنید.");
      setTimeout(() => {
        button.classList.remove("done");
        button.textContent = "کپی";
      }, 2600);
    });
  });
})();
