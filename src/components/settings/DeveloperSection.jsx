// src/components/settings/DeveloperSection.jsx
import { useApp } from "../../context/AppContext.jsx";
import { dbg } from "../../utils/debug";
import { Show } from "solid-js";

export default function DeveloperSection() {
  const app = useApp();
  const { t } = app;

  function dumpAppState() {
    const d = app.selectedDomain?.();
    const domainName = typeof d === "string" ? d : d?.name || "";

    const cfg = app.domainAssetsConfig?.();
    const raw = cfg?.logos ?? cfg?.logo ?? null;
    const logos = !raw
      ? null
      : (typeof raw === "string"
          ? { default: raw }
          : {
              dark_mobile:  raw.dark_mobile  ?? raw.mobile_dark  ?? null,
              light_mobile: raw.light_mobile ?? raw.mobile_light ?? null,
              mobile:       raw.mobile       ?? null,
              dark:         raw.dark         ?? null,
              light:        raw.light        ?? null,
              default:      raw.default      ?? raw.fallback     ?? null,
            });

    const ns = dbg.ns("Settings/Developer");
    ns.group("App state");
    ns.info("domain:", domainName);
    ns.info("assetsEnv:", app.assetsEnv?.());
    ns.info("assetsBaseUrl:", app.assetsBaseUrl?.());
    ns.info("domainAssetsSource:", app.domainAssetsSource?.()); // "remote" | "default" | null
    ns.info("domainAssetsPrefix:", app.domainAssetsPrefix?.());
    ns.info("domainAssetsConfig present:", !!cfg);
    ns.info("logos object:", logos);
    ns.groupEnd();
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

      {/* Enable/disable console debug logs */}
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={dbg.enabled()}
          onInput={(e) => dbg.setEnabled(e.currentTarget.checked)}
        />
        <span>{t("settings.developer.debugLogs")}</span>
      </label>

      {/* Handy one-click dump into the console */}
      <div>
        <button
          type="button"
          class="px-3 py-1.5 text-sm rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
          onClick={dumpAppState}
          title={t("settings.developer.debugLogs")}
        >
          {t("settings.developer.dumpState")}
        </button>
      </div>
    </section>
  );
}
