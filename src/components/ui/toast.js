import { createSignal } from "solid-js";

export const [toasts, setToasts] = createSignal([]); // {id, type, message, details, expanded}

let counter = 0;

export function pushToast({ type = "info", message = "", details = null, autohideMs = 5000 }) {
  const id = ++counter;
  const item = { id, type, message: String(message || ""), details, expanded: false };
  setToasts((curr) => [...curr, item]);
  if (autohideMs > 0 && type !== "error") {
    setTimeout(() => dismissToast(id), autohideMs);
  }
  return id;
}

export function dismissToast(id) {
  setToasts((curr) => curr.filter((t) => t.id !== id));
}

export function toggleToast(id) {
  setToasts((curr) =>
    curr.map((t) => (t.id === id ? { ...t, expanded: !t.expanded } : t))
  );
}

/** Convenience: turn any Error (or unknown) into a compact, useful details object */
export function errorDetails(err, extra = {}) {
  if (!err) return extra || {};
  const base = {
    name: err.name,
    message: err.message,
    code: err.code,
    type: err.type,
    status: err.status,
    stack: err.stack,
    cause: err.cause && typeof err.cause === "object" ? {
      name: err.cause.name,
      message: err.cause.message,
      code: err.cause.code,
      status: err.cause.status,
    } : undefined,
  };
  // Some of our code throws {causes: Error[]} arrays (e.g., IPFS gateway fallbacks)
  if (Array.isArray(err.causes)) {
    base.causes = err.causes.map((e) => ({
      name: e?.name,
      message: e?.message,
      code: e?.code,
      status: e?.status,
    }));
  }
  // Merge caller-provided context (like URL, gateway, endpoint)
  return { ...base, ...extra };
}

/** push an error toast with extracted details */
export function pushErrorToast(err, context = {}) {
  return pushToast({
    type: "error",
    message: err?.message || "Unexpected error",
    details: errorDetails(err, context),
    autohideMs: 0, // errors stay until closed
  });
}
