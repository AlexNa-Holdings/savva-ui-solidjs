// File: src/net/WsConnector.jsx
import { onMount } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import { ensureWsStarted, getWsClient, getWsApi, onAlert, offAlert } from "./wsRuntime";
import { wsUrl } from "./endpoints";

let _mounted = false;

export default function WsConnector() {
  if (_mounted) return null;
  _mounted = true;

  const app = useApp();

  // Expose helpers from the singleton runtime
  const ws = getWsClient();
  const api = getWsApi();

  app.ws = ws;
  app.wsUrl = wsUrl;                 // zero-arg getter
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
  });

  return null;
}
