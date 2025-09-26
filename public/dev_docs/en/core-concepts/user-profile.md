# User Profile Contract

The `UserProfile` contract stores the on-chain state that powers author pages, names, and profile metadata across SAVVA domains. It combines a global registry of human-readable names with per-domain key/value storage and lightweight helpers for avatars and contact data. This page summarises how the dApp interacts with the contract and the JSON profile objects that live beside it on IPFS.

## Getting a contract instance

The contract address is supplied by the backend `/info` payload under `savva_contracts.UserProfile`. Front-end code resolves it through the shared helper:

```js
const userProfile = await getSavvaContract(app, "UserProfile");
```

Every read/write shown below uses that helper together with the actor routing utilities (see `ProfileEditPage.jsx` and `userProfileStore.js`).

## Registered names

Names are globally unique, lower-cased handles registered directly against wallet addresses.

- `names(address) → string` returns the current name for an address.
- `owners(string) → address` resolves a name back to its owner. Both helpers are used when loading an arbitrary profile (see `fetchProfileForEdit`).

Mutations:

- `setName(string name)` registers or updates the caller’s handle. The UI calls this inside `executeSetName()` when saving profile edits.
- `removeName()` clears the entry.
- `transferName(address to)` hands the reservation to another address.

Because names are global, the UI lets the user pick a single registered value and then derives language-specific display names from the off-chain profile JSON (described below).

## Avatars and other primary fields

Two standalone helpers keep the most important fields on chain:

- `setAvatar(string cid)` / `avatars(address) → string` store and read the IPFS CID for a user’s avatar. The editor uploads an image to the backend storage endpoint and then calls `setAvatar` with the returned CID.
- `setPubKey(string modifier, string pubKey)` optionally records an encryptable key pair for direct messaging features.

There is also a convenience `setAll(string name, string avatar, bytes32 domain, string profile)` that batches a name + avatar update together with a profile payload for one domain.

## Domain-scoped key/value storage

Most metadata is stored using the `setString` and `setUInt` primitives. Both accept a domain id and a key, encoded as `bytes32`.

```js
await userProfile.write.setString([
  toHexBytes32(app.selectedDomainName()),
  toHexBytes32("profile_cid"),
  newProfileCid,
]);
```

The example above mirrors what `ProfileEditPage.jsx` does after uploading the JSON profile to IPFS – the CID is written under the current domain and the `profile_cid` key. Reads use `getString`/`getUInt` with the same parameters. The contract also exposes the raw public mappings (`profileString`, `profileUInt`) if you need direct access without recomputing the keys.

### Common keys

| Key | Type | Purpose |
| --- | --- | --- |
| `profile_cid` | string | Points to the canonical profile JSON file on IPFS for the selected domain. |
| Custom keys | string / uint | Integrators can introduce additional metadata for their domain by choosing new keys – just keep them under 32 bytes before encoding. |

Because the data is keyed by `(user, domain, key)`, different SAVVA domains can maintain independent profile documents while still sharing the same global name registry.

## Profile JSON schema

The JSON blob stored at `profile_cid` is what powers the rich profile UI in `ProfilePage.jsx`. When the profile editor saves changes it emits a document similar to the following:

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

Key fields:

- `display_names` — per-language overrides for the author’s public name. `ProfilePage` picks the current UI language, falls back to English, and finally to the on-chain registered name.
- `about_me` — multi-language biography text shown on the profile card. Older documents may use a single `about` string; the UI falls back accordingly.
- `nsfw` — preference flag (`h`, `s`, etc.) that influences which posts are surfaced by default.
- `sponsor_values` — integer thresholds (in SAVVA) used to pre-fill subscription tiers.
- `links` — arbitrary External link objects (`title` + `url`).

You can extend the document with additional per-domain fields; consumer code should ignore keys it does not recognise.

## Reading profiles in the dApp

`ProfilePage.jsx` orchestrates three sources:

1. A websocket call (`get-user`) which returns on-chain fields such as `address`, `name`, `display_names` cached by the backend, staking statistics, and subscription data.
2. A direct IPFS fetch for the CID stored under `profile_cid` using the helpers in `userProfileStore.js`.
3. Local overrides from the `AppContext` caches (`userDisplayNames`) that allow temporary edits to show immediately.

The combined result determines what is shown under the author’s banner, the language-specific name, and all auxiliary widgets like social links.

## Editing flow recap

While editing their profile (`ProfileEditPage.jsx`):

1. The UI resolves the target address by name (via `owners(name)`), then loads the avatar CID, current name, and `profile_cid`.
2. If a profile CID exists, the JSON is fetched from IPFS and normalised into editor state.
3. Saving uploads a new JSON blob and then issues `setString(domain, "profile_cid", cid)` through `sendAsActor`, ensuring the transaction is signed by whichever account is currently acting.
4. The helper `applyProfileEditResult` updates local caches so the new data is visible without waiting for backend re-indexing.

The avatar upload path mirrors this process, calling `setAvatar` with the returned CID.

## Working with names vs display names

- **Registered name (`setName`)** — unique, chain-level identifier. Used for routing via `/@handle` URLs and stored in the contract’s `names` mapping.
- **Display names (`display_names`)** — optional per-language labels inside the profile JSON. They override the registered name when present.
- **Legacy `display_name`** — older profile JSONs may provide a single `display_name` field; the UI still honours it when no language-specific value exists.

When building integrations always resolve the address on chain if you accept human input, and validate that a name is free before calling `setName`.

## Additional utilities

- `setUInt` / `getUInt` mirror the string helpers for numeric metadata (for example, tracking per-domain counters).
- `setAll` can seed the name, avatar, and profile pointer in a single call – useful for bootstrap scripts.
- `removeName` and `transferName` provide lifecycle management if a handle needs to be relinquished.

With these primitives you can introduce extra profile-driven features (badges, verification records, off-chain attestations) by defining new domain keys that point to either on-chain values or additional IPFS documents.
