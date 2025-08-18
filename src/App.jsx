// src/App.jsx
/* src/App.jsx */
import { createSignal, onMount, Show } from "solid-js";
import Header from "./components/Header";
import RightPane from "./components/RightPane";
import Settings from "./pages/Settings";
import { useHashRouter } from "./routing/hashRouter";
import { useApp } from "./context/AppContext.jsx";
import { useI18n } from "./i18n/useI18n";
import Toaster from "./components/Toaster";
import MainView from "./components/main/MainView";
import AssetDebugTap from "./dev/AssetDebugTap.jsx";
import DomainCssLoader from "./theme/DomainCssLoader.jsx";
import GoogleAnalyticsLoader from "./theme/GoogleAnalyticsLoader.jsx";

export default function App() {
  const [isPaneOpen, setIsPaneOpen] = createSignal(false);
  const { route } = useHashRouter();
  const app = useApp();
  const { t } = useI18n();

  onMount(() => {
    const handleKeydown = (e) => { if (e.key === "Escape") setIsPaneOpen(false); };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });

  const togglePane = () => setIsPaneOpen(!isPaneOpen());

  return (
    <div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
      <DomainCssLoader />
      <GoogleAnalyticsLoader />

      <Header onTogglePane={togglePane} />
      <Show when={route() === "/settings"} fallback={<MainView />}>
        <Settings />
      </Show>

      <RightPane isOpen={isPaneOpen} onClose={togglePane} />
      <Toaster />
      <AssetDebugTap />
    </div>
  );
}
