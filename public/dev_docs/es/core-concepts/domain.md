# Trabajando con dominios

Un **dominio** es simplemente el nombre de la red social que quieres renderizar. Normalmente es el host DNS del sitio (p. ej. `savva.app`) pero no tiene por qué serlo. Cada dominio tiene un **paquete de dominio**: una carpeta que contiene `config.yaml` además de todos los recursos específicos del dominio (logos, favicon, locales, configuración de pestañas, `domain.css` opcional, etc.).

## ¿Dónde se encuentra `config.yaml`?

En tiempo de ejecución la app calcula una **URL base de activos** a partir de `/info`:
- **Producción:** `assets_url`
- **Prueba:** `temp_assets_url`

El entorno activo es un simple conmutador prod/test en la app (usado por administradores para probar cambios). Dado el **nombre de dominio seleccionado**, la app construye un prefijo:

```

<assetsBase>/<domain>/

```

Luego la app intenta cargar:

```

<assetsBase>/<domain>/config.yaml

```

Si eso falla (paquete faltante, 404, etc.), la interfaz **recurre** al paquete predeterminado integrado:

```

/domain\_default/config.yaml

```

> Esta búsqueda y las diagnósticas están centralizadas; verás las mismas rutas en la UI de diagnósticos.  
> El `domain.css` activo se carga desde el mismo prefijo y se invalida en caché con una clave de revisión, por lo que los cambios se aplican inmediatamente después de subirlos.

## ¿Por qué dos entornos (prod / test)?

El backend expone dos URL base para los activos:

- **`assets_url`** → paquete de producción para los usuarios finales  
- **`temp_assets_url`** → paquete de prueba para previsualizar cambios

Un administrador (según lo configurado en el backend) puede subir un paquete de dominio modificado bajo la base de **test** y verificar todo (logos, pestañas, GA, colores) sin afectar a los usuarios. Cuando está satisfecho, publica el mismo paquete en **prod**.

## Estructura del paquete de dominio

Todo lo relativo a un dominio vive bajo una única carpeta:

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

## Ejemplo `config.yaml`

A continuación hay un ejemplo recortado que muestra los campos típicos que usa la app:

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

### Qué controlan estos campos

* **`logo`** — La app elige automáticamente la mejor variante (oscuro/claro + móvil/escritorio) y la resuelve mediante el prefijo de dominio activo.
* **`favicon`** — Todos los enlaces de favicon y meta tags se aplican dinámicamente; cuando cambia la configuración, la app reemplaza el conjunto de `<link rel="icon">`.
* **`GA_tag`** — Activa Google Analytics (gtag.js). Si está presente, la app inyecta los scripts de GA y envía eventos `page_view` de SPA en los cambios de ruta.
* **`modules.tabs`** — Señala el YAML que define las pestañas en la pantalla principal (ver más abajo).
* **`locales`** — Lista de idiomas para el dominio (código/nombre/título + ruta del diccionario). La app puede renderizar títulos/strings localizados por dominio.

## Pestañas en la pantalla principal

Las pestañas se configuran en un YAML independiente (referenciado por `modules.tabs` más arriba). Por ejemplo:

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

La UI toma el título de pestaña localizado, elige un icono según el `type` y renderiza bloques opcionales en el panel derecho. Este archivo vive en la **misma carpeta del dominio**, por lo que se versiona y previsualiza junto con `config.yaml`.

## Colores del tema mediante `domain.css`

Si está presente, `domain.css` se obtiene desde el mismo prefijo de dominio y se aplica en tiempo de ejecución. Normalmente define propiedades CSS personalizadas que la UI utiliza (fondos, primer plano, acentos, bordes, etc.). Cambiar el **dominio** o el **entorno** recarga este CSS, así que los administradores pueden afinar la identidad visual sin reconstruir la app.

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

Establece el `GA_tag` en `config.yaml` para habilitar GA. La app inyecta el script de GA e inicializa `gtag(...)` automáticamente, y también rastrea vistas de página en los cambios de ruta por hash. Elimina o borra `GA_tag` para desactivar el análisis para el dominio.

---

### Resumen

* La app elige la base de activos **prod** o **test**, luego carga `<base>/<domain>/config.yaml` con una caída segura a `/domain_default/config.yaml`.
* **Todos** los recursos del dominio (logos, locales, pestañas, `domain.css`) viven bajo la misma carpeta para actualizaciones atómicas.
* Los administradores pueden previsualizar cambios en **test** antes de publicarlos en **prod**.
* `config.yaml` controla la identidad visual (logos, favicon), la localización, GA y dónde encontrar módulos de la UI como **tabs**.