// src/components/settings/LocalIpfsSection.jsx
import { createSignal, Show } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";

export default function LocalIpfsSection() {
  const app = useApp(); // exposes t, local IPFS signals, actions
  const { t } = app;

  const [testing, setTesting] = createSignal(false);
  const [apiUrl, setApiUrl] = createSignal(app.localIpfsApiUrl() || "http://localhost:5001");
  const [showIpfsHelp, setShowIpfsHelp] = createSignal(false);

  async function onEnableLocal() {
    setTesting(true);
    try {
      await app.enableLocalIpfs(apiUrl().trim());
    } finally {
      setTesting(false);
    }
  }

  return (
    <section class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 space-y-3">
      <h3 class="text-lg font-medium">{t("settings.localIpfs.title")}</h3>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={app.localIpfsEnabled()}
          onInput={(e) => {
            const checked = e.currentTarget.checked;
            if (!checked) app.disableLocalIpfs();
          }}
        />
        <span>{t("settings.localIpfs.enableCheckbox")}</span>
      </label>

      {/* Input + button row (aligned bottoms); hint on its own row */}
      <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 md:items-end">
        {/* Left: label + input */}
        <label class="block">
          <span class="text-sm text-gray-700 dark:text-gray-300">
            {t("settings.localIpfs.apiUrl.label")}
          </span>
          <input
            class="mt-1 w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            value={apiUrl()}
            onInput={(e) => {
              const val = e.currentTarget.value;
              setApiUrl(val);
              app.setLocalIpfsApiUrl?.(val);
            }}
            placeholder="http://localhost:5001"
            spellcheck={false}
          />
        </label>

        {/* Right: action button, bottom-aligned to the input */}
        <div class="flex md:self-end">
          <Show
            when={!app.localIpfsEnabled()}
            fallback={
              <button
                class="h-10 px-3 rounded bg-red-600 text-white hover:bg-red-700"
                onClick={() => app.disableLocalIpfs()}
              >
                {t("settings.localIpfs.disable")}
              </button>
            }
          >
            <button
              class="h-10 px-3 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              onClick={onEnableLocal}
              disabled={testing()}
              title={t("settings.localIpfs.testEnable")}
            >
              {testing() ? t("common.checking") : t("settings.localIpfs.testEnable")}
            </button>
          </Show>
        </div>

        {/* Hint line */}
        <p class="text-xs text-gray-500 mt-1 md:col-span-2">
          {t("settings.localIpfs.apiUrl.help")} <code>/api/v0/config/show</code>.
        </p>
      </div>

      {/* Status */}
      <div class="text-sm text-gray-600 dark:text-gray-300">
        {t("settings.localIpfs.status.label")}:{" "}
        <span
          class={
            app.localIpfsStatus() === "ok"
              ? "text-emerald-600"
              : app.localIpfsStatus() === "down"
              ? "text-red-500"
              : "opacity-70"
          }
        >
          {app.localIpfsStatus()}
        </span>
        <Show when={app.localIpfsEnabled() && app.localIpfsGateway()}>
          <span class="ml-2 opacity-70">
            • {t("settings.localIpfs.gateway.label")}: {app.localIpfsGateway()}
          </span>
        </Show>
      </div>

      {/* Help toggle */}
      <div class="pt-2">
        <button
          class="text-sm underline text-blue-600 dark:text-blue-400 hover:opacity-80"
          onClick={() => setShowIpfsHelp(!showIpfsHelp())}
        >
          {showIpfsHelp()
            ? t("settings.localIpfs.help.toggle.hide")
            : t("settings.localIpfs.help.toggle.show")}
        </button>
      </div>

      {/* Collapsible help content */}
      <Show when={showIpfsHelp()}>
        <div class="mt-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-3 text-sm">
          <p class="opacity-90">
            {t("settings.localIpfs.help.intro")} <code>/api/v0/*</code>
          </p>

          <div>
            <p class="font-medium mb-1">{t("settings.localIpfs.help.api.title")}</p>
            <pre class="bg-black/70 text-white p-2 rounded overflow-x-auto text-xs">{`ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173","http://127.0.0.1:5173"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["GET","POST","PUT","OPTIONS"]'
ipfs config --json API.HTTPHeaders.Access-Control-Allow-Headers '["Content-Type","Authorization"]'`}</pre>
            <p class="opacity-75 mt-1">{t("settings.localIpfs.help.api.tip")}</p>
          </div>

          <div>
            <p class="font-medium mb-1">{t("settings.localIpfs.help.gateway.title")}</p>
            <pre class="bg-black/70 text-white p-2 rounded overflow-x-auto text-xs">{`ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173","http://127.0.0.1:5173"]'
ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Methods '["GET","HEAD","OPTIONS"]'`}</pre>
            <p class="opacity-75 mt-1">{t("settings.localIpfs.help.gateway.note")}</p>
          </div>

          <div>
            <p class="font-medium mb-1">{t("settings.localIpfs.help.restart.title")}</p>
            <pre class="bg-black/70 text-white p-2 rounded overflow-x-auto text-xs">{`ipfs shutdown 2>/dev/null || true
ipfs daemon`}</pre>
          </div>

          <div>
            <p class="font-medium mb-1">{t("settings.localIpfs.help.verify.title")}</p>
            <pre class="bg-black/70 text-white p-2 rounded overflow-x-auto text-xs">{`curl -X POST http://localhost:5001/api/v0/id
curl -X POST http://localhost:5001/api/v0/config/show | jq -r '.Addresses.Gateway'`}</pre>
            <p class="opacity-75 mt-1">
              {t("settings.localIpfs.help.verify.note")} <code>/ip4/127.0.0.1/tcp/8080</code>.
            </p>
          </div>

          <div>
            <p class="font-medium mb-1">{t("settings.localIpfs.help.proxy.title")}</p>
            <p class="opacity-90">{t("settings.localIpfs.help.proxy.text")}</p>
            <pre class="bg-black/70 text-white p-2 rounded overflow-x-auto text-xs">{`// vite.config.js
export default {
  server: {
    proxy: {
      "/ipfs-api": {
        target: "http://localhost:5001",
        changeOrigin: true,
        rewrite: p => p.replace(/^\\/ipfs-api/, "")
      }
    }
  }
};`}</pre>
            <p class="opacity-75 mt-1">
              {t("settings.localIpfs.help.proxy.note")} <code>http://localhost:5173/ipfs-api</code>.
            </p>
          </div>
        </div>
      </Show>
    </section>
  );
}
