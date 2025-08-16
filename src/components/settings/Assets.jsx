// src/components/settings/Assets.jsx
import { createSignal, createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext";
import { assessAssets } from "../../utils/assetsDiagnostics";

export default function Assets() {
  const app = useApp();
  const { t } = app;

  // env switching (prod/test)
  const env = createMemo(() => app.assetsEnv?.() || "prod");
  const [busySwitch, setBusySwitch] = createSignal(false);

  async function switchEnv(next) {
    if (next === env()) return;
    try {
      setBusySwitch(true);
      if (typeof app.setAssetsEnv === "function") {
        app.setAssetsEnv(next);
        // if the context exposes a refresh helper, call it
        if (typeof app.refreshDomainAssets === "function") {
          await app.refreshDomainAssets();
        }
      } else {
        // Fallback: soft reload to let the app pick env on boot
        // (only used if setAssetsEnv isn't available)
        location.reload();
      }
    } finally {
      setBusySwitch(false);
    }
  }

  // diagnostics
  const [busyDiag, setBusyDiag] = createSignal(false);
  const [report, setReport] = createSignal(null);
  const [err, setErr] = createSignal(null);

  async function runDiagnostics() {
    setBusyDiag(true);
    setErr(null);
    try {
      const r = await assessAssets({
        env: app.assetsEnv?.(),
        assetsBaseUrl: app.assetsBaseUrl?.(),
        selectedDomainName: (() => {
          const d = app.selectedDomain?.();
          return typeof d === "string" ? d : (d?.name || "");
        })(),
        domainAssetsPrefixActive: app.domainAssetsPrefix?.(),
        domainAssetsConfig: app.domainAssetsConfig?.(),
        domainAssetsSource: app.domainAssetsSource?.(),
      });
      setReport(r);
    } catch (e) {
      setErr(e);
    } finally {
      setBusyDiag(false);
    }
  }

  const Row = (props) => (
    <div class="grid grid-cols-[180px_1fr] gap-2 py-1">
      <div class="text-sm text-gray-500">{props.label}</div>
      <div class="text-sm break-all">{props.children}</div>
    </div>
  );

  return (
    <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-4">
      {/* Header + Env switch */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-medium">
          {t("settings.dev.assets.title") /* "Assets" */}
        </h3>

        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">
            {t("settings.dev.assets.env") /* "Environment" */}
          </span>
          <div class="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              class={`px-3 py-1.5 text-sm ${env() === "prod" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-transparent text-gray-700 dark:text-gray-200"}`}
              disabled={busySwitch()}
              onClick={() => switchEnv("prod")}
            >
              {t("settings.dev.assets.env.prod") /* "Prod" */}
            </button>
            <button
              class={`px-3 py-1.5 text-sm border-l border-gray-300 dark:border-gray-600 ${env() === "test" ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-transparent text-gray-700 dark:text-gray-200"}`}
              disabled={busySwitch()}
              onClick={() => switchEnv("test")}
            >
              {t("settings.dev.assets.env.test") /* "Test" */}
            </button>
          </div>
        </div>
      </div>

      {/* Quick facts */}
      <div class="rounded-md bg-gray-50 dark:bg-gray-900 p-3 space-y-1">
        <Row label={t("settings.dev.assets.env")}>{env()}</Row>
        <Row label={t("settings.dev.assets.baseUrl")}>{app.assetsBaseUrl?.() || "—"}</Row>
        <Row label={t("settings.dev.assets.prefix.active")}>{app.domainAssetsPrefix?.() || "—"}</Row>
        <Row label={t("settings.dev.assets.source")}>{app.domainAssetsSource?.() || "—"}</Row>
      </div>

      {/* Diagnostics block */}
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium">{t("settings.dev.assets.diagnostics.title")}</div>
        <button
          class="px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          onClick={runDiagnostics}
          disabled={busyDiag()}
        >
          {busyDiag() ? t("common.loading") : t("settings.dev.assets.diagnostics.run")}
        </button>
      </div>

      {err() && (
        <div class="text-sm text-red-400">
          {t("settings.dev.assets.diagnostics.error")}: {String(err())}
        </div>
      )}

      <Show when={report()}>
        <div class="space-y-2">
          <Row label={t("settings.dev.assets.domain")}>{report().domain || "—"}</Row>
          <Row label={t("settings.dev.assets.prefix.computed")}>{report().computedDomainPrefix || "—"}</Row>
          <Row label={t("settings.dev.assets.configUrl")}>{report().appConfigUrl || "—"}</Row>

          <div class="pt-2">
            <div class="text-sm font-semibold">{t("settings.dev.assets.diagnostics.configChecks")}</div>
            <div class="mt-1 text-xs">
              <div>• {t("settings.dev.assets.diagnostics.primary")}: {report().primaryConfig.url} — {report().primaryConfig.exists ? t("common.exists") : t("common.notFound")} ({report().primaryConfig.status})</div>
              <div>• {t("settings.dev.assets.diagnostics.default")}: {report().defaultConfig.url} — {report().defaultConfig.exists ? t("common.exists") : t("common.notFound")} ({report().defaultConfig.status})</div>
            </div>
          </div>

          <div class="pt-2">
            <div class="text-sm font-semibold">{t("settings.dev.assets.diagnostics.configSummary")}</div>
            <div class="mt-1 text-xs">
              <div>• {t("settings.dev.assets.diagnostics.hasConfig")}: {String(report().appParsedConfigPresence.hasConfigObject)}</div>
              <div>• {t("settings.dev.assets.diagnostics.hasLogos")}: {String(report().appParsedConfigPresence.hasLogos)} ({(report().appParsedConfigPresence.logoFields || []).join(", ") || "—"})</div>
              <div>• {t("settings.dev.assets.diagnostics.hasLocales")}: {String(report().appParsedConfigPresence.hasLocales)}</div>
              <div>• {t("settings.dev.assets.diagnostics.hasTabs")}: {String(report().appParsedConfigPresence.hasTabs)}</div>
              <div>• {t("settings.dev.assets.diagnostics.hasCategories")}: {String(report().appParsedConfigPresence.hasCategories)}</div>
            </div>
          </div>

          <Show when={report().resolvedSamples?.length}>
            <div class="pt-2">
              <div class="text-sm font-semibold">{t("settings.dev.assets.diagnostics.sampleFetches")}</div>
              <ul class="mt-1 space-y-1 text-xs">
                {report().resolvedSamples.map((s) => (
                  <li>
                    {s.kind}: {s.url} — {s.exists ? t("common.ok") : t("common.fail")} ({s.status})
                  </li>
                ))}
              </ul>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
