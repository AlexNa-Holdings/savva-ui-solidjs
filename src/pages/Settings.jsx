// src/pages/Settings.jsx
import { useApp } from "../context/AppContext.jsx";
import LocalIpfsSection from "../components/settings/LocalIpfsSection.jsx";
import Assets from "../components/settings/Assets.jsx";
import DeveloperSection from "../components/settings/DeveloperSection.jsx";
import ClosePageButton from "../components/ui/ClosePageButton.jsx";
import FishIconTest from '../dev/FishIconTest.jsx';

export default function Settings() {
  const app = useApp();
  const { t } = app;

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">

      <ClosePageButton />

      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-semibold">{t("settings.title")}</h2>
      </div>

      <FishIconTest />

      <LocalIpfsSection />
      <Assets />
      <DeveloperSection />
    </main>
  );
}
