# Prise en Main

Bienvenue dans le guide de **Prise en Main** pour la plateforme SAVVA.

Cette page vous guide à travers les étapes de base pour configurer le projet localement et commencer à contribuer.

## Prérequis

Avant de commencer, assurez-vous d'avoir les outils suivants installés :

- **Node.js** (v18 ou version ultérieure recommandée)  
- Gestionnaire de paquets **npm** ou **yarn**  
- **Git** pour cloner le dépôt  
- Un **navigateur** moderne (Chrome, Firefox, Edge) pour le développement et les tests  

## Cloner le Dépôt

Le code source est hébergé sur GitHub. Pour obtenir la dernière version :

```bash
git clone https://github.com/AlexNa-Holdings/savva-ui-solidjs
cd savva-ui-solidjs
````

## Installer les Dépendances

Dans le dossier du projet, installez toutes les dépendances requises :

```bash
npm install
# ou
yarn install
```

## Démarrer le Serveur de Développement

Lancez le serveur de développement avec rechargement à chaud :

```bash
npm run dev
# ou
yarn dev
```

L'application sera disponible à [http://localhost:5173](http://localhost:5173).

## Construire pour la Production

Pour créer une version optimisée :

```bash
npm run build
```

La sortie sera dans le dossier `dist/`.

## Étapes Suivantes

* Explorez la **Documentation Développeur** pour l'architecture et les modules.
* Essayez de changer de domaines et d'actifs dans le **Panneau de Droite**.
* Contribuez en ouvrant des problèmes ou des demandes de tirage sur GitHub.

C'est tout ! 🎉 Vous êtes prêt à commencer à travailler avec la **plateforme SAVVA**.

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAVVA · SolidJS</title>

  <!-- Précharger le thème pour éviter le flash -->
  <script>
    (function () {
      try {
        const saved = localStorage.getItem("theme");
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = saved || (systemDark ? "dark" : "light");
        document.documentElement.classList.toggle("dark", theme === "dark");
      } catch { }
    })();
  </script>

  <script>
    (function () {
      // S'il y a un chemin réel (par exemple, /settings) mais pas de hash, réécrire en forme de hash : /#/settings
      if (!location.hash && location.pathname !== "/") {
        var newHash = "#" + location.pathname + location.search + location.hash;
        history.replaceState(null, "", "/" + newHash);
      }
    })();
  </script>


  <!-- Charger l'application après que la classe de thème soit définie -->
  <script type="module" src="/src/index.jsx"></script>
</head>

<body>
  <div id="root"></div>
</body>

</html>
```