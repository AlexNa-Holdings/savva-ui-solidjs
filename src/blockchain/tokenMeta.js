// src/blockchain/tokenMeta.js
import { createPublicClient, http } from "viem";

// Minimal ERC-20 ABI (no JSX here)
const ERC20_MIN_ABI = [
  { name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
  { name: "symbol",   inputs: [], outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
];

// In-memory cache: key = `${chainId}:${addrLowerOrEmpty}`
const _cache = new Map();

function _key(chainId, addr) {
  return `${chainId || 0}:${(addr || "").toLowerCase()}`;
}
function _publicClient(app) {
  const chain = app?.desiredChain?.();
  const url = chain?.rpcUrls?.[0];
  return url ? createPublicClient({ chain, transport: http(url) }) : null;
}
function _nativeSymbol(app) {
  return app?.desiredChain?.().nativeCurrency?.symbol || "PLS";
}

// Resolve SAVVA/STAKE addresses once per session
let _savvaAddrCached = null;
let _stakingAddrCached = null;
async function _getSavvaAddresses(app) {
  if (_savvaAddrCached && _stakingAddrCached) return { savva: _savvaAddrCached, staking: _stakingAddrCached };
  try {
    const { getSavvaContract } = await import("./contracts.js");
    const savvaC   = await getSavvaContract(app, "SavvaToken");
    const stakingC = await getSavvaContract(app, "Staking");
    _savvaAddrCached   = (savvaC?.address || "").toLowerCase() || null;
    _stakingAddrCached = (stakingC?.address || "").toLowerCase() || null;
  } catch { /* noop */ }
  return { savva: _savvaAddrCached, staking: _stakingAddrCached };
}

/**
 * getTokenInfo(app, tokenAddress)
 * Returns { symbol, decimals } with caching and SAVVA overrides.
 *
 * Rules:
 *  - Base token (empty string): (nativeSymbol, 18)
 *  - SAVVA token address:       ("SAVVA", 18)
 *  - Staking contract address:  ("SAVVA-STAKED", 18)
 *  - Other ERC-20:               read once from chain, then cache
 */
export async function getTokenInfo(app, tokenAddress) {
  const chain = app?.desiredChain?.();
  const chainId = chain?.id || 0;

  // Base/native coin (empty address)
  if (!tokenAddress) {
    const res = { symbol: _nativeSymbol(app), decimals: 18 };
    _cache.set(_key(chainId, ""), res);
    return res;
  }

  const addr = String(tokenAddress).toLowerCase();
  const k = _key(chainId, addr);
  if (_cache.has(k)) return _cache.get(k);

  // SAVVA overrides
  const { savva, staking } = await _getSavvaAddresses(app);
  if (savva && addr === savva) {
    const res = { symbol: "SAVVA", decimals: 18 };
    _cache.set(k, res);
    return res;
  }
  if (staking && addr === staking) {
    const res = { symbol: "SAVVA-STAKED", decimals: 18 };
    _cache.set(k, res);
    return res;
  }

  // Generic ERC-20
  const pc = _publicClient(app);
  if (!pc) {
    const res = { symbol: "TOK", decimals: 18 };
    _cache.set(k, res);
    return res;
  }

  let decimals = 18, symbol = "TOK";
  try {
    const d = await pc.readContract({ address: addr, abi: ERC20_MIN_ABI, functionName: "decimals" });
    decimals = Number(d ?? 18);
  } catch {}
  try {
    const s = await pc.readContract({ address: addr, abi: ERC20_MIN_ABI, functionName: "symbol" });
    symbol = String(s || "TOK").slice(0, 32);
  } catch {}

  const res = { symbol, decimals };
  _cache.set(k, res);
  return res;
}

export function clearTokenInfoCache() {
  _cache.clear();
  _savvaAddrCached = null;
  _stakingAddrCached = null;
}
