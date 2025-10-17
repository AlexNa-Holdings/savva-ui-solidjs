// src/x/ui/ClosePageButton.jsx
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";

/**
 * Floating button that goes back in history, or navigates to main page if no history.
 */
export default function ClosePageButton(props) {
  const { t } = useApp();
  const label = t(props.title || "settings.back");
  const offsetTop = props.offsetTop ?? 56;

  const handleClick = () => {
    try {
      // If there's no history (page opened via direct URL), go to main page
      if (window.history.length <= 1) {
        navigate("/");
      } else {
        window.history.back();
      }
    } catch {
      // Fallback to main page if history.back() fails
      navigate("/");
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
