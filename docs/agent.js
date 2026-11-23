/* عامل نمایشی محلی: تشخیص قصد، ساخت فایل نمونه و شبیه‌سازی اجرای دستور.
   هیچ درخواستی به شبکه نمی‌فرستد و همهٔ تغییرها در حافظهٔ مرورگر می‌مانند. */
window.DemoAgent = (() => {
  "use strict";

  const { SNIPPETS, RUN_OUTPUT } = window.DemoData;
  const fa = (value) => String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

  function normalize(text) {
    return String(text)
      .replace(/[ي]/g, "ی")
      .replace(/[ك]/g, "ک")
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .trim();
  }

  function lineCount(text) {
    return text.split("\n").length;
  }

  function scriptFor(text) {
    if (/اول|prime/i.test(text)) {
      return { path: "primes.py", content: SNIPPETS.primes, run: "primes" };
    }
    if (/فیبوناچی|fibonacci|fib/i.test(text)) {
      return { path: "fib.py", content: SNIPPETS.fib, run: "fib" };
    }
    if (/مرتب|sort|بزرگ‌ترین|max/i.test(text)) {
      return { path: "sort_numbers.py", content: SNIPPETS.sort, run: "sort" };
    }
    if (/سلام|hello|شروع/i.test(text)) {
      return { path: "hello.py", content: SNIPPETS.hello, run: "hello" };
    }
    const safe = text.replace(/\*\//g, "").replace(/[\r\n]+/g, " ").slice(0, 160);
    return {
      path: "main.py",
      content:
        '"""' + safe + '"""\n\n\ndef main():\n    print("سلام از دستیار دیجیتال")\n\n\nif __name__ == "__main__":\n    main()\n',
      run: "hello",
    };
  }

  function simulateCommand(files, command) {
    const cmd = String(command).trim();
    if (!cmd) return "دستور خالی است.";
    if (/^(ls|dir)\b/.test(cmd)) return Object.keys(files).sort().join("\n");
    if (/^pwd$/.test(cmd)) return "/workspace";
    if (/^git status/.test(cmd)) {
      const names = Object.keys(files);
      return (
        "On branch main\nnothing to commit, working tree clean\n\n" +
        (names.length ? "فایل‌های فضای کاری:\n" + names.map((f) => " documented " + f).join("\n") : "")
      );
    }
    const python = cmd.match(/^python3?\s+([\w./-]+\.py)$/);
    if (python) {
      const file = python[1].replace(/^\.\//, "");
      if (!files[file]) return "python: can't open file '" + file + "': [Errno 2] No such file or directory";
      const body = files[file];
      const key = /primes/.test(body) ? "primes" : /fib\(/.test(body) ? "fib" : /sorted\(/.test(body) ? "sort" : "hello";
      return RUN_OUTPUT[key] + "\n\n(خروجی شبیه‌سازی‌شده — در نسخهٔ کامل، دستور واقعاً اجرا می‌شود.)";
    }
    const echo = cmd.match(/^echo\s+(.*)$/);
    if (echo) return echo[1].replace(/^["']|["']$/g, "");
    return (
      "«" + cmd + "» در حالت نمایشی اجرا نمی‌شود؛ خروجی نمونه:\n" +
      "command finished with exit code 0\n\n" +
      "در نسخهٔ کامل، tools.py دستور را داخل پوشهٔ workspace اجرا می‌کند و دستورهای خطرناک را مسدود می‌کند."
    );
  }

  /* api: { files(), facts(), writeFile(path, content), remember(fact), openFile(path), readFile(path) } */
  function plan(raw, api) {
    const text = normalize(raw);
    const lower = text.toLowerCase();
    const files = api.files();
    const facts = api.facts();

    /* حافظه: ثبت */
    const remember = text.match(
      /(?:یادت باشه|یادت باشد|به یاد داشته باش|به خاطر بسپار|ذخیره کن|ثبت کن|remember)\s*(?:که)?\s*[:،]?\s*(.+)/i
    );
    if (remember && remember[1].trim()) {
      const fact = remember[1].trim().replace(/[.。]$/, "");
      return {
        steps: [
          {
            tool: "remember",
            args: { fact },
            apply: () => api.remember(fact),
            result: "در جدول facts ذخیره شد (id=" + fa(facts.length + 1) + ")",
          },
        ],
        reply:
          "ذخیره شد: «" + fact + "»\n\n" +
          "این حقیقت در حافظهٔ محلی مانده و در پیام‌های بعدی هم دیده می‌شود. در نسخهٔ کامل، خاطرات مرتبط خودکار به دستور سیستمی اضافه می‌شوند.",
      };
    }

    /* حافظه: بازیابی */
    if (/(چی یادت|چه چیزی یادت|خاطرات|حافظه|یادت چیه|recall|what do you remember)/i.test(lower)) {
      return {
        steps: [
          {
            tool: "recall",
            args: { query: "*" },
            result: facts.length ? facts.map((f, i) => fa(i + 1) + ". " + f).join("\n") : "(خالی)",
          },
        ],
        reply: facts.length
          ? "این‌ها را در حافظه دارم:\n\n" + facts.map((f) => "- " + f).join("\n") + "\n\nهر وقت خواستی می‌توانی از پنل کنار هم حذفشان کنی."
          : "هنوز چیزی در حافظه نیست. بنویس «یادت باشه که …» تا اولین خاطره ثبت شود.",
      };
    }

    /* خواندن فایل */
    const read = text.match(/(?:بخوان|نمایش بده|نشان بده|باز کن|cat|read|show|محتوای)\s*(?:فایل\s*)?([\w\-./]+\.\w+)?/i);
    const namedFile = (text.match(/([\w\-./]+\.(?:py|md|txt|json|html|css|js))/i) || [])[1] || "";
    if (read && (namedFile || /بخوان|باز کن|نمایش|محتوا|cat|read|show/i.test(lower))) {
      const target = namedFile || Object.keys(files)[0] || "README.md";
      const content = api.readFile(target);
      const exists = content !== null;
      return {
        steps: [
          {
            tool: "read_file",
            args: { path: target },
            result: exists ? content : "FileNotFoundError: " + target,
            apply: exists ? () => api.openFile(target) : null,
          },
        ],
        reply: exists
          ? "محتوای `" + target + "` را در پنل فضای کاری باز کردم و بالا هم آمد. این فایل فقط در مرورگر شما شبیه‌سازی شده است."
          : "فایلی با نام `" + target + "` در فضای کاری نیست. با `list_files` فهرست را ببین یا یک فایل جدید بساز.",
      };
    }

    /* فهرست فایل‌ها */
    if (/(فایل‌ها|فایل ها|لیست|فهرست|list|(^|\s)ls(\s|$)|چه فایل)/i.test(lower)) {
      const names = Object.keys(files).sort();
      return {
        steps: [{ tool: "list_files", args: { path: "." }, result: names.length ? names.join("\n") : "(خالی)" }],
        reply:
          (names.length
            ? "در فضای کاری " + fa(names.length) + " فایل هست:\n\n" + names.map((n) => "- `" + n + "`").join("\n")
            : "فضای کاری خالی است.") +
          "\n\nهمه چیز داخل پوشهٔ workspace می‌ماند؛ مسیرهای بیرون از آن در `tools.py` رد می‌شوند.",
      };
    }

    /* اجرای دستور */
    if (
      /(اجرا|run\b|دستور|command|shell|bash|git status|terminal)/i.test(lower) &&
      !/(بساز|درست کن|ایجاد|create)/i.test(lower)
    ) {
      let command = "git status --short";
      const codeMatch = text.match(/(?:دستور|command)\s*[:«"]?\s*(.+?)[»"]?$/i);
      if (/git/.test(lower)) command = "git status";
      else if (/^(ls|فهرست|لیست)/.test(lower)) command = "ls";
      else if (/python/.test(lower)) command = "python main.py";
      else if (codeMatch && codeMatch[1].length < 80) command = codeMatch[1].trim();
      return {
        steps: [{ tool: "run_command", args: { command }, result: simulateCommand(files, command) }],
        reply:
          "دستور در محیط شبیه‌سازی‌شده اجرا شد و خروجی بالا آمد. دستورهایی مثل `rm -rf /`، `shutdown` و `curl | bash` در `tools.py` مسدود شده‌اند؛ اجرای شل برای استفادهٔ محلی است، نه استقرار عمومی.",
      };
    }

    /* ساختن فایل */
    if (
      /(بساز|درست کن|ایجاد|create|write|generate|build)/i.test(lower) &&
      /(فایل|اسکریپت|برنامه|script|file|کد)/i.test(lower)
    ) {
      const script = scriptFor(text);
      return {
        steps: [
          {
            tool: "write_file",
            args: { path: script.path, content: script.content },
            apply: () => {
              api.writeFile(script.path, script.content);
              api.openFile(script.path);
            },
            result: "نوشته شد: workspace/" + script.path + " (" + fa(lineCount(script.content)) + " خط)",
          },
          {
            tool: "run_command",
            args: { command: "python " + script.path },
            result: RUN_OUTPUT[script.run] + "\n\n(شبیه‌سازی — در نسخهٔ کامل واقعاً اجرا می‌شود)",
          },
        ],
        reply:
          "فایل `" + script.path + "` در فضای کاری ساخته شد و در پنل کنار هم باز شد. برای اجرای واقعی:\n\n```\npython workspace/" +
          script.path +
          "\n```\n\nاگر خواستی محتوایش را تغییر بدهم یا فایل دیگری بسازم، همین‌جا بگو.",
      };
    }

    /* معرفی امکانات */
    if (/(چه کاری|چیکار|چه کارها|کمک|help|امکانات|قابلیت|چطور)/i.test(lower)) {
      return {
        steps: [],
        reply:
          "در این دمو می‌توانی این جریان‌ها را ببینی:\n\n" +
          "- **ساخت فایل:** «یک فایل پایتون بساز که اعداد اول را چاپ کند»\n" +
          "- **فهرست و خواندن:** «فایل‌های پوشه را لیست کن» یا «notes.txt را بخوان»\n" +
          "- **اجرای دستور:** «git status را اجرا کن»\n" +
          "- **حافظه:** «یادت باشه که …» و بعد «چه چیزی یادت هست؟»\n\n" +
          "همهٔ ابزارها شبیه‌سازی‌شده‌اند و در پنل «فضای کاری دمو» اثرشان را می‌بینی. برای پاسخ واقعی مدل، از دکمهٔ «اتصال مدل» استفاده کن.",
      };
    }

    /* سلام */
    if (/(^|\s)(سلام|درود|هی|hello|hi|های)(\s|$|[!،.])/i.test(lower)) {
      return {
        steps: [],
        reply:
          "سلام! من دموی دستیار دیجیتالم.\n\n" +
          "می‌توانم فایل بسازم، دستور اجرا کنم و خاطره‌ها را نگه دارم — همه در همین مرورگر و به‌صورت شبیه‌سازی‌شده. یکی از نمونه‌های بالا را بزن یا بنویس چه می‌خواهی.",
      };
    }

    /* پیش‌فرض */
    return {
      steps: [],
      reply:
        "این «حالت نمایشی» است و به مدلی وصل نیست، پس نمی‌توانم آزادانه دربارهٔ «" +
        text.slice(0, 60) +
        (text.length > 60 ? "…" : "") +
        "» گفتگو کنم.\n\n" +
        "برای دیدن قابلیت‌های واقعی عامل، یکی از این‌ها را امتحان کن:\n\n" +
        "- «یک فایل پایتون بساز که اعداد اول را چاپ کند»\n" +
        "- «فایل‌های پوشه را لیست کن»\n" +
        "- «یادت باشه که من توی تهران زندگی می‌کنم»\n\n" +
        "یا از دکمهٔ **اتصال مدل** یک endpoint سازگار با OpenAI وصل کن تا پاسخ آزاد و استریمی بگیری.",
    };
  }

  return { normalize, scriptFor, simulateCommand, plan };
})();
