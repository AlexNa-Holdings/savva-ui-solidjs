// src/x/settings/AISettingsSection.jsx
import { createEffect, createMemo, createSignal, Show, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { AI_PROVIDERS, findProvider, testConnection, fetchModels } from "../../ai/registry.js";
import { loadAiConfig, saveAiConfig } from "../../ai/storage.js";
import { pushToast, pushErrorToast } from "../../ui/toast.js";
import { createAiClient } from "../../ai/client.js";

export default function AISettingsSection() {
  const app = useApp();
  const { t } = app;

  const [cfg, setCfg] = createSignal(loadAiConfig());
  const [busyTest, setBusyTest] = createSignal(false);
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [availableModels, setAvailableModels] = createSignal([]);
  const [loadingModels, setLoadingModels] = createSignal(false);
  const provider = createMemo(() => findProvider(cfg().providerId));

  const persistConfig = (nextCfg) => {
    try {
      const normalizedUseAi = nextCfg.useAi === false ? false : true;
      saveAiConfig({ ...nextCfg, auto: !!nextCfg.auto, useAi: normalizedUseAi });
    } catch {
      /* ignore */
    }
  };

  createEffect(() => {
    const p = provider();
    if (!p) return;
    setCfg((prev) => {
      const next = { ...prev };
      let changed = false;
      if (!prev.baseUrl && p.defaultBaseUrl !== undefined) {
        next.baseUrl = p.defaultBaseUrl || "";
        changed = true;
      }
      if (!prev.model && p.defaultModel !== undefined) {
        next.model = p.defaultModel || "";
        changed = true;
      }
      if (p.kind === "azure_openai" && !prev.extra?.apiVersion) {
        next.extra = { ...(prev.extra || {}), apiVersion: p.apiVersion || "2024-02-15-preview" };
        changed = true;
      }
      if (!changed) return prev;
      persistConfig(next);
      return next;
    });
  });

  function update(field, value) {
    setCfg((prev) => {
      const next = { ...prev, [field]: value };
      persistConfig(next);
      return next;
    });
  }
  function updateExtra(field, value) {
    setCfg((prev) => {
      const extra = { ...(prev.extra || {}) };
      if (value === undefined || value === "") delete extra[field];
      else extra[field] = value;
      const next = { ...prev, extra };
      persistConfig(next);
      return next;
    });
  }

  function onTemperatureInput(e) {
    const raw = e.currentTarget.value.trim();
    if (raw === "") {
      updateExtra("temperature", undefined);
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    const clamped = Math.min(2, Math.max(0, num));
    updateExtra("temperature", String(clamped));
  }

  function handleProviderChange(nextId) {
    const p = findProvider(nextId);
    setAvailableModels([]); // Clear models when provider changes
    setCfg((prev) => {
      const next = { ...prev, providerId: nextId };
      next.baseUrl = p?.defaultBaseUrl !== undefined ? (p.defaultBaseUrl || "") : "";
      next.model = p?.defaultModel !== undefined ? (p.defaultModel || "") : "";

      if (p?.kind === "azure_openai") {
        next.extra = { ...(prev.extra || {}), apiVersion: p.apiVersion || "2024-02-15-preview" };
      } else if (prev.extra) {
        const cloned = { ...prev.extra };
        delete cloned.apiVersion;
        if (Object.keys(cloned).length) next.extra = cloned;
        else delete next.extra;
      } else {
        delete next.extra;
      }
      persistConfig(next);
      return next;
    });
  }

  // Check if current provider supports model fetching
  const supportsModelFetch = createMemo(() => {
    const p = provider();
    return p?.kind === "openai" || p?.kind === "gemini";
  });

  async function handleFetchModels() {
    setLoadingModels(true);
    try {
      const result = await fetchModels(cfg());
      if (result.ok && result.models.length > 0) {
        setAvailableModels(result.models);
      } else {
        setAvailableModels([]);
        if (result.error) {
          pushErrorToast(new Error(result.error), { context: "ai-models" });
        }
      }
    } catch (err) {
      setAvailableModels([]);
      pushErrorToast(err, { context: "ai-models" });
    } finally {
      setLoadingModels(false);
    }
  }

  // Persist AUTO immediately when toggled so the editor can pick it up
  function onToggleFlag(field, value) {
    setCfg((prev) => {
      const next = { ...prev, [field]: value };
      persistConfig(next);
      return next;
    });
    pushToast({ type: "success", message: t("settings.ai.saved") });
  }

  function onToggleAuto(e) {
    const v = !!e.currentTarget.checked;
    onToggleFlag("auto", v);
  }

  function onToggleUseAi(e) {
    const v = !!e.currentTarget.checked;
    onToggleFlag("useAi", v);
  }

  const usingAi = createMemo(() => cfg().useAi !== false);

  createEffect(() => {
    const currentCfg = cfg();
    const p = provider();
    if (!currentCfg || !p) return;
    const baseUrl = String(currentCfg.baseUrl || "").trim();
    const defaultBase = String(p.defaultBaseUrl || "").trim();
    const hasCustomBase = baseUrl && baseUrl !== defaultBase && baseUrl !== "https://api.openai.com/v1";
    const hasAdvancedExtras = Boolean(currentCfg.extra?.apiVersion || currentCfg.extra?.temperature);
    if (hasCustomBase || hasAdvancedExtras) setShowAdvanced(true);
  });

  async function handleTest() {
    setBusyTest(true);
    const prevCfg = loadAiConfig();
    const preserveAuto = !!cfg().auto; // ← keep user's auto setting
    let restored = false;
    const restore = () => {
      if (!restored) {
        const merged = { ...prevCfg, auto: preserveAuto }; // ← restore without clobbering AUTO
        saveAiConfig(merged);
        restored = true;
      }
    };

    try {
      // Apply on-screen config so the client uses it
      saveAiConfig(cfg());

      const ai = createAiClient();
      const probes = [];

      if (typeof ai.detectBaseLanguage === "function") {
        probes.push(async () =>
          ai.detectBaseLanguage(
            ["This is an English health check sentence used to validate the SAVVA AI integration."],
            { instruction: "healthcheck" }
          )
        );
      }
      if (typeof ai.translateText === "function") {
        probes.push(async () => ai.translateText("en", "en", "healthcheck", { preserveMarkdown: true, instruction: "healthcheck" }));
      }
      if (typeof ai.translateStructure === "function") {
        probes.push(async () =>
          ai.translateStructure(
            "en",
            ["en"],
            { title: "", body: "healthcheck", chapters: [] },
            { preserveMarkdown: true, instruction: "healthcheck" }
          )
        );
      }

      let ok = false;
      let firstErr = null;

      for (const p of probes) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await p();
          ok = true;
          break;
        } catch (e) {
          if (!firstErr) firstErr = e;
          const msg = String(e?.message || "").toLowerCase();
          if (msg.includes("ambiguous")) { ok = true; break; }
        }
      }

      if (!probes.length) {
        const probe = await testConnection(cfg());
        ok = !!probe?.ok;
        if (!ok) firstErr = Object.assign(new Error("probe"), { status: probe?.status, code: probe?.code, endpoint: probe?.endpoint });
      }

      if (ok) {
        pushToast({ type: "success", message: t("settings.ai.testSuccess") });
        return;
      }

      const details = await buildTestErrorDetails(t, firstErr, cfg(), app);
      pushErrorToast(new Error(t("settings.ai.testFailed")), { context: "ai-test", details });
    } catch (err) {
      const details = await buildTestErrorDetails(t, err, cfg(), app);
      pushErrorToast(new Error(t("settings.ai.testFailed")), { context: "ai-test", details });
    } finally {
      restore();
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
            class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50"
            disabled={busyTest()}
            onClick={handleTest}
          >
            {busyTest() ? t("settings.ai.testing") : t("settings.ai.test")}
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2">
          <input type="checkbox" checked={usingAi()} onInput={onToggleUseAi} />
          <span>{t("settings.ai.useAi")}</span>
        </label>
        <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.useAiHint")}</span>
      </div>

      <Show when={usingAi()}>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="grid gap-1">
            <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.providerLabel")}</span>
            <select
              class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
              value={cfg().providerId}
              onInput={(e) => handleProviderChange(e.currentTarget.value)}
            >
              {AI_PROVIDERS.map((p) => (
                <option value={p.id}>{t(p.labelKey)}</option>
              ))}
            </select>
          </label>

          <div class="grid gap-1">
            <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.model")}</span>
            <div class="flex gap-2">
              <Show
                when={availableModels().length > 0}
                fallback={
                  <input
                    type="text"
                    class="flex-1 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
                    placeholder={modelPlaceholder()}
                    value={cfg().model || ""}
                    onInput={(e) => update("model", e.currentTarget.value)}
                  />
                }
              >
                <select
                  class="flex-1 rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
                  value={cfg().model || ""}
                  onChange={(e) => update("model", e.currentTarget.value)}
                >
                  <option value="">{t("settings.ai.selectModel")}</option>
                  <For each={availableModels()}>
                    {(model) => <option value={model}>{model}</option>}
                  </For>
                </select>
              </Show>
              <Show when={supportsModelFetch() && cfg().apiKey}>
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                  disabled={loadingModels()}
                  onClick={handleFetchModels}
                  title={t("settings.ai.fetchModels")}
                >
                  {loadingModels() ? "..." : "↻"}
                </button>
              </Show>
            </div>
          </div>

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

        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={!!cfg().auto} onInput={onToggleAuto} />
            <span>{t("settings.ai.auto")}</span>
          </label>
          <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.autoHint")}</span>
        </div>

        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2">
            <input type="checkbox" checked={showAdvanced()} onInput={(e) => setShowAdvanced(e.currentTarget.checked)} />
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

            <label class="grid gap-1">
              <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.ai.temperature")}</span>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                class="rounded border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-2 py-1.5"
                placeholder="1"
                value={cfg().extra?.temperature ?? ""}
                onInput={onTemperatureInput}
              />
              <span class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.temperatureHint")}</span>
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

        <p class="text-xs text-[hsl(var(--muted-foreground))]">{t("settings.ai.privacyNote")}</p>
      </Show>
    </section>
  );
}

// ---- helpers shown in toast error details ----
function sanitizeUrl(u) {
  if (!u) return "";
  try {
    const url = new URL(u, window.location.origin);
    return url.pathname + (url.search || "");
  } catch {
    return String(u).replace(/^https?:\/\/[^/]+/, "");
  }
}
function extractErrorInfo(e) {
  try {
    const status = e?.status ?? e?.response?.status ?? e?.cause?.status;
    const code = e?.code ?? e?.cause?.code ?? e?.error?.code;
    const endpoint =
      e?.endpoint ?? e?.url ?? e?.config?.url ?? e?.response?.url;
    const requestId =
      e?.requestId ??
      e?.response?.headers?.get?.("x-request-id") ??
      e?.headers?.["x-request-id"] ??
      e?.cause?.requestId;
    return {
      status: typeof status === "number" ? status : undefined,
      code: code ? String(code) : undefined,
      endpoint: endpoint ? sanitizeUrl(endpoint) : undefined,
      requestId: requestId ? String(requestId) : undefined,
      rawMessage: e?.message ? String(e.message) : undefined,
    };
  } catch {
    return {};
  }
}
async function getAuthDebug(app) {
  try {
    const tok = await app?.auth?.getToken?.();
    if (!tok) return { hasToken: false };
    const payload = JSON.parse(atob((tok.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
    return { hasToken: true, iss: payload?.iss, aud: payload?.aud, exp: payload?.exp };
  } catch {
    return { hasToken: true };
  }
}
async function buildTestErrorDetails(t, err, cfg, app) {
  const info = extractErrorInfo(err);
  const auth = await getAuthDebug(app);
  const parts = [t("editor.ai.errors.api")];
  if (info.status) parts.push(`${t("error.httpStatus")}: ${info.status}`);
  if (info.code) parts.push(`${t("error.code")}: ${info.code}`);
  if (info.endpoint) parts.push(`${t("error.endpoint")}: ${info.endpoint}`);
  if (info.requestId) parts.push(`x-request-id: ${info.requestId}`);
  if (info.rawMessage) parts.push(info.rawMessage);
  if (auth?.hasToken === false) parts.push(t("auth.noToken"));
  return parts.join(" · ");
}
