// src/App.jsx
import { createSignal, onMount, Show } from "solid-js";
import Header from "./components/Header";
import RightPane from "./components/RightPane";
import Settings from "./pages/Settings";
import Docs from "./pages/Docs";
import { useHashRouter } from "./routing/hashRouter";
import { useApp } from "./context/AppContext.jsx";
import Toaster from "./components/Toaster";
import MainView from "./components/main/MainView";
import DomainCssLoader from "./theme/DomainCssLoader.jsx";
import FaviconLoader from "./theme/FaviconLoader.jsx";
import GoogleAnalyticsLoader from "./theme/GoogleAnalyticsLoader.jsx";
import WsConnector from "./net/WsConnector.jsx";
import ConnectionError from "./components/main/ConnectionError.jsx"; // Import the new component
import Spinner from "./components/ui/Spinner.jsx"; // Import a spinner for loading state
import AssetDebugTap from "./dev/AssetDebugTap.jsx";

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
  const { route } = useHashRouter();
  const app = useApp();

  onMount(() => {
    const handleKeydown = (e) => { if (e.key === "Escape") setIsPaneOpen(false); };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  const togglePane = () => setIsPaneOpen(!isPaneOpen());
  const isDocs = () => route() === "/docs" || route().startsWith("/docs/");

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

          <Header onTogglePane={togglePane} />
          
          <Show when={route() === "/settings"} fallback={
            <Show when={isDocs()} fallback={<MainView />}>
              <Docs />
            </Show>
          }>
            <Settings />
          </Show>

          <RightPane isOpen={isPaneOpen} onClose={togglePane} />
          <Toaster />
          <AssetDebugTap />
        </div>
      </Show>
    </Show>
  );
}