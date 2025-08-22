// src/components/settings/LocalIpfsSection.jsx
import { createSignal, Show, For } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { fetchWithTimeout } from "../../utils/net.js";

export default function LocalIpfsSection() {
  const app = useApp();
  const { t } = app;

  const [testing, setTesting] = createSignal(false);
  const [apiUrl, setApiUrl] = createSignal(app.localIpfsApiUrl() || "http://localhost:5001");

  const [diagRunning, setDiagRunning] = createSignal(false);
  const [diagResults, setDiagResults] = createSignal(null);

  async function runDiagnostics() {
    setDiagRunning(true);
    setDiagResults(null);
    const results = [];
    const localApi = apiUrl().trim().replace(/\/+$/, "");
    const localGateway = localApi.replace(/:\d+$/, ":8080");
    const currentOrigin = window.location.origin;
    const originsList = [...new Set([currentOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'])];
    const originsJson = JSON.stringify(originsList);
    
    // --- Start of Modified Diagnostics Logic ---

    // 1. Check API Connectivity and fetch config in one step
    let config = null;
    try {
      const res = await fetchWithTimeout(`${localApi}/api/v0/config/show`, { method: "POST" });
      if (!res.ok) throw new Error(`API responded with status ${res.status}`);
      config = await res.json();
      results.push({ name: "API Connection", status: "ok", details: `Successfully connected to API at ${localApi}` });
    } catch (err) {
      // If the initial connection fails, provide a helpful error with the fix.
      const fixCommand = `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '${originsJson}'`;
      results.push({
        name: "API Connection",
        status: "error",
        details: `Failed to connect to the local IPFS API at ${localApi}. This is usually a CORS issue. Your browser blocks the request for security reasons.`,
        fixCommand: fixCommand
      });
      setDiagResults(results);
      setDiagRunning(false);
      return; // Stop diagnostics here, as other checks will also fail.
    }

    // If API connection was successful, proceed with other checks.
    
    // 2. Check Gateway CORS Origin
    const gatewayOrigins = config?.Gateway?.HTTPHeaders?.["Access-Control-Allow-Origin"] || [];
    if (originsList.every(o => gatewayOrigins.includes(o)) || gatewayOrigins.includes("*")) {
      results.push({ name: "Gateway CORS Origin", status: "ok", details: "CORS origin is correctly configured." });
    } else {
      results.push({
        name: "Gateway CORS Origin",
        status: "error",
        details: `CORS origin '${currentOrigin}' is not configured for the Gateway.`,
        fixCommand: `ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '${originsJson}'`
      });
    }
    
    // 3. Check Gateway Live Fetch
    const testCID = app.info()?.savva_contracts?.Config?.abi_cid;
    if (testCID) {
      try {
        const testUrl = `${localGateway}/ipfs/${testCID}`;
        const res = await fetchWithTimeout(testUrl);
        if (!res.ok) throw new Error(`Gateway responded with status ${res.status}`);
        results.push({ name: "Gateway Live Fetch", status: "ok", details: `Successfully fetched test CID from ${localGateway}` });
      } catch (err) {
        results.push({ name: "Gateway Live Fetch", status: "error", details: err.toString() });
      }
    } else {
      results.push({ name: "Gateway Live Fetch", status: "warn", details: "Skipped: ABI CID not found in /info response." });
    }

    setDiagResults(results);
    setDiagRunning(false);
  }
  // --- End of Modified Diagnostics Logic ---


  async function onEnableLocal() {
    setTesting(true);
    try {
      await app.enableLocalIpfs(apiUrl().trim());
    } finally {
      setTesting(false);
    }
  }

  const statusColorClass = (status) => {
    if (status === 'ok') return 'text-emerald-600';
    if (status === 'error') return 'text-red-600';
    return 'text-amber-500'; // for 'warn'
  };

  return (
    <section class="bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] rounded-lg shadow p-4 space-y-3">
      <h3 class="text-lg font-medium">{t("settings.localIpfs.title")}</h3>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={app.localIpfsEnabled()}
          onInput={(e) => {
            const checked = e.currentTarget.checked;
            if (checked) { onEnableLocal(); } else { app.disableLocalIpfs(); }
          }}
        />
        <span>{t("settings.localIpfs.enableCheckbox")}</span>
      </label>

      <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 md:items-end">
        <label class="block">
          <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.localIpfs.apiUrl.label")}</span>
          <input
            class="mt-1 w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
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
        <div class="flex md:self-end">
          <Show when={!app.localIpfsEnabled()}
            fallback={ <button class="h-10 px-3 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90" onClick={() => app.disableLocalIpfs()}>{t("settings.localIpfs.disable")}</button> } >
            <button class="h-10 px-3 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60" onClick={onEnableLocal} disabled={testing()} title={t("settings.localIpfs.testEnable")}>
              {testing() ? t("common.checking") : t("settings.localIpfs.testEnable")}
            </button>
          </Show>
        </div>
      </div>

      <div class="text-sm text-[hsl(var(--muted-foreground))]">
        {t("settings.localIpfs.status.label")}:{" "}
        <span class={ app.localIpfsStatus() === "ok" ? "text-[hsl(var(--primary))]" : app.localIpfsStatus() === "down" ? "text-[hsl(var(--destructive))]" : "opacity-70" }>
          {app.localIpfsStatus()}
        </span>
        <Show when={app.localIpfsEnabled() && app.localIpfsGateway()}>
          <span class="ml-2 opacity-70">• {t("settings.localIpfs.gateway.label")}: {app.localIpfsGateway()}</span>
        </Show>
      </div>
      
      <div class="pt-2 border-t border-[hsl(var(--border))]">
        <div class="flex items-center justify-between">
            <h4 class="font-medium">IPFS Node Diagnostics</h4>
            <button
                class="h-9 px-3 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]"
                onClick={runDiagnostics}
                disabled={diagRunning()}
            >
                {diagRunning() ? t("common.loading") : "Run Diagnostics"}
            </button>
        </div>
        <Show when={diagResults()}>
            <div class="mt-2 space-y-2 text-xs">
                <For each={diagResults()}>
                    {(result) => (
                        <div class="p-2 rounded bg-[hsl(var(--muted))]">
                            <div class="flex items-center">
                                <span class={`font-bold ${statusColorClass(result.status)}`}>
                                    {result.status.toUpperCase()}:
                                </span>
                                <span class="font-semibold ml-2">{result.name}</span>
                            </div>
                            <p class="mt-1 text-[hsl(var(--muted-foreground))]">{result.details}</p>
                            <Show when={result.fixCommand}>
                                <p class="mt-2 font-medium">To fix, run this in your terminal (then restart the daemon):</p>
                                <pre class="mt-1 p-2 rounded bg-[hsl(var(--background))] text-[hsl(var(--foreground))] font-mono text-[11px] whitespace-pre-wrap break-all">
                                    {result.fixCommand}
                                </pre>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
        </Show>
      </div>
    </section>
  );
}