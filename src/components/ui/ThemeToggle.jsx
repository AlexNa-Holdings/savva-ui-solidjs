// src/components/ui/ThemeIconToggle.jsx
import { useTheme } from "../../hooks/useTheme";
import { useApp } from "../../context/AppContext.jsx";

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path d="M12 4V2M12 22v-2M4.93 4.93L3.51 3.51M20.49 20.49l-1.42-1.42M4 12H2M22 12h-2M4.93 19.07L3.51 20.49M20.49 3.51l-1.42 1.42" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/>
    </svg>
  );
}
function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
    </svg>
  );
}

export default function ThemeIconToggle(props) {
  const [theme, toggleTheme] = useTheme();
  const app = useApp();

  const isDark = () => theme() === "dark";

  return (
    <div class="themed-segment" role="group" aria-label={app.t("rightPane.theme")}>
      <button
        class={`themed-pill themed-pill--icon ${!isDark() ? "is-active" : ""}`}
        aria-pressed={!isDark()}
        aria-label={app.t("ui.mode.light")}
        onClick={() => { if (isDark()) toggleTheme(); }}
        title={app.t("ui.mode.light")}
        type="button"
      >
        <SunIcon />
      </button>
      <button
        class={`themed-pill themed-pill--icon ${isDark() ? "is-active" : ""}`}
        aria-pressed={isDark()}
        aria-label={app.t("ui.mode.dark")}
        onClick={() => { if (!isDark()) toggleTheme(); }}
        title={app.t("ui.mode.dark")}
        type="button"
      >
        <MoonIcon />
      </button>
    </div>
  );
}
