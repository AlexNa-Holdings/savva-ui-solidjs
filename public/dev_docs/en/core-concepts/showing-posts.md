# Showing Posts

Displaying a SAVVA post is a two-step process. First, you fetch a list of post metadata objects from the SAVVA backend. Second, you use the IPFS information from that metadata to fetch the actual content (like the title, text, and images) from the decentralized network.

---

## Step 1: Fetch Post Metadata from the Backend

The primary way to get a list of posts is through the `content-list` WebSocket method. It's a flexible endpoint that supports pagination, sorting, and filtering.

### Calling `content-list`

You call the method with parameters specifying which content you need. Here's a typical example:

```javascript
// Example call using the app's wsMethod helper
const posts = await app.wsMethod("content-list")({
  domain: "savva.app",      // The domain to fetch posts from
  limit: 12,                // Number of items per page
  offset: 0,                // Start at the first item (for pagination)
  lang: "en",               // Preferred language for any returned metadata
  order_by: "fund_amount",  // Sort by total funds received
  content_type: "post",     // We only want posts
  category: "en:SAVVA Talk" // Optional: filter by a specific category
});
```

### The Post Object Structure

The `content-list` method returns an array of post objects. Each object contains all the on-chain metadata and pointers needed to fetch the full content.

Here is an example of a single post object returned from the backend:

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
  "data_cid": "bafybeig...",
  "reactions": [10, 2, 0, 1],
  "savva_cid": "0x01701...cfa2",
  "short_cid": "aBcDeF1",
  "tags": ["decentralization", "social"],
  "savva_content": {
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

* **author**: Profile information of the post's author, including their staked amount.
* **savva\_cid / short\_cid**: Unique identifiers for the post. The `savva_cid` is the full on-chain ID, while the `short_cid` is a user-friendly alternative. Use these to build URLs (e.g., `/post/<short_cid>`).
* **ipfs & data\_cid**: Crucial pointers to the content on IPFS. See the next section for how to use them.
* **savva\_content**: Metadata object directly from the backend cache. It contains a `locales` object with pre-fetched titles and previews, which is perfect for rendering post cards in a feed without needing to fetch from IPFS first.
* **fund**: Information about the post's funding pool.
* **reactions**: An array representing the counts for different reaction types (like, super, etc.).

---

## Step 2: Resolve Full Content from IPFS

While `savva_content` is useful for previews, you need to fetch from IPFS to get the full post body, chapters, and other assets.

### Finding the Descriptor and Data Folder

The `ipfs` and `data_cid` fields work together to tell you where everything is. There are two scenarios:

1. **`data_cid` is present**:

   * `ipfs` is the direct path to the descriptor file (e.g., `bafy.../info.yaml`).
   * `data_cid` is the CID of the folder containing all post assets (images, markdown files, etc.). This is your content base.

2. **`data_cid` is NOT present (legacy format)**:

   * `ipfs` is the CID of the folder containing all post assets.
   * The descriptor file is assumed to be at a standard path: `<ipfs>/info.yaml`.

The application logic should determine the descriptor path and the content base CID based on these rules.

### The Post Descriptor (`info.yaml`)

The descriptor is a YAML file that defines the full structure of the post, including all its language variations and chapters.

#### Example `info.yaml`

```yaml
# Example info.yaml for a multi-language, multi-chapter post

thumbnail: assets/post_thumbnail.png

locales:
  en:
    title: "Understanding Decentralized Systems"
    text_preview: "A deep dive into the core concepts of decentralization..."
    tags: ["blockchain", "systems", "web3"]
    categories: ["Technology"]
    # The main content, can be inline or a path
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

* **thumbnail**: Relative path to the post's main image, resolved against the content base CID.
* **locales**: Object where each key is a language code (e.g., `en`, `ru`).
* **title / text\_preview / tags / categories**: Language-specific metadata.
* **data\_path**: Relative path to the main Markdown content for that language.
* **chapters**: Array of chapter objects, each with its own title and `data_path`.

To get the full content of a chapter, you combine the content base CID with the `data_path` from the descriptor. For example, to fetch the English version of Chapter 1, you would request:

```
<content_base_cid>/content/en/chapter1.md
```

from an IPFS gateway.
