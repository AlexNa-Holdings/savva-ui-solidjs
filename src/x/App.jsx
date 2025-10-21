// src/x/App.jsx
import { createSignal, onMount, Show, createMemo, createEffect, on } from "solid-js";
import Header from "./Header.jsx";
import RightPane from "./RightPane.jsx";
import { useHashRouter, navigate } from "../routing/smartRouter.js";
import { useApp } from "../context/AppContext.jsx";
import Toaster from "./Toaster.jsx";
import MainView from "./main/MainView.jsx";
import DomainCssLoader from "../theme/DomainCssLoader.jsx";
import FaviconLoader from "../theme/FaviconLoader.jsx";
import GoogleAnalyticsLoader from "../theme/GoogleAnalyticsLoader.jsx";
import WsConnector from "./net/WsConnector.jsx";
import ConnectionError from "./main/ConnectionError.jsx";
import Spinner from "./ui/Spinner.jsx";
import AssetDebugTap from "../dev/AssetDebugTap.jsx";
import AlertManager from "../alerts/AlertManager.jsx";
import SwitchAccountModal from "./modals/SwitchAccountModal.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import ProfileEditPage from "./pages/ProfileEditPage.jsx";
import FundraisingPage from "./pages/FundraisingPage.jsx";
import Settings from "./pages/Settings.jsx";
import Docs from "./pages/Docs.jsx";
import PostPage from "./pages/PostPage.jsx";
import EditorPage from "./pages/EditorPage.jsx";
import ContributePage from "./pages/ContributePage.jsx";
import NpoListPage from "./pages/NpoListPage.jsx";
import NpoPage from "./pages/NpoPage.jsx";
import SacrificePage from "./pages/SacrificePage.jsx";
import BuyBurnPage from "./pages/BuyBurnPage.jsx";
import { closeAllModals } from "../utils/modalBus.js";
import NavigationPanel from "./navigation/NavigationPanel.jsx";
import VersionChecker from "./main/VersionChecker.jsx";
import AdminActionsBridge from "./admin/AdminActionsBridge.jsx";
import PromoCodesPage from "./pages/PromoCodesPage.jsx";
import PromoRedeemPage from "./pages/PromoRedeemPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import ContentFundRoundsPage from "./pages/ContentFundRoundsPage.jsx";
import GovernancePage from "./pages/GovernancePage.jsx";
import CreateProposalPage from "./pages/CreateProposalPage.jsx";
import ReadingKeyInviteManager from "./main/ReadingKeyInviteManager.jsx";
import PromoPostManager from "./main/PromoPostManager.jsx";

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = createSignal(false);
  const { route } = useHashRouter();
  const app = useApp();

  const currentView = createMemo(() => {
    const r = route();
    if (r.startsWith("/post/")) return "post";
    if (r.startsWith("/settings")) return "settings";
    if (r.startsWith("/docs")) return "docs";
    if (r.startsWith("/profile-edit/")) return "profile-edit";
    if (r.startsWith("/editor/")) return "editor";
    if (r.startsWith("/npo-list")) return "npo-list";
    if (r.startsWith("/fundraising")) return "fundraising";
    if (r.startsWith("/npo/")) return "npo";
    if (r.startsWith("/promo-codes")) return "promo-codes";
    if (r.startsWith("/promo-code/")) return "promo-code";
    if (r.startsWith("/sac")) return "sacrifice";
    if (r.startsWith("/buy-burn")) return "buyburn";
    if (r.startsWith("/content-fund-rounds")) return "content-fund-rounds";
    if (r.startsWith("/governance/create-proposal")) return "create-proposal";
    if (r.startsWith("/governance")) return "governance";
    if (r.startsWith("/fr/")) return "contribute";
    if (r.startsWith("/admin")) return "admin";
    if (r.startsWith("/@") || r.startsWith("/0x")) return "profile";
    return "main";
  });

  const domainRevision = createMemo(() => {
    if (app.loading()) return null;
    const domainName = app.selectedDomainName?.();
    const source = app.domainAssetsSource?.();
    const cfg = app.domainAssetsConfig?.();
    const cid = cfg?.assets_cid || cfg?.cid || "";
    const tabsPath = cfg?.modules?.tabs || "";
    return `${domainName}|${source}|${cid}|${tabsPath}`;
  });

  const isAnyModalOpen = () =>
    !!document.querySelector('.sv-modal-overlay, [aria-modal="true"], [role="dialog"]:not([aria-hidden="true"])');

  onMount(() => {
    const handleKeydown = (e) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;

      if (isAnyModalOpen()) {
        e.preventDefault();
        closeAllModals();
        return;
      }

      if (isMobileNavOpen()) {
        setIsMobileNavOpen(false);
        return;
      }

      const view = currentView();
      if (view !== "main") {
        navigate(app.lastTabRoute?.() || "/");
        return;
      }

      setIsPaneOpen(false);
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  createEffect(on(currentView, (view) => {
    if (view === "main") {
      requestAnimationFrame(() => {
        const y = app.savedScrollY();
        window.scrollTo(0, y);
      });
    }
  }));

  let savedMainScrollY = 0;
  createEffect(on(currentView, (next, prev) => {
    // Save position when leaving main
    if (prev === "main" && next !== "main") {
      savedMainScrollY = window.scrollY;
    }
    // Restore when returning to main
    if (prev !== "main" && next === "main") {
      requestAnimationFrame(() => window.scrollTo({ top: savedMainScrollY, left: 0, behavior: "auto" }));
    }
  }));

  const togglePane = () => setIsPaneOpen(!isPaneOpen());

  return (
    <Show
      when={!app.loading()}
      fallback={
        <div class="fixed inset-0 flex items-center justify-center bg-[hsl(var(--background))]">
          <Spinner class="w-8 h-8" />
        </div>
      }
    >
      <Show when={!app.error()} fallback={<ConnectionError error={app.error()} />}>
        <div class="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-300">
          <DomainCssLoader />
          <FaviconLoader />
          <GoogleAnalyticsLoader />
          <WsConnector />
          <AlertManager />
          <VersionChecker />
          <AdminActionsBridge />
          <ReadingKeyInviteManager />
          <PromoPostManager isMainView={currentView() === "main"} />

          <Show when={domainRevision()} keyed>
            <>
              <Header onTogglePane={togglePane} onToggleMobileNav={() => setIsMobileNavOpen(p => !p)} />
              <NavigationPanel isMobileOpen={isMobileNavOpen()} onMobileNavClose={() => setIsMobileNavOpen(false)} />

              <main class="main-content-wrapper">
                {/* Lazy mount MainView so feeds aren't fetched while on a post */}
                <div style={{ display: currentView() === "main" ? "block" : "none" }}>
                  <MainView isActivated={currentView() === "main"} />
                </div>

                <Show when={currentView() === "post"}><PostPage /></Show>
                <Show when={currentView() === "profile"}><ProfilePage /></Show>
                <Show when={currentView() === "settings"}><Settings /></Show>
                <Show when={currentView() === "docs"}><Docs /></Show>
                <Show when={currentView() === "editor"}><EditorPage /></Show>
                <Show when={currentView() === "npo-list"}><NpoListPage /></Show>
                <Show when={currentView() === "npo"}><NpoPage /></Show>
                <Show when={currentView() === "profile-edit"}><ProfileEditPage /></Show>
                <Show when={currentView() === "fundraising"}><FundraisingPage /></Show>
                <Show when={currentView() === "contribute"}><ContributePage /></Show>
                <Show when={currentView() === "promo-codes"}><PromoCodesPage /></Show>
                <Show when={currentView() === "promo-code"}><PromoRedeemPage /></Show>
                <Show when={currentView() === "sacrifice"}><SacrificePage /></Show>
                <Show when={currentView() === "buyburn"}><BuyBurnPage /></Show>
                <Show when={currentView() === "content-fund-rounds"}><ContentFundRoundsPage /></Show>
                <Show when={currentView() === "governance"}><GovernancePage /></Show>
                <Show when={currentView() === "create-proposal"}><CreateProposalPage /></Show>
                <Show when={currentView() === "admin"}><AdminPage /></Show>
              </main>
            </>
          </Show>

          <RightPane isOpen={isPaneOpen} onClose={togglePane} />
          <Toaster />
          <AssetDebugTap />

          <SwitchAccountModal
            isOpen={app.isSwitchAccountModalOpen()}
            requiredAddress={app.requiredAccount()}
            onSuccess={app.resolveSwitchAccountPrompt}
            onCancel={app.rejectSwitchAccountPrompt}
          />
        </div>
      </Show>
    </Show>
  );
}
