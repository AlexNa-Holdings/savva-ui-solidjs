// src/context/useAppOrchestrator.js
import { createSignal, onMount } from "solid-js";
import { parse } from "yaml";
import { configureEndpoints, httpBase, wsUrl } from "../net/endpoints.js";
import { getWsClient, whenWsOpen } from "../net/wsRuntime.js";
import { navigate } from "../routing/hashRouter.js";
import dbg from "../utils/debug.js";

// ----- tiny safe wrapper so we always print, even if dbg API shape changes -----
const dlog = (evt, obj) => {
  try {
    if (typeof dbg === "function") dbg("orchestrator", evt, obj);
    else if (dbg?.log) dbg.log("orchestrator", evt, obj);
    else console.debug("[orchestrator]", evt, obj);
  } catch {
    console.debug("[orchestrator]", evt, obj);
  }
};
const dwarn = (evt, obj) => {
  try {
    if (dbg?.warn) dbg.warn("orchestrator", evt, obj);
    else console.warn("[orchestrator]", evt, obj);
  } catch {
    console.warn("[orchestrator]", evt, obj);
  }
};

const OVERRIDE_KEY = "connect_override";

const norm = (s) => (s ?? "").toString().trim();
const ensureSlash = (s) => {
  let v = norm(s);
  if (!v) return "/";
  // fix "https:/host" -> "https://host"
  v = v.replace(/:\/(?!\/)/, "://").replace(/:\/\/+/, "://");
  if (!v.endsWith("/")) v += "/";
  return v;
};

function pickPersistable(cfg) {
  if (!cfg) return null;
  return { domain: cfg.domain || "", backendLink: ensureSlash(cfg.backendLink || "") };
}
function loadOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    return pickPersistable(JSON.parse(raw));
  } catch {
    return null;
  }
}
function saveOverride(obj) {
  try {
    if (!obj) localStorage.removeItem(OVERRIDE_KEY);
    else localStorage.setItem(OVERRIDE_KEY, JSON.stringify(pickPersistable(obj)));
  } catch {}
}

async function fetchInfo(base) {
  const url = ensureSlash(base) + "info";
  dlog("fetchInfo:request", { url });
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`/info failed: ${res.status}`);
  const json = await res.json();
  dlog("fetchInfo:response", {
    assets_url: json.assets_url,
    temp_assets_url: json.temp_assets_url,
    domains: (json.domains || []).map((d) => d?.name || d?.domain || d).filter(Boolean),
  });
  return json;
}

async function tryLoadYaml(url) {
  dlog("assets:tryLoadYaml", { url });
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    dlog("assets:tryLoadYaml:miss", { url, status: res.status });
    return null;
  }
  try {
    const text = await res.text();
    const parsed = parse(text) || {};
    dlog("assets:tryLoadYaml:ok", { url, keys: Object.keys(parsed) });
    return parsed;
  } catch (e) {
    dwarn("assets:tryLoadYaml:parse_error", { url, error: String(e) });
    return {};
  }
}

export function useAppOrchestrator({ auth, i18n }) {
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal(null);
  const [config, setConfig] = createSignal(null);
  const [info, setInfo] = createSignal(null);

  // Asset state
  const [assetsEnv, setAssetsEnv] = createSignal("prod");
  const [assetsBaseUrl, setAssetsBaseUrl] = createSignal("");
  const [domainAssetsPrefix, setDomainAssetsPrefix] = createSignal("/domain_default/");
  const [domainAssetsSource, setDomainAssetsSource] = createSignal(null);
  const [domainAssetsConfig, setDomainAssetsConfig] = createSignal(null);

  const initializeOrSwitch = async (newSettings) => {
    setLoading(true);
    setError(null);
    const isSwitching = !!newSettings;

    try {
      const prevCfg = config() || {};
      const overrideBefore = loadOverride();

      // 1) Build nextCfg inputs
      let requestedBackend = isSwitching
        ? ensureSlash(newSettings.backendLink || prevCfg.backendLink || httpBase())
        : undefined;
      let requestedDomain = isSwitching ? norm(newSettings.domain || prevCfg.domain) : undefined;

      if (!isSwitching) {
        // first boot: site YAML + override
        const res = await fetch("/default_connect.yaml", { cache: "no-store" });
        if (!res.ok) throw new Error("YAML load failed: " + res.status);
        const siteYaml = parse(await res.text()) || {};
        const override = overrideBefore || {};
        requestedBackend = ensureSlash(override.backendLink || siteYaml.backendLink);
        requestedDomain = norm(override.domain || siteYaml.domain);
        // preserve gear (site-only)
        prevCfg.gear = !!siteYaml.gear;
        dlog("boot:siteYaml", {
          backendLink: siteYaml.backendLink,
          domain: siteYaml.domain,
          gear: !!siteYaml.gear,
        });
        dlog("boot:overrideLoaded", overrideBefore);
      }

      if (!requestedBackend) throw new Error("Missing backendLink");

      dlog("switch:start", {
        isSwitching,
        from: { base: httpBase(), domain: prevCfg.domain },
        requested: { backend: requestedBackend, domain: requestedDomain },
      });

      // logout on backend change (avoid cross-backend state)
      if (isSwitching && ensureSlash(prevCfg.backendLink || httpBase()) !== requestedBackend) {
        dlog("auth:logout:onBackendChange", {
          prev: ensureSlash(prevCfg.backendLink || httpBase()),
          next: requestedBackend,
        });
        await auth.logout?.();
      }

      // 2) Pre-info: set endpoints using the **requested** domain exactly
      dlog("endpoints:configure:pre-info", {
        backendLink: requestedBackend,
        domain: requestedDomain,
      });
      configureEndpoints({ backendLink: requestedBackend, domain: requestedDomain }, "orch:pre-info");

      // 3) Fetch /info
      const infoData = await fetchInfo(requestedBackend);
      setInfo(infoData);

      // 4) Decide final domain:
      //    - If a domain was explicitly requested -> honor it.
      //    - If empty -> take the first from /info (if any).
      let finalDomain = requestedDomain || (infoData.domains?.[0]?.name || infoData.domains?.[0]?.domain || "");
      const domainList = (infoData.domains || []).map((d) => d?.name || d?.domain || d).filter(Boolean);
      dlog("domain:resolve", {
        requestedDomain,
        domainList,
        chosen: finalDomain,
        note:
          requestedDomain
            ? "requested domain is honored"
            : "no requested domain → use first from /info (if any)",
      });

      const nextCfg = {
        backendLink: requestedBackend,
        domain: finalDomain,
        gear: prevCfg.gear, // never altered after boot
      };

      // persist UI override (domain + backendLink only)
      if (isSwitching) {
        saveOverride(nextCfg);
        dlog("override:saved", pickPersistable(nextCfg));
      }

      setConfig(nextCfg);

      // 5) Finalize endpoints with finalDomain (which equals requestedDomain when provided)
      dlog("endpoints:configure:final", {
        backendLink: nextCfg.backendLink,
        domain: nextCfg.domain,
      });
      configureEndpoints(
        { backendLink: nextCfg.backendLink, domain: nextCfg.domain },
        "orch:final"
      );

      // 6) Assets: choose base and try domain pack; fallback to default only for assets
      const base =
        (assetsEnv() === "test" ? infoData?.temp_assets_url : infoData?.assets_url) || "/";
      const assetsBase = ensureSlash(base);
      setAssetsBaseUrl(assetsBase);
      dlog("assets:env", {
        env: assetsEnv(),
        assetsBase,
      });

      let prefix = "/domain_default/";
      let source = "default";
      let cfg = {};

      if (nextCfg.domain) {
        const domainCfgUrl = `${assetsBase}${nextCfg.domain}/config.yaml`;
        const loaded = await tryLoadYaml(domainCfgUrl);
        if (loaded) {
          cfg = loaded;
          prefix = `${assetsBase}${nextCfg.domain}/`;
          source = "domain";
        } else {
          const fallback = await tryLoadYaml("/domain_default/config.yaml");
          cfg = fallback || {};
          dwarn("assets:fallbackToDefault", {
            forDomain: nextCfg.domain,
            prefix: "/domain_default/",
          });
        }
      } else {
        const fallback = await tryLoadYaml("/domain_default/config.yaml");
        cfg = fallback || {};
        dwarn("assets:noDomain:useDefault", {});
      }

      setDomainAssetsPrefix(prefix);
      setDomainAssetsSource(source);
      setDomainAssetsConfig(cfg);
      dlog("assets:applied", { prefix, source, cfgKeys: Object.keys(cfg || {}) });

      // 7) WS: force reconnect to url that includes ?domain=<final>
      const ws = getWsClient();
      const url = wsUrl();
      dlog("ws:setUrl", { url });
      ws.setUrl(url);
      dlog("ws:reconnect", { reason: "orchestrator-switch" });
      ws.reconnect?.("orchestrator-switch");

      try {
        await whenWsOpen({ timeoutMs: 8000 });
        dlog("ws:open", { url: wsUrl() });
      } catch {
        dwarn("ws:open:timeout", {});
      }

      // 8) Navigate home after successful switch
      if (isSwitching) {
        const current = (typeof window !== "undefined" ? window.location.hash.slice(1) : "/") || "/";
        dlog("nav:post-switch", { current, target: "/" });
        if (current !== "/") navigate("/");
      }

      dlog("switch:done", nextCfg);
    } catch (e) {
      dwarn("switch:error", { error: String(e) });
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  onMount(() => initializeOrSwitch());

  // Keep API stable for callers
  const setDomain = (nextDomain) =>
    initializeOrSwitch({ domain: nextDomain, backendLink: config()?.backendLink || httpBase() });
  const clearConnectOverride = () => {
    saveOverride(null);
    initializeOrSwitch();
  };

  return {
    config, info, error, loading,
    initializeOrSwitch, setDomain, clearConnectOverride,
    assetsEnv, setAssetsEnv, assetsBaseUrl,
    domainAssetsPrefix, domainAssetsSource, domainAssetsConfig,
  };
}
