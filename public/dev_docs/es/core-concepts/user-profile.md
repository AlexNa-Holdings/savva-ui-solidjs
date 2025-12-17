# Contrato UserProfile

El contrato `UserProfile` almacena el estado on-chain que impulsa las páginas de autor, los nombres y los metadatos de perfil en los dominios SAVVA. Combina un registro global de nombres legibles por humanos con almacenamiento por dominio de clave/valor y utilidades ligeras para avatares y datos de contacto. Esta página resume cómo la dApp interactúa con el contrato y los objetos JSON de perfil que viven junto a él en IPFS.

## Obtener una instancia del contrato

La dirección del contrato la suministra el backend en la carga `/info` bajo `savva_contracts.UserProfile`. El código del front-end la resuelve mediante el helper compartido:

```js
const userProfile = await getSavvaContract(app, "UserProfile");
```

Todas las lecturas/escrituras mostradas más abajo usan ese helper junto con las utilidades de enrutamiento de actores (ver `ProfileEditPage.jsx` y `userProfileStore.js`).

## Nombres registrados

Los nombres son identificadores globales únicos y en minúsculas registrados directamente contra direcciones de cartera.

- `names(address) → string` devuelve el nombre actual para una dirección.
- `owners(string) → address` resuelve un nombre de vuelta a su propietario. Ambos helpers se usan al cargar un perfil arbitrario (ver `fetchProfileForEdit`).

Mutaciones:

- `setName(string name)` registra o actualiza el handle del llamante. La UI llama a esto dentro de `executeSetName()` al guardar las ediciones del perfil.
- `removeName()` borra la entrada.
- `transferName(address to)` transfiere la reserva a otra dirección.

Como los nombres son globales, la UI permite al usuario elegir un único valor registrado y luego deriva nombres para mostrar específicos por idioma a partir del JSON de perfil fuera de la cadena (descrito más abajo).

## Avatares y otros campos principales

Dos helpers independientes mantienen los campos más importantes en la cadena:

- `setAvatar(string cid)` / `avatars(address) → string` almacenan y leen el CID de IPFS para el avatar de un usuario. El editor sube una imagen al endpoint de almacenamiento del backend y luego llama a `setAvatar` con el CID devuelto.
- `setPubKey(string modifier, string pubKey)` opcionalmente registra un par de claves que puede cifrarse para funciones de mensajería directa.

También existe una función de conveniencia `setAll(string name, string avatar, bytes32 domain, string profile)` que agrupa una actualización de nombre + avatar junto con un payload de perfil para un dominio.

## Almacenamiento de clave/valor con alcance por dominio

La mayoría de los metadatos se almacenan usando los primitivos `setString` y `setUInt`. Ambos aceptan un id de dominio y una clave, codificados como `bytes32`.

```js
await userProfile.write.setString([
  toHexBytes32(app.selectedDomainName()),
  toHexBytes32("profile_cid"),
  newProfileCid,
]);
```

El ejemplo anterior refleja lo que hace `ProfileEditPage.jsx` después de subir el JSON de perfil a IPFS: el CID se escribe bajo el dominio actual y la clave `profile_cid`. Las lecturas usan `getString`/`getUInt` con los mismos parámetros. El contrato también expone los mapeos públicos crudos (`profileString`, `profileUInt`) si necesitas acceso directo sin recomputar las claves.

### Claves comunes

| Clave | Tipo | Propósito |
| --- | --- | --- |
| `profile_cid` | string | Apunta al archivo JSON canónico del perfil en IPFS para el dominio seleccionado. |
| Claves personalizadas | string / uint | Los integradores pueden introducir metadatos adicionales para su dominio eligiendo nuevas claves – sólo deben mantenerlas bajo 32 bytes antes de codificarlas. |

Debido a que los datos están indexados por `(user, domain, key)`, diferentes dominios SAVVA pueden mantener documentos de perfil independientes mientras comparten el mismo registro global de nombres.

## Esquema JSON del perfil

El blob JSON almacenado en `profile_cid` es lo que alimenta la UI rica de perfiles en `ProfilePage.jsx`. Cuando el editor de perfiles guarda cambios emite un documento similar al siguiente:

```json
{
  "display_names": {
    "en": "Alice Example",
    "fr": "Alice Exemple"
  },
  "about_me": {
    "en": "Writer focused on freedom of expression.",
    "es": "Escritora centrada en la libertad de expresión."
  },
  "nsfw": "h",
  "sponsor_values": [10, 25, 100],
  "links": [
    { "title": "Website", "url": "https://alice.example" },
    { "title": "Fedi", "url": "https://fedi.social/@alice" }
  ]
}
```

Campos clave:

- `display_names` — reemplazos por idioma para el nombre público del autor. `ProfilePage` elige el idioma actual de la UI, hace fallback al inglés y finalmente al nombre registrado on-chain.
- `about_me` — texto biográfico multilenguaje que se muestra en la tarjeta de perfil. Documentos antiguos pueden usar una única cadena `about`; la UI hace fallback en consecuencia.
- `nsfw` — bandera de preferencia (`h`, `s`, etc.) que influye en qué publicaciones se muestran por defecto.
- `sponsor_values` — umbrales enteros (en SAVVA) usados para pre-rellenar los niveles de suscripción.
- `links` — objetos arbitrarios de enlace externo (`title` + `url`).

Puedes extender el documento con campos adicionales por dominio; el código consumidor debe ignorar las claves que no reconozca.

## Lectura de perfiles en la dApp

`ProfilePage.jsx` orquesta tres fuentes:

1. Una llamada websocket (`get-user`) que devuelve campos on-chain como `address`, `name`, `display_names` cacheados por el backend, estadísticas de staking y datos de suscripción.
2. Una fetch directa a IPFS para el CID almacenado bajo `profile_cid` usando los helpers en `userProfileStore.js`.
3. Sobrescrituras locales desde las cachés de `AppContext` (`userDisplayNames`) que permiten que las ediciones temporales se muestren de inmediato.

El resultado combinado determina lo que se muestra bajo el banner del autor, el nombre específico por idioma y todos los widgets auxiliares como los enlaces sociales.

## Resumen del flujo de edición

Mientras editan su perfil (`ProfileEditPage.jsx`):

1. La UI resuelve la dirección objetivo por nombre (vía `owners(name)`), luego carga el CID del avatar, el nombre actual y `profile_cid`.
2. Si existe un profile CID, se obtiene el JSON desde IPFS y se normaliza en el estado del editor.
3. Al guardar se sube un nuevo blob JSON y luego se emite `setString(domain, "profile_cid", cid)` mediante `sendAsActor`, asegurando que la transacción esté firmada por la cuenta que esté actuando.
4. El helper `applyProfileEditResult` actualiza las cachés locales para que los nuevos datos sean visibles sin esperar a la reindexación del backend.

La ruta de subida del avatar refleja este proceso, llamando a `setAvatar` con el CID devuelto.

## Trabajar con nombres registrados vs nombres para mostrar

- **Nombre registrado (`setName`)** — identificador único a nivel de cadena. Usado para enrutar vía URLs `/@handle` y almacenado en el mapping `names` del contrato.
- **Nombres para mostrar (`display_names`)** — etiquetas opcionales por idioma dentro del JSON del perfil. Reshacen el nombre registrado cuando están presentes.
- **Legado `display_name`** — los JSON de perfil más antiguos pueden proporcionar un único campo `display_name`; la UI aún lo respeta cuando no existe un valor específico por idioma.

Al construir integraciones, siempre resuelve la dirección en la cadena si aceptas entrada humana, y valida que un nombre esté libre antes de llamar a `setName`.

## Utilidades adicionales

- `setUInt` / `getUInt` reflejan los helpers de string para metadatos numéricos (por ejemplo, seguimiento de contadores por dominio).
- `setAll` puede inicializar el nombre, el avatar y el puntero de perfil en una sola llamada – útil para scripts de bootstrap.
- `removeName` y `transferName` proporcionan gestión del ciclo de vida si es necesario ceder un handle.

Con estos primitivos puedes introducir características adicionales guiadas por el perfil (insignias, registros de verificación, atestaciones off-chain) definiendo nuevas claves por dominio que apunten a valores on-chain o a documentos adicionales en IPFS.