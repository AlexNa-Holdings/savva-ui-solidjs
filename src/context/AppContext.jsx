// src/context/AppContext.jsx
import * as Solid from "solid-js";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain, walletAccount, isWalletAvailable } from "../blockchain/wallet";
import { useI18n } from "../i18n/useI18n";
import { useLocalIpfs } from "../hooks/useLocalIpfs.js";
import { useAppAuth } from "./useAppAuth.js";
import { useAppConnection } from "./useAppConnection.js";
import { useDomainAssets } from "./useDomainAssets.js";
import { pushToast, pushErrorToast } from "../ui/toast.js";
import { useHashRouter } from "../routing/hashRouter.js";
import { createWalletClient, custom } from "viem";
import { useTokenPrices } from "./useTokenPrices.js";

const AppContext = Solid.createContext();
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function AppProvider(props) {
  const i18n = useI18n();
  const auth = useAppAuth();
  const conn = useAppConnection();
  const ipfs = useLocalIpfs({ pushToast, pushErrorToast, t: i18n.t });
  const [postUpdate, setPostUpdate] = Solid.createSignal(null);
  
  const [lastTabRoute, setLastTabRoute] = Solid.createSignal("/");
  const [savedScrollY, setSavedScrollY] = Solid.createSignal(0);

  const { route } = useHashRouter();
  Solid.createEffect(Solid.on(route, (nextRoute, prevRoute) => {
    if (!prevRoute) return;
    const isCurrentlyOnMainFeed = !/^\/(post|settings|docs|editor)/.test(prevRoute);
    const isNavigatingToPage = /^\/(post|settings|docs|editor)/.test(nextRoute);
    if (isCurrentlyOnMainFeed && isNavigatingToPage) {
      setSavedScrollY(window.scrollY);
    }
  }, { defer: true }));
  
  const [newFeedItems, setNewFeedItems] = Solid.createSignal([]);
  const [newContentAvailable, setNewContentAvailable] = Solid.createSignal(null);
  const [newTabRefreshKey, setNewTabRefreshKey] = Solid.createSignal(Date.now());

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
  const prices = useTokenPrices({ info: conn.info });

  Solid.createEffect(() => {
    const cfg = assets.domainAssetsConfig();
    const lang = i18n.lang();
    if (!cfg) return;

    const locales = Array.isArray(cfg.locales) ? cfg.locales : [];
    const currentLocale = locales.find(l => l.code === lang) || locales.find(l => l.code === 'en') || locales[0];
    
    if (currentLocale?.title) {
      document.title = currentLocale.title;
    }
  });

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

  const [isSwitchAccountModalOpen, setIsSwitchAccountModalOpen] = Solid.createSignal(false);
  const [requiredAccount, setRequiredAccount] = Solid.createSignal(null);
  let switchAccountResolver = null;
  let switchAccountRejecter = null;

  function promptSwitchAccount(requiredAddress) {
    return new Promise((resolve, reject) => {
      setRequiredAccount(requiredAddress);
      setIsSwitchAccountModalOpen(true);
      switchAccountResolver = resolve;
      switchAccountRejecter = reject;
    });
  }

  const resolveSwitchAccountPrompt = () => {
    setIsSwitchAccountModalOpen(false);
    if (switchAccountResolver) switchAccountResolver();
  };

  const rejectSwitchAccountPrompt = () => {
    setIsSwitchAccountModalOpen(false);
    if (switchAccountRejecter) switchAccountRejecter(new Error("User canceled the action."));
  };

  function getRawWalletClient() {
    const walletAcc = walletAccount();
    if (!isWalletAvailable()) throw new Error("Wallet is not available.");
    if (!walletAcc) throw new Error("Wallet is not connected.");
    
    const chain = desiredChain();
    if (!chain) throw new Error("Target chain is not configured.");

    return createWalletClient({
      chain: chain,
      account: walletAcc,
      transport: custom(window.ethereum)
    });
  }
  
  async function getGuardedWalletClient() {
    const authorizedAcc = auth.authorizedUser()?.address;
    if (!authorizedAcc) throw new Error("User is not authorized.");
    
    const walletClient = getRawWalletClient(); // Uses the raw client internally
    const walletAcc = walletClient.account.address;

    if (walletAcc.toLowerCase() !== authorizedAcc.toLowerCase()) {
      try {
        await promptSwitchAccount(authorizedAcc);
        // After success, the walletAccount() signal is updated, so we need a fresh client.
        return getRawWalletClient();
      } catch (e) {
        throw new Error(i18n.t("wallet.error.userCanceled"));
      }
    }
    
    return walletClient;
  }

  const value = {
    ...conn, ...auth, ...assets, ...ipfs, ...prices,
    i18n, t: i18n.t, lang: i18n.lang, setLang: i18n.setLang,
    showKeys: i18n.showKeys, setShowKeys: i18n.setShowKeys,
    i18nAvailable: i18n.available,
    lastTabRoute, setLastTabRoute,
    savedScrollY, setSavedScrollY,
    newFeedItems, setNewFeedItems,
    newContentAvailable, setNewContentAvailable,
    newTabRefreshKey, setNewTabRefreshKey,
    supportedDomains, selectedDomain, selectedDomainName,
    desiredChainId, desiredChain, ensureWalletOnDesiredChain,
    remoteIpfsGateways, activeIpfsGateways,
    postUpdate, setPostUpdate,
    setDomain: (d) => { conn.setDomain(d); auth.logout(); },
    clearConnectOverride: () => { conn.clearConnectOverride(); auth.logout(); },
    getGuardedWalletClient,
    getRawWalletClient,
    isSwitchAccountModalOpen,
    requiredAccount,
    resolveSwitchAccountPrompt,
    rejectSwitchAccountPrompt,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  if (typeof window !== "undefined") window.__app = ctx;
  return ctx;
}