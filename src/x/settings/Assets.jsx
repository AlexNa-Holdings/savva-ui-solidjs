// src/x/settings/Assets.jsx
import { createSignal, createMemo, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { assessAssets } from "../../utils/assetsDiagnostics.js";

export default function Assets() {
  const app = useApp();
  const { t } = app;

  const env = createMemo(() => app.assetsEnv?.() || "prod");
  const [busySwitch, setBusySwitch] = createSignal(false);
  async function switchEnv(next) {
    if (next === env()) return;
    try {
      setBusySwitch(true);
      app.setAssetsEnv?.(next);
      await app.refreshDomainAssets?.();
    } finally { setBusySwitch(false); }
  }

  const [busyDiag, setBusyDiag] = createSignal(false);
  const [report, setReport] = createSignal(null);
  const [err, setErr] = createSignal(null);

  async function runDiagnostics() {
    setBusyDiag(true); setErr(null);
    try {
      const r = await assessAssets({
        env: app.assetsEnv?.(),
        assetsBaseUrl: app.assetsBaseUrl?.(),
        selectedDomainName: (() => { const d = app.selectedDomain?.(); return typeof d === "string" ? d : (d?.name || ""); })(),
        domainAssetsPrefixActive: app.domainAssetsPrefix?.(),
        domainAssetsConfig: app.domainAssetsConfig?.(),
        domainAssetsSource: app.domainAssetsSource?.(),
      });
      setReport(r);
    } catch (e) { setErr(e); } finally { setBusyDiag(false); }
  }

  const Row = (props) => (
    <div class="grid grid-cols-[160px_1fr] gap-2 py-1">
      <div class="text-sm text-[hsl(var(--muted-foreground))]">{props.label}</div>
      <div class="text-sm break-all">{props.children}</div>
    </div>
  );

  return (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="text-lg font-medium">{t("settings.dev.assets.title")}</h3>
        <div class="flex items-center gap-2">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.dev.assets.env")}</span>
          <div class="inline-flex rounded-md border border-[hsl(var(--border))] overflow-hidden">
            <button
              class={`px-3 py-1.5 text-sm ${env() === "prod" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--foreground))]"}`}
              disabled={busySwitch()} onClick={() => switchEnv("prod")}
            >
              {t("settings.dev.assets.env.prod")}
            </button>
            <button
              class={`px-3 py-1.5 text-sm border-l border-[hsl(var(--border))] ${env() === "test" ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "text-[hsl(var(--foreground))]"}`}
              disabled={busySwitch()} onClick={() => switchEnv("test")}
            >
              {t("settings.dev.assets.env.test")}
            </button>
          </div>
        </div>
      </div>

      <div class="rounded-md bg-[hsl(var(--muted))] p-3 space-y-1">
        <Row label={t("settings.dev.assets.env")}>{env()}</Row>
        <Row label={t("settings.dev.assets.baseUrl")}>{app.assetsBaseUrl?.() || "—"}</Row>
        <Row label={t("settings.dev.assets.prefix.active")}>{app.domainAssetsPrefix?.() || "—"}</Row>
        <Row label={t("settings.dev.assets.source")}>{app.domainAssetsSource?.() || "—"}</Row>
      </div>

      <div class="flex items-center justify-between">
        <div class="text-sm font-medium">{t("settings.dev.assets.diagnostics.title")}</div>
        <button
          class="px-3 py-1.5 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]"
          onClick={runDiagnostics}
          disabled={busyDiag()}
        >
          {busyDiag() ? t("common.loading") : t("settings.dev.assets.diagnostics.run")}
        </button>
      </div>

      {err() && <div class="text-sm text-[hsl(var(--destructive))]">
        {t("settings.dev.assets.diagnostics.error")}: {String(err())}
      </div>}

      <Show when={report()}>
        <div class="space-y-2">
          <Row label={t("settings.dev.assets.domain")}>{report().domain || "—"}</Row>
          <Row label={t("settings.dev.assets.prefix.computed")}>{report().computedDomainPrefix || "—"}</Row>

          {/* Active config (what the app is really using) */}
          <Row label={t("settings.dev.assets.configUrl")}>
            <Show when={report().appConfigUrl} fallback={"—"}>
              <span class="inline-flex items-center gap-2">
                <a href={report().appConfigUrl} target="_blank" rel="noreferrer" class="underline">{report().appConfigUrl}</a>
                <a href={report().appConfigUrl} target="_blank" rel="noreferrer" class="px-2 py-0.5 rounded-md border border-[hsl(var(--border))] text-xs hover:bg-[hsl(var(--accent))]" aria-label={t("settings.dev.assets.configUrl.open")} title={t("settings.dev.assets.configUrl.open")}>↗</a>
              </span>
            </Show>
          </Row>

          {/* Also show the env+domain computed config */}
          <Row label={t("settings.dev.assets.configUrl.computed")}>
            <Show when={report().computedDomainPrefix} fallback={"—"}>
              <span class="inline-flex items-center gap-2">
                <a href={report().computedDomainPrefix + "config.yaml"} target="_blank" rel="noreferrer" class="underline">
                  {report().computedDomainPrefix + "config.yaml"}
                </a>
                <a href={report().computedDomainPrefix + "config.yaml"} target="_blank" rel="noreferrer" class="px-2 py-0.5 rounded-md border border-[hsl(var(--border))] text-xs hover:bg-[hsl(var(--accent))]" aria-label={t("settings.dev.assets.configUrl.open")} title={t("settings.dev.assets.configUrl.open")}>↗</a>
              </span>
            </Show>
          </Row>

          {/* Checks */}
          <div class="pt-2 text-xs space-y-1">
            <div><b>{t("settings.dev.assets.diagnostics.primary")}</b>: {report().primaryConfig.url} — {report().primaryConfig.exists ? t("common.exists") : t("common.notFound")} ({report().primaryConfig.status})</div>
            <Show when={report().primaryConfig.status === -1 && report().primaryConfig.error}>
              <div class="text-[hsl(var(--muted-foreground))]">{t("settings.dev.assets.diagnostics.noteNetwork")} {report().primaryConfig.error}</div>
            </Show>
            <div><b>{t("settings.dev.assets.diagnostics.default")}</b>: {report().defaultConfig.url} — {report().defaultConfig.exists ? t("common.exists") : t("common.notFound")} ({report().defaultConfig.status})</div>
          </div>

          {/* Summary */}
          <div class="pt-2 text-xs space-y-1">
            <div>• {t("settings.dev.assets.diagnostics.hasConfig")}: {String(report().appParsedConfigPresence.hasConfigObject)}</div>
            <div>• {t("settings.dev.assets.diagnostics.hasLogos")}: {String(report().appParsedConfigPresence.hasLogos)} ({(report().appParsedConfigPresence.logoFields || []).join(", ") || "—"})</div>
            <div>• {t("settings.dev.assets.diagnostics.hasLocales")}: {String(report().appParsedConfigPresence.hasLocales)}</div>
            <div>• {t("settings.dev.assets.diagnostics.hasTabs")}: {String(report().appParsedConfigPresence.hasTabs)}</div>
            <div>• {t("settings.dev.assets.diagnostics.hasCategories")}: {String(report().appParsedConfigPresence.hasCategories)}</div>
            <div>• {t("settings.dev.assets.diagnostics.hasFavicon")}: {String(report().appParsedConfigPresence.hasFavicon)}</div>
          </div>

          {/* Sample fetches */}
          <Show when={report().resolvedSamples?.length}>
            <div class="pt-2">
              <div class="text-sm font-semibold">{t("settings.dev.assets.diagnostics.sampleFetches")}</div>
              <ul class="mt-1 space-y-1 text-xs">
                {report().resolvedSamples.map((s) => (
                  <li>{s.kind}: {s.url} — {s.exists ? t("common.ok") : t("common.fail")} ({s.status})</li>
                ))}
              </ul>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
