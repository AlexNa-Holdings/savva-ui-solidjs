// src/routing/smartRouter.js
import { createSignal } from "solid-js";
import { closeAllModals } from "../utils/modalBus.js";

/**
 * Determines if we should use hash routing based on the environment
 * @returns {boolean} - true if hash routing should be used
 */
function shouldUseHashRouting() {
  if (typeof window === "undefined") return false;

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  // Use hash routing for:
  // 1. file:// protocol (local HTML files)
  // 2. IPFS gateways
  // 3. localhost or 127.0.0.1

  if (protocol === "file:") {
    return true;
  }

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return true;
  }

  // Check for IPFS-related hostnames/paths
  if (
    hostname.includes("ipfs") ||
    hostname.includes("ipns") ||
    window.location.pathname.startsWith("/ipfs/") ||
    window.location.pathname.startsWith("/ipns/")
  ) {
    return true;
  }

  // For all other cases (real domains), use history routing
  return false;
}

const USE_HASH_ROUTING = shouldUseHashRouting();

console.log(`[SmartRouter] Using ${USE_HASH_ROUTING ? "hash" : "history"} routing for ${window.location.href}`);

// ============================================================================
// Hash Routing Implementation
// ============================================================================

function readHashPath() {
  const raw = window.location.hash || "";
  return raw.replace(/^#/, "") || "/";
}

function readHistoryPath() {
  return window.location.pathname + window.location.search;
}

const [route, setRoute] = createSignal(USE_HASH_ROUTING ? readHashPath() : readHistoryPath());

function setFromHash() {
  closeAllModals();
  setRoute(readHashPath());
}

function setFromHistory() {
  closeAllModals();
  setRoute(readHistoryPath());
}

// ============================================================================
// Event Listeners
// ============================================================================

if (typeof window !== "undefined") {
  if (USE_HASH_ROUTING) {
    window.addEventListener("hashchange", setFromHash);
  } else {
    window.addEventListener("popstate", setFromHistory);
  }
}

// ============================================================================
// Navigation Function
// ============================================================================

export function navigate(path, { replace = false } = {}) {
  closeAllModals();

  if (USE_HASH_ROUTING) {
    // Hash routing mode
    const target = path.startsWith("#") ? path : `#${path}`;
    if (replace) {
      window.location.replace(target);
    } else {
      window.location.hash = path.startsWith("#") ? path.slice(1) : path;
    }
  } else {
    // History routing mode
    const cleanPath = path.startsWith("#") ? path.slice(1) : path;
    if (replace) {
      window.history.replaceState({}, "", cleanPath);
    } else {
      window.history.pushState({}, "", cleanPath);
    }
    setFromHistory();
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useHashRouter() {
  return { route, navigate };
}

// Export for debugging/info
export { USE_HASH_ROUTING };
