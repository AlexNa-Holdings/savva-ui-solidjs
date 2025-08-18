// src/hooks/useTheme.js
import { createSignal, onMount } from "solid-js";

export function useTheme() {
  const [theme, setTheme] = createSignal("light");

  onMount(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
    document.documentElement.classList.toggle("dark", savedTheme === "dark");
  });

  const toggleTheme = () => {
    const next = theme() === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try { localStorage.setItem("theme", next); } catch {}
  };

  // Expose theme signal for external use
  useTheme.theme = theme;

  return [theme, toggleTheme];
}