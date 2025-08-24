// src/net/wsRuntime.js
import WsClient from "./WsClient";
import { wsUrl } from "./endpoints";
import { createWsBus } from "./wsBus";
import { createWsApi } from "./wsApi";
import { dbg } from "../utils/debug";

let _client = null;
let _bus = null;
let _api = null;
let _started = false;

export function ensureWsStarted(reason = "init") {
  if (!_client) {
    _client = new WsClient();
    _bus = createWsBus({ replay: 32 });
    _api = createWsApi(_client);
    _client.on("message", (obj) => {
      const t = obj && (obj.type || obj.event);
      if (t) _bus.emit(String(t), obj);
    });
  }
  _client.setUrl();
  const url = _client.url();
  if (!url) {
    dbg.warn("ws", "No WS URL configured");
    return { client: _client, bus: _bus, api: _api };
  }
  if (_client.status() !== "open" && !_started) {
    _client.connect();
    _started = true;
    dbg.log("ws", "singleton connect", { url, reason });
  }
  return { client: _client, bus: _bus, api: _api };
}

function onEndpointsUpdate() {
  if (!_client) return;
  const prev = _client.url();
  _client.setUrl();
  const next = _client.url();
  if (next && next !== prev) {
    dbg.log("ws", "singleton endpoints changed → reconnect", { prev, next });
    _client.reconnect("endpoints-updated");
  } else if (next && _client.status() !== "open") {
    _client.connect();
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("savva:endpoints-updated", onEndpointsUpdate);
  window.__ws = {
    get client() {
      return _client;
    },
    get bus() {
      return _bus;
    },
    get api() {
      return _api;
    },
    start: ensureWsStarted,
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
