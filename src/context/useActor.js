// src/context/useActor.js
import * as Solid from "solid-js";
import { getWsApi } from "../net/wsRuntime.js";
import { toChecksumAddress } from "../blockchain/utils.js";
import { pushErrorToast } from "../ui/toast.js";

export function useActor(props) {
  const { auth, loading, selectedDomainName, t } = props;

  const domainName = () => (typeof selectedDomainName === "function" ? selectedDomainName() : selectedDomainName || "");
  const authorizedUser = () => (typeof auth.authorizedUser === "function" ? auth.authorizedUser() : null) || null;

  const [actor, setActor] = Solid.createSignal({ mode: "self", address: "" });
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

  let prevUserAddr = null;
  Solid.createEffect(() => {
    const u = authorizedUser();
    const current = u?.address || null;

    const isLogin    = (prevUserAddr == null && current != null);
    const isLogout   = (prevUserAddr != null && current == null);
    const userChange = (prevUserAddr && current && prevUserAddr.toLowerCase() !== current.toLowerCase());

    if (isLogin || userChange) {
      actAsSelf();
      if (typeof loading === 'function' && !loading()) void refreshNpoMemberships();
    } else if (isLogout) {
      actAsSelf();
      setNpoMemberships([]);
    }
    prevUserAddr = current;
  });

  let prevDomain = null;
  Solid.createEffect(() => {
    const dom = domainName();
    if (prevDomain && dom && dom !== prevDomain) {
      actAsSelf();
      setNpoMemberships([]);
    }
    prevDomain = dom;
  });

  // Initial load after auth and connection is ready
  Solid.createEffect(() => {
    if (authorizedUser()?.address && typeof loading === 'function' && !loading()) {
      void refreshNpoMemberships();
    }
  });

  return {
    actor,
    actorAddress,
    actorProfile,
    isActingAsNpo,
    npoMemberships,
    actAsSelf,
    actAsNpo,
    refreshNpoMemberships,
  };
}