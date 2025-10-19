// src/x/main/PromoPostManager.jsx
import { createSignal, createEffect } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import PromoPostPopup, { shouldShowPromoPost } from "../modals/PromoPostPopup.jsx";
import { dbg } from "../../utils/debug.js";

/**
 * PromoPostManager - Shows promo post popup when:
 * 1. Opening site for the first time for this domain
 * 2. Switching to a different domain
 *
 * Only shows if promo_post is set in domain config and hasn't been dismissed.
 * Shows once per session (page load) per domain. If user doesn't check "Do not show again",
 * it will show again on next page load.
 */
export default function PromoPostManager() {
  const app = useApp();
  const [isPromoOpen, setIsPromoOpen] = createSignal(false);
  const [promoPostId, setPromoPostId] = createSignal(null);

  // Track which domains we've shown promo for IN THIS SESSION ONLY (not persisted)
  const [shownDomainsThisSession, setShownDomainsThisSession] = createSignal(new Set());

  const hasShownForDomain = (domain) => {
    return shownDomainsThisSession().has(domain);
  };

  const markDomainShown = (domain) => {
    setShownDomainsThisSession(prev => {
      const newSet = new Set(prev);
      newSet.add(domain);
      return newSet;
    });
  };

  createEffect(() => {
    // Wait for app to load and domain config to be available
    if (app.loading()) return;

    const domainConfig = app.domainAssetsConfig?.();
    if (!domainConfig) return;

    const currentDomain = app.selectedDomainName?.();
    if (!currentDomain) return;

    // Check if we've already shown promo for this domain in this session
    if (hasShownForDomain(currentDomain)) return;

    dbg.log("PromoPostManager", "Domain check", {
      currentDomain,
      hasPromoPost: !!domainConfig.promo_post
    });

    // Check if domain has a promo post configured
    if (!domainConfig.promo_post) {
      dbg.log("PromoPostManager", "No promo_post configured for domain");
      markDomainShown(currentDomain);
      return;
    }

    // Check if user has dismissed this specific promo post
    if (!shouldShowPromoPost(domainConfig)) {
      dbg.log("PromoPostManager", "Promo post was already dismissed");
      markDomainShown(currentDomain);
      return;
    }

    // Show the promo popup
    dbg.log("PromoPostManager", "Showing promo post", {
      postId: domainConfig.promo_post,
      domain: currentDomain
    });

    setPromoPostId(domainConfig.promo_post);
    setIsPromoOpen(true);

    // Mark as shown for this session (so we don't show again even if they just close)
    markDomainShown(currentDomain);
  });

  const handleClose = () => {
    setIsPromoOpen(false);
    dbg.log("PromoPostManager", "Promo popup closed");
  };

  return (
    <PromoPostPopup
      isOpen={isPromoOpen()}
      promoPostId={promoPostId()}
      onClose={handleClose}
    />
  );
}
