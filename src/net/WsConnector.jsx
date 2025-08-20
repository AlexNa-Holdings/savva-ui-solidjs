// File: src/net/WsConnector.jsx
import { onMount, onCleanup } from "solid-js";
import { useApp } from "../context/AppContext.jsx";
import WsClient from "./WsClient";
import { wsUrl } from "./endpoints";
import { dbg } from "../utils/debug";

export default function WsConnector() {
  const app = useApp();
  const ws = new WsClient();

  // expose
  app.ws           = ws;
  app.wsUrl        = wsUrl; // zero-arg getter now
  app.wsStatus     = () => ws.status();
  app.wsConnected  = () => ws.status() === "open";
  app.wsReconnect  = (reason) => ws.reconnect(reason || "manual");
  app.wsCall       = (m, p = {}, o) => ws.call(m, p, o);
  app.wsNotify     = (m, p = {}) => ws.sendJson({ type: "notify", method: m, params: p });
  app.onWsEvent    = (t, fn) => ws.on(t, fn);
  app.offWsEvent   = (t, fn) => ws.off(t, fn);

  onMount(() => {
    const url = wsUrl();
    if (!url) { dbg.warn("ws", "No WS URL configured"); return; }
    ws.setUrl(url);
    ws.connect();
  });

  onCleanup(() => ws.close());
  return null;
}
