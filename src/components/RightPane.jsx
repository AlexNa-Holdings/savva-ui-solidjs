// src/components/RightPane.jsx
import { createEffect } from "solid-js";
import { useTheme } from "../hooks/useTheme";
import { useI18n, LANG_INFO } from "../i18n/useI18n";
import { navigate } from "../routing/hashRouter";

export default function RightPane({ isOpen, onClose }) {
  const [theme, toggleTheme] = useTheme();
  const { t, lang, setLang, available } = useI18n();

  createEffect(() => {
    console.log("RightPane: isOpen changed to:", isOpen());
  });

  const handlePanelClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  RightPane.theme = theme;

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-30 ${
          isOpen() ? "right-0" : "right-[-256px]"
        } transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
      >
        <div class="p-4 space-y-2">
          <button
            class="mb-4 p-2 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Theme toggle */}
          <button
            onClick={() => { toggleTheme(); console.log("Theme toggled, new theme:", theme()); }}
            class="w-full text-left px-4 py-2 bg-blue-500 dark:bg-blue-700 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-800 transition"
          >
            {theme() === "dark" ? t("ui.mode.dark") : t("ui.mode.light")}
            <span class="ml-2">{theme() === "dark" ? "🌙" : "☀️"}</span>
          </button>

          {/* Language selector */}
          <div class="pt-2">
            <label class="block text-gray-900 dark:text-gray-100 mb-1">{t("rightPane.language")}</label>
            <select
              class="w-full px-4 py-2 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700"
              value={lang()}
              onInput={(e) => setLang(e.currentTarget.value)}
            >
              {available.map((code) => {
                const info = LANG_INFO[code] || { code: code.toUpperCase(), name: code };
                return (
                  <option value={code}>
                    [{info.code}] {info.name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Settings entry */}
          <button
            class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100"
            onClick={() => { navigate("/settings"); onClose(); }}
          >
            {/* You can i18n this label later if needed */}
            Settings
          </button>
        </div>
      </div>

      {isOpen() && (
        <div
          class="fixed inset-0 bg-black opacity-20 z-20"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }}
          data-testid="overlay"
          onClick={onClose}
        />
      )}
    </>
  );
}
