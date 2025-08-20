// src/ws/WsProvider.jsx
import * as Solid from "solid-js";
import WsClient from "./WsClient";
import { useApp } from "../context/AppContext.jsx";
import { dbg } from "../utils/debug";

const WsContext = Solid.createContext();

function buildWsUrl(backendHttpBase, domainName) {
  if (!backendHttpBase) return "";
  const base = new URL(backendHttpBase);
  const wsUrl = new URL("/ws", base);            // API point is /ws
  wsUrl.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  if (domainName) wsUrl.searchParams.set("domain", domainName);
  return wsUrl.toString();
}

export function WsProvider(props) {
  const app = useApp();

  // reactive domain name
  const domainName = Solid.createMemo(() => {
    const d = app.selectedDomain?.();
    return typeof d === "string" ? d : d?.name || "";
  });

  // reactive computed ws url from AppContext
  const wsUrl = Solid.createMemo(() => {
    const cfg = app.config?.();
    const url = buildWsUrl(cfg?.backendLink || "", domainName());
    return url;
  });

  const [status, setStatus] = Solid.createSignal("idle");
  const [attempt, setAttempt] = Solid.createSignal(0);

  // single client instance
  const client = new WsClient();

  // wiring: status + counters
  client.on("status", (s) => { setStatus(s); setAttempt(client.attempt()); });
  client.on("open",   () => { setStatus("open"); setAttempt(client.attempt()); });
  client.on("close",  () => { setStatus("closed"); setAttempt(client.attempt()); });

  // Auto-connect initially and whenever URL changes
  Solid.createEffect(() => {
    const url = wsUrl();
    if (!url) return;
    client.setUrl(url);
    client.reconnect("url-changed");
    dbg.log("ws", "Provider applied URL", { url });
  });

  Solid.onMount(() => {
    if (wsUrl()) {
      client.setUrl(wsUrl());
      client.connect();
    }
  });

  Solid.onCleanup(() => client.dispose());

  // Exposed API to the app
  const value = {
    url: wsUrl,
    status,
    attempt,

    // send raw or json
    send: (data) => client.send(data),
    sendJson: (obj) => client.sendJson(obj),

    // generic RPC; default params already include current domain
    call: (method, params = {}, opts) => {
      const merged = { domain: domainName(), ...params };
      return client.call(method, merged, opts);
    },

    // event bus for alerts; server should emit JSON with {type:'alert', ...}
    on: (type, fn) => client.on(type, fn),
    off: (type, fn) => client.off(type, fn),

    // manual control
    forceReconnect: (reason) => client.reconnect(reason || "manual"),
    close: () => client.close(),
  };

  return <WsContext.Provider value={value}>{props.children}</WsContext.Provider>;
}

export function useWs() {
  const ctx = Solid.useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used inside <WsProvider>");
  return ctx;
}
