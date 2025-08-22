// src/net/WsConnector.jsx
import { onMount, onCleanup, createSignal } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { ensureWsStarted, getWsClient, getWsApi, onAlert, offAlert } from "./wsRuntime";
import { wsUrl } from "./endpoints";
import { pushToast } from "../components/ui/toast.js"; // Import the toast helper
import { useI18n } from "../i18n/useI18n.js"; // Import i18n for the message

let _mounted = false;

export default function WsConnector() {
  if (_mounted) return null;
  _mounted = true;

  const app = useApp();
  const { t } = useI18n();

  // Expose helpers from the singleton runtime
  const ws = getWsClient();
  const api = getWsApi();

  app.ws = ws;
  app.wsUrl = wsUrl;
  app.wsStatus = () => ws.status();
  app.wsConnected = () => ws.status() === "open";
  app.wsReconnect = (r) => ws.reconnect(r || "manual");
  app.wsCall = api.call;
  app.wsMethod = api.method;
  app.alertBus = { on: onAlert, off: offAlert };
  app.onAlert = onAlert;
  app.offAlert = offAlert;

  onMount(() => {
    ensureWsStarted("connector-mount");

    // This logic prevents the toast from showing on every reconnect attempt.
    // It only shows if the *initial* connection fails.
    const [hasConnectedOnce, setHasConnectedOnce] = createSignal(false);

    const onOpen = () => {
      setHasConnectedOnce(true);
    };

    const onClose = () => {
      if (!hasConnectedOnce()) {
        pushToast({
          type: "warning", // A warning is less severe than a hard error
          message: t("error.ws.title"),
          details: t("error.ws.message"),
          autohideMs: 15000, // Show for 15 seconds
        });
      }
    };

    // Attach listeners to the WebSocket client
    ws.on("open", onOpen);
    ws.on("close", onClose);

    // Clean up listeners when the component is unmounted
    onCleanup(() => {
      ws.off("open", onOpen);
      ws.off("close", onClose);
    });
  });

  return null;
}