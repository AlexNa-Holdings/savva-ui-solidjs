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

function buildUrl(baseGateway, cidPath) {
  const base = String(baseGateway || "").trim().replace(/\/+$/, "");
  const path = String(cidPath || "").trim().replace(/^\/+/g, "");
  if (!base || !path) return "";
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