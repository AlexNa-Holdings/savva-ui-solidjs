/* src/x/actors/ActorStore.jsx */
import { createSignal, createMemo, createEffect, on } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export default function ActorStore() {
  const app = useApp();

  // Confirmed NPO memberships for the authorized user (lazy-filled by UI)
  const [npoList, setNpoList] = createSignal([]);

  // Active actor
  const [actorType, setActorType] = createSignal("self"); // 'self' | 'npo'
  const [actorNpo, setActorNpo] = createSignal(null);     // selected NPO object

  const actorIsNpo = createMemo(() => actorType() === "npo");
  const actorProfile = createMemo(() => (actorIsNpo() ? (actorNpo()?.user || actorNpo()) : app.authorizedUser?.()));
  const actorAddress = createMemo(() => (actorIsNpo() ? actorNpo()?.address : app.authorizedUser?.()?.address) || null);

  function setActingAsSelf() {
    setActorType("self");
    setActorNpo(null);
  }
  function setActingAsNpo(npo) {
    if (!npo) { setActingAsSelf(); return; }
    const addr = npo.address || npo?.user?.address || "";
    const found = (npoList() || []).find(x => eq(x.address, addr)) || npo;
    setActorNpo(found);
    setActorType("npo");
  }

  // Reset actor + list whenever auth or domain changes
  createEffect(on([app.authorizedUser, app.selectedDomainName], () => {
    setActingAsSelf();
    setNpoList([]);
  }, { defer: true }));

  // Expose to the global app context (same pattern as WsConnector)
  app.npoList = npoList;
  app.setNpoList = setNpoList;
  app.actorType = actorType;
  app.actorIsNpo = actorIsNpo;
  app.actorNpo = actorNpo;
  app.actorProfile = actorProfile;
  app.actorAddress = actorAddress;
  app.setActingAsSelf = setActingAsSelf;
  app.setActingAsNpo = setActingAsNpo;

  return null;
}
