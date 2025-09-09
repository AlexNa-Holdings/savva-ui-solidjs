// src/net/wsRuntime.js
import WsClient from "./WsClient";
import { wsUrl } from "./endpoints";
import { createWsBus } from "./wsBus";
import { createWsApi } from "./wsApi";
import { dbg } from "../utils/debug";

let _client = null;
let _bus = null;
let _api = null;

export function ensureWsStarted() {
  if (!_client) {
    _client = new WsClient();
    _bus = createWsBus({ replay: 32 });
    _api = createWsApi(_client);
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
  _client.setUrl(); // Gets the latest from endpoints.js
  const next = _client.url();
  if (next && next !== prev) {
    dbg.log("ws", "URL updated via listener", { prev, next });
    // The orchestrator is now responsible for initiating connections.
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
export function getWsApi() {
  return ensureWsStarted().api;
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

  // If not open and not connecting, try to connect.
  // This is a safeguard for components that need data while the orchestrator might still be running.
  if (ws.status() === "idle" || ws.status() === "closed") {
    if (ws.url()) { // Only try to connect if a URL is set
        ws.connect();
    }
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