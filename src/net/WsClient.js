// File: src/net/WsClient.js
import { dbg } from "../utils/debug";
import { wsUrl as endpointsWsUrl } from "./endpoints";

/**
 * Pure WebSocket transport.
 * Request:  { id: number, type: string, data: any }
 * Response: { id?: number, type?: string, error?: string, data?: any }
 * Alerts:   { type: string, data?: any }  (no id)
 */
export default class WsClient {
  constructor({ url = "", protocols } = {}) {
    this._url = url || "";
    this._protocols = protocols || undefined;
    this._ws = null;
    this._manualClose = false;

    this._status = "idle"; // idle | connecting | open | closed
    this._attempt = 0;
    this._shouldReconnect = true;
    this._reconnectTid = null;

    this._heartbeatTid = null;
    this._heartbeatMs = 25_000;

    this._sendQueue = [];
    this._pending = new Map(); // id (string) -> { resolve, reject, timer }
    this._nextId = 1;

    this._listeners = new Map();

    this._onOnline = () => this.reconnect("online");
    if (typeof window !== "undefined") {
      window.addEventListener("online", this._onOnline);
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && this._status !== "open") {
          this.reconnect("visible");
        }
      });
    }
  }

  // ─── public API ───────────────────────────────────────────────────────────────
  dispose() {
    this._shouldReconnect = false;
    this._clearReconnect();
    this._stopHeartbeat();
    if (this._ws) {
      try {
        this._ws.close();
      } catch {}
    }
    this._ws = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this._onOnline);
    }
    this._failInflight(new Error("WS disposed"));
    this._emit("status", "closed");
  }

  url() {
    return this._url;
  }
  status() {
    return this._status;
  }
  attempt() {
    return this._attempt;
  }

  setUrl(nextUrl) {
    const source = nextUrl == null ? endpointsWsUrl() : nextUrl;
    const u = String(source || "");
    if (!u) {
      dbg.warn("ws", "No WS URL configured");
      return;
    }
    if (u === this._url) return;
    this._url = u;
    dbg.log("ws", "URL updated", { url: u });
  }

  setAutoReconnect(on) {
    this._shouldReconnect = !!on;
  }

  connect() {
    if (!this._url) return;
    if (
      this._ws &&
      (this._ws.readyState === WebSocket.OPEN ||
        this._ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this._clearReconnect();
    this._setStatus("connecting");
    dbg.log("ws", "Connecting…", { url: this._url });

    try {
      const ws = new WebSocket(this._url, this._protocols);
      this._ws = ws;

      ws.addEventListener("open", () => {
        this._attempt = 0;
        this._setStatus("open");
        dbg.log("ws", "Connected", { url: this._url });
        this._flushQueue();
        this._startHeartbeat();
        this._emit("open");
      });

      ws.addEventListener("message", (ev) => this._onMessage(ev));

      ws.addEventListener("error", (ev) => {
        dbg.warn("ws", "Error", { event: ev });
        this._emit("error", ev);
      });

      ws.addEventListener("close", (ev) => {
        dbg.warn("ws", "Closed", { code: ev.code, reason: ev.reason });
        this._stopHeartbeat();
        this._setStatus("closed");
        this._emit("close", ev);
        this._failInflight(new Error("WS closed"));
        if (this._shouldReconnect && !this._manualClose) {
          this._scheduleReconnect();
        }
        this._manualClose = false; // Reset the flag after handling the close event.
      });
    } catch (e) {
      dbg.error("ws", "Connect exception", e);
      this._setStatus("closed");
      this._scheduleReconnect();
    }
  }

  reconnect(reason = "manual") {
    dbg.log("ws", "Reconnecting…", { reason });
    this._clearReconnect();
    if (this._ws) {
      this._manualClose = true; 
      try { this._ws.close(1000, `reconnect: ${reason}`); } catch {}
    }
    this._ws = null;
    
    this.connect();
  }

  close() {
    this._manualClose = true;
    this._clearReconnect();
    this._stopHeartbeat();
    this._shouldReconnect = false;
    try {
      this._ws && this._ws.close(1000, "client-close");
    } catch {}
    this._ws = null;
    this._setStatus("closed");
    this._failInflight(new Error("WS closed by client"));
  }

  send(data) {
    const open = this._ws && this._ws.readyState === WebSocket.OPEN;
    if (open) this._ws.send(data);
    else this._sendQueue.push(data);
  }
  sendJson(obj) {
    this.send(JSON.stringify(obj));
  }

  /** Backend dialect:
   * send: { id: number, name: "<handler>", data: {...} }
   * ok:   { id, data, [type] }
   * err:  { id, error: "<string>", [type] }
   */
  call(method, params = {}, { timeoutMs = 15_000, id } = {}) {
    const numericId = Number.isFinite(id) ? id : this._nextId++;
    const callId = String(numericId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(callId);
        const err = new Error("WS request timeout");
        err.code = "ETIMEDOUT";
        reject(err);
      }, timeoutMs);

      this._pending.set(callId, { resolve, reject, timer });
      this.sendJson({
        id: numericId,
        type: String(method),
        data: params || {},
      });
    });
  }

  on(type, fn) {
    const key = String(type || "");
    const set = this._listeners.get(key) || new Set();
    set.add(fn);
    this._listeners.set(key, set);
    return () => this.off(key, fn);
  }
  off(type, fn) {
    const set = this._listeners.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this._listeners.delete(type);
  }

  // ─── internals ────────────────────────────────────────────────────────────────
  _setStatus(s) {
    if (this._status !== s) {
      this._status = s;
      this._emit("status", s);
    }
  }

  _emit(type, payload) {
    const set = this._listeners.get(type);
    if (!set || set.size === 0) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (e) {
        dbg.error("ws", "listener error", e);
      }
    }
  }

  _onMessage(ev) {
    let data = ev.data;
    try {
      const obj = JSON.parse(data);

      // Correlated response: match (stringified) id
      if (obj && obj.id != null) {
        const key = String(obj.id);
        const entry = this._pending.get(key);
        if (entry) {
          clearTimeout(entry.timer);
          this._pending.delete(key);

          if (typeof obj.error === "string" && obj.error) {
            const err = new Error(obj.error || "WS error");
            err.code = "WS_ERROR";
            entry.reject(err);
            return;
          }

          if ("data" in obj) {
            entry.resolve(obj.data);
            return;
          }
          // if backend someday returns {result: ...}, accept that too
          if ("result" in obj) {
            entry.resolve(obj.result);
            return;
          }

          entry.resolve(obj);
          return;
        }
      }

      // Alerts / broadcasts: frames with a type and no matching id
      if (obj && obj.type) {
        // forward both the whole obj on "message" and the typed payload
        this._emit(obj.type, obj.data ?? obj);
        this._emit("message", obj);
        return;
      }

      // Fallback
      this._emit("message", obj);
    } catch {
      this._emit("raw", data);
    }
  }

  _flushQueue() {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    while (this._sendQueue.length) {
      const item = this._sendQueue.shift();
      try {
        this._ws.send(item);
      } catch {}
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    if (this._heartbeatMs > 0) {
      this._heartbeatTid = setInterval(() => {
        try {
          if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send('{"type":"ping"}');
          }
        } catch {}
      }, this._heartbeatMs);
    }
  }
  _stopHeartbeat() {
    if (this._heartbeatTid) {
      clearInterval(this._heartbeatTid);
      this._heartbeatTid = null;
    }
  }

  _scheduleReconnect() {
    if (!this._shouldReconnect) return;
    this._attempt += 1;
    const base = 300 * Math.pow(2, this._attempt - 1);
    const jitter = Math.floor(Math.random() * 400);
    const delay = Math.min(10_000, base + jitter);
    dbg.log("ws", "Reconnect scheduled", {
      inMs: delay,
      attempt: this._attempt,
    });
    this._clearReconnect();
    this._reconnectTid = setTimeout(() => this.connect(), delay);
  }
  _clearReconnect() {
    if (this._reconnectTid) {
      clearTimeout(this._reconnectTid);
      this._reconnectTid = null;
    }
  }

  _failInflight(err) {
    if (!this._pending.size) return;
    for (const [, entry] of this._pending) {
      clearTimeout(entry.timer);
      try {
        entry.reject(err);
      } catch {}
    }
    this._pending.clear();
  }
}
