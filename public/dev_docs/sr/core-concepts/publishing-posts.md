# Objavljivanje posta

Objavljivanje sadržaja na SAVVA platformi je proces u tri koraka koji obezbeđuje integritet podataka, decentralizaciju i verifikaciju na lancu. Tok obuhvata pripremu podataka posta lokalno, otpremu sadržaja i njegovog deskriptora na IPFS, i konačno registraciju posta na blockchainu pozivom pametnog ugovora.

Frontend editor automatizuje ovaj proces kroz vodič (wizard), ali razumevanje osnovnih koraka je ključno za developere.

---

## Korak 1: Priprema podataka posta

Pre nego što se izvrši bilo koja otprema ili transakcija, editor organizuje post u standardizovanu strukturu direktorijuma. Ovom strukturom se upravlja lokalno koristeći File System API.

Glavne komponente su:

* Datoteka parametara (`params.json`) za podešavanja specifična za editor.
* Deskriptorska datoteka (`info.yaml`) koja definiše strukturu posta i metapodatke za IPFS.
* Markdown datoteke sa sadržajem za svaki jezik.
* Direktorijum `uploads/` za pridružene medijske fajlove (slike, video zapisi itd.).

### Primer `params.json`

Ova datoteka sadrži podešavanja koja koristi editor UI i nije objavljena na lancu.

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
        { "title": "What is a Blockchain?" },
        { "title": "IPFS and Content Addressing" }
      ]
    }
  },
  "thumbnail": "uploads/thumbnail.png"
}
```

### Primer `info.yaml` (deskriptor posta)

Ova datoteka je kanonska definicija posta i otprema se na IPFS. Ona povezuje sve delove sadržaja.

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

* **data\_cid**: IPFS CID direktorijuma koji sadrži sav Markdown sadržaj i otpremljene fajlove.
* **locales**: Sadrži metapodatke specifične za jezik. Naslov i text\_preview iz editora su ovde sačuvani.
* **data\_path / chapters.data\_path**: Relativne putanje do fajlova sa sadržajem unutar direktorijuma `data_cid`.

---

## Korak 2: Otpremanje na IPFS

Proces otpremanja odvija se u dve odvojene faze, kojima upravlja backend-ov storage API.

1. **Upload Content Directory**: Svi fajlovi sadržaja (npr. `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) otpremaju se kao jedan direktorijum na IPFS. Backend vraća jedan IPFS CID za ovaj direktorijum, koji postaje `data_cid`.
2. **Upload Descriptor**: Datoteka `info.yaml` se generiše sa `data_cid` iz prethodnog koraka. Ovaj YAML fajl se zatim otprema na IPFS kao zaseban fajl. CID te `info.yaml` datoteke je konačna IPFS referenca za post.

---

## Korak 3: Registracija na blockchainu

Završni korak je da se post zabeleži na blockchainu pozivom funkcije `reg` na pametnom ugovoru `ContentRegistry`.

Frontend izvršava ovu transakciju sa sledećim parametrima:

* **domain**: Trenutni domen (npr. `savva.app`).
* **author**: Adresa korisničkog novčanika.
* **guid**: Jedinstveni identifikator iz `params.json`.
* **ipfs**: IPFS CID `info.yaml` deskriptorske datoteke iz Koraka 2.
* **content\_type**: `bytes32` string, obično `post` za novi sadržaj ili `post-edit` za izmene.

### Primer poziva ugovora

```javascript
// From: src/x/editor/wizard_steps/StepPublish.jsx

const contract = await getSavvaContract(app, "ContentRegistry", { write: true });

const hash = await contract.write.reg([
  domain,           // "savva.app"
  user.address,     // "0x123..."
  guid,             // "c4a7f6b9-..."
  descriptorCid,    // "bafybeif..."
  toHexBytes32("post")
]);

// The UI then waits for the transaction to be confirmed
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

Kada je transakcija uspešno potvrđena (minirana), post je zvanično objavljen i pojaviće se u feedovima sadržaja.