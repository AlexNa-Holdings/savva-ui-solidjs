// src/components/SwitchConnectDialog.jsx
import { createSignal, createEffect, Show, createMemo, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext";

function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => (String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase());

async function fetchInfoJSON(baseUrl, { signal } = {}) {
  const url = ensureSlash(baseUrl) + "info";
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`/info failed: ${res.status}`);
  return await res.json();
}

export default function SwitchConnectDialog(props) {
  const app = useApp();
  const { t } = app;

  // form state
  const [backendUrl, setBackendUrl] = createSignal(props.backendLink ?? app.config?.()?.backendLink ?? "");
  const [domain, setDomain] = createSignal(dn(props.domain) || (app.config?.()?.domain || ""));
  const [domains, setDomains] = createSignal([]); // [{ name }]
  const [fetching, setFetching] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [localError, setLocalError] = createSignal("");

  let aborter;

  // selected domain object (from fetched /info)
  const selectedDomainObj = createMemo(() => {
    const cur = (domain() || "").trim().toLowerCase();
    return (domains() || []).find((d) => eq(dn(d), cur)) || null;
  });

  // When dialog opens: hydrate fields from AppContext (single source of truth),
  // fetch /info, and preselect the current domain if present.
  createEffect(async () => {
    if (!props.open) return;

    setLocalError("");
    setBackendUrl(props.backendLink ?? app.config?.()?.backendLink ?? "");
    setDomain(dn(props.domain) || (app.config?.()?.domain || ""));
    setDomains([]);

    aborter?.abort();
    aborter = new AbortController();
    setFetching(true);

    try {
      const initialUrl = props.backendLink ?? app.config?.()?.backendLink ?? "";
      const u = new URL(initialUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));

      const info = await fetchInfoJSON(initialUrl, { signal: aborter.signal });
      const normalized = (Array.isArray(info?.domains) ? info.domains : [])
        .filter(Boolean)
        .map((d) => (typeof d === "string" ? { name: d } : d))
        .filter((d) => typeof d?.name === "string" && d.name.trim().length > 0);

      setDomains(normalized);

      if (normalized.length > 0) {
        const wanted = dn(props.domain) || (app.config?.()?.domain || "");
        const resolved =
          normalized.find((d) => eq(d.name, wanted)) ||
          normalized.find((d) => eq(d.name, domain())) ||
          normalized[0];
        setDomain(resolved.name);
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  });

  onCleanup(() => aborter?.abort());

  async function handleReload() {
    setLocalError("");
    try {
      const u = new URL((backendUrl() || "").trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
    } catch (e) {
      setLocalError(e.message || t("rightPane.switch.validation.protocol"));
      return;
    }

    setFetching(true);
    aborter?.abort();
    aborter = new AbortController();
    try {
      const info = await fetchInfoJSON((backendUrl() || "").trim(), { signal: aborter.signal });
      const normalized = (Array.isArray(info?.domains) ? info.domains : [])
        .filter(Boolean)
        .map((d) => (typeof d === "string" ? { name: d } : d))
        .filter((d) => typeof d?.name === "string" && d.name.trim().length > 0);

      setDomains(normalized);
      if (normalized.length > 0) {
        const keep = normalized.find((d) => eq(d.name, domain()));
        setDomain(keep?.name || normalized[0].name);
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  }

  // Apply ALWAYS writes to AppContext so the whole app shares the same state.
  async function onApply() {
    setLocalError("");
    setApplying(true);
    try {
      const url = (backendUrl() || "").trim();
      const chosen = (domain() || "").trim();
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
      if (!chosen) throw new Error(t("rightPane.switch.validation.domain"));

      // Optional parent hook (no-op safe)
      if (typeof props.onApply === "function") {
        await props.onApply({ backendLink: url, domain: chosen });
      }

      // Enforce in the global app context (this is the fix)
      await app.updateConnect?.({ backendLink: url });     // persists override & /info refresh if URL changed
      await app.setDomain?.(chosen);                       // single source of truth for domain
      await app.refreshDomainAssets?.();                   // immediate asset reload
    } catch (e) {
      setLocalError(e.message || String(e));
      setApplying(false);
      return; // keep dialog open on error
    }

    setApplying(false);
    props.onClose?.();
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />

        <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[34rem] max-w-[95vw] p-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("rightPane.switch.title")}
          </h3>

          {/* Backend URL */}
          <label class="block mb-3">
            <span class="text-sm text-gray-700 dark:text-gray-300">{t("rightPane.switch.backend.label")}</span>
            <div class="mt-1 flex gap-2">
              <input
                class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                value={backendUrl()}
                onInput={(e) => setBackendUrl(e.currentTarget.value)}
                placeholder={t("rightPane.switch.backend.placeholder")}
                spellcheck={false}
              />
              <button
                class="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                onClick={handleReload}
                disabled={fetching()}
                title={t("rightPane.switch.reload.title")}
              >
                {fetching() ? t("common.loading") : t("rightPane.switch.reload")}
              </button>
            </div>
            <p class="text-xs text-gray-500 mt-1">{t("rightPane.switch.backend.help")}</p>
          </label>

          {/* Domain select */}
          <label class="block mb-1">
            <span class="text-sm text-gray-700 dark:text-gray-300">{t("rightPane.switch.domain.label")}</span>
          </label>
          <select
            class="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-60"
            value={domain()}
            onChange={(e) => setDomain(e.currentTarget.value)}
            disabled={fetching() || domains().length === 0}
          >
            {domains().map((d) => (
              <option value={d.name}>{d.name}</option>
            ))}
          </select>

          {/* Optional details */}
          <Show when={selectedDomainObj()}>
            <div class="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <Show when={selectedDomainObj().website}>
                <div>
                  {t("rightPane.switch.domain.website")}:{" "}
                  <a class="underline" href={selectedDomainObj().website} target="_blank" rel="noreferrer">
                    {selectedDomainObj().website}
                  </a>
                </div>
              </Show>
            </div>
          </Show>

          {/* Errors */}
          <Show when={localError() || props.error}>
            <p class="mt-2 text-sm text-red-500">
              {t("common.error")}: {localError() || props.error?.message}
            </p>
          </Show>

          {/* Actions */}
          <div class="mt-4 flex gap-2 justify-end">
            <button
              class="px-3 py-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100"
              onClick={props.onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-2 rounded bg-red-500 text-white hover:bg-red-600"
              onClick={props.onReset}
              title={t("rightPane.switch.reset.title")}
            >
              {t("rightPane.switch.reset")}
            </button>
            <button
              class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={onApply}
              disabled={props.loading || fetching() || applying()}
            >
              {props.loading || fetching() || applying() ? t("common.applying") : t("common.apply")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
