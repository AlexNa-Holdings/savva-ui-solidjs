# Working with domains

Un **dominio** es simplemente el nombre de la red social que quieres renderizar. Normalmente es el host DNS del sitio (p. ej. `savva.app`), pero no tiene por qué serlo. Cada dominio tiene un **paquete de dominio** — una carpeta que contiene `config.yaml` además de todos los recursos específicos del dominio (logos, favicon, locales, configuración de pestañas, `domain.css` opcional, etc.).

## ¿Dónde se encuentra `config.yaml`?

En tiempo de ejecución la app calcula una **URL base de recursos** a partir de `/info`:
- **Producción:** `assets_url`
- **Prueba:** `temp_assets_url`

El entorno activo es un sencillo conmutador prod/test en la app (usado por administradores para probar cambios). Dado el **nombre de dominio seleccionado**, la app construye un prefijo:

```

<assetsBase>/<domain>/

```

Después la app intenta cargar:

```

<assetsBase>/<domain>/config.yaml

```

Si eso falla (paquete ausente, 404, etc.), la IU **recurre** al paquete predeterminado incorporado:

```

/domain\_default/config.yaml

```

> Esta búsqueda y la diagnóstico están centralizados; verás las mismas rutas en la IU de diagnósticos.  
> El `domain.css` activo se carga desde el mismo prefijo y se invalida en caché con una clave de revisión, por lo que los cambios se aplican inmediatamente después de subirlos.

## ¿Por qué dos entornos (prod / test)?

El backend sirve dos URLs base para los recursos:

- **`assets_url`** → paquete de producción para usuarios finales  
- **`temp_assets_url`** → paquete de prueba para previsualizar cambios

Un administrador (según lo configurado en el backend) puede subir un paquete de dominio modificado bajo la base de **prueba** y verificar todo (logos, pestañas, GA, colores) sin afectar a los usuarios. Cuando esté satisfecho, publica el mismo paquete en **prod**.

## Estructura del paquete de dominio

Todo lo relacionado con un dominio vive dentro de una sola carpeta:

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

## Ejemplo de `config.yaml`

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

### Qué controlan estos campos

* **`logo`** — La app elige automáticamente la mejor variante (oscuro/claro + móvil/escritorio) y la resuelve mediante el prefijo de dominio activo.
* **`favicon`** — Todos los enlaces de favicon y las metaetiquetas se aplican dinámicamente; cuando cambia la configuración, la app reemplaza el conjunto de `<link rel="icon">`.
* **`GA_tag`** — Activa Google Analytics (gtag.js). Cuando está presente, la app inyecta los scripts de GA y envía eventos SPA `page_view` al cambiar de ruta.
* **`promo_post`** — savva_cid opcional de una publicación para mostrar en la primera apertura del sitio. Puede usarse para mostrar un post de bienvenida o anuncio a usuarios nuevos.
* **`modules.tabs`** — Señala al YAML que define las pestañas en la pantalla principal (ver más abajo).
* **`locales`** — Lista de idiomas para el dominio (código/nombre/título + ruta del diccionario). La app puede renderizar títulos/strings localizados por dominio.

## Pestañas en la pantalla principal

Las pestañas se configuran en un YAML independiente (referenciado por `modules.tabs` arriba). Por ejemplo:

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

La IU elige el título de pestaña localizado, selecciona un icono según el `type` y renderiza los bloques opcionales del panel derecho. Este archivo vive en la **misma carpeta de dominio**, por lo que se versiona y previsualiza junto con `config.yaml`.

## Colores del tema mediante `domain.css`

Si está presente, `domain.css` se obtiene desde el mismo prefijo de dominio y se aplica en tiempo de ejecución. Normalmente define variables CSS personalizadas que usa la IU (fondos, primer plano, acentos, bordes, etc.). Cambiar de **dominio** o **entorno** recarga este CSS, así que los administradores pueden ajustar la identidad visual sin recompilar la app.

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

Configura el `GA_tag` en `config.yaml` para habilitar GA. La app inyecta el script de GA e inicializa `gtag(...)` automáticamente, y también rastrea vistas de página al cambiar rutas basadas en hash. Elimina o borra `GA_tag` para desactivar la analítica para el dominio.

---

### Resumen

* La app elige la base de recursos **prod** o **test**, y luego carga `<base>/<domain>/config.yaml` con una reserva segura a `/domain_default/config.yaml`.
* **Todos** los recursos del dominio (logos, locales, pestañas, `domain.css`) viven en la misma carpeta para actualizaciones atómicas.
* Los administradores pueden previsualizar cambios en **test** antes de publicar en **prod**.
* `config.yaml` controla la identidad visual (logos, favicon), la localización, GA y dónde encontrar módulos de IU como las **pestañas**.