// src/x/docs/ImageDecryptionObserver.js
import { ipfs } from "../../ipfs/index.js";
import { getEncryptedPostContext } from "../../ipfs/encryptedFetch.js";
import { decryptFileData } from "../crypto/fileEncryption.js";

/**
 * Observer that watches for images in markdown content and decrypts them on-the-fly
 * Only decrypts images when they're about to be loaded by the browser
 */
export class ImageDecryptionObserver {
  constructor(app, container) {
    this.app = app;
    this.container = container;
    this.observer = null;
    this.processedImages = new WeakSet();
    this.blobUrls = new Set();
  }

  /**
   * Extract CID path from a gateway URL or IPFS path
   * Examples:
   *   https://gateway.com/ipfs/QmXXX/file.png -> QmXXX/file.png
   *   ipfs://QmXXX/file.png -> QmXXX/file.png
   *   QmXXX/file.png -> QmXXX/file.png
   */
  extractCidPath(url) {
    let path = String(url || "").trim();

    // Remove protocol and domain if it's a gateway URL
    const ipfsMatch = path.match(/\/ipfs\/(.+)$/);
    if (ipfsMatch) {
      return ipfsMatch[1];
    }

    // Use ipfs.normalizeInput for other cases
    return ipfs.normalizeInput(path);
  }

  /**
   * Check if a URL is from an encrypted post's data folder
   */
  isFromEncryptedPost(url) {
    const context = getEncryptedPostContext();
    console.log("[ImageDecryptionObserver] Context:", context);

    if (!context || !context.dataCid) {
      console.log("[ImageDecryptionObserver] No context or dataCid");
      return false;
    }

    try {
      const cidPath = this.extractCidPath(url);
      const dataCid = ipfs.normalizeInput(context.dataCid);

      console.log("[ImageDecryptionObserver] Extracted CID path:", cidPath);
      console.log("[ImageDecryptionObserver] Data CID:", dataCid);
      console.log("[ImageDecryptionObserver] Starts with?:", cidPath.startsWith(dataCid));

      return cidPath.startsWith(dataCid);
    } catch (error) {
      console.error("[ImageDecryptionObserver] Error checking path:", error);
      return false;
    }
  }

  /**
   * Decrypt media (video/audio) and replace its src with a blob URL
   */
  async decryptMedia(element, mediaType = "media") {
    if (this.processedImages.has(element)) {
      console.log("[ImageDecryptionObserver] Already processed:", element.getAttribute("src"));
      return;
    }

    this.processedImages.add(element);

    const originalSrc = element.getAttribute("src");
    if (!originalSrc) return;

    console.log(`[ImageDecryptionObserver] Checking if ${mediaType} is encrypted:`, originalSrc);

    // Check if this is from encrypted post
    if (!this.isFromEncryptedPost(originalSrc)) {
      console.log(`[ImageDecryptionObserver] Not from encrypted post, skipping ${mediaType}`);
      return;
    }

    console.log(`[ImageDecryptionObserver] ${mediaType} is from encrypted post, will decrypt:`, originalSrc);

    const context = getEncryptedPostContext();
    if (!context || !context.postSecretKey) {
      console.warn(`[ImageDecryptionObserver] No decryption key available for ${mediaType}:`, originalSrc);
      return;
    }

    try {
      // Show loading state
      element.style.opacity = "0.5";

      // Extract CID path from the URL for fetching
      const cidPath = this.extractCidPath(originalSrc);
      console.log(`[ImageDecryptionObserver] Fetching ${mediaType} CID path:`, cidPath);

      // Fetch and decrypt
      const result = await ipfs.fetchBest(this.app, cidPath);
      const encryptedData = await result.res.arrayBuffer();
      const decryptedData = decryptFileData(encryptedData, context.postSecretKey);

      // Determine MIME type based on file extension
      let mimeType = 'application/octet-stream';
      const ext = cidPath.split('.').pop()?.toLowerCase();
      if (mediaType === 'video') {
        if (ext === 'mp4') mimeType = 'video/mp4';
        else if (ext === 'webm') mimeType = 'video/webm';
        else if (ext === 'ogg') mimeType = 'video/ogg';
      } else if (mediaType === 'audio') {
        if (ext === 'mp3') mimeType = 'audio/mpeg';
        else if (ext === 'wav') mimeType = 'audio/wav';
        else if (ext === 'ogg') mimeType = 'audio/ogg';
        else if (ext === 'm4a') mimeType = 'audio/mp4';
      }

      // Create blob URL with proper MIME type
      const blob = new Blob([decryptedData], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);

      // Store for cleanup
      this.blobUrls.add(blobUrl);

      // Replace src
      element.src = blobUrl;
      element.setAttribute("data-encrypted-blob", "true");
      element.setAttribute("data-original-src", originalSrc);
      element.style.opacity = "1";

      // Force reload for video/audio elements
      element.load();

      console.log(`[ImageDecryptionObserver] Decrypted ${mediaType}:`, originalSrc);
    } catch (error) {
      console.error(`[ImageDecryptionObserver] Failed to decrypt ${mediaType}:`, originalSrc, error);
      element.style.opacity = "1";
      // Leave original src on error
    }
  }

  /**
   * Decrypt an image and replace its src with a blob URL
   */
  async decryptImage(img) {
    // Images are just a special case of media
    await this.decryptMedia(img, "image");
  }

  /**
   * Handle encrypted file download links
   * Intercepts clicks on links to encrypted files and triggers decrypted download
   */
  handleEncryptedLink(link) {
    if (this.processedImages.has(link)) {
      return; // Already processed
    }

    const href = link.getAttribute("href");
    if (!href) return;

    // Check if this link points to an encrypted file
    if (!this.isFromEncryptedPost(href)) {
      return; // Not encrypted, leave as-is
    }

    this.processedImages.add(link);

    console.log("[ImageDecryptionObserver] Found encrypted link:", href);

    // Add click handler to intercept and decrypt
    const clickHandler = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const context = getEncryptedPostContext();
      if (!context || !context.postSecretKey) {
        console.warn("[ImageDecryptionObserver] Cannot download - no decryption key");
        alert("Cannot download encrypted file - decryption key not available");
        return;
      }

      try {
        // Show that we're downloading
        const originalText = link.textContent;
        link.textContent = "Downloading...";
        link.style.pointerEvents = "none";

        // Extract CID path and fetch
        const cidPath = this.extractCidPath(href);
        console.log("[ImageDecryptionObserver] Downloading encrypted file:", cidPath);

        const result = await ipfs.fetchBest(this.app, cidPath);
        const encryptedData = await result.res.arrayBuffer();

        // Decrypt
        const decryptedData = decryptFileData(encryptedData, context.postSecretKey);

        // Determine filename from the path
        const filename = cidPath.split('/').pop() || 'download';

        // Determine MIME type
        let mimeType = 'application/octet-stream';
        const ext = filename.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') mimeType = 'application/pdf';
        else if (ext === 'zip') mimeType = 'application/zip';
        else if (ext === 'txt') mimeType = 'text/plain';
        else if (ext === 'json') mimeType = 'application/json';
        else if (ext === 'csv') mimeType = 'text/csv';
        else if (ext === 'doc' || ext === 'docx') mimeType = 'application/msword';
        else if (ext === 'xls' || ext === 'xlsx') mimeType = 'application/vnd.ms-excel';

        // Create blob and trigger download
        const blob = new Blob([decryptedData], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Cleanup
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

        link.textContent = originalText;
        link.style.pointerEvents = "";

        console.log("[ImageDecryptionObserver] Downloaded decrypted file:", filename);
      } catch (error) {
        console.error("[ImageDecryptionObserver] Failed to download encrypted file:", error);
        alert("Failed to download encrypted file: " + error.message);
        link.textContent = link.getAttribute("data-original-text") || "Download";
        link.style.pointerEvents = "";
      }
    };

    // Store original text for restoration
    link.setAttribute("data-original-text", link.textContent);

    // Add visual indicator that this is an encrypted link
    link.setAttribute("data-encrypted-link", "true");
    link.style.cursor = "pointer";

    // Remove default href behavior and add our handler
    link.addEventListener("click", clickHandler);

    console.log("[ImageDecryptionObserver] Attached download handler to encrypted link:", href);
  }

  /**
   * Process all media elements (images, videos, audio) and links in the container
   */
  processImages() {
    if (!this.container) return;

    const images = this.container.querySelectorAll("img");
    const videos = this.container.querySelectorAll("video");
    const audios = this.container.querySelectorAll("audio");
    const links = this.container.querySelectorAll("a[href]");

    console.log("[ImageDecryptionObserver] Processing media:", {
      images: images.length,
      videos: videos.length,
      audios: audios.length,
      links: links.length
    });

    images.forEach((img) => {
      console.log("[ImageDecryptionObserver] Found image src:", img.getAttribute("src"));
      this.decryptImage(img);
    });

    videos.forEach((video) => {
      console.log("[ImageDecryptionObserver] Found video src:", video.getAttribute("src"));
      this.decryptMedia(video, "video");
    });

    audios.forEach((audio) => {
      console.log("[ImageDecryptionObserver] Found audio src:", audio.getAttribute("src"));
      this.decryptMedia(audio, "audio");
    });

    links.forEach((link) => {
      this.handleEncryptedLink(link);
    });
  }

  /**
   * Start observing for new images
   */
  start() {
    console.log("[ImageDecryptionObserver] Starting observer for container:", this.container);
    // Process existing images
    this.processImages();

    // Watch for new media elements and links being added
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === "IMG") {
                this.decryptImage(node);
              } else if (node.tagName === "VIDEO") {
                this.decryptMedia(node, "video");
              } else if (node.tagName === "AUDIO") {
                this.decryptMedia(node, "audio");
              } else if (node.tagName === "A" && node.hasAttribute("href")) {
                this.handleEncryptedLink(node);
              } else {
                // Check for media elements and links in added subtree
                const images = node.querySelectorAll?.("img");
                const videos = node.querySelectorAll?.("video");
                const audios = node.querySelectorAll?.("audio");
                const links = node.querySelectorAll?.("a[href]");

                images?.forEach((img) => this.decryptImage(img));
                videos?.forEach((video) => this.decryptMedia(video, "video"));
                audios?.forEach((audio) => this.decryptMedia(audio, "audio"));
                links?.forEach((link) => this.handleEncryptedLink(link));
              }
            }
          });
        } else if (mutation.type === "attributes") {
          const target = mutation.target;
          if (mutation.attributeName === "src") {
            if (target.tagName === "IMG") {
              this.decryptImage(target);
            } else if (target.tagName === "VIDEO") {
              this.decryptMedia(target, "video");
            } else if (target.tagName === "AUDIO") {
              this.decryptMedia(target, "audio");
            }
          } else if (mutation.attributeName === "href" && target.tagName === "A") {
            this.handleEncryptedLink(target);
          }
        }
      }
    });

    this.observer.observe(this.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href"],
    });
  }

  /**
   * Stop observing and cleanup blob URLs
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Revoke all blob URLs
    this.blobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error("[ImageDecryptionObserver] Failed to revoke blob URL:", e);
      }
    });

    this.blobUrls.clear();
    this.processedImages = new WeakSet();
  }
}
