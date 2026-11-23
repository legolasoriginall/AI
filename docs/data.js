/* دادهٔ ثابت دمو: فایل‌های اولیهٔ فضای کاری، نمونه‌کدها و خروجی دستورها */
window.DemoData = {
  DEFAULT_FILES: {
    "README.md":
      "# فضای کاری دمو\n\nاین پوشه در مرورگر شما شبیه‌سازی شده است و هیچ فایلی روی دیسک نوشته نمی‌شود.\nابزارهای write_file و list_files در نسخهٔ کامل، همین کار را روی پوشهٔ workspace واقعی انجام می‌دهند.",
    "notes.txt":
      "ایده‌ها:\n- یک اسکریپت پایتون برای اعداد اول بسازم\n- خروجی گزارش‌ها را مرتب کنم\n- git status را چک کنم",
  },

  SNIPPETS: {
    primes:
      "def primes(limit):\n" +
      "    sieve = [True] * (limit + 1)\n" +
      "    sieve[0:2] = [False, False]\n" +
      "    for n in range(2, int(limit ** 0.5) + 1):\n" +
      "        if sieve[n]:\n" +
      "            for m in range(n * n, limit + 1, n):\n" +
      "                sieve[m] = False\n" +
      "    return [i for i, ok in enumerate(sieve) if ok]\n" +
      "\n" +
      "\nif __name__ == \"__main__\":\n" +
      "    print(primes(50))\n",
    fib:
      "def fib(count):\n" +
      "    a, b = 0, 1\n" +
      "    out = []\n" +
      "    for _ in range(count):\n" +
      "        out.append(a)\n" +
      "        a, b = b, a + b\n" +
      "    return out\n" +
      "\n" +
      "\nif __name__ == \"__main__\":\n" +
      "    print(fib(12))\n",
    sort:
      "numbers = [42, 7, 19, 3, 88, 15]\n" +
      "print(\"مرتب‌شده:\", sorted(numbers))\n" +
      "print(\"بزرگ‌ترین:\", max(numbers))\n",
    hello:
      "def main():\n" +
      "    print(\"سلام! این فایل توسط دستیار دیجیتال ساخته شد.\")\n" +
      "\n" +
      "\nif __name__ == \"__main__\":\n" +
      "    main()\n",
  },

  RUN_OUTPUT: {
    primes: "([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47])",
    fib: "([0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89])",
    sort: "مرتب‌شده: [3, 7, 15, 19, 42, 88]\nبزرگ‌ترین: 88",
    hello: "سلام! این فایل توسط دستیار دیجیتال ساخته شد.",
  },
};
