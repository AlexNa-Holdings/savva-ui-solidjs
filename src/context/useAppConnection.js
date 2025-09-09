// src/context/useAppConnection.js
import { createSignal, onMount, onCleanup } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints } from "../net/endpoints";
import { pushErrorToast } from "../ui/toast.js";
import { dbg } from "../utils/debug";

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }
const OVERRIDE_KEY = "connect_override";
const SCOPE = "AppConnection";

function pickPersistable(cfg) { if (!cfg) return null; return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") }; }
function loadOverride() { try { const raw = localStorage.getItem(OVERRIDE_KEY); if (!raw) return null; return pickPersistable(JSON.parse(raw)); } catch { return null; } }
function saveOverride(obj) { try { if (!obj) localStorage.removeItem(OVERRIDE_KEY); else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj))); } catch { } }

export function useAppConnection() {
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);
  const [error, setError] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  async function fetchInfo(cfg) {
    const url = ensureSlash(cfg.backendLink) + "info";
    const started = Date.now();
    dbg.log(SCOPE, "GET /info: start", { url, domain: cfg.domain || "" });
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    dbg.log(SCOPE, "GET /info: done", { status: res.status, ms: Date.now() - started });
    if (!res.ok) throw new Error(`/info failed: ${res.status}`);
    const json = await res.json();
    dbg.log(SCOPE, "GET /info: parsed", { hasAssets: !!json.assets_url, hasTempAssets: !!json.temp_assets_url, domains: (json.domains || []).length });
    return json;
  }

  async function applyConfig(nextCfg) {
    dbg.group(`${SCOPE}: applyConfig`);
    const prev = config();
    dbg.log(SCOPE, "applyConfig: input", { prev, next: nextCfg });

    setConfig(nextCfg);

    // Establish single source of truth first (HTTP base + WS URL).
    dbg.log(SCOPE, "configureEndpoints()", { backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" , from: "applyConfig" });
    configureEndpoints({ backendLink: nextCfg.backendLink, domain: nextCfg.domain || "" });

    // Then fetch /info to drive the rest of the app.
    const data = await fetchInfo(nextCfg);
    setInfo(data);

    dbg.groupEnd();
  }

  async function init() {
    setLoading(true);
    setError(null);
    dbg.log(SCOPE, "init: start");
    try {
      const res = await fetch("/default_connect.yaml", { cache: "no-store" });
      dbg.log(SCOPE, "init: fetched /default_connect.yaml", { status: res.status });
      if (!res.ok) throw new Error(`YAML load failed: ${res.status}`);
      const data = parse(await res.text()) || {};
      dbg.log(SCOPE, "init: parsed YAML", { backendLink: data.backendLink, domain: data.domain || "", gear: !!data.gear });
      if (!data.backendLink) throw new Error("Missing backendLink in config");

      const baseCfg = { domain: data.domain || "", backendLink: ensureSlash(data.backendLink), gear: !!data.gear };
      const override = loadOverride();
      if (override) dbg.log(SCOPE, "init: found override", override);
      const merged = { ...baseCfg, ...override };
      dbg.log(SCOPE, "init: applying merged config", merged);
      await applyConfig(merged);
    } catch (e) {
      setError(e);
      dbg.error(SCOPE, "init: failed", e);
    } finally {
      setLoading(false);
      dbg.log(SCOPE, "init: done");
    }
  }

  onMount(() => {
    // Passive taps for key global events (no behavioral changes, just logs)
    const onLang = (e) => dbg.log("useI18n", "EVENT savva:lang", e?.detail || {});
    const onEndpoints = (e) => dbg.log("ws", "EVENT savva:endpoints-updated (caught in AppConnection)", e?.detail || {});
    if (typeof window !== "undefined") {
      window.addEventListener("savva:lang", onLang);
      window.addEventListener("savva:endpoints-updated", onEndpoints);
    }

    init();

    onCleanup(() => {
      if (typeof window !== "undefined") {
        window.removeEventListener("savva:lang", onLang);
        window.removeEventListener("savva:endpoints-updated", onEndpoints);
      }
    });
  });

  async function updateConnect(partial) {
    try {
      setLoading(true); setError(null);
      dbg.group(`${SCOPE}: updateConnect`);
      dbg.log(SCOPE, "updateConnect: partial input", partial);

      const cur = config() || {};
      const next = { ...cur, ...partial, backendLink: ensureSlash(partial?.backendLink ?? cur.backendLink) };
      const backendChanged = next.backendLink !== cur.backendLink;
      const domainChanged = (next.domain || "") !== (cur.domain || "");
      dbg.log(SCOPE, "updateConnect: computed", { cur, next, backendChanged, domainChanged });

      if (backendChanged) {
        dbg.log(SCOPE, "updateConnect: backend changed → applyConfig()");
        await applyConfig(next);
      } else {
        setConfig(next);
        dbg.log(SCOPE, "updateConnect: domain-only change → configureEndpoints()", { backendLink: next.backendLink, domain: next.domain || "", from: "updateConnect" });
        configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
      }
      saveOverride(next);
      dbg.groupEnd();
    } catch (e) {
      setError(e);
      dbg.error(SCOPE, "updateConnect: failed", e);
      pushErrorToast(e, { op: "updateConnect" });
    } finally {
      setLoading(false);
    }
  }

  function setDomain(nextDomain) {
    const cur = config() || {};
    const next = { ...cur, domain: nextDomain || "" };
    dbg.log(SCOPE, "setDomain()", { prev: cur.domain || "", next: next.domain || "" });
    setConfig(next);
    saveOverride(next);
    dbg.log(SCOPE, "setDomain → configureEndpoints()", { backendLink: next.backendLink, domain: next.domain || "", from: "setDomain" });
    configureEndpoints({ backendLink: next.backendLink, domain: next.domain || "" });
  }

  async function clearConnectOverride() {
    dbg.log(SCOPE, "clearConnectOverride()");
    saveOverride(null);
    await init();
  }

  return { config, info, error, loading, init, updateConnect, clearConnectOverride, setDomain };
}
