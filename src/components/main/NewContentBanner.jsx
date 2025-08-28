// src/components/main/NewContentBanner.jsx
import { Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { navigate } from "../../routing/hashRouter";

export default function NewContentBanner() {
  const app = useApp();
  const { t } = app;

  const handleClick = () => {
    app.setNewContentAvailable(null);
    const newPath = "/new"; // Use the simple, non-prefixed path
    if (window.location.hash.slice(1) !== newPath) {
      navigate(newPath);
    }
    app.setNewTabRefreshKey(Date.now());
  };

  return (
    <div class="fixed top-14 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-4 pointer-events-none">
      <Show when={app.newContentAvailable()}>
        <div class="pointer-events-auto">
          <button
            onClick={handleClick}
            class="w-full px-4 py-2 rounded-lg shadow-lg text-sm font-semibold transition-transform duration-300 ease-out"
            style={{ 
              background: "var(--gradient)", 
              color: "hsl(var(--card))"
            }}
          >
            {t("main.newContentAvailable")}
          </button>
        </div>
      </Show>
    </div>
  );
}