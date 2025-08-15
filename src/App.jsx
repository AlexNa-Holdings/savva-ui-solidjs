import { createSignal, onMount, Show } from "solid-js";
import Header from "./components/Header";
import RightPane from "./components/RightPane";
import Settings from "./pages/Settings";
import { useHashRouter } from "./routing/hashRouter";
import { useApp } from "./context/AppContext.jsx";
import { useI18n } from "./i18n/useI18n";
import Toaster from "./components/Toaster";

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
      <Header onTogglePane={togglePane} />
      <RightPane isOpen={isPaneOpen} onClose={togglePane} />

      <Show when={route() === "/settings"} fallback={
        <main class="p-4 max-w-7xl mx-auto">
          <h2 class="text-xl">{t("init.title")}</h2>

          <Show when={app.loading()}>
            <p>{t("init.loading")}</p>
          </Show>

          <Show when={app.error()}>
            <div class="text-red-500">
              {t("common.error")}: {app.error().message}
              <button
                class="ml-3 px-2 py-1 rounded bg-blue-500 text-white"
                onClick={app.reload}
              >
                {t("common.retry")}
              </button>
            </div>
          </Show>

          <Show when={!app.loading() && !app.error()}>
            <div class="space-y-2 text-sm">
              <div><span class="opacity-60">domain:</span> {app.config()?.domain}</div>
              <div><span class="opacity-60">backend:</span> {app.config()?.backendLink}</div>
            </div>

            <pre class="mt-3 text-xs bg-black/10 p-3 rounded overflow-auto">
              {JSON.stringify(app.info(), null, 2)}
            </pre>
          </Show>
        </main>
      }>
        <Settings />
      </Show>
      <Toaster />
    </div>
  );
}
