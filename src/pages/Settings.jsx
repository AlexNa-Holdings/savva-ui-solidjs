// src/pages/Settings.jsx
import { For } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import LocalIpfsSection from "../components/settings/LocalIpfsSection.jsx";
import BackButton from "../components/ui/BackIconButton.jsx";
import BackIconButton from "../components/ui/BackIconButton.jsx";

export default function Settings() {
  const app = useApp();
  const { t } = app;

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">
  {/* Title left, back icon right */}
  <div class="flex items-center justify-between">
    <h2 class="text-2xl font-semibold">{t("settings.title")}</h2>
    <BackIconButton title={t("settings.back")} />
  </div>

      {/* Local IPFS (separate component) */}
      < LocalIpfsSection />

      {/* Developer */}
      < section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        <h3 class="text-lg font-medium">{t("settings.developer.title")}</h3>

        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={app.showKeys()}
            onInput={(e) => app.setShowKeys(e.currentTarget.checked)}
          />
          <span>{t("settings.developer.showKeys")}</span>
        </label>

        <div class="bg-white/60 dark:bg-black/30 rounded p-3">
          <h4 class="font-medium mb-2">{t("settings.debug.gateways.title")}</h4>
          <ul class="list-disc pl-6 text-sm">
            <For each={app.activeIpfsGateways()}>
              {(g) => <li>{g}</li>}
            </For>
          </ul>
        </div>
      </section>
    </main >
  );
}
