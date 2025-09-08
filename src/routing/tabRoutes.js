// src/routing/tabRoutes.js
export const TAB_PREFIX = "/t";

function slug(s) {
  return String(s || "").trim().toLowerCase();
}

/** e.g., "leaders" -> "/t/leaders" */
export function tabPath(idOrType) {
  const key = slug(idOrType);
  return `${TAB_PREFIX}/${encodeURIComponent(key)}`;
}

/** If route is "/t/<key>?..." returns "<key>", else "" */
export function tabKeyFromRoute(route) {
  const r = String(route || "");
  if (!r.startsWith(TAB_PREFIX + "/")) return "";
  const key = r.slice((TAB_PREFIX + "/").length);
  return decodeURIComponent((key || "").split(/[?#]/)[0]);
}