// src/x/SwitchConnectDialog.jsx
import { createSignal, createEffect, Show, createMemo, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext";
import { Portal } from "solid-js/web";
import ModalBackdrop from "./modals/ModalBackdrop";

const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => (String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase());

function isAbortError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  if (e?.name === "AbortError") return true;
  if (e?.code === 20) return true;
  if (msg.includes("aborted") || msg.includes("abort") || msg.includes("the operation was aborted")) return true;
  return false;
}

export default function SwitchConnectDialog(props) {
  const app = useApp();
  const { t } = app;

  const [backendUrl, setBackendUrl] = createSignal(props.backendLink ?? app.config?.()?.backendLink ?? "");
  const [domain, setDomain] = createSignal(dn(props.domain) || (app.config?.()?.domain || ""));
  const [domains, setDomains] = createSignal([]);
  const [fetching, setFetching] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [localError, setLocalError] = createSignal("");

  let aborter;

  const selectedDomainObj = createMemo(() => {
    const cur = (domain() || "").trim().toLowerCase();
    return (domains() || []).find((d) => eq(dn(d), cur)) || null;
  });

  const fetchDomains = async (url) => {
    setFetching(true);
    setLocalError("");
    setDomains([]);

    aborter?.abort();
    aborter = new AbortController();

    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw new Error(t("rightPane.switch.validation.protocol"));
      if (!u.pathname.endsWith("/")) u.pathname += "/";

      const res = await fetch(u.toString() + "info", {
        headers: { Accept: "application/json" },
        signal: aborter.signal,
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`/info failed: ${res.status}`);
      const info = await res.json();
      const normalized = (Array.isArray(info?.domains) ? info.domains : [])
        .filter(Boolean)
        .map((d) => (typeof d === "string" ? { name: d } : d))
        .filter((d) => typeof d?.name === "string" && d.name.trim().length > 0)
        .sort((a, b) => (a.name > b.name ? 1 : -1));

      setDomains(normalized);

      if (normalized.length > 0) {
        const prefer = domain();
        const keep = normalized.find((d) => eq(d.name, prefer));
        setDomain(keep?.name || normalized[0].name);
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      if (!isAbortError(e)) setLocalError(e.message || String(e));
    } finally {
      setFetching(false);
    }
  };

  // Run ONLY when dialog transitions from closed → open.
  let wasOpen = false;
  createEffect(() => {
    const isOpen = !!props.open;
    if (isOpen && !wasOpen) {
      setBackendUrl(props.backendLink ?? app.config?.()?.backendLink ?? "");
      setDomain(dn(props.domain) || (app.config?.()?.domain || ""));
      setDomains([]);
      setLocalError("");
      // No auto-fetch here; user must click "Load Domains".
    }
    if (!isOpen && wasOpen) {
      // Cancel any in-flight request when closing.
      aborter?.abort();
    }
    wasOpen = isOpen;
  });

  onCleanup(() => aborter?.abort());

  async function onApply() {
    setApplying(true);
    try {
      await app.initializeOrSwitch({
        backendLink: backendUrl(),
        domain: domain(),
      });
      props.onClose?.();
    } catch (e) {
      setLocalError(e.message || String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-60 flex items-center justify-center">
          <ModalBackdrop onClick={props.onClose} />
          <div class="relative z-70 themed-dialog rounded-lg shadow-lg w-[34rem] max-w-[95vw] p-4 bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]">
            <h3 class="text-lg font-semibold mb-3">{t("rightPane.switch.title")}</h3>

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
                  onClick={() => fetchDomains(backendUrl())}
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
                <option value={d.name}>{d.name}</option>
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
                onClick={app.clearConnectOverride}
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
      </Portal>
    </Show>
  );
}
