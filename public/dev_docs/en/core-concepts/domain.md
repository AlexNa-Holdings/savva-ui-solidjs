
# Working with domains

A **domain** is simply the name of the social network you want to render. It’s usually the site’s DNS host (e.g. `savva.app`) but it doesn’t have to be. Each domain has a **domain pack** — a folder that contains `config.yaml` plus all domain‑specific assets (logos, favicon, locales, tabs config, optional `domain.css`, etc.).

## Where does `config.yaml` live?

At runtime the app computes an **assets base URL** from `/info`:
- **Production:** `assets_url`
- **Test:** `temp_assets_url`

The active environment is a simple prod/test toggle in the app (used by admins to test changes). Given the **selected domain name**, the app builds a prefix:

```

<assetsBase>/<domain>/

```

Then the app tries to load:

```

<assetsBase>/<domain>/config.yaml

```

If that fails (missing pack, 404, etc.), the UI **falls back** to the built‑in default pack:

```

/domain\_default/config.yaml

```

> This lookup and diagnostics are centralized; you’ll see the same paths in the diagnostics UI.  
> The active `domain.css` is loaded from the same prefix and cache‑busted with a revision key, so changes apply immediately after upload.

## Why two environments (prod / test)?

The backend serves two base URLs for assets:

- **`assets_url`** → production pack for end users  
- **`temp_assets_url`** → test pack for previewing changes

An administrator (as configured in backend) can push a modified domain pack under the **test** base and verify everything (logos, tabs, GA, colors) without affecting users. When happy, they publish the same pack to **prod**.

## Domain pack layout

Everything for a domain lives under a single folder:

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

## Example `config.yaml`

Below is a trimmed example showing the typical fields the app uses:

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

### What these fields control

* **`logo`** — The app chooses the best variant automatically (dark/light + mobile/desktop) and resolves via the active domain prefix.
* **`favicon`** — All favicon links & meta tags are applied dynamically; when the config changes, the app replaces the `<link rel="icon">` set.
* **`GA_tag`** — Enables Google Analytics (gtag.js). When present, the app injects GA scripts and sends SPA `page_view` events on route changes.
* **`promo_post`** — Optional savva_cid of a post to show on first site opening. Can be used to display a welcome or announcement post to new users.
* **`modules.tabs`** — Points at the YAML that defines the tabs on the main screen (see below).
* **`locales`** — Language list for the domain (code/name/title + dictionary path). The app can render localized titles/strings per domain.

## Tabs on the main screen

Tabs are configured in a standalone YAML (referenced by `modules.tabs` above). For example:

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

The UI picks the localized tab title, chooses an icon by `type`, and renders optional right‑panel blocks. This file lives in the **same domain folder**, so it’s versioned and previewed together with `config.yaml`.

## Theme colors via `domain.css`

If present, `domain.css` is fetched from the same domain prefix and applied at runtime. It typically defines CSS custom properties the UI uses (backgrounds, foreground, accents, borders, etc.). Switching **domain** or **environment** reloads this CSS, so admins can fine‑tune branding without rebuilding the app.

Example variables:

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

Set the `GA_tag` in `config.yaml` to enable GA. The app injects the GA script and initializes `gtag(...)` automatically, and also tracks page views on hash‑route changes. Remove or clear `GA_tag` to disable analytics for the domain.

---

### Summary

* The app chooses **prod** or **test** assets base, then loads `<base>/<domain>/config.yaml` with a safe fallback to `/domain_default/config.yaml`.
* **All** domain resources (logos, locales, tabs, `domain.css`) live under the same folder for atomic updates.
* Admins can preview changes in **test** before publishing to **prod**.
* `config.yaml` controls branding (logos, favicon), localization, GA, and where to find UI modules like **tabs**.

