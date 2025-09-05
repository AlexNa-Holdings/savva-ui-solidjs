// src/blockchain/tokenMeta.js
// Single source of truth for token meta (symbol, decimals, Icon).
import { createPublicClient, http } from "viem";
import SavvaTokenIcon from "../x/ui/icons/SavvaTokenIcon.jsx";
import QuestionTokenIcon from "../x/ui/icons/QuestionTokenIcon.jsx";
import { getChainLogo } from "./chainLogos.js";
import { Show } from "solid-js";

// Minimal ERC-20 ABI
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
function _normalizeAddr(addr) {
  if (!addr) return "";
  const s = String(addr).trim();
  return s === "0" ? "" : s.toLowerCase();
}

// Resolve SAVVA / STAKING addresses once per session (lazy)
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
  } catch { /* ignore */ }
  return { savva: _savvaAddrCached, staking: _stakingAddrCached };
}

function makeChainIcon(chainId) {
  const ChainLogo = getChainLogo(chainId);
  // If chain logo is missing, fall back to question icon
  return function Icon(props = {}) {
      return (
          <Show when={ChainLogo} fallback={<QuestionTokenIcon {...props} />}>
              <ChainLogo {...props} />
          </Show>
      );
  };
}

/**
 * getTokenInfo(app, tokenAddress)
 * Returns a stable meta object:
 * { symbol: string, decimals: number, Icon: Component }
 *
 * Rules:
 * - Base token ("" or "0"):   { symbol: native,        decimals: 18, Icon: chain logo (or ? fallback) }
 * - SAVVA token address:      { symbol: "SAVVA",       decimals: 18, Icon: Savva }
 * - Staking contract address: { symbol: "SAVVA_VOTES", decimals: 18, Icon: Savva }
 * - Generic ERC-20:           read symbol/decimals via viem, Icon: ? fallback
 */
export async function getTokenInfo(app, tokenAddress) {
  const chain = app?.desiredChain?.();
  const chainId = chain?.id || 0;

  const addr = _normalizeAddr(tokenAddress);
  const k = _key(chainId, addr);

  // Base/native coin
  if (!addr) {
    const res = { symbol: _nativeSymbol(app), decimals: 18, Icon: makeChainIcon(chainId) };
    _cache.set(k, res);
    return res;
  }

  // Cached?
  if (_cache.has(k)) return _cache.get(k);

  // SAVVA overrides
  const { savva, staking } = await _getSavvaAddresses(app);
  if (savva && addr === savva) {
    const res = { symbol: "SAVVA", decimals: 18, Icon: SavvaTokenIcon };
    _cache.set(k, res);
    return res;
  }
  if (staking && addr === staking) {
    const res = { symbol: "SAVVA_VOTES", decimals: 18, Icon: SavvaTokenIcon };
    _cache.set(k, res);
    return res;
  }

  // Generic ERC-20
  const pc = _publicClient(app);
  if (!pc) {
    const res = { symbol: "TOK", decimals: 18, Icon: QuestionTokenIcon };
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

  const res = { symbol, decimals, Icon: QuestionTokenIcon };
  _cache.set(k, res);
  return res;
}

export function clearTokenInfoCache() {
  _cache.clear();
  _savvaAddrCached = null;
  _stakingAddrCached = null;
}