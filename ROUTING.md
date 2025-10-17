# Smart Routing System

This application uses a **smart routing system** that automatically detects the environment and chooses the appropriate routing strategy.

## Routing Modes

### Hash Routing (`#/path`)
Used for environments where server-side routing is not available:
- **localhost** or **127.0.0.1** (local development)
- **file://** protocol (opening HTML files directly)
- **IPFS gateways** (ipfs.io, dweb.link, etc.)
- Any URL containing "ipfs" or "ipns" in the hostname or path

### History Routing (`/path`)
Used for regular web deployments:
- Production domains (e.g., `example.com`)
- Any environment not matching the hash routing criteria above

## How It Works

The routing mode is automatically detected in `src/routing/smartRouter.js`:

```javascript
function shouldUseHashRouting() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // Use hash routing for file://, localhost, or IPFS
  if (protocol === "file:") return true;
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.includes("ipfs") || hostname.includes("ipns")) return true;

  // Otherwise use history routing
  return false;
}
```

## Deployment

### IPFS Deployment (Primary)
This application is designed for IPFS deployment:
- No server configuration needed
- Hash routing is automatically used
- Works as a single-page application
- Simply build and deploy to IPFS

### Traditional Web Servers (Optional)
If you want to deploy to a traditional web server with clean URLs:

#### Apache (.htaccess)
Create a `.htaccess` file in your web root:
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

#### Nginx
Add this to your nginx config:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

#### Netlify / Cloudflare Pages
Create `public/_redirects`:
```
/*    /index.html   200
```

#### Vercel
Create `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Benefits

1. **Single Page Mode**: Works seamlessly when deployed to IPFS or opened as a local file
2. **SEO-Friendly URLs**: Uses clean URLs on production domains (no hash fragments)
3. **Automatic Detection**: No configuration needed - it just works!
4. **Consistent API**: All code uses the same `useHashRouter()` hook and `navigate()` function

## Migration Notes

All files have been updated to import from `smartRouter.js` instead of `hashRouter.js`:

```javascript
// Old
import { useHashRouter, navigate } from "../routing/hashRouter.js";

// New
import { useHashRouter, navigate } from "../routing/smartRouter.js";
```

The hook name remains `useHashRouter()` for backwards compatibility, but it now uses history routing when appropriate.
