// src/alerts/AlertManager.jsx
import { onMount } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { alertRegistry, registerDynamicHandlers } from "./registry.js";
import { dbg } from "../utils/debug.js";

export default function AlertManager() {
  const app = useApp();

  onMount(() => {
    // Register dynamic handlers (e.g., NFT handlers) that need the app context
    registerDynamicHandlers(app);
    dbg.log("AlertManager", "Dynamic handlers registered");

    // Subscribe to all events from the WebSocket bus.
    const unsubscribe = app.alertBus.on("*", ({ type, payload }) => {
      const handler = alertRegistry[type];
      if (handler) {
        try {
          dbg.log("AlertManager", `Handling alert of type: '${type}'`, payload);
          handler(app, payload);
        } catch (error) {
          dbg.error("AlertManager", `Error in handler for '${type}':`, error);
        }
      } else {
        // Optional: Log unhandled events for development purposes.
        dbg.log("AlertManager", `No handler for alert type: '${type}'`);
      }
    });

    // The component doesn't unmount in this app, but this is good practice.
    return () => unsubscribe();
  });

  return null; // This component does not render anything.
}