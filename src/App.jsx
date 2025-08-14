import { createSignal, onMount } from "solid-js";

export default function App() {
  const [theme, setTheme] = createSignal("light");

  onMount(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  });

  const toggleTheme = () => {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  };

  return (
    <div class="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header class="border-b border-neutral-200 dark:border-neutral-800">
        <nav class="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <div class="font-semibold tracking-wide">SAVVA · SolidJS</div>
          <button
            type="button"
            onClick={toggleTheme}
            class="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 hover:border-emerald-400 dark:hover:border-emerald-400 transition text-sm"
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            <span class="hidden sm:inline">
              {theme() === "dark" ? "Dark" : "Light"} mode
            </span>
            <span aria-hidden="true">{theme() === "dark" ? "🌙" : "☀️"}</span>
          </button>
        </nav>
      </header>

      <main class="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <h1 class="text-2xl font-bold">Hello, Alex 👋</h1>
        <button class="rounded-xl px-4 py-2 border border-neutral-300 dark:border-neutral-700 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300 transition">
          Tailwind works?
        </button>
      </main>
    </div>
  );
}
