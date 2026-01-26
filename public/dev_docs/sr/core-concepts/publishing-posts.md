# Objavljivanje posta

Objavljivanje sadržaja na SAVVA platformi je proces u tri koraka koji obezbeđuje integritet podataka, decentralizaciju i verifikaciju na lancu. Tok obuhvata pripremu podataka objave lokalno, otpremanje sadržaja i njegovog deskriptora na IPFS, i konačno registraciju objave na blockchain-u pozivom pametnog ugovora.

Frontend uređivač automatizuje ovaj proces kroz čarobnjak, ali razumevanje osnovnih koraka je ključno za programere.

---

## Korak 1: Priprema podataka objave

Pre bilo kog otpremanja ili transakcije, uređivač organizuje objavu u standardizovanu strukturu direktorijuma. Ovom strukturom se upravlja lokalno pomoću File System API-ja.

Glavne komponente su:

* Datoteka parametara (`params.json`) za podešavanja urednika.
* Deskriptor fajl (`info.yaml`) koji definiše strukturu objave i metapodatke za IPFS.
* Markdown datoteke za sadržaj na svakom jeziku.
* `uploads/` direktorijum za prateće medijske fajlove (slike, video zapise itd.).

### Primer `params.json`

Ovaj fajl sadrži podešavanja koja koristi UI uređivača i nije objavljen na lancu.

```json
{
  "guid": "c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a",
  "nsfw": false,
  "fundraiser": 0,
  "publishAsNewPost": true,
  "audience": "subscribers",
  "minWeeklyPaymentWei": "1000000000000000000000",
  "allowPurchase": true,
  "purchasePriceWei": "99000000000000000000",
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

**Parametri publike i kontrole pristupa:**

* **audience**: Ili `"public"` (podrazumevano) ili `"subscribers"` za objave dostupne samo pretplatnicima.
* **minWeeklyPaymentWei**: Minimalna nedeljna uplata (staking) potrebna za pristup objavi (u wei, kao string).
* **allowPurchase**: Ako je `true`, omogućava jednokratnu kupovinu pristupa za one koji nisu pretplatnici.
* **purchasePriceWei**: Cena jednokratne kupovine pristupa u SAVVA tokenima (u wei, kao string).

---

## Korak 2: Deskriptor objave (`info.yaml`)

Ovaj fajl predstavlja kanonsku definiciju objave i otprema se na IPFS. Povezuje sve delove sadržaja i sadrži informacije o kontroli pristupa i enkripciji.

### Javni deskriptor objave

Za javne objave, deskriptor je jednostavan:

```yaml
savva_spec_version: "2.0"
data_cid: bafybeih...
guid: c4a7f6b9-6e3e-4b9e-8b1e-2e4a6d7c8b9a
recipient_list_type: public
gateways:
  - https://ipfs.io/
locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: []
    categories: []
    data_path: "en/data.md"
    chapters:
      - data_path: "en/chapters/1.md"
      - data_path: "en/chapters/2.md"
```

### Deskriptor za objave samo za pretplatnike (šifrovano)

Za objave samo za pretplatnike, deskriptor uključuje dodatna polja za kontrolu pristupa i blok `encryption`:

```yaml
savva_spec_version: "2.0"
data_cid: QmaHRmTymgC9unG14rHJpwfv6DWFgzuJjVhtjHcY8cCjkS
guid: 249c62bd-54f7-4865-bc83-922d21ed90a6
recipient_list_type: subscribers
recipient_list_min_weekly: "1000000000000000000000"
gateways:
  - https://savva.myfilebase.com/ipfs/
  - https://test.savva.app/api/ipfs/
locales:
  en:
    title: "Premium Content Title"
    text_preview: "0ee338af352029c34bfc65ab2d39bcb4622a08206a247f8e:f3f352e0df63aaac..."
    tags: []
    categories: []
    data_path: en/data.md
    chapters: []
encryption:
  type: x25519-xsalsa20-poly1305
  key_exchange_alg: x25519
  key_exchange_pub_key: cb8711e46877d7775a55d6ae446d445b500ce77f6a5514999d275280eceb707e
  access_type: for_subscribers_only
  min_weekly_pay: "1000000000000000000000"
  allow_purchase: true
  purchase_price: "99000000000000000000"
  processor_address: "0xC0959416606AEd87B09f6B205BbAD2e0cA0A9f48"
  purchase_token: "0x99eadb13da88952c18f980bd6b910adba770130e"
  recipients:
    "0xe328b70d1db5c556234cade0df86b3afbf56dd32":
      pass: f3a7cc9fe83091b562273e5395d0ad1dca3ef0f9f06cfd22bee0180a39c8541c...
      pass_nonce: d326da17dfcc6e333fc036732954370407f66df0f1141518
      pass_ephemeral_pub_key: cca725f1a50a2614cf019115f7c7ac45d1bda916813dc038055b14409c5d5e59
      reading_public_key: 1f61298e54fd3da75192f509002fc7d9e10b019b55d1806e75c7efa836836418
      reading_key_scheme: x25519-xsalsa20-poly1305
      reading_key_nonce: 18d1609e898d5e252604
```

### Referenca polja deskriptora

**Polja na korenskom nivou:**

| Polje | Opis |
|-------|------|
| `savva_spec_version` | Verzija šeme, trenutno `"2.0"` |
| `data_cid` | IPFS CID direktorijuma koji sadrži sve fajlove sadržaja |
| `guid` | Jedinstveni identifikator objave |
| `recipient_list_type` | Tip pristupa: `"public"` ili `"subscribers"` |
| `recipient_list_min_weekly` | Minimalna nedeljna uplata u wei (string) |
| `gateways` | Lista preferiranih IPFS gateway-a za preuzimanje sadržaja |
| `locales` | Metapodaci sadržaja specifični za jezik |
| `encryption` | Blok enkripcije (samo za objave za pretplatnike) |

**Polja za lokalizaciju (Locale Fields):**

| Polje | Opis |
|-------|------|
| `title` | Naslov objave (uvek nešifrovan radi prikaza) |
| `text_preview` | Tekst pregleda (za pretplatničke objave šifrovan kao `nonce:ciphertext`) |
| `tags` | Niz tagova (uvek nešifrovan radi indeksiranja) |
| `categories` | Niz kategorija (uvek nešifrovan radi indeksiranja) |
| `data_path` | Relativna putanja do glavnog fajla sadržaja |
| `chapters` | Niz objekata poglavlja sa `data_path` i opcionim `title` |

**Polja bloka enkripcije:**

| Polje | Opis |
|-------|------|
| `type` | Šema enkripcije: `x25519-xsalsa20-poly1305` |
| `key_exchange_alg` | Algoritam razmene ključeva: `x25519` |
| `key_exchange_pub_key` | X25519 javni ključ objave (hex) |
| `access_type` | Ograničenje pristupa: `for_subscribers_only` |
| `min_weekly_pay` | Minimalni nedeljni zahtev za plaćanje u wei (string) |
| `allow_purchase` | Da li je jednokratna kupovina omogućena |
| `purchase_price` | Cena za kupovinu u wei (string) |
| `processor_address` | Adresa procesa za verifikaciju kupovine |
| `purchase_token` | Adresa token kontrakta za uplate prilikom kupovine (SAVVA) |
| `recipients` | Mapa adresa primalaca na njihove šifrovane ključeve objave |

**Polja unosa primaoca:**

| Polje | Opis |
|-------|------|
| `pass` | Šifrovani tajni ključ objave (hex) |
| `pass_nonce` | Nonce korišćen za enkripciju (hex) |
| `pass_ephemeral_pub_key` | Ephemeral javni ključ za ECDH (hex) |
| `reading_public_key` | Javilični ključ za čitanje primaoca (hex) |
| `reading_key_scheme` | Šema enkripcije za čitalački ključ |
| `reading_key_nonce` | Nonce povezan sa čitalačkim ključem |

---

## Tok enkripcije za objave samo za pretplatnike

Kada se kreira objava samo za pretplatnike:

1. Generiše se ključ objave: Nasumični X25519 par ključeva se generiše za objavu.
2. Šifruje se sadržaj: Telo objave i fajlovi poglavlja se šifruju koristeći XSalsa20-Poly1305 sa tajnim ključem objave.
3. Šifruju se pregledi: Polje `text_preview` se šifruje i čuva kao `nonce:ciphertext`.
4. Pravi se lista primalaca: Ključ objave se šifruje za svakog podobnog primaoca koristeći njihov objavljeni čitalački ključ preko ECDH razmene ključeva.
5. Uključuju se obavezni primaoci:
   - Autor objave (uvek može dešifrovati sopstveni sadržaj)
   - Svi big_brothers konfigurisanih za domen
   - Procesor plaćanja (ako je pristup kupovinom omogućen)
   - Podobni pretplatnici koji ispunjavaju minimalni zahtev za plaćanje

---

## Korak 3: Otpremanje na IPFS

Proces otpremanja odvija se u dve odvojene faze, koje rukovodi backend-ov storage API.

1. **Otpremanje direktorijuma sadržaja**: Svi fajlovi sadržaja (npr. `en/data.md`, `en/chapters/1.md`, `uploads/thumbnail.png`) otpremaju se kao jedan direktorijum na IPFS. Za šifrovane objave, ovi fajlovi se šifruju pre otpremanja. Backend vraća jedan IPFS CID za taj direktorijum, koji postaje `data_cid`.
2. **Otpremanje deskriptora**: Fajl `info.yaml` se generiše sa `data_cid` iz prethodnog koraka. Ovaj YAML fajl se zatim otprema na IPFS kao zaseban fajl. CID ovog `info.yaml` fajla je konačna IPFS referenca za objavu.

---

## Korak 4: Registracija na blockchain-u

Poslednji korak je evidentiranje objave na blockchain-u pozivom funkcije `reg` na pametnom ugovoru `ContentRegistry`.

Frontend izvršava ovu transakciju sa sledećim parametrima:

* **domain**: Trenutni naziv domena (npr. `savva.app`).
* **author**: Adresa korisničkog novčanika.
* **guid**: Jedinstveni identifikator iz `params.json`.
* **ipfs**: IPFS CID `info.yaml` deskriptora iz Koraka 3.
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

Kada je transakcija uspešno potvrđena, objava je zvanično objavljena i pojaviće se u feedovima sadržaja.