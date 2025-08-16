// src/pages/Settings.jsx
import { useApp } from "../context/AppContext.jsx";
import LocalIpfsSection from "../components/settings/LocalIpfsSection.jsx";
import BackIconButton from "../components/ui/BackIconButton.jsx";
import Assets from "../components/settings/Assets.jsx";  

export default function Settings() {
  const app = useApp();
  const { t } = app;

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("settings.title")}</h2>
        <BackIconButton title={t("settings.back")} />
      </div>

      {/* Local IPFS (separate component) */}
      <LocalIpfsSection />

      <Assets/>

      {/* Developer */}
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        <h3 class="text-lg font-medium">{t("settings.developer.title")}</h3>

        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={app.showKeys()}
            onInput={(e) => app.setShowKeys(e.currentTarget.checked)}
          />
          <span>{t("settings.developer.showKeys")}</span>
        </label>

      </section>
    </main>
  );
}

