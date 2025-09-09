// src/ui/toast.js
import { createSignal } from "solid-js";

export const [toasts, setToasts] = createSignal([]);

let counter = 0;

export function pushToast({ type = "info", message = "", details = null, autohideMs = 15000, bodyComponent = null, bodyProps = {} }) {
  const id = ++counter;
  const item = { id, type, message: String(message || ""), details, expanded: false, bodyComponent, bodyProps };
  setToasts((curr) => [...curr, item]);

  if (autohideMs > 0) {
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
  
  if (Array.isArray(err.causes)) {
    base.causes = err.causes.map((e) => ({
      name: e?.name,
      message: e?.message,
      code: e?.code,
      status: e?.status,
      url: e?.url 
    }));
  }
  
  return { ...base, ...extra };
}

export function pushErrorToast(err, context = {}) {
  return pushToast({
    type: "error",
    message: err?.message || "Unexpected error",
    details: errorDetails(err, context),
    autohideMs: 10000,
  });
}
