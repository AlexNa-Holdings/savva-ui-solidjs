// Minimal IPFS client with gateway fallback.
// Usage:
//   import { ipfs } from "../ipfs";
//   const res = await ipfs.fetch("Qm.../file.json", { gateways: myGateways });
//   const json = await ipfs.getJSON("ipfs://Qm.../file.json", { gateways: myGateways });

function ensureSlash(s) { return s.endsWith("/") ? s : s + "/"; }
function stripPrefix(s, p) { return s.startsWith(p) ? s.slice(p.length) : s; }

function normalizeInput(input) {
  // Accepts: "ipfs://CID/path", "/ipfs/CID/path", "CID[/path]"
  let s = String(input || "").trim();
  if (!s) throw new Error("ipfs: empty input");
  s = stripPrefix(s, "ipfs://");
  s = stripPrefix(s, "/ipfs/");
  s = stripPrefix(s, "ipfs/");
  return s; // "CID[/path]"
}

function buildUrl(baseGateway, cidPath) {
  // baseGateway may be ".../ipfs/" or a raw origin.
  const g = baseGateway.replace(/\/+$/g, ""); // remove trailing slashes
  const hasIpfs = /\/ipfs$/i.test(g);
  const prefix = hasIpfs ? g + "/" : g + "/ipfs/";
  return prefix + cidPath.replace(/^\/+/g, "");
}

async function fetchWithTimeout(url, { timeoutMs, signal, ...init }) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  const compositeSignal = signal
    ? new AbortController()
    : null;

  // If a signal was provided, abort our controller when it aborts.
  if (signal && compositeSignal) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(tid);
  }
}

async function tryGateways(cidPath, gateways, { timeoutMs = 8000, init = {} } = {}) {
  const errors = [];
  for (const gw of gateways) {
    const url = buildUrl(gw, cidPath);
    try {
      const res = await fetchWithTimeout(url, { timeoutMs, ...init });
      if (res && res.ok) return { res, url, gateway: gw };
      // Treat non-2xx as failure and continue
      errors.push(new Error(`Gateway ${gw} -> HTTP ${res.status}`));
    } catch (e) {
      errors.push(new Error(`Gateway ${gw} -> ${e?.name || "Error"}: ${e?.message || e}`));
    }
  }
  const err = new Error("All IPFS gateways failed");
  err.causes = errors;
  throw err;
}

async function fetchIpfs(input, opts = {}) {
  const {
    gateways = [],
    timeoutMs = 8000,
    signal,
    cache = "default",
    headers,
    method = "GET",
  } = opts;

  if (!gateways || gateways.length === 0) {
    throw new Error("ipfs.fetch: no gateways provided");
  }
  const cidPath = normalizeInput(input);
  const { res, url, gateway } = await tryGateways(cidPath, gateways, {
    timeoutMs,
    init: { method, headers, cache, signal }
  });
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

export const ipfs = {
  fetch: fetchIpfs,
  getJSON,
  getText,
  getBlob,
  getArrayBuffer,
  // Utils you may want in other places:
  normalizeInput,
  buildUrl,
};
