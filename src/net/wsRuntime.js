// src/net/wsRuntime.js
import WsClient from "./WsClient";
import { wsUrl } from "./endpoints";
import { createWsBus } from "./wsBus";
import { createWsApi } from "./wsApi";
import { dbg } from "../utils/debug";

let _client = null;
let _bus = null;
let _api = null;
let _apiWrapped = false;

export function ensureWsStarted() {
  if (!_client) {
    _client = new WsClient();
    _bus = createWsBus({ replay: 32 });
    _api = createWsApi(_client);

    // Forward server events to the bus as before
    _client.on("message", (obj) => {
      const t = obj && (obj.type || obj.event);
      if (t) _bus.emit(String(t), obj);
    });
  }
  return { client: _client, bus: _bus, api: _api };
}

function onEndpointsUpdate() {
  if (!_client) return;
  const prev = _client.url();
  _client.setUrl(); // pull fresh URL from endpoints.js
  const next = _client.url();
  if (next && next !== prev) {
    dbg.log("ws", "URL updated via listener", { prev, next });
    // Orchestrator is responsible for initiating reconnects.
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("savva:endpoints-updated", onEndpointsUpdate);
  window.__ws = {
    get client() { return _client; },
    get bus() { return _bus; },
    get api() { return _api; },
    start: () => getWsClient().connect(),
  };
}

export function getWsClient() {
  return ensureWsStarted().client;
}

// IMPORTANT: gate every api.call until the socket is OPEN.
// This removes the “WS request timeout” during the tiny reconnect gap.
export function getWsApi() {
  const { api } = ensureWsStarted();
  if (!_apiWrapped) {
    const rawCall = api.call.bind(api);
    api.call = async (...args) => {
      await whenWsOpen({ timeoutMs: 20000 }).catch(() => {});
      return rawCall(...args);
    };
    _apiWrapped = true;
    dbg.log("ws", "wsApi.call gated by whenWsOpen()");
  }
  return api;
}

export function onAlert(type, fn) {
  return ensureWsStarted().bus.on(type, fn);
}
export function offAlert(type, fn) {
  return ensureWsStarted().bus.off(type, fn);
}

export function whenWsOpen({ timeoutMs = 12000 } = {}) {
  const ws = getWsClient();
  if (ws.status() === "open") return Promise.resolve();

  // If not open and not connecting, try to connect (URL must be set).
  if (ws.status() === "idle" || ws.status() === "closed") {
    if (ws.url()) ws.connect();
  }

  return new Promise((resolve, reject) => {
    let timer;
    const onOpen = () => {
      ws.off("open", onOpen);
      if (timer) clearTimeout(timer);
      resolve();
    };
    ws.on("open", onOpen);

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        ws.off("open", onOpen);
        reject(new Error("WS open timeout"));
      }, timeoutMs);
    }
  });
}
