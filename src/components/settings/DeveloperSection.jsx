// src/components/settings/DeveloperSection.jsx
/* src/components/settings/DeveloperSection.jsx */
import { Show, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug";

export default function DeveloperSection() {
  const app = useApp();
  const { t } = app;
  const [copied, setCopied] = createSignal(false);

  async function copyLog() {
    const ok = await dbg.copy();
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
      <h3 class="text-lg font-medium">{t("settings.developer.title")}</h3>

      {/* Show translation keys */}
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={app.showKeys()}
          onInput={(e) => app.setShowKeys(e.currentTarget.checked)}
        />
        <span>{t("settings.developer.showKeys")}</span>
      </label>

      {/* Enable debug logging */}
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={dbg.enabled()}
          onInput={(e) => dbg.enable(e.currentTarget.checked)}
        />
        <span>{t("settings.developer.debug.enable")}</span>
      </label>

      <div class="flex gap-2">
        <button class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={copyLog}>
          {t("settings.developer.debug.copy")}
        </button>
        <button class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={() => dbg.clear()}>
          {t("settings.developer.debug.clear")}
        </button>
      </div>

      <Show when={copied()}>
        <div class="text-xs opacity-70">{t("settings.developer.debug.copied")}</div>
      </Show>
    </section>
  );
}
