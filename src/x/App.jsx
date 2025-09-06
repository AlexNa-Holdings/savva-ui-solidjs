// src/x/App.jsx
import { createSignal, onMount, Show, createMemo, createEffect, on } from "solid-js";
import Header from "./Header.jsx";
import RightPane from "./RightPane.jsx";
import { useHashRouter, navigate } from "../routing/hashRouter.js";
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
import { closeAllModals } from "../utils/modalBus.js";

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
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
    if (r.startsWith("/fr/")) return "contribute";
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

  // Detect any modal by presence of our shared overlay or ARIA dialog.
  // TransferModal + others include <ModalBackdrop/> => .sv-modal-overlay. :contentReference[oaicite:3]{index=3} :contentReference[oaicite:4]{index=4}
  const isAnyModalOpen = () =>
    !!document.querySelector('.sv-modal-overlay, [aria-modal="true"], [role="dialog"]:not([aria-hidden="true"])');

  onMount(() => {
    const handleKeydown = (e) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;

      // If a modal is open, close it via the modal bus and stop page-level ESC.
      if (isAnyModalOpen()) {
        e.preventDefault();
        closeAllModals(); // ModalAutoCloser listens and invokes onClose on each modal. :contentReference[oaicite:5]{index=5}
        return;
      }

      const view = currentView();
      if (view !== "main") {
        navigate(app.lastTabRoute() || "/"); // navigate() already closes modals defensively. :contentReference[oaicite:6]{index=6}
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
      <Show
        when={!app.error()}
        fallback={<ConnectionError error={app.error()} />}
      >
        <div class="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-300">
          <DomainCssLoader />
          <FaviconLoader />
          <GoogleAnalyticsLoader />
          <WsConnector />
          <AlertManager />
          
          <Show when={domainRevision()} keyed>
            <>
              <Header onTogglePane={togglePane} />
              
              <div hidden={currentView() !== 'main'}>
                <MainView />
              </div>

              <Show when={currentView() === 'post'}><PostPage /></Show>
              <Show when={currentView() === 'profile'}><ProfilePage /></Show>
              <Show when={currentView() === 'settings'}><Settings /></Show>
              <Show when={currentView() === 'docs'}><Docs /></Show>
              <Show when={currentView() === 'editor'}><EditorPage /></Show>
              <Show when={currentView() === 'npo-list'}><NpoListPage /></Show>
              <Show when={currentView() === 'npo'}><NpoPage /></Show>
              <Show when={currentView() === 'profile-edit'}><ProfileEditPage /></Show>
              <Show when={currentView() === 'fundraising'}><FundraisingPage /></Show>
              <Show when={currentView() === 'contribute'}><ContributePage /></Show>
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
