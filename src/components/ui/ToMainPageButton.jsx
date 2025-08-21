// src/components/ui/ToMainPageButton.jsx
import { useHashRouter } from "../../routing/hashRouter";
import { useApp } from "../../context/AppContext.jsx";

/**
 * Close (Go to main page) floating button.
 * - Fixed position (does not scroll)
 * - Sits below the header; tweak offsetTop if your header height changes
 * - Nice SVG cross; themable via current text color
 *
 * Props:
 *   title?: string         // tooltip/aria label (defaults to i18n Back)
 *   offsetTop?: number     // px from top viewport (default 56)
 */
export default function ToMainPageButton({ title, offsetTop = 56 }) {
  const { navigate } = useHashRouter();
  const { t } = useApp();
  const label = title || t("settings.back"); // reuse existing i18n key

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-label={label}
      title={label}
      class="fixed right-3 z-50 p-2 rounded-full
             bg-[hsl(var(--background))]/70
             hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))] 
             shadow-sm transition-colors"
      style={{ top: `${offsetTop}px` }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}
