// src/context/useAppAuth.js
import { createSignal, onMount } from "solid-js";
import { httpBase, wsUrl } from "../net/endpoints.js";
import { getWsClient, whenWsOpen, getWsApi } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";
import { dbg } from "../utils/debug.js";

const AUTH_USER_KEY = "savva_auth_user";

// ---- helpers ---------------------------------------------------------------

const reconnectOnce = (() => {
  let inflight = null;
  return async (reason = "auth-change") => {
    if (inflight) return inflight;
    inflight = (async () => {
      const ws = getWsClient();
      try {
        // align URL with current domain/endpoints before reconnecting
        const url = wsUrl?.() || ws?.url;
        if (url && ws?.setUrl) ws.setUrl(url);
      } catch {}
      ws?.reconnect?.(`useAppAuth:${reason}`);
      await whenWsOpen({ timeoutMs: 20000 }).catch(() => {});
    })().finally(() => { inflight = null; });
    return inflight;
  };
})();

function getAppRef() {
  try { return typeof window !== "undefined" ? window.__app : null; } catch { return null; }
}

async function waitForAppApi(deadlineMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const app = getAppRef();
    if (app?.updateConnect || app?.orchestrator?.initializeOrSwitch) return app;
    await new Promise(r => setTimeout(r, 50));
  }
  return getAppRef();
}

function getCurrentRoute() {
  if (typeof window === "undefined") return "#/";
  return window.location.hash || "#/";
}

// ---- hook ------------------------------------------------------------------

export function useAppAuth() {
  const [authorizedUser, setAuthorizedUser] = createSignal(null);

  onMount(() => {
    try {
      const savedUser = localStorage.getItem(AUTH_USER_KEY);
      if (savedUser) setAuthorizedUser(JSON.parse(savedUser));
    } catch {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  });

  async function runSameOrchestrationButStay() {
    const prevHash = getCurrentRoute();
    const app = getAppRef();

    const backend =
      app?.backendLink?.() ??
      app?.config?.()?.backendLink ??
      httpBase();

    const domain =
      app?.domain?.() ??
      app?.config?.()?.domain ??
      "";

    if (typeof app?.updateConnect === "function") {
      dbg?.log?.("auth", "orchestrate via updateConnect");
      await Promise.resolve(app.updateConnect({ backendLink: backend, domain, noNavigate: true })).catch(() => {});
      await whenWsOpen({ timeoutMs: 20000 }).catch(() => {});
    } else if (app?.orchestrator?.initializeOrSwitch) {
      dbg?.log?.("auth", "orchestrate via orchestrator.initializeOrSwitch");
      await Promise.resolve(app.orchestrator.initializeOrSwitch({ backendLink: backend, domain, noNavigate: true })).catch(() => {});
      await whenWsOpen({ timeoutMs: 20000 }).catch(() => {});
    } else {
      // orchestrator truly not visible — do a single, URL-aligned reconnect
      dbg?.log?.("auth", "bridge reconnect (no orchestrator visible)");
      await reconnectOnce("bridge");
    }

    if (typeof window !== "undefined" && window.location.hash !== prevHash) {
      window.location.hash = prevHash;
    }
  }

  async function login(coreUser) {
    if (!coreUser?.address) return;
    dbg?.log?.("auth", "login:start", { addr: coreUser.address });

    // 1) reconnect first (orchestration), then update state
    await runSameOrchestrationButStay();

    // 2) minimal user after WS is open
    setAuthorizedUser(coreUser);
    try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(coreUser)); } catch {}

    // 3) enrich profile
    try {
      const addr = toChecksumAddress(coreUser.address);
      const app = getAppRef();
      const domain =
        app?.domain?.() ??
        app?.config?.()?.domain ??
        coreUser.domain ??
        "";
      const profile = await getWsApi().call("get-user", { domain, user_addr: addr });
      const full = { ...coreUser, ...profile };
      setAuthorizedUser(full);
      try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(full)); } catch {}
      dbg?.log?.("auth", "login:profile-loaded");
    } catch (e) {
      dbg?.log?.("auth", "login:profile-failed", { err: String(e) });
    }
  }

  async function logout() {
    dbg?.log?.("auth", "logout:start");
    try {
      await fetch(`${httpBase()}logout`, { credentials: "include" });
    } catch {
      // non-fatal
    }

    // 1) reconnect first (orchestration preferred)
    await runSameOrchestrationButStay();

    // 2) then clear user state
    setAuthorizedUser(null);
    try { localStorage.removeItem(AUTH_USER_KEY); } catch {}
    dbg?.log?.("auth", "logout:done");
  }

  function updateAuthorizedUser(partial) {
    const cur = authorizedUser();
    if (!cur) return;
    const next = { ...cur, ...partial, address: cur.address };
    setAuthorizedUser(next);
    try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(next)); } catch {}
  }

  function handleAuthError() {
    logout();
  }

  return { authorizedUser, login, logout, updateAuthorizedUser, handleAuthError };
}
