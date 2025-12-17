# Inicijalizacija aplikacije i povezivanje sa backend-om

## Šta je SAVVA backend (SAVVA čvor)?
SAVVA backend je serverska komponenta koja **indeksira/kešira podatke dobijene iz aktivnosti na blockchain-u** i izlaže brze, UI‑prijateljske API-je i WebSocket metode. Jedan backend može služiti **više SAVVA domena** — zamislite „domen“ kao zasebnu SAVVA društvenu mrežu (brending, tabovi, resursi, podrazumevana podešavanja), sve podržano jednim čvorom.

## Šta aplikaciji treba pri pokretanju
Pri pokretanju web-aplikaciji su potrebna dva parametra:

1. **Backend URL** – osnovni URL SAVVA backenda.
2. **Ime domena** – koji SAVVA domen (društvena mreža) se prikazuje po defaultu.

Podrazumevana podešavanja dolaze iz malog YAML fajla u korenu web-aplikacije:

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# optional:
# default_ipfs_link: ipfs://bafy.../something.json
````

* `backendLink` — osnovna HTTP krajnja tačka SAVVA backenda (aplikacija je normalizuje).
* `domain` — početni domen koji se prikazuje; kasnije se može promeniti u UI.
* `gear` — omogućava developerske opcije u UI (opciono).
* `default_ipfs_link` — opciona podrazumevana vrednost koja se koristi u nekim tokovima.

> **Napomena za produkciju**
> U produkciji ovaj fajl obično servira vaš HTTP server (npr. Nginx) i efektivno **određuje koji domen** će prikazivati raspoređena web-aplikacija po defaultu. Jedan uobičajen obrazac je serviranje specifičnog fajla sa diska:
>
> ```nginx
> # example: serve a static default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Prilagodite svojoj infrastrukturi; ključno je da aplikacija može da `GET /default_connect.yaml`.

---

## Sekvenca pokretanja

1. **Load `/default_connect.yaml`**
   Aplikacija preuzima YAML fajl, validira `backendLink` i čuva `domain`. Odmah **konfiguriše krajnje tačke** (HTTP baza + WS URL) koristeći te vrednosti. &#x20;

2. **Konfigurisanje krajnjih tačaka**

   * `httpBase` je normalizovana verzija `backendLink` (garantovan završni kosu crtu).
   * `ws` URL se izvodi iz iste baze, pokazuje na `.../ws` (protokol se menja u `ws:` ili `wss:`) i uključuje `?domain=...` u query‑ju.
     Ovo održava **jedan izvor istine** za HTTP i WS.&#x20;

3. **Preuzimanje `/info`**
   Sa postavljenim krajnjim tačkama, aplikacija poziva `GET <httpBase>info` i skladišti JSON. Od tog trenutka, **/info upravlja ponašanjem u runtime-u** (domeni, lanac, IPFS, resursi).&#x20;

4. **Izvođenje runtime stanja iz `/info`**
   Sledeća polja se koriste (vidi primer dole):

   * **`domains`** → Lista dostupnih domena. UI preferira eksplicitni `domain` iz YAML/override; ako nije prisutan u `/info`, i dalje ga koristi.&#x20;
   * **`blockchain_id`** → Ciljani EVM chain ID. pomoćnik za novčanik može prebaciti/dodati ovu mrežu.&#x20;
   * **`ipfs_gateways`** → Remote IPFS gateway‑i koje treba probati redom (osim ako nije omogućen lokalni IPFS override).&#x20;
   * **`assets_url`** i **`temp_assets_url`** → **osnova za resurse** (prod vs test). Aplikacija računa **prefiks aktivnih resursa za domen** kao
     `(<assets base> + <domain> + "/")` sa **fallback**-om na `/domain_default/` ako daljinski `config.yaml` nedostaje. &#x20;

5. **Učitavanje resursa i konfiguracije domena**
   Aplikacija pokušava `(<active prefix>/config.yaml)` sa kratkim timeout-om; u slučaju greške pada na podrazumevani paket na `/domain_default/config.yaml`. Rezultujući parsirani config (logotipi, tabovi, lokalizacije, itd.) se skladišti i UI se renderuje u skladu s tim.&#x20;

6. **WebSocket tokom rada**
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

### Polje po polje (šta aplikacija radi sa tim)

* **domains** — lista domena koje se mogu izabrati. Dijalog **Switch backend / domain** popunjava se iz `/info`, ali konfigurisani domen i dalje ima prednost ako je `/info` zastareo. &#x20;
* **blockchain\_id** — numerički EVM chain ID; koristi se za izgradnju meta‑podataka za `switch/add chain` i da bi se osiguralo da je novčanik na **zahtevanom mrežnom**. &#x20;
* **ipfs\_gateways** — uređena lista udaljenih gateway‑a; kombinuje se sa opcionim **Local IPFS** override‑om (kada je omogućen u podešavanjima) da formira **aktivni** redosled gateway‑a.&#x20;
* **assets\_url / temp\_assets\_url** — aplikacija održava **assets env** (`prod`/`test`) i bira odgovarajuću osnovu. Zatim računa `/<base>/<domain>/` i učitava `config.yaml`. Ako daljinski paket nedostaje ili je spor, koristi **podrazumevani** `/domain_default/`.&#x20;

---

## Gde se ovo nalazi u kodu (za brzi pregled)

* Boot & `/default_connect.yaml` učitavanje, pa zatim `/info`: **`src/context/AppContext.jsx`** i **`src/hooks/useConnect.js`**. &#x20;
* Izvor istine za krajnje tačke (HTTP baza + WS URL): **`src/net/endpoints.js`**.&#x20;
* Rezolucija liste domena, chain ID, IPFS gateway‑i, assets env i učitavanje resursa domena: **`src/context/AppContext.jsx`**.  &#x20;
* Dijalog za prebacivanje koji preuzima `/info` i normalizuje `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Sledeće:** u narednom poglavlju razložićemo **konfiguraciju domena** (`config.yaml`) i kako ona kontroliše logotipe, tabove, lokalizacije i druga ponašanja korisničkog interfejsa po domenu.