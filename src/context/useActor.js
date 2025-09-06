// src/context/useActor.js
import * as Solid from "solid-js";
import { getWsApi } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";
import { pushErrorToast } from "../ui/toast.js";

export function useActor(input = {}) {
  // Support both signatures: { app } or { auth, conn, selectedDomainName }
  const app  = input.app || null;
  const auth = input.auth || app || {};
  const domSig = input.selectedDomainName;

  const domainName = () =>
    app?.selectedDomainName?.() ??
    (typeof domSig === "function" ? domSig() : (domSig || ""));

  const authorizedUser = () =>
    (typeof auth.authorizedUser === "function" ? auth.authorizedUser() : null) || null;

  const [actor, setActor] = Solid.createSignal({ mode: "self", address: "" }); // 'self' | 'npo'
  const [npoMemberships, setNpoMemberships] = Solid.createSignal([]);
  const [selectedNpoProfile, setSelectedNpoProfile] = Solid.createSignal(null);

  const isActingAsNpo = Solid.createMemo(() => actor().mode === "npo" && !!actor().address);
  const actorAddress  = Solid.createMemo(() => (isActingAsNpo() ? actor().address : (authorizedUser()?.address || "")));
  const actorProfile  = Solid.createMemo(() => (isActingAsNpo() ? selectedNpoProfile() : authorizedUser() || null));

  async function refreshActorProfile(address) {
    try {
      const api = getWsApi();
      const res = await api.call("get-user", { domain: domainName(), user_addr: address });
      setSelectedNpoProfile(res || { address, is_npo: true });
    } catch {
      setSelectedNpoProfile({ address, is_npo: true });
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
      // use app.t if present; otherwise fall back silently
      const t = app?.t || ((k) => k);
      pushErrorToast(e, { message: t("errors.loadFailed") });
      setNpoMemberships([]);
      return [];
    }
  }

  async function actAsSelf() {
    setActor({ mode: "self", address: "" });
    setSelectedNpoProfile(null);
  }

  async function actAsNpo(addr) {
    const address = String(addr || "").trim();
    if (!address) return;
    setActor({ mode: "npo", address });
    await refreshActorProfile(address);
  }

  // Reset on login/logout; load memberships on login
  let prevUserAddr = null;
  Solid.createEffect(() => {
    const u = authorizedUser();
    const current = u?.address || null;

    const isLogin    = (prevUserAddr == null && current != null);
    const isLogout   = (prevUserAddr != null && current == null);
    const userChange = (prevUserAddr && current && prevUserAddr.toLowerCase() !== current.toLowerCase());

    if (isLogin || userChange) {
      actAsSelf();
      void refreshNpoMemberships();
    } else if (isLogout) {
      actAsSelf();
      setNpoMemberships([]);
    }
    prevUserAddr = current;
  });

  // Reset on domain change
  let prevDomain = null;
  Solid.createEffect(() => {
    const dom = domainName();
    if (prevDomain && dom && dom !== prevDomain) {
      actAsSelf();
      setNpoMemberships([]);
    }
    prevDomain = dom;
  });

  // Initial load after auth
  Solid.createEffect(() => {
    if (authorizedUser()?.address) void refreshNpoMemberships();
  });

  return {
    // state
    actor,                     // { mode, address }
    actorAddress,              // () => string
    actorProfile,              // () => user or NPO profile
    isActingAsNpo,             // () => boolean
    npoMemberships,            // () => array

    // actions
    actAsSelf,
    actAsNpo,
    refreshNpoMemberships,
  };
}
