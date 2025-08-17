// src/pages/Settings.jsx
import { useApp } from "../context/AppContext.jsx";
import LocalIpfsSection from "../components/settings/LocalIpfsSection.jsx";
import BackIconButton from "../components/ui/BackIconButton.jsx";
import Assets from "../components/settings/Assets.jsx";
import DeveloperSection from "../components/settings/DeveloperSection.jsx";

export default function Settings() {
  const app = useApp();
  const { t } = app;

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("settings.title")}</h2>
        <BackIconButton title={t("settings.back")} />
      </div>

      <LocalIpfsSection />
      <Assets />
      <DeveloperSection />
    </main>
  );
}
