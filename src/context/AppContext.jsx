// src/context/AppContext.jsx
import * as Solid from "solid-js";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain } from "../blockchain/wallet";
import { useI18n } from "../i18n/useI18n";
import { useLocalIpfs } from "../hooks/useLocalIpfs.js";
import { useAppAuth } from "./useAppAuth.js";
import { useAppConnection } from "./useAppConnection.js";
import { useDomainAssets } from "./useDomainAssets.js";
import { pushToast, pushErrorToast } from "../components/ui/toast.js";
import { useHashRouter } from "../routing/hashRouter.js";

const AppContext = Solid.createContext();
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function AppProvider(props) {
  const i18n = useI18n();
  const auth = useAppAuth();
  const conn = useAppConnection();
  const ipfs = useLocalIpfs({ pushToast, pushErrorToast, t: i18n.t });
  
  const [lastTabRoute, setLastTabRoute] = Solid.createSignal("/");
  const [savedScrollY, setSavedScrollY] = Solid.createSignal(0);

  const { route } = useHashRouter();
  Solid.createEffect(Solid.on(route, (nextRoute, prevRoute) => {
    if (!prevRoute) return;
    
    const isCurrentlyOnMainFeed = !/^\/(post|settings|docs)/.test(prevRoute);
    const isNavigatingToPage = /^\/(post|settings|docs)/.test(nextRoute);

    if (isCurrentlyOnMainFeed && isNavigatingToPage) {
      setSavedScrollY(window.scrollY);
    }
  }, { defer: true }));
  
  const supportedDomains = Solid.createMemo(() => {
    const list = conn.info()?.domains || [];
    return [...new Set(list.map(d => (typeof d === "string" ? d : d?.name)).filter(Boolean))]
      .map(name => ({ name, website: list.find(d => d.name === name)?.website || "" }));
  });

  const selectedDomain = Solid.createMemo(() => {
    const explicit = String(conn.config()?.domain || "").trim();
    if (explicit) {
      return supportedDomains().find(d => eq(d.name, explicit)) || explicit;
    }
    return supportedDomains()[0] || "";
  });
  
  const selectedDomainName = Solid.createMemo(() => dn(selectedDomain()));
  const assets = useDomainAssets({ info: conn.info, selectedDomainName, i18n });

  const desiredChainId = Solid.createMemo(() => conn.info()?.blockchain_id ?? null);
  const desiredChain = Solid.createMemo(() => { const id = desiredChainId(); return id ? getChainMeta(id) : null; });
  async function ensureWalletOnDesiredChain() { const meta = desiredChain(); if (!meta) throw new Error("Unknown target chain"); await switchOrAddChain(meta); }
  
  const remoteIpfsGateways = Solid.createMemo(() => (conn.info()?.ipfs_gateways || []).map(g => g.trim().endsWith("/") ? g : `${g}/`));
  const activeIpfsGateways = Solid.createMemo(() => (ipfs.localIpfsEnabled() && ipfs.localIpfsGateway()) ? [ipfs.localIpfsGateway()] : remoteIpfsGateways());
  
  Solid.createEffect(() => {
    if (auth.authorizedUser() && conn.config() && auth.authorizedUser().domain !== conn.config().domain) {
      auth.logout();
      pushToast({ type: 'info', message: 'Logged out due to domain change.' });
    }
  });

  const value = {
    ...conn, ...auth, ...assets, ...ipfs,
    i18n, t: i18n.t, lang: i18n.lang, setLang: i18n.setLang,
    showKeys: i18n.showKeys, setShowKeys: i18n.setShowKeys,
    i18nAvailable: i18n.available,
    lastTabRoute, setLastTabRoute,
    savedScrollY, setSavedScrollY,
    supportedDomains, selectedDomain, selectedDomainName,
    desiredChainId, desiredChain, ensureWalletOnDesiredChain,
    remoteIpfsGateways, activeIpfsGateways,
    // --- MODIFICATION: Removed the redundant logout call from setDomain ---
    setDomain: conn.setDomain,
    clearConnectOverride: () => { conn.clearConnectOverride(); auth.logout(); },
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  if (typeof window !== "undefined") window.__app = ctx;
  return ctx;
}