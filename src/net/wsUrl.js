// File: src/net/wsUrl.js
export function toWsUrl(backendHttpUrl, { path = "/ws", query = {} } = {}) {
  if (!backendHttpUrl) return "";
  const u = new URL(backendHttpUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  const basePath = u.pathname.endsWith("/") ? u.pathname : (u.pathname + "/");
  const wsPath = path.startsWith("/") ? path.slice(1) : path;
  u.pathname = basePath + wsPath;

  const params = new URLSearchParams(u.search);
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") params.set(k, String(v));
  }
  u.search = params.toString() ? `?${params.toString()}` : "";
  return u.toString();
}
