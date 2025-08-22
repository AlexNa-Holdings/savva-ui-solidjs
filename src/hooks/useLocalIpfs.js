// src/hooks/useLocalIpfs.js
import { createSignal, onCleanup } from "solid-js";
import { fetchWithTimeout } from "../utils/net.js";

// Constants are now local to this hook
const IPFS_LOCAL_KEY = "ipfs_local_enabled";
const IPFS_LOCAL_API_KEY = "ipfs_local_api";
const IPFS_LOCAL_GATEWAY_KEY = "ipfs_local_gateway";

function trimSlash(s) { if (!s) return ""; return s.endsWith("/") ? s.slice(0, -1) : s; }

export function useLocalIpfs(dependencies) {
  const { pushToast, pushErrorToast, t } = dependencies;

  const [localIpfsEnabled, setLocalIpfsEnabled] = createSignal(localStorage.getItem(IPFS_LOCAL_KEY) === "1");
  const [localIpfsApiUrl, setLocalIpfsApiUrl] = createSignal(localStorage.getItem(IPFS_LOCAL_API_KEY) || "http://127.0.0.1:5001");
  const [localIpfsGateway, setLocalIpfsGateway] = createSignal(localStorage.getItem(IPFS_LOCAL_GATEWAY_KEY) || "");
  const [localIpfsStatus, setLocalIpfsStatus] = createSignal("unknown");
  let ipfsMonitorTid = null;

  async function pingLocalIpfs() {
    try {
      const base = trimSlash(localIpfsApiUrl());
      if (!base) throw new Error("No API URL");
      const res = await fetchWithTimeout(`${base}/api/v0/id`, { method: "POST", timeoutMs: 5000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLocalIpfsStatus("ok");
      return true;
    } catch (e) {
      setLocalIpfsStatus("down");
      pushErrorToast(e, { op: "pingLocalIpfs", apiUrl: localIpfsApiUrl() });
      return false;
    }
  }

  async function probeLocalIpfs(apiUrl) {
    const url = trimSlash(apiUrl || "");
    if (!url) throw new Error("Empty IPFS API URL");
    const res = await fetchWithTimeout(`${url}/api/v0/version`, { method: "POST", timeoutMs: 4000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gw = url.replace(/:\d+$/, ":8080").replace(/\/api$/, "");
    return gw.endsWith("/") ? gw : gw + "/";
  }

  function startLocalIpfsMonitor() {
    stopLocalIpfsMonitor();
    ipfsMonitorTid = setInterval(() => { pingLocalIpfs(); }, 10_000);
    pingLocalIpfs();
  }

  function stopLocalIpfsMonitor() {
    if (ipfsMonitorTid) { clearInterval(ipfsMonitorTid); ipfsMonitorTid = null; }
  }

  async function enableLocalIpfs(apiUrl) {
    try {
      const gw = await probeLocalIpfs(apiUrl);
      setLocalIpfsApiUrl(apiUrl);
      setLocalIpfsGateway(gw);
      setLocalIpfsEnabled(true);
      localStorage.setItem(IPFS_LOCAL_KEY, "1");
      localStorage.setItem(IPFS_LOCAL_API_KEY, apiUrl);
      localStorage.setItem(IPFS_LOCAL_GATEWAY_KEY, gw);
      startLocalIpfsMonitor();
    } catch (e) {
      pushErrorToast(e, { op: "enableLocalIpfs", apiUrl });
      throw e;
    }
  }

  async function disableLocalIpfs() {
    stopLocalIpfsMonitor();
    setLocalIpfsEnabled(false);
    setLocalIpfsGateway("");
    localStorage.setItem(IPFS_LOCAL_KEY, "0");
    localStorage.removeItem(IPFS_LOCAL_GATEWAY_KEY);
    pushToast({ type: "info", message: t("settings.ipfs.localDisabled") });
  }

  // Start the monitor if it was enabled on page load
  if (localIpfsEnabled() && localIpfsApiUrl()) {
    startLocalIpfsMonitor();
  }

  onCleanup(() => stopLocalIpfsMonitor());

  return {
    localIpfsEnabled,
    localIpfsApiUrl,
    localIpfsGateway,
    localIpfsStatus,
    enableLocalIpfs,
    disableLocalIpfs,
    setLocalIpfsApiUrl,
  };
}