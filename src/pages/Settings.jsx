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

        <DeveloperAssetsSection />

      </section>
    </main >
  );
}

function DeveloperAssetsSection() {
  const {
    assetsEnv,
    setAssetsEnv,
    assetsBaseUrl,
    domainAssetsPrefix,
    domainAssetsConfig,
    selectedDomain,
  } = useApp();

  const onInput = (e) => setAssetsEnv(e.currentTarget.value);

  const domainName = () => {
    const d = selectedDomain();
    if (!d) return "";
    return typeof d === "string" ? d : (d.name || "");
  };

  return (
    <section class="space-y-3">
      <h4 class="text-base font-semibold">Domain assets</h4>

      <div class="flex items-center gap-4">
        <label class="inline-flex items-center gap-2">
          <input
            type="radio"
            name="assets-env"
            value="prod"
            checked={assetsEnv() === "prod"}
            onInput={onInput}
          />
          <span>prod</span>
        </label>
        <label class="inline-flex items-center gap-2">
          <input
            type="radio"
            name="assets-env"
            value="test"
            checked={assetsEnv() === "test"}
            onInput={onInput}
          />
          <span>test</span>
        </label>
      </div>

      <dl class="text-sm grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
        <dt class="font-medium">Domain:</dt>
        <dd>{domainName() || "—"}</dd>

        <dt class="font-medium">Base URL:</dt>
        <dd>{assetsBaseUrl() || "—"}</dd>

        <dt class="font-medium">Prefix:</dt>
        <dd>{domainAssetsPrefix() || "—"}</dd>

        <dt class="font-medium">Config:</dt>
        <dd>
          <Show when={domainAssetsConfig()} fallback={<span>none</span>}>
            <span>loaded</span>
          </Show>
        </dd>
      </dl>
    </section>
  );
}

