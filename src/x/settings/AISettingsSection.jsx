// src/x/settings/AISettingsSection.jsx
import { createEffect, createMemo, createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { AI_PROVIDERS, findProvider, testConnection } from "../../ai/registry.js";
import { loadAiConfig, saveAiConfig } from "../../ai/storage.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";

export default function AISettingsSection() {
  const app = useApp();
  const { t } = app;

  const [cfg, setCfg] = createSignal(loadAiConfig());
  const [busyTest, setBusyTest] = createSignal(false);
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const provider = createMemo(() => findProvider(cfg().providerId));

  // Track provider defaults for baseUrl/apiVersion
  createEffect(() => {
    const p = provider();
    if (!p) return;
    setCfg((prev) => {
      const next = { ...prev };
      if (!prev.baseUrl) next.baseUrl = p.defaultBaseUrl || "";
      if (p.kind === "azure_openai" && !prev.extra?.apiVersion) {
        next.extra = { ...(prev.extra || {}), apiVersion: p.apiVersion || "2024-02-15-preview" };
      }
      return next;
    });
  });

  function update(field, value) {
    setCfg((prev) => ({ ...prev, [field]: value }));
  }
  function updateExtra(field, value) {
    setCfg((prev) => ({ ...prev, extra: { ...(prev.extra || {}), [field]: value } }));
  }

  function handleSave() {
    saveAiConfig(cfg());
    pushToast({ type: "success", message: t("settings.ai.saved") });
  }

  async function handleTest() {
    setBusyTest(true);
    try {
      const result = await testConnection(cfg());
      if (result.ok) {
        pushToast({ type: "success", message: t("settings.ai.testSuccess") });
      } else {
        pushErrorToast(Object.assign(new Error(t("settings.ai.testFailed")), { details: result }));
      }
    } catch (err) {
      pushErrorToast(err, { context: "ai-test" });
    } finally {
      setBusyTest(false);
    }
  }

  const modelPlaceholder = createMemo(() => provider()?.modelHint || "gpt-4o / claude-3 / gemini-1.5-pro");

  return (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-lg font-medium">{t("settings.ai.title")}</h3>
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1.5 text-sm rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
            onClick={handleSave}
          >
            {t("settings.ai.save")}
          </button>
          <button
            class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            disabled={busyTest()}
            onClick={handleTest}
          >
            {busyTest() ? t("settings.ai.testing") : t("settings.ai.test")}
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <label class="grid gap-1">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.providerLabel")}</span>
          <select
            class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
            value={cfg().providerId}
            onInput={(e) => update("providerId", e.currentTarget.value)}
          >
            {AI_PROVIDERS.map((p) => (
              <option value={p.id}>{t(p.labelKey)}</option>
            ))}
          </select>
        </label>

        <label class="grid gap-1">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.model")}</span>
          <input
            type="text"
            class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
            placeholder={modelPlaceholder()}
            value={cfg().model || ""}
            onInput={(e) => update("model", e.currentTarget.value)}
          />
        </label>

        <label class="grid gap-1 sm:col-span-2">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.apiKey")}</span>
          <input
            type="password"
            autocomplete="off"
            class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 w-full"
            placeholder={t("settings.ai.apiKey.placeholder")}
            value={cfg().apiKey || ""}
            onInput={(e) => update("apiKey", e.currentTarget.value)}
          />
        </label>
      </div>

      {/* Auto-use toggle */}
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!cfg().auto}
            onInput={(e) => update("auto", e.currentTarget.checked)}
          />
          <span>{t("settings.ai.auto")}</span>
        </label>
        <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.autoHint")}</span>
      </div>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showAdvanced()}
            onInput={(e) => setShowAdvanced(e.currentTarget.checked)}
          />
          <span>{t("settings.ai.advanced")}</span>
        </label>
        <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.advancedHint")}</span>
      </div>

      <Show when={showAdvanced()}>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1 sm:col-span-2">
            <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.baseUrl")}</span>
            <input
              type="text"
              class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5 w-full"
              placeholder={provider()?.defaultBaseUrl || "https://api.example.com/v1"}
              value={cfg().baseUrl || ""}
              onInput={(e) => update("baseUrl", e.currentTarget.value)}
            />
          </label>

          <Show when={provider()?.kind === "azure_openai"}>
            <label class="grid gap-1">
              <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.apiVersion")}</span>
              <input
                type="text"
                class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
                placeholder="2024-02-15-preview"
                value={cfg().extra?.apiVersion || ""}
                onInput={(e) => updateExtra("apiVersion", e.currentTarget.value)}
              />
            </label>
          </Show>
        </div>
      </Show>

      <p class="text-xs text-[hsl(var(--muted-foreground))]">
        {t("settings.ai.privacyNote")}
      </p>
    </section>
  );
}
