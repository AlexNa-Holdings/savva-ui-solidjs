<!-- public/dev_docs/sr/core-concepts/connection-orchestration.md -->

# Orkestracija konekcije, `/info` skladištenje i konfiguracija domena

Ova stranica objašnjava tačno kako aplikacija pokreće, povezuje se sa backend-om, bira domen i kako skladišti/koristi odgovor `/info` sa backend-a i konfiguraciju domena. Napisana je za profesionalne inženjere koji treba da prošire ili otklone greške u toku.

> **TL;DR** — Postoji jedan orkestrator (`useAppOrchestrator`) koji:
>
> * čita `/default_connect.yaml` (+ opcioni lokalni preklop),
> * konfiguriše HTTP/WS krajnje tačke,
> * preuzima `/info`,
> * finalizuje domen,
> * bira osnovu sredstava (prod/test), učitava paket domena,
> * ponovo povezuje WebSocket, i
> * (na eksplicitnom prebacivanju) navigira na `/`.

---

## Pojmovi i primitivni tipovi

* **Backend** — SAVVA čvor (HTTP API + WebSocket).
* **Domen** — koja mreža (brendiranje, kartice, sredstva) da se prikaže.
* **Paket domena** — folder `\<assetsBase\>/\<domain\>/` sa `config.yaml`, `domain.css`, i18n, slikama, modulima, itd. Aplikacija može učitati pakete iz **prod** (`assets_url`) ili **test** (`temp_assets_url`).
* **Preklop** — mali `{ backendLink, domain }` snimak koji se čuva u `localStorage` pod ključem `connect_override`.

---

## Mapa fajlova (gde se šta nalazi)

* **Orkestrator (izvor istine):** `src/context/useAppOrchestrator.js` — logika pokretanja i prebacivanja, `/info`, okruženje sredstava, paket domena, WS ponovna povezanost. Izlaže `initializeOrSwitch()`, `setDomain()`, `clearConnectOverride()`, i signale za `config`, `info`, `assetsEnv`, `domainAssets*`.
* **Obavijač konteksta aplikacije:** `src/context/AppContext.jsx` — koristi orkestrator i izvodi `supportedDomains`, `selectedDomain`, lanac/mrežu, IPFS prolaze, i `assetUrl()`; takođe osigurava doslednost autentifikacije prilikom promena domena.
* **HTTP/WS krajnje tačke:** `src/net/endpoints.js` — izračunava `httpBase()` i `wsUrl()` iz `{ backendLink, domain }`, pokreće događaj promene prilikom rekonfiguracije, i pruža pomoćne funkcije.
* **WebSocket runtime:** preuzima promene krajnjih tačaka i ponovo se povezuje u skladu s tim.
* **UI za prebacivanje:** `src/x/modals/SwitchConnectModal.jsx` — preuzima `<backend>/info`, normalizuje listu domena, i primenjuje promene putem API-ja aplikacije.
* **Glavna ljuska:** dinamički primenjuje `domain.css`, favicone/meta, GA, i povezuje WS konektor.
* **Napomena o nasleđu.** Možda ćete videti stariji `useAppConnection` hook; nastavite da koristite **orkestrator** (trenutni dizajn) kao jedini izvor istine.

---

## 1) Sekvenca pokretanja — Korak po korak

Orkestrator se pokreće jednom prilikom montiranja:

1. **Učitaj podrazumevane postavke**
   `GET /default_connect.yaml`, analiziraj `backendLink`, `domain`, i (opciono) `gear`. Ove vrednosti se kombinuju sa sačuvanim **preklopom** (ako je prisutan).

2. **Normalizuj i prethodno konfiguriši krajnje tačke (pre‑info)**
   Pre `/info`, postavljamo krajnje tačke koristeći **traženi** domen onako kako jeste:
   `configureEndpoints({ backendLink, domain }, "orch:pre-info")`. Ovo izračunava `httpBase()` i `wsUrl()` i emituje događaj promene kako bi runtime mogao da ukazuje na pravi server.

3. **Preuzmi `/info`**
   `GET <backendLink>/info` (bez keširanja). JSON se skladišti u `orchestrator.info`.

4. **Reši konačni domen**
   Ako je korisnik eksplicitno zatražio domen, to se **poštuje**; u suprotnom, biramo **prvi** domen iz `/info.domains` (ako ih ima). Rešeni `{ backendLink, domain }` postaje `config`. Ako je ovo bilo prebacivanje, **čuvamo** preklop.

5. **Finalizuj krajnje tačke (post‑info)**
   Ponovo pokreni `configureEndpoints` sa **konačnim** domenom. Sve HTTP pozive treba da koriste `httpBase()`, a **WS URL uključuje** `?domain=...`.

6. **Okruženje sredstava → učitaj paket domena**
   Izaberi osnovu iz `/info`: `assets_url` (prod) ili `temp_assets_url` (test). Pokušaj `\<assetsBase\>/\<domain\>/config.yaml`, inače se vraća na `/domain_default/config.yaml`. Skladišti `domainAssetsPrefix`, `domainAssetsConfig`, i izvor (`domain` vs `default`).

7. **Prisilna WS ponovna povezanost**
   Ažuriraj ws klijent URL, ponovo se poveži, čekaj da se otvori (do ~8s). Ovo osigurava da je runtime usklađen sa novim domenom i backend-om.

8. **Navigacija**
   Na eksplicitnom prebacivanju, navigiraj na `/` (održava stanje usmeravanja zdravim nakon velike promene konteksta).

> Orkestrator izlaže isti API za ponovno pokretanje ove sekvence u bilo kojem trenutku; `setDomain()` koristi isti put ispod haube.

---

## 2) Izračunavanje krajnjih tačaka (HTTP & WS)

`src/net/endpoints.js` je **jedino** mesto koje zna aktivnu osnovu i ws url:

### `configureEndpoints({ backendLink, domain }, reason)`

* Normalizuje osnovu (osigurava `https://…/`).
* Čuva **domen** (string).
* Izvodi WebSocket URL (`ws:`/`wss:`) sa `?domain=<name>&space=public`.
* Emituje događaj `ENDPOINTS_CHANGED`.

Sav ostali kod poziva gettere (`httpBase()`, `wsUrl()`, `wsQuery()`) i/ili se pretplaćuje na promene.

### WS runtime reaguje na promene

Runtime sluša promene krajnjih tačaka i može se ponovo povezati. Orkestrator takođe eksplicitno postavlja URL i poziva `reconnect`.

### HTTP pozivi

Za krajnje tačke koje zahtevaju `domain` u upitu (autentifikacija, admin provere, itd.), pozivaoci ga dodaju putem `URLSearchParams` protiv `httpBase()`. (Pogledajte primere u `auth.js`.)

---

## 3) `/info` — Šta skladištimo i kako to koristimo

Siromašni `/info` JSON se skladišti kao **signal**: `orchestrator.info()`.

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

* **Domeni** — `AppContext` izvodi `supportedDomains` (normalizovano, bez duplikata) i `selectedDomain`. Ako je `config.domain` postavljen, on se preferira; u suprotnom se koristi prvi podržani domen.
* **Lanac/mreža** — `desiredChainId = info.blockchain_id` → `desiredChain()` izvodi pune metapodatke; `ensureWalletOnDesiredChain()` može biti pozvan pre tx tokova.
* **IPFS prolazi** — `remoteIpfsGateways` dolazi iz `info.ipfs_gateways`, a `activeIpfsGateways` opcionalno dodaje **lokalni** prolaz ako je omogućeno u postavkama.
* **Osnova sredstava** — Orkestrator bira `assets_url` (prod) ili `temp_assets_url` (test), izračunava `\<assetsBase\>/\<domain\>/`, a zatim učitava paket domena. Aktivni prefiks + analizirana konfiguracija se objavljuju putem `domainAssetsPrefix()` / `domainAssetsConfig()`.
* **Funkcije aplikacije koje koriste `/info`** — npr., mapiranje cena tokena traži `/info.savva_contracts.SavvaToken.address` da bi stavio osnovni SAVVA token u tabelu cena.

---

## 4) Konfiguracija domena — Skladištenje i konzumacija

Nakon koraka (6) u toku pokretanja, aplikacija ima:

* `assetsEnv()` — `"prod"` ili `"test"` (prebacivanje u postavkama, koristi se od strane admina).
* `assetsBaseUrl()` — izračunato iz `/info` + okruženje.
* `domainAssetsPrefix()` — ili `\<assetsBase\>/\<domain\>/` ili `/domain_default/`.
* `domainAssetsConfig()` — analizirani `config.yaml`.

### Šta čita konfiguraciju domena?

* **CSS i brendiranje**

  * `DomainCssLoader` učitava `assetUrl("domain.css")`, kešira se sa revizijom `(env|domain|assets_cid)`.
  * `FaviconLoader` čita odeljak `favicon` (veličine ikona, manifest, maska ikone, meta) i ažurira `<link rel="icon">` itd.; URL-ovi se rešavaju putem `assetUrl(relPath)` i keširaju.

* **Međunarodna lokalizacija (jezici po domenu)**

  * Prilikom svakog učitavanja konfiguracije, aplikacija objavljuje kodove jezika domena u i18n sistem i prilagođava dokument `<title>` trenutnom lokalnom `title`. Takođe **validira** trenutni jezik u odnosu na novi domen i prebacuje se na podržani kada je to potrebno.

* **Moduli / Kartice**

  * Glavna navigaciona traka (`TabsBar`) čita `config.modules.tabs` (podrazumevano na `modules/tabs.yaml`) i učitava YAML putem **učitača sredstava** koristeći `assetUrl()`. Kartice su lokalizovane putem i18n ključeva i/ili metapodataka po kartici.

* **HTML blokovi i druga sredstva**

  * Widgeti (npr., `HtmlBlock`) pozivaju `loadAssetResource(app, relPath)` koji rešava relativne putanje kroz `assetUrl()` i preuzima tekst/YAML u skladu s tim.

> Aktivni `assetUrl(relPath)` je **samo** `domainAssetsPrefix()` + `relPath` (bez vodeće `/`); ovo održava sve potrošače doslednim.

### Postavke → Sredstva (dijagnostika)

Admini mogu prebaciti **prod/test**, videti **aktivni prefiks/izvor**, i pokrenuti dijagnostiku koja potvrđuje prisustvo ključnih polja (logotipi, lokali, kartice, favicon). Ova prikaz čita *samo* objavljene signale orkestratora.

---

## 5) Kako funkcioniše prebacivanje (backend/domen)

### UI tok

1. Dijalog **Prebaci backend / domen** prihvata URL backend-a.
2. Poziva `<backend>/info` da popuni normalizovanu listu domena (`[{name, …}]`).
3. Primena selekcije pozivanjem API-ja aplikacije.

### Tok orkestratora

* Ako se **backend** promenio, prvo se **odjavljujemo** da bismo izbegli stanje kolačića između backend-a.
* Prethodno konfiguriši krajnje tačke (traženi domen), preuzmi `/info`, reši konačni domen.
* Sačuvaj preklop, postavi `config`, **finalizuj krajnje tačke**, učitaj paket domena, **ponovo poveži WS**, navigiraj kući.

### Doslednost autentifikacije

Ako je korisnik prijavljen i **domen** u `config` se menja, aplikacija proaktivno odjavljuje da bi izbegla delovanje u nesaglasnom kontekstu. Toast objašnjava zašto.

---

## 6) `AppContext` — Na šta se vaš kod može osloniti

`useApp()` izlaže stabilnu površinu, podržanu od strane orkestratora:

* **Stanje konekcije:** `loading()`, `error()`, `config()`, `info()` (sirovi `/info`).
* **Domeni:** `supportedDomains()`, `selectedDomain()`, `selectedDomainName()`.
* **Mreža:** `desiredChainId()`, `desiredChain()`, `ensureWalletOnDesiredChain()`.
* **IPFS:** `remoteIpfsGateways()`, `activeIpfsGateways()`.
* **Sredstva:** `assetsEnv()`, `assetsBaseUrl()`, `domainAssetsPrefix()`, `domainAssetsConfig()`, i `assetUrl(relPath)`.
* **API za prebacivanje:** `initializeOrSwitch(newSettings)`, `setDomain(name)`, `clearConnectOverride()`.
* **i18n pomoćnici:** `t(key, vars?)`, `lang()`, `setLang(code)`.

### Primer: učitavanje YAML isječka iz paketa domena

```js
// (nije komponenta, samo skica)
// Sve vidljive stringove MORAJU biti lokalizovane; ovde nijedna nije prikazana korisniku.
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
// Svi stringovi vidljivi korisnicima moraju biti lokalizovani putem t():
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

## 7) Obrada grešaka i prazna stanja

Kada konekcija ne uspe prilikom pokretanja (npr., neispravan YAML, `/info` nedostupan), `AppContext` izlaže `error()` i ljuska prikazuje centriranu kartu greške sa i18n stringovima i dugmetom **Ponovo**.

---

## 8) Napomene o i18n i UX invariantima

* **Svaki** string vidljiv korisnicima u UI kodu mora biti `t("…")` iz `useApp()` (navigacija, postavke, toasti, itd.).
* `document.title` se izvodi iz lokalizovanog `title` domena konfiguracije. Promena **domena** ili **okruženja** odmah ažurira brendiranje bez ponovnog izgradnje.

---

## 9) Referentni isječci

* Pre‑info konfiguriši → `/info` → konačna konfiguracija — jezgro orkestratora.
* Osnova sredstava i rezervna konfiguracija paketa domena — orkestrator.
* Krajnje tačke i WS URL (`?domain=...`) — jedini izvor.
* WS runtime + ponovna povezanost na promenu krajnje tačke — detalji runtime-a.
* Dijalog za prebacivanje `/info` preuzimanje i normalizacija domena — UI detalj.

---

## 10) Operativna kontrolna lista

* Da biste promenili podrazumevane postavke u implementaciji, ažurirajte **`/default_connect.yaml`** na hosting web serveru.
* Da biste prebacili u toku rada, koristite **Dijalog za prebacivanje** (oprema mora biti omogućena YAML-om sajta).
* Da biste pregledali paket domena, prebacite **Postavke → Sredstva → Okruženje: Test**. Aplikacija će učitati iz `temp_assets_url`.
* Ako prebacite **backend**, aplikacija se **odjavljuje** prvo da bi izbegla kolačiće između backend-a.

---

## Dodatak: Model podataka na prvi pogled

```ts
// P pojednostavljeni konceptualni model

type AppConfig = {
  backendLink: string;   // normalizovano sa završnim slash-om
  domain: string;        // izabrano ime domena
  gear: boolean;         // UI oprema omogućena (iz YAML-a sajta)
};

type Info = {
  domains: Array<string | { name: string; website?: string }>;
  blockchain_id?: number;
  ipfs_gateways?: string[];
  assets_url?: string;
  temp_assets_url?: string;
  // ...ostala polja (npr., savva_contracts)
};

type Orchestrator = {
  config(): AppConfig | null;
  info(): Info | null;
  loading(): boolean;
  error(): Error | null;

  // orkestracija
  initializeOrSwitch(newSettings?: Partial<AppConfig>): Promise<void>;
  setDomain(name: string): Promise<void>;
  clearConnectOverride(): void;

  // sredstva
  assetsEnv(): "prod" | "test";
  setAssetsEnv(next: "prod" | "test"): void;
  assetsBaseUrl(): string;
  domainAssetsPrefix(): string;           // '/domain_default/' ili '<assetsBase>/<domain>/'
  domainAssetsConfig(): any | null;       // analizirani config.yaml
};
```

---

To je cela slika. Sa ovim primitivima možete sigurno proširiti UI, uvereni da krajnje tačke, `/info`, i resursi domena ostaju **dosledni** i **reaktivni** širom aplikacije.