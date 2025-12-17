# Primeros pasos

Bienvenido a la guía **Primeros pasos** de la Plataforma SAVVA.

Esta página te guía a través de los pasos básicos para configurar el proyecto localmente y comenzar a contribuir.

## Requisitos previos

Antes de comenzar, asegúrate de tener instaladas las siguientes herramientas:

- **Node.js** (se recomienda v18 o posterior)  
- **npm** o **yarn** como gestor de paquetes  
- **Git** para clonar el repositorio  
- Un **navegador** moderno (Chrome, Firefox, Edge) para desarrollo y pruebas  

## Clonar el repositorio

El código fuente está alojado en GitHub. Para obtener la versión más reciente:

```bash
git clone https://github.com/AlexNa-Holdings/savva-ui-solidjs
cd savva-ui-solidjs
````
## Instalar dependencias

Dentro de la carpeta del proyecto, instala todas las dependencias requeridas:

```bash
npm install
# or
yarn install
```

## Iniciar el servidor de desarrollo

Ejecuta el servidor de desarrollo con recarga en caliente:

```bash
npm run dev
# or
yarn dev
```

La aplicación estará disponible en [http://localhost:5173](http://localhost:5173).

## Construir para producción

Para crear una compilación optimizada:

```bash
npm run build
```

La salida estará en la carpeta `dist/`.

## Próximos pasos

* Explora la **Documentación para desarrolladores** para la arquitectura y los módulos.
* Prueba a cambiar dominios y recursos en el **panel derecho**.
* Contribuye abriendo issues o pull requests en GitHub.

¡Eso es todo! 🎉 Estás listo para empezar a trabajar con la **Plataforma SAVVA**.

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