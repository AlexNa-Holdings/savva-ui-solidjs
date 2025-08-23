# Rad sa domenama

**Domena** je jednostavno naziv društvene mreže koju želite da prikažete. Obično je to DNS host sajta (npr. `savva.app`), ali ne mora biti. Svaka domena ima **domen paket** — folder koji sadrži `config.yaml` plus sve resurse specifične za domenu (logotipe, favicon, lokalizacije, konfiguraciju tabova, opcioni `domain.css`, itd.).

## Gde se nalazi `config.yaml`?

Tokom izvršavanja, aplikacija izračunava **osnovni URL resursa** iz `/info`:
- **Proizvodnja:** `assets_url`
- **Test:** `temp_assets_url`

Aktivno okruženje je jednostavan prekidač između produkcije i testa u aplikaciji (koji koriste administratori za testiranje promena). S obzirom na **izabrano ime domene**, aplikacija gradi prefiks:

```

<assetsBase>/<domain>/

```

Zatim aplikacija pokušava da učita:

```

<assetsBase>/<domain>/config.yaml

```

Ako to ne uspe (nedostajući paket, 404, itd.), UI **pada nazad** na ugrađeni podrazumevani paket:

```

/domain\_default/config.yaml

```

> Ova pretraga i dijagnostika su centralizovane; videćete iste putanje u dijagnostičkom UI-u.  
> Aktivni `domain.css` se učitava iz istog prefiksa i kešira se sa ključem revizije, tako da se promene primenjuju odmah nakon učitavanja.

## Zašto dva okruženja (proizvodnja / test)?

Backend pruža dva osnovna URL-a za resurse:

- **`assets_url`** → paket za proizvodnju za krajnje korisnike  
- **`temp_assets_url`** → test paket za pregled promena

Administrator (kako je podešeno u backendu) može da gurne izmenjeni domen paket pod **test** osnovu i da proveri sve (logotipe, tabove, GA, boje) bez uticaja na korisnike. Kada su zadovoljni, objavljuju isti paket u **proizvodnju**.

## Raspored domen paketa

Sve za domenu se nalazi u jednom folderu:

```

<assetsBase>/<domain>/
config.yaml          # glavna konfiguracija (logotipi, favicon, lokalizacije, moduli)
domain.css           # opcione teme varijable (boje, pozadine)
i18n/*.yaml          # jezički rečnici (po lokalizaciji)
images/*             # resursi za brendiranje
modules/tabs.yaml    # definicija tabova za glavni ekran
modules/*.yaml       # druge konfiguracije modula (opciono)
html/*.html          # proizvoljni HTML blokovi (opciono)

````

## Primer `config.yaml`

Ispod je skraćeni primer koji prikazuje tipična polja koja aplikacija koristi:

```yaml
logo:
  light: images/logo_light.png
  dark: images/logo_dark.png
  light_mobile: images/logo_light.png
  dark_mobile: images/logo_dark.png

favicon:
  apple-touch-icon: favicon/apple-touch-icon.png
  16: favicon/favicon-16x16.png
  32: favicon/favicon-32x32.png
  manifest: favicon/site.webmanifest
  mask-icon:
    href: favicon/safari-pinned-tab.svg
    color: '#5bbad5'
  base: favicon/favicon.ico
  meta:
    - name: msapplication-TileColor
      content: '#da532c'
    - name: theme-color
      content: '#ffffff'

GA_tag: G-XXXXXXXXXX   # Google Analytics (gtag) ID

modules:
  tabs: modules/tabs.yaml
  content_lists: modules/content_lists.yaml
  staker_levels: modules/staker_levels.yaml
  categories: modules/categories.yaml

default_locale: en
locales:
  - code: en
    name: English
    title: 'SAVVA.APP - Beyond Likes Social'
    dictionary: i18n/en.yaml
  - code: ru
    name: Русский
    title: 'SAVVA.APP - За пределами лайков'
    dictionary: i18n/ru.yaml
````

### Šta ova polja kontrolišu

* **`logo`** — Aplikacija automatski bira najbolju varijantu (tamnu/svetlu + mobilnu/desktop) i rešava putem aktivnog prefiksa domene.
* **`favicon`** — Sve favicon veze i meta tagovi se dinamički primenjuju; kada se konfiguracija promeni, aplikacija zamenjuje set `<link rel="icon">`.
* **`GA_tag`** — Omogućava Google Analytics (gtag.js). Kada je prisutan, aplikacija ubacuje GA skripte i šalje SPA `page_view` događaje prilikom promena rute.
* **`modules.tabs`** — Ukazuje na YAML koji definiše tabove na glavnom ekranu (vidi ispod).
* **`locales`** — Lista jezika za domenu (kod/naziv/naslov + putanja rečnika). Aplikacija može da prikaže lokalizovane naslove/stringove po domeni.

## Tabovi na glavnom ekranu

Tabovi su konfigurirani u samostalnom YAML-u (na koji se poziva `modules.tabs` iznad). Na primer:

```yaml
# modules/tabs.yaml
tabs:
  - type: leaders
    title:
      en: Leaders
      ru: Лидеры
    right_panel:
      available: true
      blocks:
        - type: html
          en: /html/info_block_en.html
          ru: /html/info_block_ru.html
        - type: content_List
          list_name: main
          count: 7

  - type: new
    title:
      en: New
      ru: Новое
```

UI bira lokalizovani naslov taba, bira ikonu prema `type`, i prikazuje opcionale blokove desnog panela. Ova datoteka se nalazi u **istom folderu domene**, tako da je verzionisana i pregledana zajedno sa `config.yaml`.

## Boje teme putem `domain.css`

Ako je prisutan, `domain.css` se preuzima iz istog prefiksa domene i primenjuje u vreme izvršavanja. Obično definiše CSS prilagođene osobine koje UI koristi (pozadine, foreground, akcenti, ivice, itd.). Promena **domene** ili **okruženja** ponovo učitava ovaj CSS, tako da administratori mogu fino podešavati brendiranje bez ponovnog izgradnje aplikacije.

Primer varijabli:

```css
:root {
  --gradient: linear-gradient(to top left, #000c40, #607d8b);
  --background: 243 100% 98.26%;
  --foreground: 243 10% 0.52%;
  --muted: 243 10% 91.3%;
  --muted-foreground: 243 5% 41.3%;
  --primary: 243 100% 13%;
  --primary-foreground: 243 2% 98%;
  /* ... */
}
```

## Google Analytics (GA)

Postavite `GA_tag` u `config.yaml` da omogućite GA. Aplikacija automatski ubacuje GA skriptu i inicijalizuje `gtag(...)`, takođe prati pregleda stranica prilikom promena hash-rute. Uklonite ili obrišite `GA_tag` da onemogućite analitiku za domenu.

---

### Sažetak

* Aplikacija bira **proizvodne** ili **test** osnovne resurse, zatim učitava `<base>/<domain>/config.yaml` sa sigurnim povratkom na `/domain_default/config.yaml`.
* **Svi** resursi domene (logotipi, lokalizacije, tabovi, `domain.css`) se nalaze u istom folderu za atomsku ažuriranja.
* Administratori mogu pregledati promene u **testu** pre objavljivanja u **proizvodnju**.
* `config.yaml` kontroliše brendiranje (logotipe, favicon), lokalizaciju, GA, i gde da pronađe UI module poput **tabova**.