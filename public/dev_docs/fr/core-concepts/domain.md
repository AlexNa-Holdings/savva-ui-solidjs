# Travailler avec les domaines

Un **domaine** est simplement le nom du réseau social que vous souhaitez rendre. C'est généralement l'hôte DNS du site (par exemple, `savva.app`), mais ce n'est pas obligatoire. Chaque domaine a un **pack de domaine** — un dossier qui contient `config.yaml` ainsi que tous les actifs spécifiques au domaine (logos, favicon, locales, configuration des onglets, `domain.css` optionnel, etc.).

## Où se trouve `config.yaml` ?

Au moment de l'exécution, l'application calcule une **URL de base des actifs** à partir de `/info` :
- **Production :** `assets_url`
- **Test :** `temp_assets_url`

L'environnement actif est un simple basculement prod/test dans l'application (utilisé par les administrateurs pour tester des modifications). Étant donné le **nom de domaine sélectionné**, l'application construit un préfixe :

```

<assetsBase>/<domain>/

```

Ensuite, l'application essaie de charger :

```

<assetsBase>/<domain>/config.yaml

```

Si cela échoue (pack manquant, 404, etc.), l'interface utilisateur **retourne** au pack par défaut intégré :

```

/domain\_default/config.yaml

```

> Cette recherche et ce diagnostic sont centralisés ; vous verrez les mêmes chemins dans l'interface de diagnostic.  
> Le `domain.css` actif est chargé à partir du même préfixe et est mis en cache avec une clé de révision, donc les modifications s'appliquent immédiatement après le téléchargement.

## Pourquoi deux environnements (prod / test) ?

Le backend sert deux URL de base pour les actifs :

- **`assets_url`** → pack de production pour les utilisateurs finaux  
- **`temp_assets_url`** → pack de test pour prévisualiser les modifications

Un administrateur (tel que configuré dans le backend) peut pousser un pack de domaine modifié sous la base **test** et vérifier tout (logos, onglets, GA, couleurs) sans affecter les utilisateurs. Lorsqu'il est satisfait, il publie le même pack en **prod**.

## Structure du pack de domaine

Tout pour un domaine se trouve sous un seul dossier :

```

<assetsBase>/<domain>/
config.yaml          # configuration principale (logos, favicon, locales, modules)
domain.css           # variables de thème optionnelles (couleurs, arrière-plans)
i18n/*.yaml          # dictionnaires de langue (par-locale)
images/*             # actifs de marque
modules/tabs.yaml    # définition des onglets pour l'écran principal
modules/*.yaml       # autres configurations de module (optionnelles)
html/*.html          # blocs HTML arbitraires (optionnels)

````

## Exemple de `config.yaml`

Voici un exemple abrégé montrant les champs typiques utilisés par l'application :

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

GA_tag: G-XXXXXXXXXX   # ID Google Analytics (gtag)

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

### Ce que ces champs contrôlent

* **`logo`** — L'application choisit automatiquement la meilleure variante (sombre/clair + mobile/desktop) et résout via le préfixe de domaine actif.
* **`favicon`** — Tous les liens de favicon et les balises méta sont appliqués dynamiquement ; lorsque la configuration change, l'application remplace le `<link rel="icon">` défini.
* **`GA_tag`** — Active Google Analytics (gtag.js). Lorsqu'il est présent, l'application injecte des scripts GA et envoie des événements `page_view` SPA lors des changements de route.
* **`modules.tabs`** — Pointe vers le YAML qui définit les onglets sur l'écran principal (voir ci-dessous).
* **`locales`** — Liste des langues pour le domaine (code/nom/titre + chemin du dictionnaire). L'application peut rendre des titres/chaînes localisés par domaine.

## Onglets sur l'écran principal

Les onglets sont configurés dans un YAML autonome (référencé par `modules.tabs` ci-dessus). Par exemple :

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

L'interface utilisateur choisit le titre d'onglet localisé, choisit une icône par `type`, et rend les blocs optionnels du panneau de droite. Ce fichier se trouve dans le **même dossier de domaine**, il est donc versionné et prévisualisé avec `config.yaml`.

## Couleurs de thème via `domain.css`

Si présent, `domain.css` est récupéré à partir du même préfixe de domaine et appliqué à l'exécution. Il définit généralement des propriétés CSS personnalisées que l'interface utilise (arrière-plans, premier plan, accents, bordures, etc.). Changer de **domaine** ou d'**environnement** recharge ce CSS, permettant aux administrateurs d'ajuster la marque sans reconstruire l'application.

Exemple de variables :

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

Définissez le `GA_tag` dans `config.yaml` pour activer GA. L'application injecte le script GA et initialise `gtag(...)` automatiquement, et suit également les vues de page lors des changements de route par hachage. Supprimez ou effacez `GA_tag` pour désactiver l'analyse pour le domaine.

---

### Résumé

* L'application choisit la base d'actifs **prod** ou **test**, puis charge `<base>/<domain>/config.yaml` avec un retour sécurisé à `/domain_default/config.yaml`.
* **Tous** les ressources de domaine (logos, locales, onglets, `domain.css`) se trouvent sous le même dossier pour des mises à jour atomiques.
* Les administrateurs peuvent prévisualiser les modifications en **test** avant de publier en **prod**.
* `config.yaml` contrôle la marque (logos, favicon), la localisation, GA, et où trouver les modules d'interface utilisateur comme **tabs**.