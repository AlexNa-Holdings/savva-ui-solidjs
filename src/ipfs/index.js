// src/ipfs/index.js
import { fetchWithTimeout } from "../utils/net.js";

// Helper function to ensure a URL has a protocol
function ensureProtocol(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `https://${url}`;
}

// Iteratively strips all known IPFS prefixes to handle cases like 'ipfs:/ipfs/Qm...'
function normalizeInput(input) {
  let s = String(input || "").trim();
  if (!s) return s;
  let prevS;
  do {
    prevS = s;
    s = s.replace(/^(ipfs:\/\/|\/ipfs\/|ipfs\/)/i, "");
  } while (s !== prevS && s.length > 0);
  return s;
}

// Robustly joins a gateway and a CID path, ensuring no duplicate '/ipfs/' segment.
function buildUrl(baseGateway, cidPath) {
  // 1. Normalize gateway: ensure protocol, remove any trailing /ipfs or slashes.
  let gw = ensureProtocol(String(baseGateway || "").trim());
  gw = gw.replace(/\/+$/, "");     // remove trailing slashes
  if (gw.endsWith('/ipfs')) {
    gw = gw.slice(0, -5);       // remove /ipfs
  }
  gw = gw.replace(/\/+$/, "");     // remove slashes again

  // 2. The path is expected to be pre-normalized, but we clean it as a fallback.
  const path = normalizeInput(cidPath);
  
  if (!gw || !path) return "";
  
  // 3. Join them correctly.
  return `${gw}/ipfs/${path}`;
}

async function tryGateways(cidPath, gateways, { timeoutMs = 8000, init = {} } = {}) {
  const errors = [];
  for (const gw of gateways) {
    const url = buildUrl(gw, cidPath);
    try {
      const res = await fetchWithTimeout(url, { timeoutMs, ...init });
      if (res && res.ok) {
        return { res, url, gateway: gw };
      }

      const httpError = new Error(`Gateway ${gw} -> HTTP ${res.status}`);
      httpError.url = url;
      httpError.status = res.status;
      errors.push(httpError);

    } catch (e) {
      const networkError = new Error(`Gateway ${gw} -> ${e?.name || "Error"}: ${e?.message || e}`);
      networkError.url = url;
      errors.push(networkError);
    }
  }
  const err = new Error("All IPFS gateways failed");
  err.causes = errors;
  if (errors.some(e => e.status === 404)) {
      err.is404 = true;
  }
  throw err;
}

async function fetchBest(app, ipfsPath, options = {}) {
  const { postGateways = [], timeoutMs = 8000, ...fetchOptions } = options;
  const cidPath = normalizeInput(ipfsPath);
  let gatewaysToTry = [];
  
  let effectiveTimeout = timeoutMs;

  if (app.localIpfsEnabled() && app.localIpfsGateway()) {
    gatewaysToTry = [app.localIpfsGateway()];
    effectiveTimeout = 30000;
  } else {
    const systemGateways = app.remoteIpfsGateways() || [];
    gatewaysToTry = [...new Set([...postGateways, ...systemGateways])];
  }

  if (gatewaysToTry.length === 0) {
    throw new Error("No IPFS gateways available to try.");
  }

  return tryGateways(cidPath, gatewaysToTry, { timeoutMs: effectiveTimeout, init: fetchOptions });
}

async function getJSONBest(app, ipfsPath, options = {}) {
  const { res, url, gateway } = await fetchBest(app, ipfsPath, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  });
  return { data: await res.json(), url, gateway };
}

export const ipfs = {
  fetchBest,
  getJSONBest,
  normalizeInput,
  buildUrl,
};