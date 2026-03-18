<!-- public/dev_docs/en/core-concepts/connection-orchestration.md -->

# Orkestracija konekcije, skladištenje `/info` & konfiguracija domena

Ova stranica objašnjava tačno kako aplikacija startuje, povezuje se sa backendom, bira domen i kako čuva/koristi backendovu `/info` reakciju i konfiguraciju domena. Napisana je za profesionalne inženjere kojima je potrebno da prošire ili debug-uju tok.

> **TL;DR** — Postoji jedan orkestrator (`useAppOrchestrator`) koji:
>
> * učitava `/default_connect.json` (sa fall‑back na `.yaml`) + opciono lokalno prepisivanje,
> * konfiguriše HTTP/WS endpoint-e,
> * preuzima `/info`,
> * finalizuje domen,
> * bira bazu za assets (prod/test) i učitava paket domena,
> * ponovo povezuje WebSocket, i
> * (pri eksplicitnoj promeni) navigira na `/`.

---

## Pojmovi i osnovne komponente

* **Backend** — SAVVA čvor (HTTP API + WebSocket).
* **Domen** — koja mreža (brendiranje, tabovi, assets) će se prikazivati.
* **Domain Pack** — folder `\<assetsBase\>/\<domain\>/` sa `config.yaml`, `domain.css`, i18n fajlovima, slikama, modulima itd. Aplikacija može da učitava pakete iz **prod** (`assets_url`) ili **test** (`temp_assets_url`).
* **Override** — mali snimak `{ backendLink, domain }` koji se perzistira u `localStorage` pod ključem `connect_override`.

---

## Mapa fajlova (gde se šta nalazi)

* **Orkestrator (izvor istine):** `src/context/useAppOrchestrator.js` — logika startovanja i menjanja, `/info`, okruženje za assets, paket domena, WS reconnect. Eksponira `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()` i signale za `config`, `info`, `assetsEnv`, `domainAssets*`.
* **App context wrapper:** `src/context/AppContext.jsx` — koristi orkestrator i izvodi `supportedDomains`, `selectedDomain`, chain/network, IPFS gateway-e i `assetUrl()`; takođe obezbeđuje konzistentnost autentifikacije pri promeni domena.
* **HTTP/WS endpoint-i:** `src/net/endpoints.js` — računa `httpBase()` i `wsUrl()` iz `{ backendLink, domain }`, emituje događaj promena pri re‑konfiguraciji i pruža helper-e.
* **WebSocket runtime:** prima promene endpoint-a i ponovo se povezuje po potrebi.
* **Switch UI:** `src/x/modals/SwitchConnectModal.jsx` — preuzima `<backend>/info`, normalizuje listu domena i primenjuje izmene kroz app API.
* **Main shell:** dinamički primenjuje `domain.css`, favikon/metapodake, GA i povezuje WS konektor.
* **Legacy napomena.** Možete naići na stariji hook `useAppConnection`; nastavite da koristite **orkestrator** (trenutni dizajn) kao jedini izvor istine.

---

## 1) Sekvenca pokretanja — korak po korak

Orkestrator se izvršava jednom pri mount‑u:

1. **Učitaj podrazumevana podešavanja sajta**
   Pokušaj `GET /default_connect.json` prvo; ako nije dostupan, revertuj na `GET /default_connect.yaml`. Parsiraj `backendLink`, `domain` i (opciono) `gear`. Ove vrednosti se kombinuju sa sačuvanim **override**-om (ako postoji).

2. **Normalizuj & predkonfiguriši endpoint-e (pre `/info`)**
   Pre `/info`, postavimo endpoint-e koristeći **zahtevani** domen kako jeste:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Ovo računa `httpBase()` i `wsUrl()` i emituje događaj promene tako da runtime može da pokazuje na pravi server.

3. **Preuzmi `/info`**
   `GET <backendLink>/info` (no-cache). JSON se skladišti u `orchestrator.info`.

4. **Odredi konačni domen**
   Ako je korisnik eksplicitno zatražio domen, on se **poštuje**; u suprotnom biramo **prvi** domen iz `/info.domains` (ako postoji). Rezultujući `{ backendLink, domain }` postaje `config`. Ako je ovo bila promena, **sačuvamo** override.

5. **Finalizuj endpoint-e (posle `/info`)**
   Ponovo pozovi `configureEndpoints` sa **konačnim** domenom. Svi HTTP pozivi treba da koriste `httpBase()`, a **WS URL uključuje** `?domain=...`.

6. **Okruženje za assets → učitaj paket domena**
   Izaberi bazu iz `/info`: `assets_url` (prod) ili `temp_assets_url` (test). Pokušaj `\<assetsBase\>/\<domain\>/config.yaml`, inače fall‑back na `/domain_default/config.yaml`. Sačuvaj `domainAssetsPrefix`, `domainAssetsConfig` i izvor (`domain` vs `default`).

7. **Forsiraj ponovno povezivanje WS**
   Ažuriraj ws klijent URL, reconnectuj, sačekaj open (do ~8s). Ovo obezbeđuje da runtime bude sinhronizovan sa novim domenom i backendom.

8. **Navigacija**
   Pri eksplicitnoj promeni, navigiraj na `/` (očuva stanje rutiranja konzistentnim nakon značajne promene konteksta).

> Orkestrator eksponira isti API za ponovno pokretanje ove sekvence u bilo kom trenutku; `setDomain()` koristi isti put ispod haube.

---

## 2) Računanje endpoint‑a (HTTP & WS)

`src/net/endpoints.js` je **jedino** mesto koje zna aktivnu bazu i ws url:

### `configureEndpoints({ backendLink, domain }, reason)`

* Normalizuje bazu (osigurava `https://…/`).
* Skladišti **domen** (string).
* Izvodi WebSocket URL (`ws:`/`wss:`) sa `?domain=<name>&space=public`.
* Emituje događaj `ENDPOINTS_CHANGED`.

Sav ostali kod poziva getter‑e (`httpBase()`, `wsUrl()`, `wsQuery()`) i/ili se pretplaćuje na promene.

### WS runtime reaguje na promene

Runtime sluša promene endpoint‑a i može da se ponovo poveže. Orkestrator takođe eksplicitno postavlja URL i poziva `reconnect`.

### HTTP pozivi

Za endpoint‑e kojima je potreban `domain` u query‑ju (auth, admin provere, itd.), pozivaoci ga dodaju preko `URLSearchParams` protiv `httpBase()`. (Vidi primere u `auth.js`.)

---

## 3) `/info` — šta skladištimo i kako koristimo

Sirovi `/info` JSON čuva se kao **signal**: `orchestrator.info()`.

**Tipičan oblik (skraćeno):**

```json
{
  "domains": ["savva.app", {"name":"art.savva"}],
  "blockchain_id": 369,
  "ipfs_gateways": ["https://cloudflare-ipfs.com/ipfs/"],
  "assets_url": "https://cdn…/assets/",
  "temp_assets_url": "https://cdn…/assets-test/"
}
```

**Gde se koristi:**

* **Domeni** — `AppContext` izvodi `supportedDomains` (normalizovano, bez duplikata) i `selectedDomain`. Ako je `config.domain` postavljen, on ima prednost; u suprotnom koristi se prvi podržani domen.
* **Chain/network** — `desiredChainId = info.blockchain_id` → `desiredChain()` izvodi kompletnu metapodatak; `ensureWalletOnDesiredChain()` se može pozvati pre tokova transakcija.
* **IPFS gateway‑i** — `remoteIpfsGateways` dolazi iz `info.ipfs_gateways`, a `activeIpfsGateways` opciono dodaje **lokalni** gateway ako je uključen u podešavanjima.
* **Baza za assets** — Orkestrator bira `assets_url` (prod) ili `temp_assets_url` (test), računa `\<assetsBase\>/\<domain\>/`, pa učitava paket domena. Aktivni prefix + parsirana konfiguracija se objavljuju kroz `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Funkcionalnosti aplikacije koje koriste `/info`** — npr. mapiranje cena tokena traži `/info.savva_contracts.SavvaToken.address` da ubaci osnovni SAVVA token u tabelu cena.

---

## 4) Konfiguracija domena — skladištenje i konzumacija

Nakon koraka (6) u toku podizanja, aplikacija ima:

* `assetsEnv()` — `"prod"` ili `"test"` (preklop u Settings, koristi se od strane admina).
* `assetsBaseUrl()` — izračunato iz `/info` + env.
* `domainAssetsPrefix()` — ili `\<assetsBase\>/\<domain\>/` ili `/domain_default/`.
* `domainAssetsConfig()` — parsiran `config.yaml`.

### Ko čita konfiguraciju domena?

* **CSS & brendiranje**

  * `DomainCssLoader` učitava `assetUrl("domain.css")`, cache‑bustovano sa revizijom `(env|domain|assets_cid)`.
  * `FaviconLoader` čita sekciju `favicon` (veličine ikonica, manifest, mask icon, meta) i ažurira `<link rel="icon">` itd.; URL‑ovi se rešavaju preko `assetUrl(relPath)` i cache‑bastuju.

* **Internacionalizacija (po‑domen jezicima)**

  * Pri svakom učitavanju konfiguracije, aplikacija objavljuje jezičke kodove domena u i18n sistem i podešava `<title>` dokumenta za trenutnu lokalizaciju. Takođe **validira** trenutni jezik prema novom domenu i menja ga na podržani ako je potrebno.

* **Moduli / tabovi**

  * Glavni navigacioni bar (`TabsBar`) čita `config.modules.tabs` (podrazumevano `modules/tabs.yaml`) i učitava YAML preko **asset loader‑a** koristeći `assetUrl()`. Tabovi su lokalizovani preko i18n ključeva i/ili metapodataka po tabu.

* **HTML blokovi & ostali assets**

  * Widgeti (npr. `HtmlBlock`) pozivaju `loadAssetResource(app, relPath)` koji rešava relativne putanje preko `assetUrl()` i preuzima tekst/YAML po potrebi.

> Aktivni `assetUrl(relPath)` je **samo** `domainAssetsPrefix()` + `relPath` (bez vodećeg `/`); to održava konzistentnost među potrošačima.

### Settings → Assets (diagnostika)

Admini mogu da prebacuju **prod/test**, vide **aktivni prefix/izvor**, i pokreću dijagnostiku koja potvrđuje prisustvo ključnih polja (logoi, lokalizacije, tabovi, favicon). Ovaj prikaz čita *samo* objavljene orkestrator signale.

---

## 5) Kako funkcioniše promena (backend/domen)

### UI tok

1. Dijalog **Switch backend / domain** prihvata backend URL.
2. Poziva `<backend>/info` da popuni normalizovanu listu domena (`[{name, …}]`).
3. Primeni selekciju pozivom app API‑ja.

### Tok orkestratora

* Ako se promenio **backend**, prvo se **odjavljujemo** da bismo izbegli stanje kolačića između backend‑ova.
* Predkonfiguriši endpoint‑e (zahtevani domen), preuzmi `/info`, odredi konačni domen.
* Perzistiraj override, postavi `config`, **finalizuj endpoint‑e**, učitaj paket domena, **ponovo poveži WS**, navigiraj na početnu stranu.

### Konzistentnost autentifikacije

Ako je korisnik ulogovan i **domen** u `config` se promeni, aplikacija proaktivno odjavljuje korisnika da bi izbegla rad u pogrešnom kontekstu. Prikazuje se obaveštenje (toast) koje objašnjava razlog.

---

## 6) `AppContext` — na šta se vaš kod može osloniti

`useApp()` eksponira stabilan interfejs, potkovan orkestratorom:

* **Stanje konekcije:** `loading()`, `error()`, `config()`, `info()` (sirovi `/info`).
* **Domeni:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Mreža:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Assets:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, i `assetUrl(relPath)`.
* **API za promenu:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **i18n pomoćnici:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Primer: učitavanje YAML isečka iz paketa domena

```js
// (nije komponenta, samo skica)
// Sve vidljive stringove MORAJU biti lokalizovane; ovde se ništa ne prikazuje korisniku.
import { useApp } from "../context/AppContext.jsx";
import { loadAssetResource } from "../utils/assetLoader.js";

async function loadDomainTabs() {
  const app = useApp();
  const rel = app.domainAssetsConfig?.()?.modules?.tabs || "modules/tabs.yaml";
  const data = await loadAssetResource(app, rel, { type: "yaml" });
  return Array.isArray(data?.tabs) ? data.tabs : [];
}
```

### Primer: izgradnja autentifikovanog poziva koji zahteva domen

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

## 7) Rukovanje greškama & prazna stanja

Kada konekcija zakaže pri pokretanju (npr. malformisan config, `/info` nedostupan), `AppContext` eksponira `error()` i shell prikazuje centriranu grešku karticu sa i18n stringovima i dugmetom **Retry**.

---

## 8) Napomene o i18n & UX invariantama

* **Svaki** string vidljiv korisniku u UI kodu mora biti `t("…")` iz `useApp()` (navigacija, podešavanja, toast‑ovi itd.).
* `document.title` potiče iz lokalizovanog `title` polja u konfiguraciji domena. Promena **domena** ili **env** odmah ažurira brendiranje bez ponovnog build‑a.

---

## 9) Referentni isečci

* Pred‑info konfiguracija → `/info` → finalna konfiguracija — jezgro orkestratora.
* Baza za assets & fallback paket domena — orkestrator.
* Endpoint‑i & WS URL (`?domain=...`) — jedini izvor.
* WS runtime + reconnect pri promeni endpoint‑a — detalji runtime‑a.
* Switch dijalog `/info` fetch & normalizacija domena — UI detalj.

---

## 10) Operativna lista za proveru

* Da biste promenili podrazumevana podešavanja na deployment‑u, ažurirajte **`/default_connect.json`** (ili `/default_connect.yaml`) na hosting web serveru.
* Da biste promenili u runtime‑u, koristite **Switch dialog** (gear mora biti omogućena kroz site config).
* Da biste pregledali paket domena, u Settings → Assets postavite Environment: Test. Aplikacija će učitati iz `temp_assets_url`.
* Ako promenite **backend**, aplikacija se **prvo odjavljuje** da bi izbegla kolačiće između backend‑ova.

---

## Dodatak: model podataka na brzinu

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

To je cela slika. Sa ovim primitivima možete bezbedno proširivati UI, sigurni da su endpoint‑i, `/info` i resursi domena **konzistentni** i **reaktivni** kroz celu aplikaciju.