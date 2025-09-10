// src/x/profile/userProfileStore.js
import { createMemo, createResource, createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const cache = new Map();    // cid -> json
const inflight = new Map(); // cid -> Promise<json|null>

const eqAddr = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.trim().toLowerCase() === b.trim().toLowerCase();

function buildIpfsUrls(app, cid) {
  const base = app.config?.()?.backendLink || "";
  const u = new URL(base);
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  return [
    new URL(`ipfs/${encodeURIComponent(cid)}`, u).toString(),
    new URL(`ipfs/cat?cid=${encodeURIComponent(cid)}`, u).toString(),
  ];
}

async function fetchProfileJSON(app, cid) {
  if (!cid) return null; // fetcher is never called when source returns undefined
  if (cache.has(cid)) return cache.get(cid);
  if (inflight.has(cid)) return inflight.get(cid);

  const urls = buildIpfsUrls(app, cid);

  const p = (async () => {
    let lastErr = null;
    for (const link of urls) {
      try {
        const res = await fetch(link, { headers: { Accept: "application/json" }, cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          cache.set(cid, json);
          inflight.delete(cid);
          return json;
        }
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn("profile fetch failed:", lastErr);
    inflight.delete(cid);
    return null;
  })();

  inflight.set(cid, p);
  return p;
}

export function getCachedUserProfile(cid) {
  return cid ? cache.get(cid) ?? null : null;
}
export function invalidateUserProfile(cid) {
  if (!cid) return;
  cache.delete(cid);
  inflight.delete(cid);
}
export function primeUserProfile(cid, json) {
  if (!cid) return;
  cache.set(cid, json ?? null);
  inflight.delete(cid);
}
export function acceptNewProfileCid(oldCid, newCid, newJson) {
  if (oldCid && oldCid !== newCid) invalidateUserProfile(oldCid);
  if (newCid && newJson) primeUserProfile(newCid, newJson);
}

export function selectField(obj, path, fallback = undefined) {
  if (!obj || !path) return fallback;
  let cur = obj;
  for (const key of String(path).split(".")) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, key)) cur = cur[key];
    else return fallback;
  }
  return cur === undefined ? fallback : cur;
}

function normalizeCid(v) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : undefined; // returning undefined defers the resource
}

// -------- Arbitrary profile by CID (sticky)
export function useProfileByCid(cidAccessor) {
  const app = useApp();

  const normalizedCid = createMemo(() => {
    const raw = typeof cidAccessor === "function" ? cidAccessor() : cidAccessor;
    return normalizeCid(raw);
  });

  const [profile, { refetch }] = createResource(
    normalizedCid,
    (cid) => fetchProfileJSON(app, cid),
    { initialValue: null }
  );

  // Sticky last-good value + last seen cid
  const [lastCid, setLastCid] = createSignal();
  const [lastProfile, setLastProfile] = createSignal(null);

  createEffect(() => {
    const c = normalizedCid();
    if (c) setLastCid(c);
  });
  createEffect(() => {
    const v = profile();
    if (v != null) setLastProfile(v);
  });

  const dataStable = createMemo(() => {
    const v = profile();
    if (v != null) return v;                       // fresh
    const c = normalizedCid();
    if (c) {
      const cached = getCachedUserProfile(c);      // cache for current cid
      if (cached != null) return cached;
    }
    const lc = lastCid();
    if (lc) {
      const cached = getCachedUserProfile(lc);     // cache for last cid
      if (cached != null) return cached;
    }
    return lastProfile();                           // last known good
  });

  function refresh() {
    const c = normalizedCid();
    if (!c) return null;
    invalidateUserProfile(c);
    return refetch();
  }
  function peek() {
    const c = normalizedCid();
    return getCachedUserProfile(c);
  }

  return { data: profile, dataStable, refresh, peek, cid: normalizedCid };
}

// -------- Authenticated user's profile (sticky)
export default function useUserProfile() {
  const app = useApp();

  // track whichever signal your app exposes
  const user = createMemo(() => {
    const a = typeof app.auth?.authorizedUser === "function" ? app.auth.authorizedUser() : undefined;
    const b = typeof app.authorizedUser === "function" ? app.authorizedUser() : undefined;
    return a ?? b;
  });

  const profileCid = createMemo(() => normalizeCid(user()?.profile_cid));

  const { data, dataStable, refresh, peek, cid } = useProfileByCid(profileCid);

  // IMPORTANT: we DO NOT clear lastProfile on transient empties.
  // If you need a hard clear (real logout), call resetUserProfileCache() below.

  return { cid, data, dataStable, refresh, peek };
}

export function resetUserProfileCache() {
  cache.clear();
  inflight.clear();
}

/**
 * Update stored SELF profile only if:
 *  - ownerAddress == authorizedUser.address
 *  - AND actorAddress == authorizedUser.address
 * Always seed/evict caches for the edited entity’s CID.
 */
export async function applyProfileEditResult(app, params) {
  const {
    ownerAddress,
    oldCid,
    newCid,
    profileJson,
    actorAddress,
    ensureAuthRefresh = true,
  } = params || {};

  const auth = (typeof app?.auth?.authorizedUser === "function" ? app.auth.authorizedUser() : undefined)
            ?? (typeof app?.authorizedUser === "function" ? app.authorizedUser() : undefined);

  const authAddr = auth?.address;

  if (newCid && profileJson) primeUserProfile(newCid, profileJson);
  if (oldCid && oldCid !== newCid) invalidateUserProfile(oldCid);

  const isSelf      = eqAddr(ownerAddress, authAddr);
  const isActorSelf = eqAddr(actorAddress, authAddr);

  if (!(isSelf && isActorSelf)) return { updatedAuthProfile: false };

  acceptNewProfileCid(oldCid, newCid, profileJson);

  if (ensureAuthRefresh) {
    if (typeof app?.auth?.refreshAuthorizedUser === "function") {
      await app.auth.refreshAuthorizedUser();
    } else if (typeof app?.auth?.setAuthorizedUser === "function") {
      const u = { ...(auth || {}), profile_cid: newCid };
      app.auth.setAuthorizedUser(u);
    } else if (typeof app?.setAuthorizedUser === "function") {
      const u = { ...(auth || {}), profile_cid: newCid };
      app.setAuthorizedUser(u);
    }
  }

  return { updatedAuthProfile: true };
}
