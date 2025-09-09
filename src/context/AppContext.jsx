// src/context/AppContext.jsx
import * as Solid from "solid-js";
import { getChainMeta } from "../blockchain/chains";
import { switchOrAddChain, walletAccount, isWalletAvailable } from "../blockchain/wallet.js";
import { useI18n } from "../i18n/useI18n.js";
import { useLocalIpfs } from "../hooks/useLocalIpfs.js";
import { useAppAuth } from "./useAppAuth.js";
import { useAppOrchestrator } from "./useAppOrchestrator.js";
import { pushToast, pushErrorToast, dismissToast } from "../ui/toast.js";
import { useHashRouter } from "../routing/hashRouter.js";
import { createWalletClient, custom } from "viem";
import { useTokenPrices } from "./useTokenPrices.js";
import { dbg } from "../utils/debug.js";
import { useActor } from "./useActor.js";

const AppContext = Solid.createContext();
const dn = (d) => (typeof d === "string" ? d : d?.name || "");
const eq = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function AppProvider(props) {
  const i18n = useI18n();
  const auth = useAppAuth();
  const orchestrator = useAppOrchestrator({ auth, i18n });
  const ipfs = useLocalIpfs({ pushToast, pushErrorToast, t: i18n.t });

  const [postUpdate, setPostUpdate] = Solid.createSignal(null);
  const [lastTabRoute, setLastTabRoute] = Solid.createSignal("/");
  const [savedScrollY, setSavedScrollY] = Solid.createSignal(0);
  const [walletDataNeedsRefresh, setWalletDataNeedsRefresh] = Solid.createSignal(0);
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
    const list = orchestrator.info()?.domains || [];
    return [...new Set(list.map(d => (typeof d === "string" ? d : d?.name)).filter(Boolean))]
      .map(name => ({ name, website: list.find(d => d.name === name)?.website || "" }));
  });

  const selectedDomain = Solid.createMemo(() => {
    const explicit = String(orchestrator.config()?.domain || "").trim();
    if (explicit) {
      return supportedDomains().find(d => eq(d.name, explicit)) || explicit;
    }
    return supportedDomains()[0] || "";
  });
  
  const selectedDomainName = Solid.createMemo(() => dn(selectedDomain()));

  const prices = useTokenPrices({ loading: orchestrator.loading, info: orchestrator.info });
  
  Solid.createEffect(() => {
    const cfg = orchestrator.domainAssetsConfig?.();
    if (!cfg) return;
    const norm = (c) => String(c || "").trim().toLowerCase().split(/[-_]/)[0];
    const lang = norm(i18n.lang?.());
    const locales = Array.isArray(cfg.locales) ? cfg.locales : [];
    const current = locales.find((l) => norm(l.code) === lang) || locales.find((l) => norm(l.code) === "en") || locales[0];
    if (current?.title) document.title = current.title;
  });

  const desiredChainId = Solid.createMemo(() => orchestrator.info()?.blockchain_id ?? null);
  const desiredChain = Solid.createMemo(() => { const id = desiredChainId(); return id ? getChainMeta(id) : null; });
  async function ensureWalletOnDesiredChain() { const meta = desiredChain(); if (!meta) throw new Error("Unknown target chain"); await switchOrAddChain(meta); }
  const remoteIpfsGateways = Solid.createMemo(() => (orchestrator.info()?.ipfs_gateways || []).map(g => g.trim().endsWith("/") ? g : `${g}/`));
  const activeIpfsGateways = Solid.createMemo(() => (ipfs.localIpfsEnabled() && ipfs.localIpfsGateway()) ? [ipfs.localIpfsGateway()] : remoteIpfsGateways());

  Solid.createEffect(() => {
    if (auth.authorizedUser() && orchestrator.config() && auth.authorizedUser().domain !== orchestrator.config().domain) {
      auth.logout();
      pushToast({ type: 'info', message: 'Logged out due to domain change.' });
    }
  });

  // Effect to sync domain languages AND validate current selection
  Solid.createEffect(() => {
    const cfg = orchestrator.domainAssetsConfig();
    const norm = (c) => String(c || "").trim().toLowerCase().split(/[-_]/)[0];
    
    if (!cfg) {
      i18n.setDomainLangCodes([]);
      return;
    }
    
    const locales = Array.isArray(cfg.locales) ? cfg.locales : [];
    const codes = locales.map(l => norm(l.code)).filter(Boolean);

    i18n.setDomainLangCodes(codes);
    dbg.log("DomainLangs", "i18n domain language codes updated", codes.length > 0 ? codes : "[using app fallback]");

    // NEW: Validate current language against the new domain's supported codes
    if (codes.length > 0) {
        const currentLang = norm(i18n.lang());
        if (!codes.includes(currentLang)) {
            const defaultLang = norm(cfg.default_locale);
            const nextLang = 
                (defaultLang && codes.includes(defaultLang)) ? defaultLang :
                codes.includes('en') ? 'en' :
                codes[0]; // Fallback to the first available lang for the domain
            
            dbg.warn("LangValidator", `Current lang '${currentLang}' not supported by new domain. Switching to '${nextLang}'.`);
            i18n.setLang(nextLang);
        }
    }
  });
  
  const actor = useActor({ auth, loading: orchestrator.loading, selectedDomainName, t: i18n.t });

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
    return createWalletClient({ chain, account: walletAcc, transport: custom(window.ethereum) });
  }

  async function getGuardedWalletClient() {
    const authorizedAcc = auth.authorizedUser()?.address;
    if (!authorizedAcc) throw new Error("User is not authorized.");
    const walletClient = getRawWalletClient();
    const walletAcc = walletClient.account.address;
    if (walletAcc.toLowerCase() !== authorizedAcc.toLowerCase()) {
      try {
        await promptSwitchAccount(authorizedAcc);
        return getRawWalletClient();
      } catch (e) {
        throw new Error(i18n.t("wallet.error.userCanceled"));
      }
    }
    return walletClient;
  }
  
  const [userDisplayNames, _setUserDisplayNames] = Solid.createSignal({});
  function setUserDisplayNames(address, namesMap) {
    if (!address || !namesMap || typeof namesMap !== "object") return;
    const key = String(address).toLowerCase();
    _setUserDisplayNames((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...namesMap } }));
  }

  const [userAvatars, _setUserAvatars] = Solid.createSignal({});
  function setUserAvatar(address, avatarCid) {
    if (!address || typeof avatarCid !== 'string') return;
    const key = String(address).toLowerCase();
    _setUserAvatars((prev) => ({ ...prev, [key]: avatarCid }));
  }

  const assetUrl = (relPath) => {
    const prefix = orchestrator.domainAssetsPrefix();
    const rel = String(relPath || "").replace(/^\/+/, "");
    return prefix + rel;
  };

  const value = {
    ...orchestrator, ...auth, ...ipfs, ...prices,
    assetUrl,
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
    walletDataNeedsRefresh,
    triggerWalletDataRefresh: () => setWalletDataNeedsRefresh(c => c + 1),
    route,
    getGuardedWalletClient,
    getRawWalletClient,
    isSwitchAccountModalOpen,
    requiredAccount,
    resolveSwitchAccountPrompt,
    rejectSwitchAccountPrompt,
    userDisplayNames,
    setUserDisplayNames,
    userAvatars,
    setUserAvatar,
    dismissToast,
    actorIsNpo: actor.actorIsNpo,
    isActingAsNpo: actor.isActingAsNpo,
    actorAddress: actor.actorAddress,
    actorProfile: actor.actorProfile,
    actAsSelf: actor.actAsSelf,
    actAsNpo: actor.actAsNpo,
    npoMemberships: actor.npoMemberships,
    refreshNpoMemberships: actor.refreshNpoMemberships,
  };

  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = Solid.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  if (typeof window !== "undefined") window.__app = ctx;
  return ctx;
}