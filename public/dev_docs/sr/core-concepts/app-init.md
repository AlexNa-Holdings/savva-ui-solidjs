# Inicijalizacija aplikacije i povezivanje sa backend-om

## Šta je SAVVA backend (SAVVA čvor)?
SAVVA backend je serverska komponenta koja **indeksira/kešira podatke dobijene iz blockchain aktivnosti** i izlaže brze, UI-prijateljske API-je i WebSocket metode. Jedan backend može služiti **više SAVVA domena**—razmislite o "domeni" kao o posebnoj SAVVA društvenoj mreži (brendiranje, kartice, resursi, podrazumevano), sve podržano jednim čvorom.

## Šta aplikacija treba pri pokretanju
Pri pokretanju web aplikacija su potrebna dva ulaza:

1. **Backend URL** – osnovni URL SAVVA backend-a.
2. **Ime domena** – koji SAVVA domen (društvena mreža) da se prikazuje podrazumevano.

Podrazumevane vrednosti dolaze iz male YAML datoteke na web korenu:

### `/default_connect.yaml`
```yaml
# /default_connect.yaml
domain: savva.app
backendLink: https://ui.savva.app/api/
gear: true
# opcionalno:
# default_ipfs_link: ipfs://bafy.../something.json
```

* `backendLink` — osnovna HTTP tačka SAVVA backend-a (aplikacija je normalizuje).
* `domain` — inicijalni domen za prikaz; može se promeniti kasnije u UI.
* `gear` — omogućava developerske alate u UI (opcionalno).
* `default_ipfs_link` — opcionalna pogodnost koja se koristi u nekim tokovima.

> **Napomena za proizvodnju**
> U proizvodnji, ova datoteka se obično služi od strane vašeg HTTP servera (npr., Nginx) i efektivno **biraju koji domen** se prikazuje podrazumevano u implementiranoj web aplikaciji. Jedan uobičajen obrazac je da se služi određena datoteka sa diska:
>
> ```nginx
> # primer: služi statičku default_connect.yaml
> location = /default_connect.yaml {
>   default_type text/yaml;
>   alias /etc/savva/default_connect.yaml;
> }
> ```
>
> Prilagodite svojoj infrastrukturi; ključ je da aplikacija može `GET /default_connect.yaml`.

---

## Sekvenca pokretanja

1. **Učitaj `/default_connect.yaml`**
   Aplikacija preuzima YAML datoteku, validira `backendLink` i čuva `domain`. Odmah **konfiguriše tačke** (HTTP osnovu + WS URL) koristeći te vrednosti. &#x20;

2. **Konfiguriši tačke**

   * `httpBase` je normalizovana verzija `backendLink` (garantovano sa završnim slash-om).
   * `ws` URL se izvodi iz iste osnove, ukazujući na `.../ws` (protokol prebačen na `ws:` ili `wss:`) i uključuje `?domain=...` u upitu.
     Ovo održava **jedan izvor istine** za HTTP i WS.&#x20;

3. **Preuzmi `/info`**
   Sa postavljenim tačkama, aplikacija poziva `GET <httpBase>info` i čuva JSON. Od tog trenutka, **/info upravlja ponašanjem u vreme izvođenja** (domeni, lanac, IPFS, resursi).&#x20;

4. **Izvedi stanje u vreme izvođenja iz `/info`**
   Sledeća polja se koriste (vidi primer ispod):

   * **`domains`** → Lista dostupnih domena. UI preferira eksplicitni `domain` iz YAML/override; ako nije prisutan u `/info`, i dalje ga koristi.&#x20;
   * **`blockchain_id`** → ID ciljnog EVM lanca. Pomoćnik za novčanik može prebaciti/dodati ovu mrežu.&#x20;
   * **`ipfs_gateways`** → Udaljeni IPFS gateway-evi koje treba probati redom (osim ako nije omogućena lokalna IPFS prepravka).&#x20;
   * **`assets_url`** i **`temp_assets_url`** → Osnovna **URL adresa resursa** (proizvod vs test). Aplikacija izračunava **aktivni prefiks resursa domena** kao
     `(<assets base> + <domain> + "/")` sa **rezervom** na `/domain_default/` ako je udaljeni `config.yaml` nedostupan. &#x20;

5. **Učitaj resurse domena i konfiguraciju**
   Aplikacija pokušava `(<active prefix>/config.yaml)` sa kratkim vremenskim ograničenjem; u slučaju neuspeha vraća se na podrazumevani paket na `/domain_default/config.yaml`. Rezultantna analizirana konfiguracija (logotipi, kartice, jezici itd.) se čuva i UI se prikazuje u skladu s tim.&#x20;

6. **WebSocket vreme izvođenja**
   WS klijent koristi izračunati `ws` URL iz tačaka; kada se backend/domen promene, tačke se ponovo izračunavaju i WS sloj to preuzima.&#x20;

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

### Polje po polje (šta aplikacija radi s tim)

* **domains** — lista selektabilnih domena. Dijalog **Prebaci backend / domen** se popunjava iz `/info`, ali konfigurisani domen i dalje ima prioritet ako je `/info` iza. &#x20;
* **blockchain\_id** — numerički EVM ID lanca; koristi se za izgradnju `switch/add chain` metapodataka i za osiguranje da je novčanik na **zahtevanoj mreži**. &#x20;
* **ipfs\_gateways** — uređena lista udaljenih gateway-eva; kombinovana sa opcionalnom **Lokalnom IPFS** prepravkom (kada je omogućena u podešavanjima) da formira **aktivni** redosled gateway-a.&#x20;
* **assets\_url / temp\_assets\_url** — aplikacija održava **okruženje resursa** (`prod`/`test`) i bira odgovarajući osnov. Zatim izračunava `/<base>/<domain>/` i učitava `config.yaml`. Ako udaljeni paket nedostaje ili je spor, koristi **podrazumevani** `/domain_default/`.&#x20;

---

## Gde se ovo nalazi u kodu (za brzu referencu)

* Pokretanje i učitavanje `/default_connect.yaml`, zatim `/info`: **`src/context/AppContext.jsx`** i **`src/hooks/useConnect.js`**. &#x20;
* Izvor tačke istine (HTTP osnovna + WS URL): **`src/net/endpoints.js`**.&#x20;
* Rešavanje liste domena, ID lanca, IPFS gateway-eva, okruženje resursa i učitavanje resursa domena: **`src/context/AppContext.jsx`**.  &#x20;
* Dijalog za prebacivanje koji preuzima `/info` i normalizuje `domains`: **`src/x/SwitchConnectModal.jsx`**.&#x20;

---

**Sledeće:** u sledećem poglavlju razložićemo **konfiguraciju domena** (`config.yaml`) i kako ona kontroliše logotipe, kartice, jezike i drugo ponašanje UI po domenima.