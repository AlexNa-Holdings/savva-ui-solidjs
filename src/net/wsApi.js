// File: src/net/wsApi.js
// Thin helper over WsClient for JSON-RPC-like calls and simple method sugar.

export function createWsApi(wsClient) {
  function call(method, params = {}, opts) {
    return wsClient.call(String(method), params, opts);
  }

  // Sugar: api.method("get-user") returns (...args) => call("get-user", ...mergedParams)
  function method(name, fixedParams = {}) {
    const m = String(name);
    return (params = {}, opts) => call(m, { ...fixedParams, ...params }, opts);
  }

  // Optional: define a few common factories here as you add them over time.
  const api = { call, method };

  return api;
}
