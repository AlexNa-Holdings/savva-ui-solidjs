// src/x/modals/SwitchConnectModal.jsx
import { createSignal, createEffect, Show, createMemo, onCleanup, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import Modal from "./Modal.jsx";
import { dbg } from "../../utils/debug.js";

const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const asStr = (v) => (v ?? "").toString().trim();
const eq = (a, b) => asStr(a).toLowerCase() === asStr(b).toLowerCase();

function isAbortError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  if (e?.name === "AbortError") return true;
  if (e?.code === 20) return true;
  if (msg.includes("aborted") || msg.includes("abort") || msg.includes("the operation was aborted")) return true;
  return false;
}

export default function SwitchConnectModal(props) {
  const app = useApp();
  const { t } = app;

  // Back-compat: support both `isOpen` (new) and `open` (old)
  const isOpen = () => !!(props.isOpen ?? props.open);

  const [backendUrl, setBackendUrl] = createSignal(props.backendLink ?? app.config?.()?.backendLink ?? "");
  const [domain, setDomain] = createSignal(dn(props.domain) || (app.config?.()?.domain || ""));
  const [domains, setDomains] = createSignal([]);
  const [fetching, setFetching] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [localError, setLocalError] = createSignal("");

  let aborter;
  let selectEl;

  const selectedDomainObj = createMemo(() => {
    const cur = (domain() || "").trim().toLowerCase();
    return (domains() || []).find((d) => eq(dn(d), cur)) || null;
  });

  const log = (phase, obj) => {
    try { dbg.log("switch-dialog", phase, obj); } catch {}
  };

  const normalizeDomains = (list) =>
    (Array.isArray(list) ? list : [])
      .filter(Boolean)
      .map((d) => {
        if (typeof d === "string") return { name: d };
        const name = d?.name || d?.domain || d?.host || d?.hostname || d?.slug || d?.id;
        return name ? { ...d, name: String(name) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => (a.name > b.name ? 1 : -1));

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
      const infoUrl = u.toString() + "info";
      log("fetchDomains:request", { infoUrl });

      const res = await fetch(infoUrl, {
        headers: { Accept: "application/json" },
        signal: aborter.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`/info failed: ${res.status}`);

      const info = await res.json();
      const normalized = normalizeDomains(info?.domains);

      setDomains(normalized);
      log("fetchDomains:response", { domains: normalized.map((d) => d.name) });

      if (normalized.length > 0) {
        const prefer = domain();
        const keep = normalized.find((d) => eq(d.name, prefer));
        const next = keep?.name || normalized[0].name;
        setDomain(next);
        log("domain:autoSelect", { prefer, chosen: next });
      } else {
        setLocalError(t("rightPane.switch.noDomains"));
      }
    } catch (e) {
      if (!isAbortError(e)) setLocalError(e.message || String(e));
      log("fetchDomains:error", { message: e?.message || String(e) });
    } finally {
      setFetching(false);
    }
  };

  // Only when modal goes closed → open
  let wasOpen = false;
  createEffect(() => {
    const nowOpen = isOpen();
    if (nowOpen && !wasOpen) {
      const initBackend = props.backendLink ?? app.config?.()?.backendLink ?? "";
      const initDomain = dn(props.domain) || (app.config?.()?.domain || "");
      setBackendUrl(initBackend);
      setDomain(initDomain);
      setDomains([]);
      setLocalError("");
      log("open", { backendUrl: initBackend, domain: initDomain });

      // Prefill domains from already-fetched /info (if available)
      const cachedInfo = app.info?.();
      const pre = normalizeDomains(cachedInfo?.domains);
      if (pre.length > 0) {
        setDomains(pre);
        const prefer = initDomain;
        const keep = pre.find((d) => eq(d.name, prefer));
        const next = keep?.name || pre[0].name;
        setDomain(next);
        log("domains:prefillFromInfo", { domains: pre.map((d) => d.name), chosen: next });
      }
    }
    if (!nowOpen && wasOpen) {
      aborter?.abort();
      log("close", {});
    }
    wasOpen = nowOpen;
  });

  onCleanup(() => aborter?.abort());

  // Trace state
  createEffect(() => {
    log("state", { backendUrl: backendUrl(), domain: domain() });
  });

  async function onApply() {
    const domFromEl = selectEl?.value ? String(selectEl.value) : undefined;
    const chosenDomain = domFromEl || domain();
    const payload = { backendLink: backendUrl(), domain: chosenDomain };
    log("apply:before", { ...payload, domFromEl, stateDomain: domain() });

    setApplying(true);
    try {
      await app.initializeOrSwitch(payload);
      log("apply:after", payload);
      props.onClose?.();
    } catch (e) {
      setLocalError(e.message || String(e));
      log("apply:error", { message: e?.message || String(e) });
    } finally {
      setApplying(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen()}
      onClose={props.onClose}
      title={t("rightPane.switch.title")}
      size="lg"
      footer={
        <div class="mt-2 flex gap-2 justify-end">
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
      }
    >
      <div class="space-y-3">
        <label class="block">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("rightPane.switch.backend.label")}</span>
          <div class="mt-1 flex gap-2">
            <input
              class="flex-1 px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
              value={backendUrl()}
              onInput={(e) => { setBackendUrl(e.currentTarget.value); log("backend:changed", { value: e.currentTarget.value }); }}
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
        </label>

        <label class="block">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("rightPane.switch.domain.label")}</span>
        </label>
        <select
          ref={(el) => (selectEl = el)}
          class="w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))] disabled:opacity-60"
          value={domain()}
          onChange={(e) => { setDomain(e.currentTarget.value); log("domain:changed", { value: e.currentTarget.value }); }}
          onInput={(e) => { setDomain(e.currentTarget.value); log("domain:input", { value: e.currentTarget.value }); }}
          onBlur={(e) => log("domain:blur", { value: e.currentTarget.value })}
          disabled={fetching() || domains().length === 0}
        >
          <For each={domains()}>
            {(d) => <option value={d.name}>{d.name}</option>}
          </For>
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
      </div>
    </Modal>
  );
}
