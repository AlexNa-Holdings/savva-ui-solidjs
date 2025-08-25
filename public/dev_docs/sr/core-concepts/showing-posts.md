# Prikazivanje Postova

Prikazivanje SAVVA posta je proces u dva koraka. Prvo, preuzimate listu objekata metapodataka postova sa SAVVA backend-a. Drugo, koristite IPFS informacije iz tih metapodataka da preuzmete stvarni sadržaj (kao što su naslov, tekst i slike) sa decentralizovane mreže.

---

## Korak 1: Preuzimanje Metapodataka Posta sa Backend-a

Primarni način da dobijete listu postova je putem `content-list` WebSocket metode. To je fleksibilna tačka pristupa koja podržava paginaciju, sortiranje i filtriranje.

### Pozivanje `content-list`

Pozivate metodu sa parametrima koji određuju koji sadržaj vam je potreban. Evo tipičnog primera:

```javascript
// Primer poziva koristeći wsMethod pomoćnu funkciju aplikacije
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Domen sa kojeg se preuzimaju postovi
  limit: 12,                // Broj stavki po stranici
  offset: 0,                // Počnite od prve stavke (za paginaciju)
  lang: "en",               // Preferirani jezik za sve vraćene metapodatke
  order_by: "fund_amount",  // Sortiraj po ukupnim primljenim sredstvima
  content_type: "post",     // Želimo samo postove
  category: "en:SAVVA Talk" // Opcionalno: filtriraj po specifičnoj kategoriji
});
```

### Struktura Objekta Posta

`content-list` metoda vraća niz objekata postova. Svaki objekat sadrži sve on-chain metapodatke i pokazivače potrebne za preuzimanje celog sadržaja.

Evo primera jednog objekta posta koji se vraća sa backend-a:

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
  "data_cid": "bafybeig...",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["decentralization", "social"],
  "savva_content": {
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

* **author**: Informacije o profilu autora posta, uključujući njihov ulog.
* **savva\_cid / short\_cid**: Jedinstveni identifikatori za post. `savva_cid` je puni on-chain ID, dok je `short_cid` korisnički prijateljska alternativa. Koristite ih za izgradnju URL-ova (npr., `/post/<short_cid>`).
* **ipfs & data\_cid**: Ključni pokazivači na sadržaj na IPFS-u. Pogledajte sledeći odeljak za to kako ih koristiti.
* **savva\_content**: Objekat metapodataka direktno iz backend keša. Sadrži objekat `locales` sa unapred preuzetim naslovima i pregledima, što je savršeno za prikazivanje post kartica u feed-u bez potrebe da se prvo preuzima sa IPFS-a.
* **fund**: Informacije o fondu za finansiranje posta.
* **reactions**: Niz koji predstavlja brojeve za različite tipove reakcija (sviđa mi se, super, itd.).

---

## Korak 2: Rešavanje Celog Sadržaja sa IPFS-a

Dok je `savva_content` koristan za preglede, morate preuzeti sa IPFS-a da biste dobili ceo tekst posta, poglavlja i druge resurse.

### Pronalaženje Deskriptora i Foldera sa Podacima

Polja `ipfs` i `data_cid` rade zajedno da vam kažu gde se sve nalazi. Postoje dva scenarija:

1. **`data_cid` je prisutan**:

   * `ipfs` je direktan put do deskriptorskog fajla (npr., `bafy.../info.yaml`).
   * `data_cid` je CID foldera koji sadrži sve resurse posta (slike, markdown fajlove, itd.). Ovo je vaša osnovna sadržina.

2. **`data_cid` NISU prisutni (legacy format)**:

   * `ipfs` je CID foldera koji sadrži sve resurse posta.
   * Pretpostavlja se da je deskriptorski fajl na standardnoj putanji: `<ipfs>/info.yaml`.

Logika aplikacije treba da odredi putanju deskriptora i CID osnovnog sadržaja na osnovu ovih pravila.

### Deskriptor Posta (`info.yaml`)

Deskriptor je YAML fajl koji definiše punu strukturu posta, uključujući sve njegove jezičke varijacije i poglavlja.

#### Primer `info.yaml`

```yaml
# Primer info.yaml za post sa više jezika i više poglavlja

thumbnail: assets/post_thumbnail.png

locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: ["blockchain", "systems", "web3"]
    categories: ["Technology"]
    # Glavni sadržaj, može biti inline ili putanja
    data_path: content/en/main.md
    chapters:
      - title: "What is a Blockchain?"
        data_path: content/en/chapter1.md
      - title: "IPFS and Content Addressing"
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

* **thumbnail**: Relativna putanja do glavne slike posta, rešena u odnosu na osnovni CID sadržaja.
* **locales**: Objekat gde je svaki ključ jezički kod (npr., `en`, `ru`).
* **title / text\_preview / tags / categories**: Metapodaci specifični za jezik.
* **data\_path**: Relativna putanja do glavnog Markdown sadržaja za taj jezik.
* **chapters**: Niz objekata poglavlja, svaki sa svojim naslovom i `data_path`.

Da biste dobili ceo sadržaj poglavlja, kombinujete osnovni CID sadržaja sa `data_path` iz deskriptora. Na primer, da biste preuzeli englesku verziju Poglavlja 1, tražili biste:

```
<content_base_cid>/content/en/chapter1.md
```

sa IPFS gateway-a.