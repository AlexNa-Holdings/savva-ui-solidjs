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

const AppContext = Solid.createContext();
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function AppProvider(props) {
  // 1. Initialize core hooks and simple state
  const i18n = useI18n();
  const auth = useAppAuth();
  const conn = useAppConnection(auth);
  const ipfs = useLocalIpfs({ pushToast, pushErrorToast, t: i18n.t });
  const [lastTabRoute, setLastTabRoute] = Solid.createSignal("/");

  // 2. Create memos that depend on the core hooks
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

  // 3. Initialize the assets hook, passing the memos it depends on
  const assets = useDomainAssets({ 
    info: conn.info, 
    selectedDomainName: selectedDomainName, 
    i18n: i18n 
  });

  // 4. Create final memos and effects
  const desiredChainId = Solid.createMemo(() => conn.info()?.blockchain_id ?? null);
  const desiredChain = Solid.createMemo(() => { const id = desiredChainId(); return id ? getChainMeta(id) : null; });
  async function ensureWalletOnDesiredChain() { const meta = desiredChain(); if (!meta) throw new Error("Unknown target chain"); await switchOrAddChain(meta); }

  const remoteIpfsGateways = Solid.createMemo(() => (conn.info()?.ipfs_gateways || []).map(g => g.trim().endsWith("/") ? g : `${g}/`));
  const activeIpfsGateways = Solid.createMemo(() => (ipfs.localIpfsEnabled() && ipfs.localIpfsGateway()) ? [ipfs.localIpfsGateway()] : remoteIpfsGateways());

  Solid.createEffect(() => {
    const user = auth.authorizedUser();
    if (user && conn.config() && user.domain !== conn.config().domain) {
      auth.logout();
      pushToast({ type: 'info', message: 'Logged out due to domain change.' });
    }
  });

  // 5. Compose the final value for the context provider
  const value = {
    ...conn, ...auth, ...assets, ...ipfs,
    i18n, t: i18n.t, lang: i18n.lang, setLang: i18n.setLang,
    showKeys: i18n.showKeys, setShowKeys: i18n.setShowKeys,
    i18nAvailable: i18n.available,
    lastTabRoute, setLastTabRoute,
    supportedDomains, selectedDomain, selectedDomainName,
    desiredChainId, desiredChain, ensureWalletOnDesiredChain,
    remoteIpfsGateways, activeIpfsGateways,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  if (typeof window !== "undefined") window.__app = ctx;
  return ctx;
}