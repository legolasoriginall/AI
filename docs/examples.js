/* نمونه‌های گفتگو برای دمو: هر نمونه یک گفتگوی کامل است — درخواست کاربر،
   کارت ابزار و پاسخ نهایی. کلیک روی هر کارت، همان جریان را در دمو بازپخش می‌کند.
   هیچ درخواستی به شبکه فرستاده نمی‌شود؛ محتوای فایل‌ها از data.js می‌آید. */
window.DemoExamples = (() => {
  "use strict";

  const { SNIPPETS, RUN_OUTPUT, DEFAULT_FILES } = window.DemoData;
  const notes = DEFAULT_FILES["notes.txt"];
  const memoryFact = "کاربر در تهران زندگی می‌کند و ساعت کاری‌اش ۹ تا ۱۷ است.";

  const list = [
    {
      id: "build",
      title: "ساخت و اجرای فایل",
      summary: "یک اسکریپت می‌سازد، اجرا می‌کند و خروجی را توضیح می‌دهد.",
      tools: ["write_file", "run_command"],
      turns: [
        {
          user: "یک فایل پایتون بساز که اعداد اول زیر ۵۰ را چاپ کند.",
          steps: [
            {
              tool: "write_file",
              args: { path: "primes.py", content: SNIPPETS.primes },
              result: "نوشته شد: workspace/primes.py (" + SNIPPETS.primes.split("\n").length + " خط)",
              effect: { write: { path: "primes.py", content: SNIPPETS.primes } },
            },
            {
              tool: "run_command",
              args: { command: "python primes.py" },
              result: RUN_OUTPUT.primes + "\n\n(خروجی شبیه‌سازی‌شده — در نسخهٔ کامل واقعاً اجرا می‌شود.)",
            },
          ],
          reply:
            "فایل `primes.py` ساخته و اجرا شد:\n\n```\n" +
            RUN_OUTPUT.primes +
            "\n```\n\n" +
            "غربال اراتوستن است: یک آرایهٔ بولین تا ۵۰ می‌سازد و مضارب هر عدد اول را علامت می‌زند. فایل در پنل «فضای کاری دمو» باز شده و می‌توانی محتوایش را ببینی.",
        },
      ],
    },
    {
      id: "memory",
      title: "حافظهٔ دو نوبته",
      summary: "یک حقیقت را ذخیره می‌کند و در پیام بعدی به یاد می‌آورد.",
      tools: ["remember", "recall"],
      turns: [
        {
          user: "یادت باشه که من توی تهران زندگی می‌کنم و ساعت کاری‌ام ۹ تا ۱۷ است.",
          steps: [
            {
              tool: "remember",
              args: { fact: memoryFact },
              result: "در جدول facts ذخیره شد (id=۱)",
              effect: { remember: memoryFact },
            },
          ],
          reply:
            "ذخیره شد: «" +
            memoryFact +
            "»\n\nاز این به بعد در پاسخ‌ها به تهران و ساعت کاری‌ات توجه می‌کنم. خاطره در پنل کنار هم دیده می‌شود و در نسخهٔ کامل داخل SQLite می‌ماند.",
        },
        {
          user: "چه چیزی یادت هست؟",
          steps: [
            {
              tool: "recall",
              args: { query: "*" },
              result: "۱. " + memoryFact,
            },
          ],
          reply:
            "این را در حافظه دارم:\n\n- " +
            memoryFact +
            "\n\nهر وقت خواستی حذفش کنی، از پنل «حافظه» ضربدر بزن؛ در نسخهٔ کامل هم با ابزار `recall` قابل بازیابی است.",
        },
      ],
    },
    {
      id: "files",
      title: "گشت‌وگذار در فضای کاری",
      summary: "فهرست می‌گیرد، یک فایل را می‌خواند و بازش می‌کند.",
      tools: ["list_files", "read_file"],
      turns: [
        {
          user: "چه فایل‌هایی در فضای کاری داری؟",
          steps: [
            {
              tool: "list_files",
              args: { path: "." },
              result: "README.md\nnotes.txt",
            },
          ],
          reply:
            "دو فایل:\n\n- `README.md`\n- `notes.txt`\n\nهیچ‌کدام بیرون از پوشهٔ workspace نیستند؛ مسیرهای خارج از آن در `tools.py` رد می‌شوند.",
        },
        {
          user: "محتوای notes.txt را بخوان.",
          steps: [
            {
              tool: "read_file",
              args: { path: "notes.txt" },
              result: notes,
              effect: { open: "notes.txt" },
            },
          ],
          reply:
            "محتوای `notes.txt`:\n\n```\n" +
            notes +
            "\n```\n\nسه ایده در آن هست؛ می‌خواهی اولی را به یک اسکریپت پایتون تبدیل کنم؟",
        },
      ],
    },
    {
      id: "guard",
      title: "مرز امنیتی",
      summary: "یک دستور مخرب را اجرا نمی‌کند و دلیلش را می‌گوید.",
      tools: ["run_command"],
      turns: [
        {
          user: "دستور rm -rf / را اجرا کن.",
          steps: [
            {
              tool: "run_command",
              args: { command: "rm -rf /" },
              state: "ناموفق",
              result: "مسدود شد: دستورهای مخرب (rm -rf، shutdown، mkfs، curl | bash) پیش از اجرا در tools.py رد می‌شوند.",
            },
          ],
          reply:
            "این دستور را اجرا نمی‌کنم.\n\n" +
            "در نسخهٔ کامل، `tools.py` پیش از اجرا الگوهای مخرب را می‌گیرد و مسیرها را به پوشهٔ `workspace` محدود می‌کند؛ حتی اگر مدل چنین درخواستی بدهد، اجرا نمی‌شود. اگر می‌خواهی فایلی را پاک کنی، نام همان فایل داخل workspace را بده.",
        },
      ],
    },
  ];

  function card(sample) {
    const wrap = document.createElement("article");
    wrap.className = "card example-card";

    const title = document.createElement("h3");
    title.textContent = sample.title;
    wrap.appendChild(title);

    const summary = document.createElement("p");
    summary.textContent = sample.summary;
    wrap.appendChild(summary);

    const tools = document.createElement("div");
    tools.className = "example-tools";
    for (const tool of sample.tools) {
      const chip = document.createElement("code");
      chip.textContent = tool;
      tools.appendChild(chip);
    }
    wrap.appendChild(tools);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = "بارگذاری در دمو";
    button.addEventListener("click", () => {
      if (!window.DemoChat) return;
      window.DemoChat.play(sample);
      const demo = document.getElementById("demo");
      if (demo) demo.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    wrap.appendChild(button);

    return wrap;
  }

  function mount(container) {
    if (!container) return;
    container.innerHTML = "";
    for (const sample of list) container.appendChild(card(sample));
  }

  const grid = document.getElementById("exampleGrid");
  if (grid) mount(grid);

  return { list, mount };
})();
