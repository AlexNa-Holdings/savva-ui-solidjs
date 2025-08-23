// src/utils/net.js
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
      // Change 'no-store' to 'force-cache' for aggressive caching of immutable assets.
      cache: "force-cache",
    });
  } finally {
    clearTimeout(timer);
  }
}
