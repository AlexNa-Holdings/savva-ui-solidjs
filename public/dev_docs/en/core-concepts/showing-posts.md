# Showing Posts

Displaying a SAVVA post is a two-step process.

1. Fetch a list of post metadata objects from the SAVVA backend.
2. Use the IPFS information from that metadata to fetch the actual content (title, text, images, etc.) from the decentralized network.

---

## Step 1: Fetch Post Metadata from the Backend

The primary way to get a list of posts is through the **`content-list`** WebSocket method.
It supports pagination, sorting, and filtering.

### Calling `content-list`

You call the method with parameters specifying which content you need. Example:

```js
// Example call using the app's wsMethod helper
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // Domain to fetch posts from
  limit: 12,                // Number of items per page
  offset: 0,                // Start index (for pagination)
  lang: "en",               // Preferred language for metadata
  order_by: "fund_amount",  // Sort by total funds received
  content_type: "post",     // We only want posts
  show_nsfw: true,          // true if user settings allow, otherwise false
  category: "en:SAVVA Talk" // Optional: filter by category
});
```

---

## The Post Object Structure

The `content-list` method returns an array of **post objects**.
Each contains metadata and pointers needed to fetch the full content.

Example:

```json
{
  "author": {
    "address": "0x1234...",
    "avatar": "Qm...",
    "name": "alexna",
    "display_name": "Alex Na",
    "staked": "5000000000000000000000"
  },
  "category": "en:SAVVA Talk",
  "domain": "savva.app",
  "effective_time": "2025-08-20T10:30:00Z",
  "fund": {
    "amount": "125000000000000000000",
    "round_time": 1672531200,
    "total_author_share": "100000000000000000000"
  },
  "ipfs": "bafybeig.../info.yaml",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["decentralization", "social"],
  "savva_content": {
    "data_cid": "bafybeig...",
    "locales": {
      "en": {
        "text_preview": "This is a short preview of the post content...",
        "title": "My First Post on SAVVA"
      },
      "ru": {
        "text_preview": "Это короткий анонс содержания поста...",
        "title": "Мой первый пост на SAVVA"
      }
    },
    "thumbnail": "thumbnail.jpg"
  }
}
```

### Key Fields Explained

* **author** — profile info of the author (including staked amount).
* **savva\_cid / short\_cid** — unique IDs. Use them to build URLs (`/post/<short_cid>`).
* **ipfs / savva\_content.data\_cid** — pointers to IPFS content.
* **savva\_content** — backend-cached metadata (titles, previews, thumbnails). Great for feed rendering without IPFS fetch.
* **fund** — post’s funding pool information.
* **reactions** — array of counts for each reaction type.

---

## Step 2: Resolve Full Content from IPFS

While `savva_content` is useful for previews, full content must be fetched from IPFS (post body, chapters, assets).

### Resolving Content Paths

The location of `info.yaml` depends on format:

* **Modern format**

  * `savva_content.data_cid` = base CID for assets.
  * `ipfs` = direct path to `info.yaml`.
* **Legacy format**

  * No `data_cid`.
  * `ipfs` = base CID. Descriptor assumed at `<ipfs>/info.yaml`.

### Utility Functions

Use helpers from `src/ipfs/utils.js`:

```js
import {
  getPostDescriptorPath,
  getPostContentBaseCid,
  resolvePostCidPath
} from "../../ipfs/utils.js";

const post = { ... };

// 1. Path to descriptor file
const descriptorPath = getPostDescriptorPath(post);

// 2. Base CID for assets
const contentBaseCid = getPostContentBaseCid(post);

// 3. Resolve relative path (e.g., thumbnail)
const fullThumbnailPath = resolvePostCidPath(post, post.savva_content.thumbnail);
```

---

## IPFS Gateway Prioritization

Fetch order:

1. **Local node** (if enabled).
2. **Post-specific gateways** (listed in descriptor).
3. **System gateways** (backend `/info`).

This ensures best speed and availability.

---

## The Post Descriptor (`info.yaml`)

A YAML file defining the full structure: languages, chapters, metadata.

### Example `info.yaml`

```yaml
thumbnail: assets/post_thumbnail.png
gateways:
  - https://my-fast-pinning-service.cloud

locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: ["blockchain", "systems", "web3"]
    categories: ["Technology"]
    data_path: content/en/main.md
    chapters:
      - title: "What is a Blockchain?"
        data_path: content/en/chapter1.md
      - title: "IPFS and Content Addressing"
        data_path: content/en/chapter2.md
  
  ru:
    title: "Понимание децентрализованных систем"
    text_preview: "Глубокое погружение в основные концепции децентрализации..."
    tags: ["блокчейн", "системы", "web3"]
    categories: ["Технологии"]
    data_path: content/ru/main.md
    chapters:
      - title: "Что такое блокчейн?"
        data_path: content/ru/chapter1.md
      - title: "IPFS и контентная адресация"
        data_path: content/ru/chapter2.md
```

### Key Descriptor Fields

* **thumbnail** — relative path to main image.
* **gateways** — optional recommended IPFS gateways.
* **locales** — object keyed by language codes.

  * **title / text\_preview / tags / categories** — language-specific metadata.
  * **data\_path** — main Markdown content for that language.
  * **chapters** — array of chapters, each with `title` and `data_path`.

To fetch full chapter content:

```txt
<content_base_cid>/content/en/chapter1.md
```


