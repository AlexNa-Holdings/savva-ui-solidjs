// src/utils/loadSiteConfig.js
export async function loadSiteConfig() {
  const res = await fetch("/default_connect.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Site config load failed: ${res.status}`);
  return (await res.json()) || {};
}
