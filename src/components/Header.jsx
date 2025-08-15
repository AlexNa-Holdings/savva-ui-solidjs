// src/components/Header.jsx
import { useI18n } from "../i18n/useI18n";

export default function Header({ onTogglePane }) {
  const { t } = useI18n();

  return (
    <header class="bg-white dark:bg-gray-800 shadow flex items-center justify-between p-2 sticky top-0 z-10 h-12">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 ml-2">
        {t("app.title")}
      </h1>
      <button
        class="p-1 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition"
        onClick={onTogglePane}
        aria-label="Open menu"
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
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
    </header>
  );
}
