// src/x/main/VersionChecker.jsx
import { createSignal, onMount, onCleanup } from "solid-js";
import { APP_VERSION } from "../../version.js";
import NewVersionModal from "../modals/NewVersionModal.jsx";
import { dbg } from "../../utils/debug.js";

// Function to compare semantic versions
function isNewerVersion(current, fetched) {
  const currentParts = current.split('.').map(Number);
  const fetchedParts = fetched.split('.').map(Number);
  const len = Math.max(currentParts.length, fetchedParts.length);

  for (let i = 0; i < len; i++) {
    const currentVal = currentParts[i] || 0;
    const fetchedVal = fetchedParts[i] || 0;
    if (fetchedVal > currentVal) return true;
    if (fetchedVal < currentVal) return false;
  }
  return false;
}

export default function VersionChecker() {
  const [showUpdateModal, setShowUpdateModal] = createSignal(false);

  const checkVersion = async () => {
    // Only check when tab is visible
    if (document.hidden) {
      return;
    }

    try {
      // Fetch version.js with cache-busting
      const response = await fetch(`/version.js?t=${new Date().getTime()}`);
      if (!response.ok) {
        dbg.warn("VersionChecker", "Could not fetch server version file.");
        return;
      }
      
      const text = await response.text();
      const match = text.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
      
      if (match && match[1]) {
        const serverVersion = match[1];
        dbg.log("VersionChecker", `Current: ${APP_VERSION}, Server: ${serverVersion}`);
        
        if (isNewerVersion(APP_VERSION, serverVersion)) {
          setShowUpdateModal(true);
        }
      }
    } catch (error) {
      dbg.error("VersionChecker", "Error checking for new version:", error);
    }
  };

  onMount(() => {
    // Check on mount, then on visibility change
    checkVersion();
    document.addEventListener("visibilitychange", checkVersion);
    
    onCleanup(() => {
      document.removeEventListener("visibilitychange", checkVersion);
    });
  });

  return (
    <NewVersionModal 
      isOpen={showUpdateModal()}
    />
  );
}