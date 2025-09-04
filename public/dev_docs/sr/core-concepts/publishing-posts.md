# Objavljivanje posta

Objavljivanje sadržaja na SAVVA platformi je trostepeni proces koji osigurava integritet podataka, decentralizaciju i verifikaciju na lancu. Tok procesa uključuje pripremu podataka o postu lokalno, otpremanje sadržaja i njegovog opisa na IPFS, i konačno registraciju posta na blockchainu putem poziva pametnog ugovora.

Frontend uređivač automatizuje ovaj proces kroz čarobnjaka, ali razumevanje osnovnih koraka je ključno za programere.

---

## Korak 1: Priprema podataka o postu

Pre nego što dođe do bilo kakvog otpremanja ili transakcije, uređivač organizuje post u standardizovanu strukturu direktorijuma. Ova struktura se upravlja lokalno koristeći File System API.

Glavne komponente su:

* Datoteka sa parametrima (`params.json`) za podešavanja specifična za uređivač.
* Datoteka sa opisom (`info.yaml`) koja definiše strukturu posta i metapodatke za IPFS.
* Markdown datoteke za sadržaj na svakom jeziku.
* Direktorijum `uploads/` za sve povezane medijske datoteke (slike, video zapisi itd.).

### Primer `params.json`

Ova datoteka sadrži podešavanja koja koristi UI uređivača i ne objavljuje se na lancu.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "locales": {
    "en": {
      "tags": ["decentralization", "social"],
      "categories": ["Technology"],
      "chapters": [
        { "title": "Šta je blockchain?" },
        { "title": "IPFS i adresiranje sadržaja" }
      ]
    }
  },
  "thumbnail": "uploads/thumbnail.png"
}
```

### Primer `info.yaml` (Opis posta)

Ova datoteka je kanonska definicija posta i otprema se na IPFS. Ona povezuje sve delove sadržaja zajedno.

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Razumevanje decentralizovanih sistema"
    text_preview: "Duboko istraživanje osnovnih koncepata decentralizacije..."
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

* **data\_cid**: IPFS CID direktorijuma koji sadrži sav Markdown sadržaj i otpremljene datoteke.
* **locales**: Sadrži metapodatke specifične za jezik. Naslov i tekst\_pregled iz uređivača se čuvaju ovde.
* **data\_path / chapters.data\_path**: Relativne putanje do datoteka sa sadržajem unutar `data_cid` direktorijuma.

---

## Korak 2: Otpremanje na IPFS

Proces otpremanja se odvija u dve različite faze, kojima upravlja backend-ov API za skladištenje.

1. **Otpremanje direktorijuma sa sadržajem**: Sve datoteke sa sadržajem (npr., `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) se otpremaju kao jedan direktorijum na IPFS. Backend vraća jedan IPFS CID za ovaj direktorijum, koji postaje `data_cid`.
2. **Otpremanje opisa**: Datoteka `info.yaml` se generiše sa `data_cid` iz prethodnog koraka. Ova YAML datoteka se zatim otprema na IPFS kao samostalna datoteka. CID ove `info.yaml` datoteke je konačna IPFS referenca za post.

---

## Korak 3: Registracija na blockchainu

Poslednji korak je da se post zabeleži na blockchainu pozivom funkcije `reg` na pametnom ugovoru `ContentRegistry`.

Frontend izvršava ovu transakciju sa sledećim parametrima:

* **domain**: Trenutno ime domena (npr., `savva.app`).
* **author**: Adresa novčanika korisnika.
* **guid**: Jedinstveni identifikator iz `params.json`.
* **ipfs**: IPFS CID datoteke `info.yaml` iz Koraka 2.
* **content\_type**: `bytes32` string, obično `post` za novi sadržaj ili `post-edit` za ažuriranja.

### Primer poziva ugovora

```javascript
// Iz: src/x/editor/wizard_steps/StepPublish.jsx

const contract = await getSavvaContract(app, "ContentRegistry", { write: true });

const hash = await contract.write.reg([
  domain,           // "savva.app"
  user.address,     // "0x123..."
  guid,             // "c4a7f6b9-..."
  descriptorCid,    // "bafybeif..."
  toHexBytes32("post")
]);

// UI zatim čeka da transakcija bude potvrđena
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Kada se transakcija uspešno završi, post je zvanično objavljen i pojaviće se u sadržajnim tokovima.