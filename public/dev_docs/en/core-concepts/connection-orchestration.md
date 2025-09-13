<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Connection Orchestration, `/info` Storage & Domain Configuration

This page explains exactly how the app boots, connects to a backend, chooses a domain, and how it stores/uses the backend’s `/info` response and domain configuration. It’s written for professional engineers who need to extend or debug the flow.

> **TL;DR** — There is a single orchestrator (`useAppOrchestrator`) that:
>
> * reads `/default_connect.yaml` (+ optional local override),
> * configures HTTP/WS endpoints,
> * fetches `/info`,
> * finalizes the domain,
> * chooses the assets base (prod/test), loads the domain pack,
> * reconnects WebSocket, and
> * (on explicit switch) navigates to `/`.

---

## Terms & Primitives

* **Backend** — the SAVVA node (HTTP API + WebSocket).
* **Domain** — which network (branding, tabs, assets) to render.
* **Domain Pack** — folder `\<assetsBase\>/\<domain\>/` with `config.yaml`, `domain.css`, i18n, images, modules, etc. The app can load packs from **prod** (`assets_url`) or **test** (`temp_assets_url`).
* **Override** — a small `{ backendLink, domain }` snapshot persisted in `localStorage` under the key `connect_override`.

---

## File Map (where things live)

* **Orchestrator (source of truth):** `src/context/useAppOrchestrator.js` — boot & switch logic, `/info`, assets env, domain pack, WS reconnect. Exposes `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()`, and signals for `config`, `info`, `assetsEnv`, `domainAssets*`.
* **App context wrapper:** `src/context/AppContext.jsx` — consumes the orchestrator and derives `supportedDomains`, `selectedDomain`, chain/network, IPFS gateways, and `assetUrl()`; also enforces auth consistency on domain changes.
* **HTTP/WS endpoints:** `src/net/endpoints.js` — computes `httpBase()` and `wsUrl()` from `{ backendLink, domain }`, dispatches a change event on reconfigure, and provides helpers.
* **WebSocket runtime:** picks up endpoint changes and reconnects accordingly.
* **Switch UI:** `src/x/modals/SwitchConnectModal.jsx` — fetches `<backend>/info`, normalizes a domain list, and applies changes via the app API.
* **Main shell:** dynamically applies `domain.css`, favicons/meta, GA, and binds WS connector.
* **Legacy note.** You may see an older `useAppConnection` hook; keep using the **orchestrator** (current design) as the single source of truth.

---

## 1) Boot Sequence — Step by Step

The orchestrator runs once on mount:

1. **Load site defaults**
   `GET /default_connect.yaml`, parse `backendLink`, `domain`, and (optionally) `gear`. These values are combined with a persisted **override** (if present).

2. **Normalize & pre‑configure endpoints (pre‑info)**
   Before `/info`, we set endpoints using the **requested** domain as‑is:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. This calculates `httpBase()` and `wsUrl()` and emits a change event so the runtime can point to the right server.

3. **Fetch `/info`**
   `GET <backendLink>/info` (no-cache). The JSON is stored into `orchestrator.info`.

4. **Resolve the final domain**
   If the user explicitly requested a domain, it is **honored**; otherwise we pick the **first** domain from `/info.domains` (if any). The resolved `{ backendLink, domain }` becomes `config`. If this was a switch, we **persist** the override.

5. **Finalize endpoints (post‑info)**
   Re-run `configureEndpoints` with the **final** domain. All HTTP calls should use `httpBase()`, and the **WS URL includes** `?domain=...`.

6. **Assets env → load the domain pack**
   Pick base from `/info`: `assets_url` (prod) or `temp_assets_url` (test). Try `\<assetsBase\>/\<domain\>/config.yaml`, else fall back to `/domain_default/config.yaml`. Store `domainAssetsPrefix`, `domainAssetsConfig`, and source (`domain` vs `default`).

7. **Force WS reconnect**
   Update ws client URL, reconnect, await open (up to \~8s). This ensures the runtime is in sync with the new domain and backend.

8. **Navigation**
   On an explicit switch, navigate to `/` (keeps routing state sane after major context change).

> The orchestrator exposes the same API for re‑running this sequence at any time; `setDomain()` uses the same path under the hood.

---

## 2) Endpoint Calculation (HTTP & WS)

`src/net/endpoints.js` is the **only** place that knows the active base and ws url:

### `configureEndpoints({ backendLink, domain }, reason)`

* Normalizes the base (ensures `https://…/`).
* Stores the **domain** (string).
* Derives the WebSocket URL (`ws:`/`wss:`) with `?domain=<name>&space=public`.
* Emits an `ENDPOINTS_CHANGED` event.

All other code calls getters (`httpBase()`, `wsUrl()`, `wsQuery()`) and/or subscribes to changes.

### WS runtime reacts to changes

The runtime listens for the endpoints change and can reconnect. The orchestrator also explicitly sets the URL and calls `reconnect`.

### HTTP calls

For endpoints that require `domain` in the query (auth, admin checks, etc.), callers attach it via `URLSearchParams` against `httpBase()`. (See `auth.js` examples.)

---

## 3) `/info` — What We Store and How We Use It

The raw `/info` JSON is stored as a **signal**: `orchestrator.info()`.

**Typical shape (abbreviated):**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Where it’s used:**

* **Domains** — `AppContext` derives `supportedDomains` (normalized, de‑duplicated) and the `selectedDomain`. If `config.domain` is set, it is preferred; otherwise the first supported domain is used.
* **Chain/network** — `desiredChainId = info.blockchain_id` → `desiredChain()` derives full metadata; `ensureWalletOnDesiredChain()` may be called before tx flows.
* **IPFS gateways** — `remoteIpfsGateways` comes from `info.ipfs_gateways`, and `activeIpfsGateways` optionally prepends a **local** gateway if enabled in settings.
* **Assets base** — The orchestrator chooses `assets_url` (prod) or `temp_assets_url` (test), computes `\<assetsBase\>/\<domain\>/`, then loads the domain pack. The active prefix + parsed config are published via `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **App features using `/info`** — e.g., token price mapping looks up `/info.savva_contracts.SavvaToken.address` to place the base SAVVA token into the price table.

---

## 4) Domain Configuration — Storage & Consumption

After step (6) in the boot flow, the app has:

* `assetsEnv()` — `"prod"` or `"test"` (toggle in Settings, used by admins).
* `assetsBaseUrl()` — computed from `/info` + env.
* `domainAssetsPrefix()` — either `\<assetsBase\>/\<domain\>/` or `/domain_default/`.
* `domainAssetsConfig()` — parsed `config.yaml`.

### What reads the domain config?

* **CSS & branding**

  * `DomainCssLoader` loads `assetUrl("domain.css")`, cache‑busted with a revision of `(env|domain|assets_cid)`.
  * `FaviconLoader` reads the `favicon` section (icon sizes, manifest, mask icon, meta) and updates `<link rel="icon">` et al.; URLs are resolved via `assetUrl(relPath)` and cache‑busted.

* **Internationalization (per‑domain languages)**

  * On each config load, the app publishes the domain’s language codes to the i18n system and adjusts document `<title>` to the current locale’s `title`. It also **validates** the current language against the new domain and switches to a supported one when necessary.

* **Modules / Tabs**

  * The main navigation bar (`TabsBar`) reads `config.modules.tabs` (defaults to `modules/tabs.yaml`) and loads YAML via the **asset loader** using `assetUrl()`. Tabs are localized via i18n keys and/or per‑tab metadata.

* **HTML blocks & other assets**

  * Widgets (e.g., `HtmlBlock`) call `loadAssetResource(app, relPath)` which resolves relative paths through `assetUrl()` and fetches text/YAML accordingly.

> The active `assetUrl(relPath)` is **just** `domainAssetsPrefix()` + `relPath` (sans leading `/`); this keeps all consumers consistent.

### Settings → Assets (diagnostics)

Admins can toggle **prod/test**, see the **active prefix/source**, and run diagnostics that confirm the presence of key fields (logos, locales, tabs, favicon). This view reads *only* the published orchestrator signals.

---

## 5) How Switching Works (backend/domain)

### UI flow

1. The **Switch backend / domain** dialog accepts a backend URL.
2. Calls `<backend>/info` to populate a normalized domain list (`[{name, …}]`).
3. Applies a selection by calling the app API.

### Orchestrator flow

* If **backend** changed, we **logout** first to avoid cross‑backend cookie state.
* Pre‑configure endpoints (requested domain), fetch `/info`, resolve final domain.
* Persist override, set `config`, **finalize endpoints**, load domain pack, **reconnect WS**, navigate home.

### Auth consistency

If a user is logged in and the **domain** in `config` changes, the app proactively logs out to avoid acting under a mismatched context. A toast explains why.

---

## 6) `AppContext` — What Your Code Can Rely On

`useApp()` exposes a stable surface, backed by the orchestrator:

* **Connection state:** `loading()`, `error()`, `config()`, `info()` (raw `/info`).
* **Domains:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Network:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Assets:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, and `assetUrl(relPath)`.
* **Switching API:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **i18n helpers:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Example: loading a YAML snippet from the domain pack

```js
// (not a component, just a sketch)
// All visible strings MUST be localized; here none are shown to the user.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Example: building an authenticated call that requires a domain

```js
// All user-visible strings must be localized via t():
import { useApp } from "../context/AppContext.jsx";

async function fetchAdminFlag(address) {
  const { t } = useApp();
  const url = new URL(`${httpBase()}is-admin`);
  url.searchParams.set("address", address);
  url.searchParams.set("domain", useApp().selectedDomainName());
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(t("error.connection.message"));
  return (await res.json())?.admin === true;
}
```

---

## 7) Error Handling & Empty States

When connection fails at boot (e.g., malformed YAML, `/info` down), `AppContext` exposes `error()` and the shell renders a centered error card with i18n strings and a **Retry** button.

---

## 8) Notes on i18n & UX Invariants

* **Every** user‑visible string in UI code must be `t("…")` from `useApp()` (navigation, settings, toasts, etc.).
* `document.title` is derived from the domain config’s localized `title`. Changing **domain** or **env** updates branding immediately without rebuilding.

---

## 9) Reference Snippets

* Pre‑info configure → `/info` → final configure — orchestrator core.
* Assets base & domain pack fallback — orchestrator.
* Endpoints & WS URL (`?domain=...`) — single source.
* WS runtime + reconnect on endpoint change — runtime details.
* Switch dialog `/info` fetch & domain normalization — UI detail.

---

## 10) Operational Checklist

* To change defaults in a deployment, update **`/default_connect.yaml`** on the hosting web server.
* To switch at runtime, use the **Switch dialog** (gear must be enabled by the site’s YAML).
* To preview a domain pack, toggle **Settings → Assets → Environment: Test**. The app will load from `temp_assets_url`.
* If you switch **backend**, the app **logs out** first to avoid cross‑backend cookies.

---

## Appendix: Data Model at a Glance

```ts
// Simplified conceptual model

type AppConfig = {
  backendLink: string;   // normalized with trailing slash
  domain: string;        // chosen domain name
  gear: boolean;         // UI gear enabled (from site YAML)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...other fields (e.g., savva_contracts)
};

type Orchestrator = {
  config(): AppConfig | null;
  info(): Info | null;
  loading(): boolean;
  error(): Error | null;

  // orchestration
  initializeOrSwitch(newSettings?: Partial<AppConfig>): Promise<void>;
  setDomain(name: string): Promise<void>;
  clearConnectOverride(): void;

  // assets
  assetsEnv(): "prod" | "test";
  setAssetsEnv(next: "prod" | "test"): void;
  assetsBaseUrl(): string;
  domainAssetsPrefix(): string;           // '/domain_default/' or '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // parsed config.yaml
};
```

---

That’s the full picture. With these primitives you can extend the UI safely, confident that endpoints, `/info`, and domain resources remain **consistent** and **reactive** across the app.
