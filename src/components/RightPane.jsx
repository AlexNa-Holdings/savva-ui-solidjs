// src/components/RightPane.jsx
import { createEffect } from "solid-js";
import { useTheme } from "../hooks/useTheme";
import { useI18n, LANG_INFO } from "../i18n/useI18n";

export default function RightPane({ isOpen, onClose }) {
  const [theme, toggleTheme] = useTheme();
  const { t, lang, setLang, showKeys, setShowKeys, available } = useI18n(); // ← add

  createEffect(() => {
    console.log("RightPane: isOpen changed to:", isOpen()); // Debug reactivity
  });

  const handlePanelClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose(); // Close only if clicking the panel's outer edge
    }
  };

  // Pass theme to parent (App.jsx) via a prop or context
  RightPane.theme = theme; // Attach theme signal to RightPane for App.jsx access

  return (
    <>
      <div
        class={`fixed top-0 right-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-30 ${isOpen() ? "right-0" : "right-[-256px]"
          } transition-all duration-300`}
        onClick={handlePanelClick}
        data-testid="right-pane"
      >
        <div class="p-4 space-y-2"> {/* ← just added spacing between blocks */}
          <button
            class="mb-4 p-2 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Theme toggle (unchanged structure) */}
          <li class="list-none">
            <button
              onClick={() => {
                toggleTheme();
                console.log("Theme toggled, new theme:", theme()); // Debug log
              }}
              class="w-full text-left px-4 py-2 bg-blue-500 dark:bg-blue-700 text-white rounded hover:bg-blue-600 dark:hover:bg-blue-800 transition"
            >
              {theme() === "dark" ? t("ui.mode.dark") : t("ui.mode.light")}
              <span class="ml-2">{theme() === "dark" ? "🌙" : "☀️"}</span>
            </button>
          </li>

          {/* Language selector (added below theme toggle) */}
          <div>
            <label class="block text-gray-900 dark:text-gray-100 mb-1">
              {t("rightPane.language")}
            </label>
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

          {/* Show translation keys toggle */}
          <label class="flex items-center gap-2 px-1 py-2 cursor-pointer text-gray-900 dark:text-gray-100">
            <input
              type="checkbox"
              class="h-4 w-4"
              checked={showKeys()}
              onInput={(e) => setShowKeys(e.currentTarget.checked)}
            />
            <span>{t("rightPane.showKeys")}</span>
          </label>

          {/* Existing options, now translated */}
          <ul class="space-y-2">
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                {t("rightPane.option1")}
              </button>
            </li>
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                {t("rightPane.option2")}
              </button>
            </li>
            <li>
              <button class="w-full text-left px-4 py-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                {t("rightPane.option3")}
              </button>
            </li>
          </ul>
        </div>
      </div>

      {isOpen() && (
        <div
          class="fixed inset-0 bg-black opacity-20 z-20"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.2)" }} // Fallback inline style
          data-testid="overlay"
        ></div>
      )}
    </>
  );
}
