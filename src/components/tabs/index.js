// src/components/tabs/index.js
import NILTab from "./NILTab.jsx";
import NewTab from "./NewTab.jsx";

/**
 * Registry of tab type -> component.
 * Add more mappings as you implement new tab types.
 */
const REGISTRY = {
  nil: NILTab,
  new: NewTab,
  "for-you": null, // example: not implemented yet
  leaders: null,
  actual: null,
  comments: null,
};

export function getTabComponent(type) {
  const key = String(type || "").toLowerCase();
  return REGISTRY[key] || null;
}
