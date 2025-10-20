# Working with domains

Un **domaine** est simplement le nom du réseau social que vous souhaitez afficher. C’est généralement l’hôte DNS du site (par ex. `savva.app`) mais ce n’est pas obligatoire. Chaque domaine possède un **pack de domaine** — un dossier qui contient `config.yaml` ainsi que tous les assets spécifiques au domaine (logos, favicon, locales, configuration des onglets, fichier optionnel `domain.css`, etc.).

## Where does `config.yaml` live?

À l’exécution, l’application calcule une **URL de base pour les assets** à partir de `/info` :
- **Production :** `assets_url`
- **Test :** `temp_assets_url`

L’environnement actif est une simple bascule prod/test dans l’application (utilisée par les administrateurs pour tester des modifications). Étant donné le **nom de domaine sélectionné**, l’application construit un préfixe :

```

<assetsBase>/<domain>/

```

Ensuite l’application tente de charger :

```

<assetsBase>/<domain>/config.yaml

```

Si cela échoue (pack manquant, 404, etc.), l’UI **retombe** sur le pack par défaut intégré :

```

/domain\_default/config.yaml

```

> Cette recherche et les diagnostics sont centralisés ; vous verrez les mêmes chemins dans l’interface de diagnostic.  
> Le `domain.css` actif est chargé depuis le même préfixe et invalidé dans le cache à l’aide d’une clé de révision, de sorte que les changements s’appliquent immédiatement après l’upload.

## Why two environments (prod / test)?

Le backend fournit deux URL de base pour les assets :

- **`assets_url`** → pack de production pour les utilisateurs finaux  
- **`temp_assets_url`** → pack de test pour prévisualiser les modifications

Un administrateur (tel que configuré dans le backend) peut déposer un pack de domaine modifié sous la base **test** et vérifier tout (logos, onglets, GA, couleurs) sans impacter les utilisateurs. Une fois satisfait, il publie le même pack en **prod**.

## Domain pack layout

Tout pour un domaine se trouve dans un seul dossier :

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

Ci‑dessous un exemple réduit montrant les champs typiques utilisés par l’application :

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

* **`logo`** — L’application choisit automatiquement la meilleure variante (dark/light + mobile/desktop) et résout via le préfixe de domaine actif.
* **`favicon`** — Tous les liens et meta tags favicon sont appliqués dynamiquement ; lorsque la configuration change, l’application remplace l’ensemble de `<link rel="icon">`.
* **`GA_tag`** — Active Google Analytics (gtag.js). Lorsqu’il est présent, l’application injecte les scripts GA et envoie des événements SPA `page_view` lors des changements de route.
* **`promo_post`** — Savva_cid optionnel d’un post à afficher à la première ouverture du site. Peut servir à afficher un message de bienvenue ou une annonce aux nouveaux utilisateurs.
* **`modules.tabs`** — Pointe vers le YAML qui définit les onglets de l’écran principal (voir ci‑dessous).
* **`locales`** — Liste des langues pour le domaine (code/nom/titre + chemin du dictionnaire). L’application peut rendre des titres/chaînes localisés par domaine.

## Tabs on the main screen

Les onglets sont configurés dans un fichier YAML autonome (référencé par `modules.tabs` ci‑dessus). Par exemple :

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

L’UI choisit le titre localisé de l’onglet, sélectionne une icône selon le `type`, et affiche les blocs optionnels du panneau droit. Ce fichier vit dans le **même dossier de domaine**, il est donc versionné et prévisualisé en même temps que `config.yaml`.

## Theme colors via `domain.css`

Si présent, `domain.css` est récupéré depuis le même préfixe de domaine et appliqué à l’exécution. Il définit typiquement des propriétés CSS personnalisées utilisées par l’UI (fonds, premiers plans, accents, bordures, etc.). Le changement de **domaine** ou d’**environnement** recharge ce CSS, permettant aux administrateurs d’ajuster la charte graphique sans reconstruire l’application.

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

Définissez `GA_tag` dans `config.yaml` pour activer GA. L’application injecte le script GA et initialise `gtag(...)` automatiquement, et suit également les vues de page sur les changements de route en hash. Supprimez ou videz `GA_tag` pour désactiver l’analytics pour le domaine.

---

### Summary

* L’application choisit la base d’assets **prod** ou **test**, puis charge `<base>/<domain>/config.yaml` avec un fallback sécurisé vers `/domain_default/config.yaml`.
* **Toutes** les ressources du domaine (logos, locales, onglets, `domain.css`) se trouvent dans le même dossier pour des mises à jour atomiques.
* Les administrateurs peuvent prévisualiser les modifications en **test** avant de publier en **prod**.
* `config.yaml` contrôle l’identité visuelle (logos, favicon), la localisation, GA, et l’emplacement des modules UI comme les **tabs**.