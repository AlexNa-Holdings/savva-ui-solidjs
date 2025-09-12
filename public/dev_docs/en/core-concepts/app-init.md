
# App initialization & backend connect

## What is the SAVVA backend (SAVVA node)?
A SAVVA backend is a server component that **indexes/caches data sourced from blockchain activity** and exposes fast, UI‑friendly APIs & WebSocket methods. A single backend can serve **multiple SAVVA domains**—think of a “domain” as a distinct SAVVA social network (branding, tabs, assets, defaults), all backed by one node.

## What the app needs at boot
On startup the web app needs two inputs:

1. **Backend URL** – the base URL of the SAVVA backend.
2. **Domain name** – which SAVVA domain (social network) to render by default.

Defaults come from a tiny YAML file at the web root:

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optional:
# default_ipfs_link: ipfs://bafy.../something.json
````

* `backendLink` — base HTTP endpoint of the SAVVA backend (the app normalizes it).
* `domain` — initial domain to render; can be switched later in the UI.
* `gear` — enables developer gear in the UI (optional).
* `default_ipfs_link` — optional convenience default used in some flows.

> **Production note**
> In production this file is usually served by your HTTP server (e.g., Nginx) and effectively **chooses which domain** a deployed web app shows by default. One common pattern is to serve a specific file from disk:
>
> ```nginx
> # example: serve a static default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Adjust to your infra; the key is that the app can `GET /default_connect.yaml`.

---

## Boot sequence

1. **Load `/default_connect.yaml`**
   The app fetches the YAML file, validates `backendLink`, and stores `domain`. It immediately **configures endpoints** (HTTP base + WS URL) using those values. &#x20;

2. **Configure endpoints**

   * `httpBase` is a normalized version of `backendLink` (guaranteed trailing slash).
   * `ws` URL is derived from the same base, pointing to `.../ws` (protocol switched to `ws:` or `wss:`) and includes `?domain=...` in the query.
     This keeps **one source of truth** for both HTTP and WS.&#x20;

3. **Fetch `/info`**
   With endpoints set, the app calls `GET <httpBase>info` and stores the JSON. From that moment, **/info drives runtime behavior** (domains, chain, IPFS, assets).&#x20;

4. **Derive runtime state from `/info`**
   The following fields are used (see sample below):

   * **`domains`** → Available domain list. The UI prefers the explicit `domain` from the YAML/override; if it’s not present in `/info`, it still uses it.&#x20;
   * **`blockchain_id`** → Target EVM chain ID. The wallet helper can switch/add this network.&#x20;
   * **`ipfs_gateways`** → Remote IPFS gateways to try in order (unless a local IPFS override is enabled).&#x20;
   * **`assets_url`** and **`temp_assets_url`** → The **assets base** (prod vs test). The app computes the **active domain assets prefix** as
     `(<assets base> + <domain> + "/")` with a **fallback** to `/domain_default/` if the remote `config.yaml` is missing. &#x20;

5. **Load domain assets & config**
   The app tries `(<active prefix>/config.yaml)` with a short timeout; on failure it falls back to the default pack at `/domain_default/config.yaml`. The resulting parsed config (logos, tabs, locales, etc.) is stored and the UI renders accordingly.&#x20;

6. **WebSocket runtime**
   The WS client uses the computed `ws` URL from endpoints; when backend/domain changes, endpoints recalculate and the WS layer picks it up.&#x20;

---

## Sample `/info` (illustrative)

```json
{
  "domains": [
    "savva.app",
    {"name": "art.savva"},
    "dev.savva"
  ],
  "blockchain_id": 369,
  "ipfs_gateways": [
    "https://cloudflare-ipfs.com/ipfs/",
    "https://ipfs.io/ipfs/"
  ],
  "assets_url": "https://cdn.savva.network/assets/",
  "temp_assets_url": "https://cdn.savva.network/assets-test/"
}
```

### Field-by-field (what the app does with it)

* **domains** — list of selectable domains. The **Switch backend / domain** dialog populates from `/info`, but the configured domain still takes precedence if `/info` is behind. &#x20;
* **blockchain\_id** — numeric EVM chain ID; used to build `switch/add chain` metadata and to ensure the wallet is on the **required network**. &#x20;
* **ipfs\_gateways** — ordered list of remote gateways; combined with an optional **Local IPFS** override (when enabled in settings) to form the **active** gateway order.&#x20;
* **assets\_url / temp\_assets\_url** — the app maintains an **assets env** (`prod`/`test`) and picks the matching base. It then computes `/<base>/<domain>/` and loads `config.yaml`. If the remote pack is missing or slow, it uses the **default** `/domain_default/`.&#x20;

---

## Where this lives in the code (for quick reference)

* Boot & `/default_connect.yaml` load, then `/info`: **`src/context/AppContext.jsx`** and **`src/hooks/useConnect.js`**. &#x20;
* Endpoint source of truth (HTTP base + WS URL): **`src/net/endpoints.js`**.&#x20;
* Domain list resolution, chain ID, IPFS gateways, assets env & domain assets loading: **`src/context/AppContext.jsx`**.  &#x20;
* Switch dialog that fetches `/info` and normalizes `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Next:** in the following chapter we’ll break down **domain configuration** (`config.yaml`) and how it controls logos, tabs, locales, and other per‑domain UI behaviors.



