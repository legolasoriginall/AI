/* رندر مارک‌داون سبک برای پاسخ‌های دستیار: پاراگراف، لیست، عنوان و بلوک کد */
window.DemoMarkdown = (() => {
  "use strict";

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function inline(text) {
    const frag = document.createDocumentFragment();
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("`") && part.endsWith("`")) {
        frag.appendChild(el("code", "", part.slice(1, -1)));
      } else if (part.startsWith("**") && part.endsWith("**")) {
        frag.appendChild(el("strong", "", part.slice(2, -2)));
      } else if (/^\[[^\]]+\]\([^)]+\)$/.test(part)) {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const href = match[2].trim();
        if (/^https?:\/\//i.test(href)) {
          const link = el("a", "md-link", match[1]);
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          frag.appendChild(link);
        } else {
          frag.appendChild(document.createTextNode(match[1]));
        }
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    return frag;
  }

  function render(text) {
    const frag = document.createDocumentFragment();
    const lines = String(text).replace(/\r/g, "").split("\n");
    let paragraph = [];
    let list = null;

    const flushParagraph = () => {
      if (!paragraph.length) return;
      const p = el("p");
      p.appendChild(inline(paragraph.join(" ")));
      frag.appendChild(p);
      paragraph = [];
    };
    const flushList = () => {
      if (list) frag.appendChild(list);
      list = null;
    };
    const flushAll = () => {
      flushParagraph();
      flushList();
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^```/.test(trimmed)) {
        flushAll();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i++;
        }
        const pre = el("pre", "md-code");
        pre.appendChild(el("code", "", codeLines.join("\n")));
        frag.appendChild(pre);
        continue;
      }

      if (!trimmed) {
        flushAll();
        continue;
      }

      const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
      const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
      if (bullet || numbered) {
        flushParagraph();
        const tag = bullet ? "ul" : "ol";
        if (!list || list.tagName.toLowerCase() !== tag) {
          flushList();
          list = el(tag, "md-list");
        }
        const li = el("li");
        li.appendChild(inline((bullet || numbered)[1]));
        list.appendChild(li);
        continue;
      }

      const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        flushAll();
        const h = el("h" + (heading[1].length + 3), "md-heading");
        h.appendChild(inline(heading[2]));
        frag.appendChild(h);
        continue;
      }

      if (list) {
        list.lastChild.appendChild(document.createTextNode(" " + trimmed));
        continue;
      }

      paragraph.push(trimmed);
    }
    flushAll();
    return frag;
  }

  return { render, inline };
})();
