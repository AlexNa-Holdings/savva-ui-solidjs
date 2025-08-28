# Prikaz Postova

Prikaz SAVVA posta je proces u dva koraka.

1. Preuzmite listu objekata metapodataka postova sa SAVVA backend-a.
2. Iskoristite IPFS informacije iz tih metapodataka da preuzmete stvarni sadržaj (naslov, tekst, slike, itd.) sa decentralizovane mreže.

---

## Korak 1: Preuzimanje Metapodataka Postova sa Backend-a

Primarni način za dobijanje liste postova je putem **`content-list`** WebSocket metode. 
Podržava paginaciju, sortiranje i filtriranje.

### Pozivanje `content-list`

Pozivate metodu sa parametrima koji specificiraju koji sadržaj vam je potreban. Primer:

```js
// Primer poziva koristeći wsMethod pomoćnika aplikacije
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Domen sa kojeg se preuzimaju postovi
  limit: 12,                // Broj stavki po stranici
  offset: 0,                // Početni indeks (za paginaciju)
  lang: "en",               // Preferirani jezik za metapodatke
  order_by: "fund_amount",  // Sortiraj po ukupnim primljenim sredstvima
  content_type: "post",     // Želimo samo postove
  category: "en:SAVVA Talk" // Opcionalno: filtriraj po kategoriji
});
```

---

## Struktura Objekta Posta

Metoda `content-list` vraća niz **objekata postova**. 
Svaki sadrži metapodatke i pokazivače potrebne za preuzimanje celokupnog sadržaja.

Primer:

```json
{
  "author": {
    "address": "0x1234...",
    "avatar": "Qm...",
    "name": "alexna",
    "display_name": "Alex Na",
    "staked": "5000000000000000000000"
  },
  "category": "en:SAVVA Talk",
  "domain": "savva.app",
  "effective_time": "2025-08-20T10:30:00Z",
  "fund": {
    "amount": "125000000000000000000",
    "round_time": 1672531200,
    "total_author_share": "100000000000000000000"
  },
  "ipfs": "bafybeig.../info.yaml",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["decentralization", "social"],
  "savva_content": {
    "data_cid": "bafybeig...",
    "locales": {
      "en": {
        "text_preview": "This is a short preview of the post content...",
        "title": "My First Post on SAVVA"
      },
      "ru": {
        "text_preview": "Это короткий анонс содержания поста...",
        "title": "Мой первый пост на SAVVA"
      }
    },
    "thumbnail": "thumbnail.jpg"
  }
}
```

### Objašnjenje Ključnih Polja

* **author** — profil informacije autora (uključujući iznos koji je uložio).
* **savva\_cid / short\_cid** — jedinstveni ID-ovi. Koristite ih za izgradnju URL-ova (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — pokazivači na IPFS sadržaj.
* **savva\_content** — metapodaci keširani na backend-u (naslovi, pregledi, sličice). Odlično za prikazivanje feed-a bez preuzimanja sa IPFS-a.
* **fund** — informacije o fondu postova.
* **reactions** — niz brojeva za svaki tip reakcije.

---

## Korak 2: Rešavanje Celokupnog Sadržaja sa IPFS-a

Dok je `savva_content` koristan za preglede, celokupan sadržaj mora biti preuzet sa IPFS-a (telo posta, poglavlja, resursi).

### Rešavanje Putanja Sadržaja

Lokacija `info.yaml` zavisi od formata:

* **Savremeni format**

  * `savva_content.data_cid` = osnovni CID za resurse.
  * `ipfs` = direktna putanja do `info.yaml`.
* **Legacijski format**

  * Nema `data_cid`.
  * `ipfs` = osnovni CID. Pretpostavlja se da je deskriptor na `<ipfs>/info.yaml`.

### Funkcije Pomoći

Koristite pomoćnike iz `src/ipfs/utils.js`:

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Putanja do deskriptorskog fajla
const descriptorPath = getPostDescriptorPath(post);

// 2. Osnovni CID za resurse
const contentBaseCid = getPostContentBaseCid(post);

// 3. Rešavanje relativne putanje (npr., sličica)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## Prioritet IPFS Gateway-a

Redosled preuzimanja:

1. **Lokalni čvor** (ako je omogućen).
2. **Specifični gateway-evi za postove** (navedeni u deskriptoru).
3. **Sistemski gateway-evi** (backend `/info`).

Ovo osigurava najbolju brzinu i dostupnost.

---

## Deskriptor Posta (`info.yaml`)

YAML fajl koji definiše celokupnu strukturu: jezici, poglavlja, metapodaci.

### Primer `info.yaml`

```yaml
thumbnail: assets/post_thumbnail.png
gateways:
  - https://my-fast-pinning-service.cloud

locales:
  en:
    title: "Razumevanje Decentralizovanih Sistema"
    text_preview: "Dubinsko istraživanje osnovnih koncepata decentralizacije..."
    tags: ["blockchain", "systems", "web3"]
    categories: ["Tehnologija"]
    data_path: content/en/main.md
    chapters:
      - title: "Šta je Blockchain?"
        data_path: content/en/chapter1.md
      - title: "IPFS i Adresiranje Sadržaja"
        data_path: content/en/chapter2.md
  
  ru:
    title: "Понимание децентрализованных систем"
    text_preview: "Глубокое погружение в основные концепции децентрализации..."
    tags: ["блокчейн", "системы", "web3"]
    categories: ["Технологии"]
    data_path: content/ru/main.md
    chapters:
      - title: "Что такое блокчейн?"
        data_path: content/ru/chapter1.md
      - title: "IPFS и контентная адресация"
        data_path: content/ru/chapter2.md
```

### Ključna Polja Deskriptora

* **thumbnail** — relativna putanja do glavne slike.
* **gateways** — opcioni preporučeni IPFS gateway-evi.
* **locales** — objekat sa ključevima prema kodovima jezika.

  * **title / text\_preview / tags / categories** — metapodaci specifični za jezik.
  * **data\_path** — glavni Markdown sadržaj za taj jezik.
  * **chapters** — niz poglavlja, svako sa `title` i `data_path`.

Da preuzmete celokupan sadržaj poglavlja:

```txt
<content_base_cid>/content/en/chapter1.md
```