// src/pages/Settings.jsx
import { navigate } from "../routing/hashRouter";
import { useI18n } from "../i18n/useI18n";

export default function Settings() {
  const { t, showKeys, setShowKeys } = useI18n();

  return (
    <div class="p-4 max-w-7xl mx-auto">
      <div class="bg-white dark:bg-gray-800 p-6 rounded shadow">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl">{t("settings.title")}</h2>
          <button
            class="px-3 py-1 rounded bg-blue-500 dark:bg-blue-700 text-white hover:bg-blue-600 dark:hover:bg-blue-800 transition"
            onClick={() => navigate("/", { replace: true })}
          >
            {t("settings.close")}
          </button>
        </div>

        {/* Debug section */}
        <section class="mt-4">
          <h3 class="font-bold mb-2 text-gray-900 dark:text-gray-100">
            {t("settings.debug.title")}
          </h3>
          <div class="rounded border border-gray-200 dark:border-gray-700 p-4">
            <label class="flex items-center gap-2 cursor-pointer text-gray-900 dark:text-gray-100">
              <input
                type="checkbox"
                class="h-4 w-4"
                checked={showKeys()}
                onInput={(e) => setShowKeys(e.currentTarget.checked)}
              />
              <span>{t("settings.debug.showKeys.label")}</span>
            </label>
            <p class="text-sm mt-2 text-gray-600 dark:text-gray-200">
              {t("settings.debug.showKeys.help")}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
