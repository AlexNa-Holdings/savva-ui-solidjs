# Contrato UserProfile

El contrato `UserProfile` almacena el estado on-chain que alimenta las páginas de autor, los nombres y los metadatos de perfil a través de los dominios SAVVA. Combina un registro global de nombres legibles por humanos con almacenamiento clave/valor por dominio y utilidades ligeras para avatares y datos de contacto. Esta página resume cómo la dApp interactúa con el contrato y los objetos JSON de perfil que residen junto a él en IPFS.

## Obtener una instancia del contrato

La dirección del contrato la proporciona el backend en la carga útil `/info` bajo `savva_contracts.UserProfile`. El código del front-end la resuelve mediante el helper compartido:

```js
const userProfile = await getSavvaContract(app, "UserProfile");
```

Todas las lecturas/escrituras mostradas abajo utilizan ese helper junto con las utilidades de enrutamiento de actor (ver `ProfileEditPage.jsx` y `userProfileStore.js`).

## Nombres registrados

Los nombres son identificadores únicos a nivel global, en minúsculas, registrados directamente contra direcciones de billetera.

- `names(address) → string` devuelve el nombre actual para una dirección.
- `owners(string) → address` resuelve un nombre de vuelta a su propietario. Ambos helpers se usan al cargar un perfil arbitrario (ver `fetchProfileForEdit`).

Mutaciones:

- `setName(string name)` registra o actualiza el handle del caller. La UI llama a esto dentro de `executeSetName()` al guardar las ediciones del perfil.
- `removeName()` borra la entrada.
- `transferName(address to)` transfiere la reserva a otra dirección.

Debido a que los nombres son globales, la UI permite al usuario escoger un único valor registrado y luego deriva nombres de visualización específicos por idioma desde el JSON de perfil off-chain (descrito más abajo).

## Avatares y otros campos primarios

Dos helpers independientes mantienen los campos más importantes on-chain:

- `setAvatar(string cid)` / `avatars(address) → string` almacenan y leen el CID de IPFS para el avatar de un usuario. El editor sube una imagen al endpoint de almacenamiento del backend y luego llama a `setAvatar` con el CID devuelto.
- `setPubKey(string modifier, string pubKey)` opcionalmente registra un par de claves cifrables para funciones de mensajería directa.

También existe una conveniencia `setAll(string name, string avatar, bytes32 domain, string profile)` que agrupa una actualización de nombre + avatar junto con una carga útil de perfil para un dominio.

## Almacenamiento clave/valor con alcance por dominio

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
| `profile_cid` | string | Apunta al archivo JSON de perfil canónico en IPFS para el dominio seleccionado. |
| Claves personalizadas | string / uint | Los integradores pueden introducir metadatos adicionales para su dominio eligiendo nuevas claves; solo deben mantenerlas por debajo de 32 bytes antes de codificarlas. |

Debido a que los datos están indexados por `(user, domain, key)`, distintos dominios SAVVA pueden mantener documentos de perfil independientes mientras comparten el mismo registro global de nombres.

## Esquema JSON de perfil

El blob JSON almacenado en `profile_cid` es lo que alimenta la UI rica de perfil en `ProfilePage.jsx`. Cuando el editor de perfil guarda cambios emite un documento similar al siguiente:

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

- `display_names` — sustituciones por idioma para el nombre público del autor. `ProfilePage` elige el idioma actual de la UI, hace fallback al inglés y, finalmente, al nombre registrado on-chain.
- `about_me` — texto biográfico multilingüe mostrado en la tarjeta de perfil. Los documentos más antiguos pueden usar una única cadena `about`; la UI hace fallback en consecuencia.
- `nsfw` — bandera de preferencia (`h`, `s`, etc.) que influye en qué publicaciones se muestran por defecto.
- `sponsor_values` — umbrales enteros (en SAVVA) usados para prellenar los niveles de suscripción.
- `links` — objetos de Enlaces Externos arbitrarios (`title` + `url`).

Puedes extender el documento con campos adicionales por dominio; el código consumidor debe ignorar las claves que no reconozca.

## Lectura de perfiles en la dApp

`ProfilePage.jsx` orquesta tres fuentes:

1. Una llamada websocket (`get-user`) que devuelve campos on-chain como `address`, `name`, `display_names` cacheados por el backend, estadísticas de staking y datos de suscripción.
2. Una obtención directa desde IPFS para el CID almacenado bajo `profile_cid` usando los helpers en `userProfileStore.js`.
3. Sobrescrituras locales desde las cachés de `AppContext` (`userDisplayNames`) que permiten que las ediciones temporales se muestren inmediatamente.

El resultado combinado determina lo que se muestra bajo el banner del autor, el nombre específico por idioma y todos los widgets auxiliares como los enlaces sociales.

## Resumen del flujo de edición

Mientras editan su perfil (`ProfileEditPage.jsx`):

1. La UI resuelve la dirección objetivo por nombre (vía `owners(name)`), luego carga el CID del avatar, el nombre actual y el `profile_cid`.
2. Si existe un profile CID, el JSON se obtiene de IPFS y se normaliza al estado del editor.
3. Al guardar se sube un nuevo blob JSON y luego se emite `setString(domain, "profile_cid", cid)` mediante `sendAsActor`, asegurando que la transacción sea firmada por la cuenta que actualmente actúa.
4. El helper `applyProfileEditResult` actualiza las cachés locales para que los nuevos datos sean visibles sin esperar el re-indexado del backend.

La ruta de subida del avatar refleja este proceso, llamando a `setAvatar` con el CID devuelto.

## Trabajar con nombres vs nombres de visualización

- **Nombre registrado (`setName`)** — identificador único a nivel cadena. Usado para el enrutamiento vía URLs `/@handle` y almacenado en el mapeo `names` del contrato.
- **Nombres de visualización (`display_names`)** — etiquetas opcionales por idioma dentro del JSON de perfil. Anulan el nombre registrado cuando están presentes.
- **Legado `display_name`** — los JSON de perfil más antiguos pueden proporcionar un único campo `display_name`; la UI todavía lo respeta cuando no existe un valor específico por idioma.

Al construir integraciones siempre resuelve la dirección en cadena si aceptas entrada humana, y valida que un nombre esté libre antes de llamar a `setName`.

## Utilidades adicionales

- `setUInt` / `getUInt` reflejan los helpers de string para metadatos numéricos (por ejemplo, para rastrear contadores por dominio).
- `setAll` puede inicializar el nombre, avatar y el apuntador de perfil en una sola llamada — útil para scripts de bootstrap.
- `removeName` y `transferName` proporcionan gestión del ciclo de vida si un handle necesita ser renunciado.

Con estos primitivos puedes introducir características adicionales impulsadas por el perfil (insignias, registros de verificación, atestaciones off-chain) definiendo nuevas claves de dominio que apunten ya sea a valores on-chain o a documentos IPFS adicionales.