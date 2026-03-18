# Inicijalizacija aplikacije i konekcija na backend

## Šta je SAVVA backend (SAVVA čvor)?
SAVVA backend je serverska komponenta koja **indeksira/kešira podatke dobijene iz blockchain aktivnosti** i izlaže brze, za UI prilagođene API-je i WebSocket metode. Jedan backend može služiti **više SAVVA domena** — zamislite „domen“ kao zasebnu SAVVA društvenu mrežu (brendiranje, kartice, resursi, podrazumevana podešavanja), sve podržano jednim čvorom.

## Šta aplikacija treba pri pokretanju
Pri startovanju web aplikacija treba dva ulaza:

1. **Backend URL** – osnovni URL SAVVA backenda.
2. **Ime domena** – koji SAVVA domen (društvena mreža) će se po defaultu prikazati.

Podrazumevana podešavanja dolaze iz male JSON datoteke u korenu veba (YAML je takođe podržan kao fallback):

### `/default_connect.json`
```json
{
  "domain": "savva.app",
  "backendLink": "https://ui.savva.app/api/",
  "gear": true,
  "default_ipfs_link": "ipfs://bafy.../something.json"
}
```

* `backendLink` — osnovna HTTP krajnja tačka SAVVA backenda (aplikacija je normalizuje).
* `domain` — početni domen za prikaz; može se kasnije menjati u UI.
* `gear` — omogućava developerske opcije u UI (opciono).
* `default_ipfs_link` — opciona zgodnost koja se koristi u nekim tokovima.

> **Napomena o formatu**
> Aplikacija pokušava prvo `/default_connect.json`. Ako taj zahtev ne uspe, pada na `/default_connect.yaml` radi retrokompatibilnosti. Nove deployment-e bi trebalo da koriste JSON.

> **Napomena za produkciju**
> U produkciji ovu datoteku obično servira vaš HTTP server (npr. Nginx) i ona praktično **izborom domena određuje koji domen** će raspoređena web aplikacija po defaultu prikazivati. Jedan uobičajen obrazac je da se servira specifična datoteka sa diska:
>
> ```nginx
> # example: serve a static default_connect.json
> location = /default_connect.json {
>   default_type application/json;
>   alias /etc/savva/default_connect.json;
> }
> ```
>
> Prilagodite to vašoj infra; suština je da aplikacija može `GET /default_connect.json`.

---

## Sekvenca pokretanja

1. **Učitaj konfiguraciju sajta (`/default_connect.json` ili `.yaml`)**
   Aplikacija pokušava da preuzme `/default_connect.json` prvo; ako nije dostupna, prelazi na `/default_connect.yaml`. Validira `backendLink`, skladišti `domain`, i odmah **konfiguriše krajnje tačke** (HTTP baza + WS URL) koristeći te vrednosti. &#x20;

2. **Konfiguriši krajnje tačke**

   * `httpBase` je normalizovana verzija `backendLink` (sa garantovanim završnim kosim crtom).
   * `ws` URL se izvodi iz iste baze, pokazuje na `.../ws` (protokol se menja u `ws:` ili `wss:`) i uključuje `?domain=...` u upitu.
     Ovo održava **jedan izvor istine** za oba, HTTP i WS.&#x20;

3. **Preuzmi `/info`**
   Sa postavljenim krajnjim tačkama, aplikacija poziva `GET <httpBase>info` i skladišti JSON. Od tog trenutka, **/info upravlja ponašanjem u runtime-u** (domeni, chain, IPFS, resursi).&#x20;

4. **Izvedi runtime stanje iz `/info`**
   Sledeća polja se koriste (videti primer niže):

   * **`domains`** → Lista dostupnih domena. UI preferira eksplicitni `domain` iz YAML/override; ako on nije prisutan u `/info`, i dalje ga koristi.&#x20;
   * **`blockchain_id`** → Ciljni EVM chain ID. pomoćnik za novčanik može da prebaci/doda ovu mrežu.&#x20;
   * **`ipfs_gateways`** → Remote IPFS gateway-e koje treba pokušati redom (osim ako nije omogućeno lokalno IPFS preslikavanje).&#x20;
   * **`assets_url`** i **`temp_assets_url`** → Osnova **resursa** (prod vs test). Aplikacija računa **aktivni prefiks resursa za domen** kao
     `(<assets base> + <domain> + "/")` sa **fallback-om** na `/domain_default/` ako udaljeni `config.yaml` nedostaje. &#x20;

5. **Učitaj resurse domena i konfiguraciju**
   Aplikacija pokušava `(<active prefix>/config.yaml)` sa kratkim timeout-om; u slučaju neuspeha pada na default paket na `/domain_default/config.yaml`. Rezultujuća parsirana konfiguracija (logoi, kartice, lokalizacije, itd.) se skladišti i UI se renderuje prema tome.&#x20;

6. **WebSocket runtime**
   WS klijent koristi izračunati `ws` URL iz krajnjih tačaka; kada se backend/domen promeni, krajnje tačke se ponovo izračunavaju i WS sloj to preuzima.&#x20;

---

## Primer `/info` (ilustrativno)

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

### Polje-po-polje (šta aplikacija radi sa tim)

* **domains** — lista domena koja se može izabrati. Dijalog **Switch backend / domain** popunjava se iz `/info`, ali konfigurisani domen i dalje ima prednost ako je `/info` zastareo. &#x20;
* **blockchain\_id** — numerički EVM chain ID; koristi se za izgradnju meta-podataka za `switch/add chain` i za osiguranje da je novčanik na **zahtevanoj mreži**. &#x20;
* **ipfs\_gateways** — uređena lista udaljenih gateway-a; kombinuje se sa opcionim **Local IPFS** preslikavanjem (kada je omogućeno u podešavanjima) da formira **aktivni** redosled gateway-a.&#x20;
* **assets\_url / temp\_assets\_url** — aplikacija održava **assets env** (`prod`/`test`) i bira odgovarajuću bazu. Zatim računa `/<base>/<domain>/` i učitava `config.yaml`. Ako udaljeni paket nedostaje ili je spor, koristi **default** `/domain_default/`.&#x20;

---

## Gde se ovo nalazi u kodu (za brzi pregled)

* Boot & učitavanje konfiguracije sajta (`/default_connect.json` sa `.yaml` fallback-om), zatim `/info`: **`src/context/AppContext.jsx`** i **`src/hooks/useConnect.js`**. Deljeni loader je u **`src/utils/loadSiteConfig.js`**. &#x20;
* Izvor istine za krajnje tačke (HTTP baza + WS URL): **`src/net/endpoints.js`**.&#x20;
* Rezolucija liste domena, chain ID, IPFS gateway-i, assets env i učitavanje resursa domena: **`src/context/AppContext.jsx`**.  &#x20;
* Dijalog za prebacivanje koji preuzima `/info` i normalizuje `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Dalje:** u narednom poglavlju razložićemo **konfiguraciju domena** (`config.yaml`) i kako ona kontroliše logoe, kartice, lokalizacije i ostala ponašanja UI‑ja po domenima.