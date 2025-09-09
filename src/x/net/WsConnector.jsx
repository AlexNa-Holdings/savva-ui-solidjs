// src/x/net/WsConnector.jsx
import { onMount, onCleanup, createSignal } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { ensureWsStarted, getWsClient, getWsApi, onAlert, offAlert } from "../../net/wsRuntime.js";
import { wsUrl } from "../../net/endpoints.js";
import { pushToast } from "../../ui/toast.js";
import { useI18n } from "../../i18n/useI18n.js";

let _mounted = false;

export default function WsConnector() {
  if (_mounted) return null;
  _mounted = true;

  const app = useApp();
  const { t } = useI18n();

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

    const [hasConnectedOnce, setHasConnectedOnce] = createSignal(false);

    const onOpen = () => { setHasConnectedOnce(true); };
    const onClose = (ev) => {
      if (!hasConnectedOnce()) {
        // Add useful debugging details into the toast.
        pushToast({
          type: "warning",
          message: t("error.ws.title"),
          details: {
            message: t("error.ws.message"),
            code: ev?.code,
            reason: ev?.reason,
            attempt: ws.attempt?.(),
            url: ws.url?.()
          },
          autohideMs: 15000,
        });
      }
    };
    const onAuthError = () => { app.handleAuthError?.(); };

    ws.on("open", onOpen);
    ws.on("close", onClose);
    ws.on("auth_error", onAuthError);

    onCleanup(() => {
      ws.off("open", onOpen);
      ws.off("close", onClose);
      ws.off("auth_error", onAuthError);
    });
  });

  return null;
}
