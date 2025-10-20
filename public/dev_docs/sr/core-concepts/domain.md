# Rad sa domenima

Domen je jednostavno ime društvene mreže koju želite da prikazujete. Obično je to DNS host sajta (npr. `savva.app`) ali ne mora biti. Svaki domen ima paket domena — folder koji sadrži `config.yaml` i sve resurse specifične za domen (logotipe, favicon, lokalizacije, konfiguraciju tabova, opciono `domain.css`, itd.).

## Gde se nalazi `config.yaml`?

Tokom rada aplikacija iz `/info` izračunava osnovni URL za resurse (assets base URL):
- **Production:** `assets_url`
- **Test:** `temp_assets_url`

Aktivno okruženje je jednostavan prekidač prod/test u aplikaciji (koristi ga admin za testiranje promena). Za dato **odabrano ime domena**, aplikacija gradi prefiks:

```

<assetsBase>/<domain>/

```

Zatim aplikacija pokušava da učita:

```

<assetsBase>/<domain>/config.yaml

```

Ako to ne uspe (nedostaje paket, 404, itd.), UI se **vraća** na ugrađeni podrazumevani paket:

```

/domain\_default/config.yaml

```

> Ovo pretraživanje i dijagnostika su centralizovani; iste putanje ćete videti i u dijagnostičkom UI‑ju.  
> Aktivni `domain.css` se učitava iz istog prefiksa i poništava keš pomoću ključa revizije, tako da promene stupaju na snagu odmah nakon otpremanja.

## Zašto dva okruženja (prod / test)?

Backend pruža dva osnovna URL‑a za resurse:

- **`assets_url`** → produkcioni paket za krajnje korisnike  
- **`temp_assets_url`** → test paket za pregled promena

Administrator (kako je podešeno u backendu) može da otpremi izmenjeni paket domena pod **test** bazom i proveri sve (logotipe, tabove, GA, boje) bez uticaja na korisnike. Kada je zadovoljan, isti paket objavljuje u **prod**.

## Struktura paketa domena

Sve za jedan domen živi u okviru jednog foldera:

```

<assetsBase>/<domain>/
config.yaml          # main configuration (logos, favicon, locales, modules)
domain.css           # optional theme variables (colors, backgrounds)
i18n/*.yaml          # language dictionaries (per-locale)
images/*             # branding assets
modules/tabs.yaml    # tabs definition for the main screen
modules/*.yaml       # other module configs (optional)
html/*.html          # arbitrary HTML blocks (optional)

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
promo_post: ''          # savva_cid of a post to show on first site opening

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

### Šta ovih polja kontrolišu

* **`logo`** — Aplikacija automatski bira najbolju varijantu (dark/light + mobile/desktop) i rešava putanju preko aktivnog domenskog prefiksa.
* **`favicon`** — Sve favicon linkovi i meta tagovi se dinamički primenjuju; kada se konfiguracija promeni, aplikacija zamenjuje skup `<link rel="icon">` tagova.
* **`GA_tag`** — Omogućava Google Analytics (gtag.js). Kada je prisutan, aplikacija ubacuje GA skripte i šalje SPA `page_view` događaje pri promeni ruta.
* **`promo_post`** — Opcioni `savva_cid` posta koji se prikazuje pri prvom otvaranju sajta. Može se koristiti za prikaz dobrodošlice ili obaveštenja novim korisnicima.
* **`modules.tabs`** — Pokazuje na YAML koji definiše tabove na glavnom ekranu (vidi dole).
* **`locales`** — Lista jezika za domen (code/name/title + putanja do rečnika). Aplikacija može da prikazuje lokalizovane naslove/stringove po domenima.

## Tabovi na glavnom ekranu

Tabovi se konfigurišu u odvojenom YAML fajlu (na koji se referiše kroz `modules.tabs` gore). Na primer:

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

UI bira lokalizovani naslov taba, bira ikonu po `type`, i renderuje opcione blokove desnog panela. Ovaj fajl se nalazi u **istom folderu domena**, tako da je verzionisan i pregledan zajedno sa `config.yaml`.

## Tematske boje preko `domain.css`

Ako postoji, `domain.css` se preuzima iz istog domenskog prefiksa i primenjuje u runtime‑u. Uobičajeno definiše CSS custom properties koje UI koristi (pozadine, foreground, accent boje, ivice, itd.). Promena **domena** ili **okruženja** ponovo učitava ovaj CSS, tako da administratori mogu fino da podešavaju brending bez ponovnog build‑ovanja aplikacije.

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

Podesite `GA_tag` u `config.yaml` da biste omogućili GA. Aplikacija ubacuje GA skriptu i automatski inicijalizuje `gtag(...)`, kao i prati prikaze stranica pri promenama hash‑ruta. Uklonite ili očistite `GA_tag` da biste onemogućili analitiku za domen.

---

### Sažetak

* Aplikacija bira **prod** ili **test** assets base, zatim učitava `<base>/<domain>/config.yaml` sa sigurnom rezervom na `/domain_default/config.yaml`.
* **Svi** domen resursi (logotipi, lokalizacije, tabovi, `domain.css`) žive u istom folderu radi atomskih ažuriranja.
* Administratori mogu pregledati promene u **test** pre objave u **prod**.
* `config.yaml` kontroliše brending (logotipi, favicon), lokalizaciju, GA i gde se nalaze UI moduli kao što su **tabs**.