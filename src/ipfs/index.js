// src/ipfs/index.js
import { fetchWithTimeout } from "../utils/net.js";

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }
function stripPrefix(s, p) { return s.startsWith(p) ? s.slice(p.length) : s; }

function normalizeInput(input) {
  let s = String(input || "").trim();
  if (!s) throw new Error("ipfs: empty input");
  s = stripPrefix(s, "ipfs://");
  s = stripPrefix(s, "/ipfs/");
  s = stripPrefix(s, "ipfs/");
  return s;
}

// FIXED: This helper function was missing, causing the ReferenceError.
function normalizeGatewayBase(s) {
  return String(s || "").trim();
}

async function fetchIpfs(input, opts = {}) {
  const { gateways = [], ...rest } = opts;
  if (!gateways || gateways.length === 0) throw new Error("ipfs.fetch: no gateways provided");
  const cidPath = normalizeInput(input);
  const { res, url, gateway } = await tryGateways(cidPath, gateways, { init: rest });
  return { response: res, url, gateway };
}

async function getJSON(input, opts) {
  const { response, url, gateway } = await fetchIpfs(input, { ...opts, headers: { Accept: "application/json", ...(opts?.headers || {}) } });
  return { data: await response.json(), url, gateway };
}

async function getText(input, opts) {
  const { response, url, gateway } = await fetchIpfs(input, opts);
  return { data: await response.text(), url, gateway };
}

async function getBlob(input, opts) {
  const { response, url, gateway } = await fetchIpfs(input, opts);
  return { data: await response.blob(), url, gateway };
}

async function getArrayBuffer(input, opts) {
  const { response, url, gateway } = await fetchIpfs(input, opts);
  return { data: await response.arrayBuffer(), url, gateway };
}


// --- New Smart Fetching Logic ---

async function fetchBest(app, ipfsPath, options = {}) {
  const { postGateways = [], timeoutMs = 8000, ...fetchOptions } = options;
  const cidPath = normalizeInput(ipfsPath);
  let gatewaysToTry = [];
  
  // -- MODIFICATION START --
  let effectiveTimeout = timeoutMs; // Default timeout

  // 1. If local IPFS is enabled, use it exclusively with a longer timeout.
  if (app.localIpfsEnabled() && app.localIpfsGateway()) {
    gatewaysToTry = [app.localIpfsGateway()];
    effectiveTimeout = 30000; // 30 seconds for local gateway
  } else {
    // 2. Otherwise, combine post-specific gateways with system-wide remote gateways.
    const systemGateways = app.remoteIpfsGateways() || [];
    gatewaysToTry = [...new Set([...postGateways, ...systemGateways])];
  }
  // -- MODIFICATION END --

  if (gatewaysToTry.length === 0) {
    throw new Error("No IPFS gateways available to try.");
  }

  // Use the new effectiveTimeout when calling the helper
  return tryGateways(cidPath, gatewaysToTry, { timeoutMs: effectiveTimeout, init: fetchOptions });
}

async function getJSONBest(app, ipfsPath, options = {}) {
  const { response, url, gateway } = await fetchBest(app, ipfsPath, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  return { data: await response.json(), url, gateway };
}

function buildUrl(baseGateway, cidPath) {
  // This restored logic correctly handles gateways that may or may not include /ipfs
  const base = String(baseGateway || "").trim().replace(/\/+$/, "");
  const path = String(cidPath || "").trim().replace(/^\/+/g, "");

  if (!base || !path) return "";

  // Check if the gateway already ends with /ipfs
  const hasIpfs = /\/ipfs$/i.test(base);
  const prefix = hasIpfs ? `${base}/` : `${base}/ipfs/`;

  return prefix + path;
}

async function tryGateways(cidPath, gateways, { timeoutMs = 8000, init = {} } = {}) {
  const errors = [];
  for (const gw of gateways) {
    const url = buildUrl(gw, cidPath);
    try {
      const res = await fetchWithTimeout(url, { timeoutMs, ...init });
      if (res && res.ok) return { res, url, gateway: gw };

      // --- MODIFICATION START ---
      // Create a detailed error object and add the 'url' to it.
      const httpError = new Error(`Gateway ${gw} -> HTTP ${res.status}`);
      httpError.url = url; 
      errors.push(httpError);
      // --- MODIFICATION END ---

    } catch (e) {
      // --- MODIFICATION START ---
      // Also add the 'url' to network/timeout errors.
      const networkError = new Error(`Gateway ${gw} -> ${e?.name || "Error"}: ${e?.message || e}`);
      networkError.url = url;
      errors.push(networkError);
      // --- MODIFICATION END ---
    }
  }
  const err = new Error("All IPFS gateways failed");
  err.causes = errors;
  throw err;
}

export const ipfs = {
  // Original methods
  fetch: fetchIpfs,
  getJSON,
  getText,
  getBlob,
  getArrayBuffer,
  // New, smarter methods
  fetchBest,
  getJSONBest,
  // Exported utils
  normalizeInput,
  buildUrl,
};