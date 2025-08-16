// src/utils/net.js
// ^^^ one single source of truth
export async function fetchWithTimeout(
  url,
  { timeoutMs = 7000, method = "GET", headers, signal, body } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    timeoutMs
  );
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  try {
    return await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}
