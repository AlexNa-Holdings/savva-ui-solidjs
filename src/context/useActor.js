// src/context/useActor.js
import { createSignal, createMemo, createEffect } from "solid-js";
import { getWsApi } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";
import { pushErrorToast } from "../ui/toast.js";

const ACTOR_KEY = "savva_actor_v1";

function readPersisted() {
  try { return JSON.parse(localStorage.getItem(ACTOR_KEY) || "null") || null; } catch { return null; }
}
function writePersisted(v) {
  try { if (!v) localStorage.removeItem(ACTOR_KEY); else localStorage.setItem(ACTOR_KEY, JSON.stringify(v)); } catch {}
}

/**
 * Centralized "acting as" state.
 * - mode: 'self' | 'npo'
 * - actorAddress(): the effective address for signing/attribution
 * - actorProfile(): resolved profile of the current actor (user or NPO)
 * - npoMemberships(): the confirmed NPOs the user can act as
 */
export function useActor({ app, t }) {
  const [actor, setActor] = createSignal({ mode: "self", address: "" });
  const [npoMemberships, setNpoMemberships] = createSignal([]);
  const [selectedNpoProfile, setSelectedNpoProfile] = createSignal(null);

  const authorizedUser = () => app.authorizedUser?.();
  const domainName = () => app.selectedDomainName?.() || "";

  const actorAddress = createMemo(() => {
    const a = actor();
    if (a.mode === "npo" && a.address) return a.address;
    return authorizedUser()?.address || "";
  });

  const isActingAsNpo = createMemo(() => actor().mode === "npo" && !!actor().address);

  const actorProfile = createMemo(() => {
    if (isActingAsNpo()) return selectedNpoProfile();
    return authorizedUser() || null;
  });

  let prevUserAddr = null;
  let prevDomain = null;
  let initialized = false;

  // Initial restore (same domain + same user)
  createEffect(() => {
    const u = authorizedUser();
    const dom = domainName();
    if (!u || !dom || initialized) return;

    const persisted = readPersisted();
    if (
      persisted &&
      persisted.domain === dom &&
      persisted.user?.toLowerCase() === (u.address || "").toLowerCase() &&
      persisted.mode === "npo" &&
      persisted.address
    ) {
      setActor({ mode: "npo", address: String(persisted.address) });
      void refreshActorProfile(String(persisted.address));
    } else {
      setActor({ mode: "self", address: "" });
      setSelectedNpoProfile(null);
    }
    initialized = true;
    prevUserAddr = u.address || null;
    prevDomain = dom;
  });

  // On LOGIN (null -> address), force 'self' as per spec; on LOGOUT clear everything.
  createEffect(() => {
    const u = authorizedUser();
    const current = u?.address || null;

    const isLogin = (prevUserAddr == null && current != null);
    const isLogout = (prevUserAddr != null && current == null);
    const userChanged = (prevUserAddr && current && prevUserAddr.toLowerCase() !== current.toLowerCase());

    if (isLogin || userChanged) {
      // After authorization we start as self.
      setActor({ mode: "self", address: "" });
      setSelectedNpoProfile(null);
      writePersisted({ domain: domainName(), user: current, mode: "self" });
      void refreshNpoMemberships();
    } else if (isLogout) {
      setActor({ mode: "self", address: "" });
      setSelectedNpoProfile(null);
      setNpoMemberships([]);
      writePersisted(null);
    }

    prevUserAddr = current;
  });

  // On DOMAIN change, clear actor + memberships (spec).
  createEffect(() => {
    const dom = domainName();
    if (!initialized) return;
    if (prevDomain && dom && dom !== prevDomain) {
      setActor({ mode: "self", address: "" });
      setSelectedNpoProfile(null);
      setNpoMemberships([]);
      // Keep persisted entry for same-domain restores; will be ignored on mismatch.
    }
    prevDomain = dom;
  });

  async function refreshActorProfile(addr) {
    try {
      const api = getWsApi();
      const profile = await api.call("get-user", {
        domain: domainName(),
        user_addr: toChecksumAddress(addr),
      });
      setSelectedNpoProfile(profile || { address: addr, is_npo: true });
    } catch (e) {
      pushErrorToast(e, { message: t("errors.loadFailed") });
    }
  }

  async function refreshNpoMemberships() {
    const u = authorizedUser();
    const userAddr = u?.address;
    if (!userAddr) { setNpoMemberships([]); return []; }
    try {
      const api = getWsApi();
      const res = await api.call("list-npo", {
        domain: domainName(),
        user_addr: toChecksumAddress(userAddr),
        confirmed_only: true,
        limit: 200,
        offset: 0,
      });
      const list = Array.isArray(res) ? res : (Array.isArray(res?.list) ? res.list : []);
      setNpoMemberships(list);
      return list;
    } catch (e) {
      pushErrorToast(e, { message: t("errors.loadFailed") });
      setNpoMemberships([]);
      return [];
    }
  }

  async function actAsSelf() {
    setActor({ mode: "self", address: "" });
    setSelectedNpoProfile(null);
    const user = authorizedUser();
    writePersisted({ domain: domainName(), user: user?.address || "", mode: "self" });
  }

  async function actAsNpo(addr) {
    const address = String(addr || "").trim();
    if (!address) return;
    setActor({ mode: "npo", address });
    await refreshActorProfile(address);
    const user = authorizedUser();
    writePersisted({ domain: domainName(), user: user?.address || "", mode: "npo", address });
  }

  // Fetch memberships once authorized
  createEffect(() => {
    if (authorizedUser()?.address) void refreshNpoMemberships();
  });

  return {
    // state
    actor,               // { mode, address }
    actorAddress,        // () => string
    actorProfile,        // () => user or NPO profile
    isActingAsNpo,       // () => boolean
    npoMemberships,      // () => array

    // actions
    actAsSelf,
    actAsNpo,
    refreshNpoMemberships,
  };
}
