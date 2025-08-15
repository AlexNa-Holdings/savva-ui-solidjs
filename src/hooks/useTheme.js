// src/hooks/useTheme.js
import { createSignal, onMount } from "solid-js";

let themeSignal; // <-- singleton holder

export function useTheme() {
  if (!themeSignal) {
    const [theme, setTheme] = createSignal("light");

    const apply = (t) => {
      // Flip the html.dark class
      document.documentElement.classList.toggle("dark", t === "dark");
      try { localStorage.setItem("theme", t); } catch {}
    };

    onMount(() => {
      // Respect saved pref, or system
      const saved = localStorage.getItem("theme");
      const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
      const initial = saved || (systemDark ? "dark" : "light");
      setTheme(initial);
      apply(initial);
    });

    const toggleTheme = () => {
      const next = theme() === "dark" ? "light" : "dark";
      setTheme(next);
      apply(next);
    };

    themeSignal = [theme, toggleTheme];
  }
  return themeSignal;
}
