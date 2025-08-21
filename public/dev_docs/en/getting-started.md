
# Getting Started

Welcome to the **Getting Started** guide for the SAVVA Platform.

This page walks you through the basic steps to set up the project locally and start contributing.

## Prerequisites

Before you begin, make sure you have the following tools installed:

- **Node.js** (v18 or later recommended)  
- **npm** or **yarn** package manager  
- **Git** for cloning the repository  
- A modern **browser** (Chrome, Firefox, Edge) for development and testing  

## Clone the Repository

The source code is hosted on GitHub. To get the latest version:

```bash
git clone https://github.com/AlexNa-Holdings/savva-ui-solidjs
cd savva-ui-solidjs
````

## Install Dependencies

Inside the project folder, install all required dependencies:

```bash
npm install
# or
yarn install
```

## Start the Development Server

Run the dev server with hot reloading:

```bash
npm run dev
# or
yarn dev
```

The app will be available at [http://localhost:5173](http://localhost:5173).

## Build for Production

To create an optimized build:

```bash
npm run build
```

The output will be in the `dist/` folder.

## Next Steps

* Explore the **Developer Docs** for architecture and modules.
* Try switching domains and assets in the **Right Pane**.
* Contribute by opening issues or pull requests on GitHub.

That’s it! 🎉 You’re ready to start working with the **SAVVA Platform**.

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


