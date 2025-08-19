// src/components/ui/BackIconButton.jsx
import { useHashRouter, navigate } from "../../routing/hashRouter";

export default function BackIconButton({ title = "Back", fallbackHref = "/" }) {
  const { route } = useHashRouter();

  function goBack() {
    let before = route();
    try {
      if (window.history.length > 1) {
        window.history.back();
        // Дадим hashchange шанс сработать; если остались на /settings — уводим вручную
        setTimeout(() => {
          const now = route();
          if (now === before || now === "/settings") {
            navigate(typeof fallbackHref === "string" ? fallbackHref : "/");
          }
        }, 60);
        return;
      }
    } catch { /* ignore */ }

    // Нет истории — уводим сразу через роутер
    navigate(typeof fallbackHref === "string" ? fallbackHref : "/");
  }

  return (
    <button
      class="p-2 rounded text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
      onClick={goBack}
      aria-label={title}
      title={title}
      type="button"
    >
      <svg viewBox="0 0 24 24" class="w-5 h-5" aria-hidden="true">
        <path
          d="M9 15L3 9m0 0l6-6M3 9h11a4 4 0 014 4v7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="sr-only">{title}</span>
    </button>
  );
}
