import { createSignal, Show } from "solid-js";
import { useApp } from "../context/AppContext.jsx";

export default function Settings() {
  const app = useApp();
  const { t, showKeys, setShowKeys } = app;
  const [testing, setTesting] = createSignal(false);
  const [apiUrl, setApiUrl] = createSignal(app.localIpfsApiUrl() || "http://localhost:5001");

  async function onEnableLocal() {
    setTesting(true);
    try {
      await app.enableLocalIpfs(apiUrl().trim());
    } finally {
      setTesting(false);
    }
  }

  return (
    <main class="p-4 max-w-3xl mx-auto space-y-6">
      <h2 class="text-2xl font-semibold">Settings</h2>

      {/* Local IPFS */}
      <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        <h3 class="text-lg font-medium">Local IPFS</h3>

        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={app.localIpfsEnabled()}
            onInput={(e) => {
              const checked = e.currentTarget.checked;
              if (!checked) {
                app.disableLocalIpfs();
              }
            }}
          />
          <span>Use local IPFS node</span>
        </label>

        <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
          <label class="block">
            <span class="text-sm text-gray-700 dark:text-gray-300">Local IPFS API URL</span>
            <input
              class="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
              value={apiUrl()}
              onInput={(e) => setApiUrl(e.currentTarget.value)}
              placeholder="http://localhost:5001"
              spellcheck={false}
            />
            <p class="text-xs text-gray-500 mt-1">
              We will call <code>/api/v0/config/show</code> to discover your local Gateway URL.
            </p>
          </label>

          <Show when={!app.localIpfsEnabled()} fallback={
            <button
              class="px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700"
              onClick={() => app.disableLocalIpfs()}
            >
              Disable
            </button>
          }>
            <button
              class="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={onEnableLocal}
              disabled={testing()}
              title="Probe local IPFS and enable"
            >
              {testing() ? "Checking…" : "Test & enable"}
            </button>
          </Show>
        </div>

        <div class="text-sm text-gray-600 dark:text-gray-300">
          Status:{" "}
          <span class={
            app.localIpfsStatus() === "ok" ? "text-emerald-600" :
              app.localIpfsStatus() === "down" ? "text-red-500" : "opacity-70"
          }>
            {app.localIpfsStatus()}
          </span>
          <Show when={app.localIpfsEnabled() && app.localIpfsGateway()}>
            <span class="ml-2 opacity-70">• Gateway: {app.localIpfsGateway()}</span>
          </Show>
        </div>
      </section>

      <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
        <h3 class="text-lg font-medium">Developer</h3>

        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showKeys()}
            onInput={(e) => setShowKeys(e.currentTarget.checked)}
          />
          <span>Show i18n keys instead of translations</span>
        </label>

      </section>
    </main>
  );
}
