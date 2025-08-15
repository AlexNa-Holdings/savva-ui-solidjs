import { createSignal, createEffect, Show, createMemo } from "solid-js";
import { useI18n } from "../i18n/useI18n";

function ensureSlash(s) {
  if (!s) return "";
  return s.endsWith("/") ? s : s + "/";
}

async function fetchInfoJSON(baseUrl, { signal } = {}) {
  const url = ensureSlash(baseUrl) + "info";
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`/info failed: ${res.status}`);
  return await res.json();
}

export default function SwitchConnectDialog(props) {
  const { t } = useI18n();

  // Form state
  const [backendUrl, setBackendUrl] = createSignal(props.backendLink ?? "");
  const [domain, setDomain] = createSignal(props.domain ?? "");
  const [domains, setDomains] = createSignal([]); // array of { name, ... }
  const [fetching, setFetching] = createSignal(false);
  const [localError, setLocalError] = createSignal("");

  // Helper: current domain object
  const selectedDomainObj = createMemo(() =>
    (domains() || []).find((d) => d?.name === domain()) || null
  );

  // On open: fetch /info and populate domains (from info.domains[].name)
  createEffect(async () => {
    if (!props.open) return;

    setLocalError("");
    setBackendUrl(props.backendLink ?? "");
    setDomain(props.domain ?? "");
    setDomains([]);

    // Validate URL; if invalid, show a tip and skip autopopulate
    try {
      const u = new URL(ensureSlash(backendUrl()));
      if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    } catch {
      setLocalError(t("rightPane.switch.validation.protocol"));
      return;
    }

    const controller = new AbortController();
    setFetching(true);
    try {
      const info = await fetchInfoJSON(backendUrl(), { signal: controller.signal });
      const list = Array.isArray(info?.domains) ? info.domains.filter(Boolean) : [];

      // Expect objects with a .name string; fallback to []
      const normalized = list
        .map((d) => (typeof d === "string" ? { name: d } : d))
        .filter((d) => d && typeof d.name === "string" && d.name.trim().length > 0);

      setDomains(normalized);

      if (normalized.length > 0) {
        if (props.domain && normalized.some((d) => d.name === props.domain)) {
          setDomain(props.domain);
        } else {
          setDomain(normalized[0].name);
        }
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }

    return () => controller.abort();
  });

  async function handleReload() {
    setLocalError("");
    try {
      const u = new URL(ensureSlash(backendUrl()));
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
    } catch (e) {
      setLocalError(e.message || t("rightPane.switch.validation.protocol"));
      return;
    }

    setFetching(true);
    try {
      const info = await fetchInfoJSON(backendUrl());
      const list = Array.isArray(info?.domains) ? info.domains.filter(Boolean) : [];
      const normalized = list
        .map((d) => (typeof d === "string" ? { name: d } : d))
        .filter((d) => d && typeof d.name === "string" && d.name.trim().length > 0);

      setDomains(normalized);

      if (normalized.length > 0 && !normalized.some((d) => d.name === domain())) {
        setDomain(normalized[0].name);
      }
      if (normalized.length === 0) setLocalError(t("rightPane.switch.noDomains"));
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  }

  async function onApply() {
    setLocalError("");
    try {
      const u = new URL(ensureSlash(backendUrl()));
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
      const chosen = (domain() || "").trim();
      if (!chosen) throw new Error(t("rightPane.switch.validation.domain"));

      await props.onApply({
        backendLink: ensureSlash(backendUrl().trim()),
        domain: chosen,
      });
    } catch (e) {
      setLocalError(e.message || String(e));
    }
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />

        <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[34rem] max-w-[95vw] p-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t("rightPane.switch.title")}
          </h3>

          {/* Backend URL first */}
          <label class="block mb-3">
            <span class="text-sm text-gray-700 dark:text-gray-300">{t("rightPane.switch.backend.label")}</span>
            <div class="mt-1 flex gap-2">
              <input
                class="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                value={backendUrl()}
                onInput={(e) => setBackendUrl(e.currentTarget.value)}
                placeholder="https://ui.savva.app/api/"
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

          {/* Domain depends on backend /info */}
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

          {/* Small details for selected domain (optional, helpful) */}
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
              disabled={props.loading || fetching()}
            >
              {props.loading || fetching() ? t("common.applying") : t("common.apply")}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
