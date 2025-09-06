// src/pages/Settings.jsx
import { useApp } from "../../context/AppContext.jsx";
import LocalIpfsSection from "../settings/LocalIpfsSection.jsx";
import Assets from "../settings/Assets.jsx";
import DeveloperSection from "../settings/DeveloperSection.jsx";
import ClosePageButton from "../ui/ClosePageButton.jsx";
import PinningServicesSection from "../settings/PinningServicesSection.jsx";
import AISettingsSection from "../settings/AISettingsSection.jsx";


export default function Settings() {
  const app = useApp();
  const { t } = app;

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">

      <ClosePageButton />

      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("settings.title")}</h2>
      </div>

      <LocalIpfsSection />
      <PinningServicesSection />
      <AISettingsSection />
      <Assets />
      <DeveloperSection />
    </main>
  );
}