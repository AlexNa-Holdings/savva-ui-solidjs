// src/blockchain/tokenAmount.js
import { parseUnits, formatUnits } from "viem";
import { getTokenInfo } from "./tokenMeta.js";

// Normalize user text like "1,23  " -> "1.23"
function normalizeDecimalInput(text) {
  if (text == null) return "";
  let s = String(text).trim();
  // Allow only digits and decimal separators, replace comma with dot
  s = s.replace(/,/g, ".").replace(/[^\d.]/g, "");
  // Disallow multiple dots or lone dot
  if ((s.match(/\./g) || []).length > 1) throw new Error("invalid-decimal");
  if (s === "." || s === "") throw new Error("empty");
  return s;
}

/** Sync: parse with known decimals */
export function parseAmountWithDecimals(text, decimals) {
  const dec = Number.isFinite(decimals) ? Number(decimals) : 18;
  const s = normalizeDecimalInput(text);
  return parseUnits(s, dec); // bigint, exact, supports 0.000...001
}

/** Async: parse using token decimals resolved from meta */
export async function parseAmount(app, tokenAddress, text) {
  const addr = tokenAddress ? String(tokenAddress).toLowerCase() : "";
  const meta = await getTokenInfo(app, addr);
  const dec = Number(meta?.decimals ?? 18);
  return parseAmountWithDecimals(text, dec);
}

/** Sync: format a bigint wei with known decimals */
export function formatAmountWithDecimals(wei, decimals, fractionDigits = 6) {
  try {
    const dec = Number.isFinite(decimals) ? Number(decimals) : 18;
    const s = formatUnits(BigInt(wei ?? 0n), dec);
    // limit visible fraction (UI may choose its own formatting after this)
    const [int, frac = ""] = s.split(".");
    return frac ? `${int}.${frac.slice(0, fractionDigits)}` : int;
  } catch {
    return "0";
  }
}

/** Async: format using token decimals from meta */
export async function formatAmount(app, tokenAddress, wei, fractionDigits = 6) {
  const addr = tokenAddress ? String(tokenAddress).toLowerCase() : "";
  const meta = await getTokenInfo(app, addr);
  return formatAmountWithDecimals(wei, Number(meta?.decimals ?? 18), fractionDigits);
}
