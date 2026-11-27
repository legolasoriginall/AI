/* دکمهٔ کپی روی هر بلوک دستور در صفحهٔ راهنمای لینوکس. */
(() => {
  "use strict";

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
    } catch {
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
      } catch {
        /* جایگزین */
      }
    }
    return fallbackCopy(text);
  }

  document.querySelectorAll(".guide-body pre").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "کپی";
    button.setAttribute("aria-label", "کپی این دستورها");
    button.addEventListener("click", async () => {
      const ok = await copyText(code.textContent.replace(/\n+$/, ""));
      button.classList.toggle("done", ok);
      button.textContent = ok ? "کپی شد ✓" : "کپی نشد";
      setTimeout(() => {
        button.classList.remove("done");
        button.textContent = "کپی";
      }, 2200);
    });
    pre.appendChild(button);
  });
})();
