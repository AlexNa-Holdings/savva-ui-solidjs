// src/x/post/crossChainPostLookup.js
import { toChecksumAddress } from "../../blockchain/utils.js";

function ensureSlash(url) {
  if (!url) return "";
  return url.endsWith("/") ? url : url + "/";
}

function normalizeBackend(url) {
  return ensureSlash(String(url || "").trim().toLowerCase());
}

function safeChecksum(addr) {
  try { return toChecksumAddress(addr); } catch { return undefined; }
}

function buildContentListUrl(chain, identifier, domain, lang, myAddr) {
  const url = new URL(ensureSlash(chain.rpc) + "content-list");
  if (identifier.startsWith("0x")) url.searchParams.set("savva_cid", identifier);
  else url.searchParams.set("short_cid", identifier);
  if (domain) url.searchParams.set("domain", domain);
  if (lang) url.searchParams.set("lang", lang);
  url.searchParams.set("limit", "1");
  url.searchParams.set("show_nsfw", "true");
  url.searchParams.set("show_all_encrypted_posts", "true");
  if (myAddr) url.searchParams.set("my_addr", myAddr);
  return url.toString();
}

async function probeChain(chain, identifier, domain, lang, myAddr, parentSignal, timeoutMs) {
  const ctrl = new AbortController();
  if (parentSignal?.aborted) ctrl.abort();
  const onParentAbort = () => ctrl.abort();
  parentSignal?.addEventListener("abort", onParentAbort);
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = buildContentListUrl(chain, identifier, domain, lang, myAddr);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : Array.isArray(body?.list) ? body.list : [];
    if (arr.length === 0) throw new Error("not found");
    return chain;
  } finally {
    clearTimeout(tid);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

// Probes every configured chain *other than* the current one (in parallel) and
// returns the first chain whose backend has the post. Returns null if none does.
//
// The encryption/access state of the post is intentionally ignored here — we
// only need to know which chain owns the content. Decryption happens after the
// user actually switches to that chain.
export async function findPostOnOtherChains(params) {
  const {
    identifier,
    currentBackendLink,
    siteDomain,
    lang,
    myAddr,
    chains,
    signal,
    timeoutMs = 5000,
  } = params;

  if (!identifier || !Array.isArray(chains) || chains.length <= 1) return null;

  const current = normalizeBackend(currentBackendLink);
  const seen = new Set();
  const candidates = chains.filter((c) => {
    if (!c?.rpc) return false;
    const n = normalizeBackend(c.rpc);
    if (n === current) return false;
    if (seen.has(n)) return false;
    seen.add(n);
    return true;
  });
  if (candidates.length === 0) return null;

  const checksumAddr = myAddr ? safeChecksum(myAddr) : undefined;
  const masterCtrl = new AbortController();
  const onParentAbort = () => masterCtrl.abort();
  if (signal?.aborted) masterCtrl.abort();
  signal?.addEventListener("abort", onParentAbort);

  try {
    const probes = candidates.map((c) =>
      probeChain(c, identifier, siteDomain, lang, checksumAddr, masterCtrl.signal, timeoutMs)
    );
    const winner = await Promise.any(probes);
    masterCtrl.abort(); // cancel the remaining in-flight probes
    return winner;
  } catch {
    return null;
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
  }
}
