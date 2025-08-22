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
    setDiagResults([]);
    const results = [];
    
    const localApi = apiUrl().trim().replace(/\/+$/, "");
    const localGateway = localApi.replace(/:\d+$/, ":8080");
    const currentOrigin = window.location.origin;
    const originsJson = JSON.stringify([currentOrigin]);

    // --- New Step-by-Step Diagnostics Logic ---

    // Step 1: Check basic API liveness
    let config = null;
    try {
      await fetchWithTimeout(`${localApi}/api/v0/version`, { method: "POST" });
      results.push({ name: "API Liveness Check", status: "ok", details: `Successfully connected to IPFS API at ${localApi}.` });
    } catch (err) {
      results.push({ name: "API Liveness Check", status: "error", details: `Failed to connect to the IPFS API. Ensure your IPFS daemon is running at ${localApi}. Error: ${err.message}` });
      setDiagResults(results);
      setDiagRunning(false);
      return;
    }
    setDiagResults([...results]); // Update UI after first check

    // Step 2: Fetch the full configuration
    try {
      const res = await fetchWithTimeout(`${localApi}/api/v0/config/show`, { method: "POST" });
      if (!res.ok) throw new Error(`API responded with status ${res.status}`);
      config = await res.json();
      results.push({ name: "Fetch Configuration", status: "ok", details: "Successfully retrieved IPFS configuration." });
    } catch (err) {
      results.push({
        name: "Fetch Configuration",
        status: "error",
        details: "Could not fetch config. This is a CORS issue on your IPFS API.",
        fixCommand: `ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '${originsJson}'`
      });
      setDiagResults(results);
      setDiagRunning(false);
      return;
    }
    setDiagResults([...results]);

    // Step 3: Analyze Gateway CORS Configuration
    const gatewayOrigins = config?.Gateway?.HTTPHeaders?.["Access-Control-Allow-Origin"] || [];
    if (gatewayOrigins.includes(currentOrigin) || gatewayOrigins.includes("*")) {
      results.push({ name: "Gateway CORS Check", status: "ok", details: `CORS origin '${currentOrigin}' is correctly configured.` });
    } else {
      results.push({
        name: "Gateway CORS Check",
        status: "error",
        details: `CORS origin '${currentOrigin}' is missing from the Gateway config.`,
        fixCommand: `ipfs config --json Gateway.HTTPHeaders.Access-Control-Allow-Origin '${originsJson}'`
      });
    }

    // Step 4: Analyze Gateway NoFetch (Redirect) Setting
    if (config?.Gateway?.NoFetch === true) {
        results.push({ name: "Gateway Redirect Check", status: "ok", details: "'NoFetch' is correctly set to true, preventing redirects." });
    } else {
        results.push({
            name: "Gateway Redirect Check",
            status: "error",
            details: "Gateway is configured to redirect requests, which browsers block. 'NoFetch' must be true.",
            fixCommand: `ipfs config --bool Gateway.NoFetch true`
        });
    }
    setDiagResults([...results]);

    // Step 5: Final Live Gateway Fetch Test
    const testCID = app.info()?.savva_contracts?.Config?.abi_cid;
    if (testCID) {
      try {
        const testUrl = `${localGateway}/ipfs/${testCID}`;
        await fetchWithTimeout(testUrl);
        results.push({ name: "Live Gateway Fetch", status: "ok", details: `Successfully fetched test CID from ${localGateway}. Setup is complete!` });
      } catch (err) {
        results.push({ name: "Live Gateway Fetch", status: "error", details: `Final test failed. Error: ${err.message}. This could be a firewall issue on port 8080.` });
      }
    } else {
      results.push({ name: "Live Gateway Fetch", status: "warn", details: "Skipped: ABI CID not found in /info response." });
    }

    setDiagResults(results);
    setDiagRunning(false);
  }

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
            <input type="checkbox" checked={app.localIpfsEnabled()} onInput={(e) => {
                const checked = e.currentTarget.checked;
                if (checked) { onEnableLocal(); } else { app.disableLocalIpfs(); }
            }}/>
            <span>{t("settings.localIpfs.enableCheckbox")}</span>
        </label>
        <div class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-2 md:items-end">
            <label class="block">
                <span class="text-sm text-[hsl(var(--muted-foreground))]">{t("settings.localIpfs.apiUrl.label")}</span>
                <input class="mt-1 w-full px-3 py-2 rounded border bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--input))]"
                    value={apiUrl()}
                    onInput={(e) => {
                        const val = e.currentTarget.value;
                        setApiUrl(val);
                        app.setLocalIpfsApiUrl?.(val);
                    }}
                    placeholder="http://localhost:5001" spellcheck={false}/>
            </label>
            <div class="flex md:self-end">
                <Show when={!app.localIpfsEnabled()}
                    fallback={<button class="h-10 px-3 rounded bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90" onClick={()=> app.disableLocalIpfs()}>{t("settings.localIpfs.disable")}</button>}>
                    <button class="h-10 px-3 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60" onClick={onEnableLocal} disabled={testing()} title={t("settings.localIpfs.testEnable")}>
                        {testing() ? t("common.checking") : t("settings.localIpfs.testEnable")}
                    </button>
                </Show>
            </div>
        </div>
        <div class="text-sm text-[hsl(var(--muted-foreground))]">
            {t("settings.localIpfs.status.label")}:{" "}
            <span class={app.localIpfsStatus()==='ok' ? "text-[hsl(var(--primary))]" : app.localIpfsStatus()==='down' ? "text-[hsl(var(--destructive))]" : "opacity-70"}>
                {app.localIpfsStatus()}
            </span>
            <Show when={app.localIpfsEnabled() && app.localIpfsGateway()}>
                <span class="ml-2 opacity-70">• {t("settings.localIpfs.gateway.label")}: {app.localIpfsGateway()}</span>
            </Show>
        </div>
        <div class="pt-2 border-t border-[hsl(var(--border))]">
            <div class="flex items-center justify-between">
                <h4 class="font-medium">IPFS Node Diagnostics</h4>
                <button class="h-9 px-3 rounded-md border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]"
                    onClick={runDiagnostics}
                    disabled={diagRunning()}>
                    {diagRunning() ? t("common.loading") : "Run Diagnostics"}
                </button>
            </div>
            <Show when={diagResults() && diagResults().length > 0}>
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