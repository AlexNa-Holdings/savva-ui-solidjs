# Uvod

Dobrodošli u **Uvod** vodič za SAVVA Platformu.

Ova stranica vas vodi kroz osnovne korake za postavljanje projekta lokalno i započinjanje doprinosa.

## Preduslovi

Pre nego što počnete, uverite se da imate instalirane sledeće alate:

- **Node.js** (preporučena verzija 18 ili novija)  
- **npm** ili **yarn** menadžer paketa  
- **Git** za kloniranje repozitorijuma  
- Moderni **pregledač** (Chrome, Firefox, Edge) za razvoj i testiranje  

## Kloniranje Repozitorijuma

Izvorni kod je hostovan na GitHub-u. Da biste dobili najnoviju verziju:

```bash
git clone https://github.com/AlexNa-Holdings/savva-ui-solidjs
cd savva-ui-solidjs
````

## Instaliranje Zavisnosti

Unutar foldera projekta, instalirajte sve potrebne zavisnosti:

```bash
npm install
# ili
yarn install
```

## Pokretanje Razvojnog Servera

Pokrenite dev server sa automatskim ponovnim učitavanjem:

```bash
npm run dev
# ili
yarn dev
```

Aplikacija će biti dostupna na [http://localhost:5173](http://localhost:5173).

## Izrada za Proizvodnju

Da biste kreirali optimizovanu verziju:

```bash
npm run build
```

Izlaz će biti u `dist/` folderu.

## Sledeći Koraci

* Istražite **Dokumentaciju za Razvijače** za arhitekturu i module.
* Pokušajte da menjate domene i resurse u **Desnom Panelu**.
* Doprinosite otvaranjem problema ili pull zahteva na GitHub-u.

To je to! 🎉 Spremni ste da počnete sa radom na **SAVVA Platformi**.

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SAVVA · SolidJS</title>

  <!-- Preload theme to avoid flash -->
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
      // If there is a real path (e.g., /settings) but no hash, rewrite to hash form: /#/settings
      if (!location.hash && location.pathname !== "/") {
        var newHash = "#" + location.pathname + location.search + location.hash;
        history.replaceState(null, "", "/" + newHash);
      }
    })();
  </script>


  <!-- Load app after theme class is set -->
  <script type="module" src="/src/index.jsx"></script>
</head>

<body>
  <div id="root"></div>
</body>

</html>
```