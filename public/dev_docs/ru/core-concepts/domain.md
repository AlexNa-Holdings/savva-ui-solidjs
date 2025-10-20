# Работа с доменами

A **домен** — это просто имя социальной сети, которую вы хотите отобразить. Обычно это DNS‑хост сайта (например, `savva.app`), но не обязательно. У каждого домена есть **пакет домена** — папка, которая содержит `config.yaml` и все ресурсы, специфичные для домена (логотипы, фавикон, локали, конфиг вкладок, опциональный `domain.css` и т.д.).

## Где находится `config.yaml`?

Во время выполнения приложение вычисляет **базовый URL ресурсов** из `/info`:
- **Продакшн:** `assets_url`
- **Тест:** `temp_assets_url`

Активное окружение — это простой переключатель prod/test в приложении (используется администраторами для тестирования изменений). Учитывая **выбранное имя домена**, приложение строит префикс:

```

<assetsBase>/<domain>/

```

Затем приложение пытается загрузить:

```

<assetsBase>/<domain>/config.yaml

```

Если это не удаётся (пакет отсутствует, 404 и т.д.), UI **откатывается** к встроенному пакету по умолчанию:

```

/domain\_default/config.yaml

```

> Этот поиск и диагностические данные централизованы; вы увидите те же пути в UI диагностики.  
> Активный `domain.css` загружается из того же префикса и инвалидация кэша выполняется с помощью ключа ревизии, поэтому изменения применяются сразу после загрузки.

## Зачем нужны два окружения (prod / test)?

Бэкенд предоставляет два базовых URL для ресурсов:

- **`assets_url`** → production‑пак для конечных пользователей  
- **`temp_assets_url`** → test‑пак для предварительного просмотра изменений

Администратор (как настроено в бэкенде) может загрузить изменённый пакет домена под базой **test** и проверить всё (логотипы, вкладки, GA, цвета), не влияя на пользователей. Когда всё устраивает, тот же пакет публикуют в **prod**.

## Структура пакета домена

Всё для домена хранится в одной папке:

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

## Пример `config.yaml`

Ниже приведён сокращённый пример, показывающий типичные поля, которые использует приложение:

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

### Что контролируют эти поля

* **`logo`** — Приложение автоматически выбирает наилучший вариант (темный/светлый + мобильный/настольный) и подставляет его по активному префиксу домена.
* **`favicon`** — Все ссылки фавикона и meta‑теги применяются динамически; при изменении конфига приложение заменяет набор `<link rel="icon">`.
* **`GA_tag`** — Включает Google Analytics (gtag.js). Если задан, приложение внедряет скрипты GA и отправляет SPA‑события `page_view` при смене маршрутов.
* **`promo_post`** — Опциональный savva_cid поста, который показывается при первом открытии сайта. Можно использовать для отображения приветственного или объявления для новых пользователей.
* **`modules.tabs`** — Указывает на YAML, который определяет вкладки на главном экране (см. ниже).
* **`locales`** — Список языков для домена (code/name/title + путь к словарю). Приложение может рендерить локализованные заголовки/строки для домена.

## Вкладки на главном экране

Вкладки настраиваются в отдельном YAML (указанном в `modules.tabs` выше). Например:

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

UI выбирает локализованный заголовок вкладки, подбирает иконку по `type` и рендерит опциональные блоки в правой панели. Этот файл живёт в **той же папке домена**, поэтому он версионируется и предварительно просматривается вместе с `config.yaml`.

## Тема и цвета через `domain.css`

Если присутствует, `domain.css` загружается из того же префикса домена и применяется во время выполнения. Обычно он задаёт CSS‑переменные, которые использует UI (фоны, передний план, акценты, бордюры и т.д.). Переключение **домена** или **окружения** перезагружает этот CSS, поэтому администраторы могут тонко настраивать брендинг без пересборки приложения.

Пример переменных:

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

Задайте `GA_tag` в `config.yaml`, чтобы включить GA. Приложение вставляет скрипт GA и инициализирует `gtag(...)` автоматически, а также отслеживает просмотры страниц при изменениях хеш‑маршрутов. Удалите или очистите `GA_tag`, чтобы отключить аналитику для домена.

---

### Резюме

* Приложение выбирает базу ресурсов **prod** или **test**, затем загружает `<base>/<domain>/config.yaml` с безопасным откатом к `/domain_default/config.yaml`.
* **Все** ресурсы домена (логотипы, локали, вкладки, `domain.css`) хранятся в одной папке для атомарных обновлений.
* Администраторы могут предварительно просматривать изменения в **test** перед публикацией в **prod**.
* `config.yaml` контролирует брендинг (логотипы, favicon), локализацию, GA и места расположения UI‑модулей, таких как **tabs**.