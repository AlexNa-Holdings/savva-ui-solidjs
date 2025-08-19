// src/components/SwitchConnectDialog.jsx
import { createSignal, createEffect, Show, createMemo, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext";

function ensureSlash(s) { if (!s) return ""; return s.endsWith("/") ? s : s + "/"; }
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => (String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase());

function isAbortError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  if (e?.name === "AbortError") return true;
  if (e?.code === 20) return true;
  if (msg.includes("aborted") || msg.includes("abort") || msg.includes("the operation was aborted")) return true;
  return false;
}

async function fetchInfoJSON(baseUrl, { signal } = {}) {
  const url = ensureSlash(baseUrl) + "info";
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`/info failed: ${res.status}`);
  return await res.json();
}

export default function SwitchConnectDialog(props) {
  const app = useApp();
  const { t } = app;

  const [backendUrl, setBackendUrl] = createSignal(props.backendLink ?? app.config?.()?.backendLink ?? "");
  const [domain, setDomain] = createSignal(dn(props.domain) || (app.config?.()?.domain || ""));
  const [domains, setDomains] = createSignal([]); // [{ name }]
  const [fetching, setFetching] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [localError, setLocalError] = createSignal("");

  let aborter;

  const selectedDomainObj = createMemo(() => {
    const cur = (domain() || "").trim().toLowerCase();
    return (domains() || []).find((d) => eq(dn(d), cur)) || null;
  });

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

      normalized.sort((a, b) => (a.name > b.name ? 1 : -1));
      setDomains(normalized);

      if (normalized.length > 0) {
        const wanted = dn(props.domain) || (app.config?.()?.domain || "");
        const resolved =
          normalized.find((d) => eq(d.name, wanted)) ||
          normalized.find((d) => eq(d.name, domain())) ||
          normalized[0];

        const name = resolved.name;
        setDomain(name);
        queueMicrotask(() => setDomain(name));
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      if (!isAbortError(e)) setLocalError(e.message || String(e));
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
        const prefer = dn(props.domain) || (app.config?.()?.domain || "") || domain();
        const keep = normalized.find((d) => eq(d.name, prefer)) || normalized.find((d) => eq(d.name, domain()));
        const name = keep?.name || normalized[0].name;
        setDomain(name);
        queueMicrotask(() => setDomain(name));
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      if (!isAbortError(e)) setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  }

  async function onApply() {
    setLocalError("");
    setApplying(true);
    try {
      const url = (backendUrl() || "").trim();
      const chosen = (domain() || "").trim();
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
      if (!chosen) throw new Error(t("rightPane.switch.validation.domain"));

      if (typeof props.onApply === "function") {
        await props.onApply({ backendLink: url, domain: chosen });
      }

      await app.updateConnect?.({ backendLink: url });
      await app.setDomain?.(chosen);
      await app.refreshDomainAssets?.();
    } catch (e) {
      if (!isAbortError(e)) setLocalError(e.message || String(e));
      setApplying(false);
      return;
    }

    setApplying(false);
    try { aborter?.abort(); } catch {}
    props.onClose?.();
  }

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-40 flex items-center justify-center">
        <div class="absolute inset-0 bg-black/40" onClick={props.onClose} />

        <div class="relative themed-dialog rounded-lg shadow-lg w-[34rem] max-w-[95vw] p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
          <h3 class="text-lg font-semibold mb-3">
            {t("rightPane.switch.title")}
          </h3>

          <label class="block mb-3">
            <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("rightPane.switch.backend.label")}</span>
            <div class="mt-1 flex gap-2">
              <input
                class="flex-1 px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                value={backendUrl()}
                onInput={(e) => setBackendUrl(e.currentTarget.value)}
                placeholder={t("rightPane.switch.backend.placeholder")}
                spellcheck={false}
              />
              <button
                class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90 disabled:opacity-60"
                onClick={handleReload}
                disabled={fetching()}
                title={t("rightPane.switch.reload.title")}
              >
                {fetching() ? t("common.loading") : t("rightPane.switch.reload")}
              </button>
            </div>
            <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">{t("rightPane.switch.backend.help")}</p>
          </label>

          <label class="block mb-1">
            <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("rightPane.switch.domain.label")}</span>
          </label>
          <select
            class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] disabled:opacity-60"
            value={domain()}
            onChange={(e) => setDomain(e.currentTarget.value)}
            disabled={fetching() || domains().length === 0}
          >
            {domains().map((d) => (
              <option value={d.name} selected={eq(d.name, domain())}>
                {d.name}
              </option>
            ))}
          </select>

          <Show when={selectedDomainObj()}>
            <div class="mt-2 text-xs text-[hsl(var(--muted-foreground))] space-y-1">
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

          <Show when={localError() || props.error}>
            <p class="mt-2 text-sm text-[hsl(var(--destructive))]">
              {t("common.error")}: {localError() || props.error?.message}
            </p>
          </Show>

          <div class="mt-4 flex gap-2 justify-end">
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] hover:opacity-90"
              onClick={props.onClose}
            >
              {t("common.cancel")}
            </button>
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90"
              onClick={props.onReset}
              title={t("rightPane.switch.reset.title")}
            >
              {t("rightPane.switch.reset")}
            </button>
            <button
              class="px-3 py-2 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
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
