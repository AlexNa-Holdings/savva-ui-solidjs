// src/App.jsx
import { createSignal, onMount, Show, Switch, Match, createMemo, createEffect, on } from "solid-js";
import Header from "./components/Header";
import RightPane from "./components/RightPane";
import Settings from "./pages/Settings";
import Docs from "./pages/Docs";
import { useHashRouter, navigate } from "./routing/hashRouter";
import { useApp } from "./context/AppContext.jsx";
import Toaster from "./components/Toaster";
import MainView from "./components/main/MainView";
import DomainCssLoader from "./theme/DomainCssLoader.jsx";
import FaviconLoader from "./theme/FaviconLoader.jsx";
import GoogleAnalyticsLoader from "./theme/GoogleAnalyticsLoader.jsx";
import WsConnector from "./net/WsConnector.jsx";
import ConnectionError from "./components/main/ConnectionError.jsx";
import Spinner from "./components/ui/Spinner.jsx";
import AssetDebugTap from "./dev/AssetDebugTap.jsx";
import PostPage from "./pages/PostPage";
import EditorPage from "./pages/EditorPage.jsx";
import AlertManager from "./alerts/AlertManager.jsx";

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
  const { route } = useHashRouter();
  const app = useApp();

  const currentView = createMemo(() => {
    const r = route();
    if (r.startsWith("/post/")) return "post";
    if (r.startsWith("/settings")) return "settings";
    if (r.startsWith("/docs")) return "docs";
    if (r.startsWith("/editor/")) return "editor";
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

  onMount(() => {
    const handleKeydown = (e) => {
      if (e.key !== "Escape") return;
      
      const view = currentView();
      if (view !== 'main') {
        navigate(app.lastTabRoute() || "/");
        return; 
      }
      
      setIsPaneOpen(false);
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  createEffect(on(currentView, (view) => {
    if (view === 'main') {
      requestAnimationFrame(() => {
        const y = app.savedScrollY();
        console.log(`%c[App.jsx] Restoring scroll position to: ${y}`, 'color: green; font-weight: bold;');
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
              <Switch>
                <Match when={currentView() === 'main'}><MainView /></Match>
                <Match when={currentView() === 'post'}><PostPage /></Match>
                <Match when={currentView() === 'settings'}><Settings /></Match>
                <Match when={currentView() === 'docs'}><Docs /></Match>
                <Match when={currentView() === 'editor'}><EditorPage /></Match>
              </Switch>
            </>
          </Show>
          
          <RightPane isOpen={isPaneOpen} onClose={togglePane} />
          <Toaster />
          <AssetDebugTap />
        </div>
      </Show>
    </Show>
  );
}