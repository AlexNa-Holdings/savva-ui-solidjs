// src/components/ui/BackIconButton.jsx
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter, navigate } from "../../routing/hashRouter";

export default function BackIconButton(props) {
  const app = useApp();
  const { route } = useHashRouter();

  const label = () =>
    props.title ||
    app.t(props.titleKey || "settings.back"); // default key exists today

  const size = () => (Number(props.size) > 0 ? Number(props.size) : 20);
  const fallback = () =>
    typeof props.fallbackHref === "string" ? props.fallbackHref : "/";

  function goBack() {
    const before = route();
    let attemptedHistory = false;

    try {
      if (window.history.length > 1) {
        window.history.back();
        attemptedHistory = true;
        // Give hashchange a tick; if we didn't move, go to fallback.
        setTimeout(() => {
          const now = route();
          if (now === before) navigate(fallback());
          props.onBack?.(now, before);
        }, 80);
      }
    } catch {
      /* ignore */
    }

    if (!attemptedHistory) {
      navigate(fallback());
      props.onBack?.(route(), before);
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      class={`p-2 rounded text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] ${props.class || ""}`}
      aria-label={label()}
      title={label()}
    >
      <svg viewBox="0 0 24 24" width={size()} height={size()} aria-hidden="true">
        <path
          d="M9 15L3 9m0 0l6-6M3 9h11a4 4 0 014 4v7"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="sr-only">{label()}</span>
    </button>
  );
}
