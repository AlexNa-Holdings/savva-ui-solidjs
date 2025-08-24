// src/components/settings/DeveloperSection.jsx
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug";

export default function DeveloperSection() {
  const app = useApp();
  const { t } = app;

  return (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
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
    </section>
  );
}