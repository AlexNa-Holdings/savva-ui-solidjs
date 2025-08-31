// src/components/ui/ClosePageButton.jsx
import { useApp } from "../../context/AppContext.jsx";
import { useHashRouter } from "../../routing/hashRouter";

/**
 * Close (go to main tabs view) or Back (go to previous history entry) floating button.
 * @param {object} props
 * @param {string} [props.mode='back'] - 'back' for history.back(), 'close' to navigate to the main feed.
 */
export default function ClosePageButton(props) {
  const app = useApp();
  const { navigate } = useHashRouter();
  const { t } = app;
  const label = props.title || t("settings.back");
  const offsetTop = props.offsetTop ?? 56;
  const mode = props.mode || 'back';

  const handleClick = () => {
    if (mode === 'close') {
      navigate(app.lastTabRoute() || "/");
    } else {
      window.history.back();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      class="fixed right-3 z-20 p-2 rounded-full
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