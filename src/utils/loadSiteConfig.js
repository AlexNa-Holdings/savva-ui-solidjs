// src/utils/loadSiteConfig.js
// Loads site config: tries /default_connect.json first, falls back to /default_connect.yaml.
import { parse } from "yaml";

export async function loadSiteConfig() {
  // Try JSON first
  try {
    const res = await fetch("/default_connect.json", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return data || {};
    }
  } catch {
    // JSON not available or parse error — fall through to YAML
  }

  // Fall back to YAML
  const res = await fetch("/default_connect.yaml", { cache: "no-store" });
  if (!res.ok) throw new Error(`Site config load failed: ${res.status}`);
  return parse(await res.text()) || {};
}
