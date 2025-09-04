// src/x/tabs/index.js
import ActualTab from "./ActualTab.jsx";
import CommentsTab from "./CommentsTab.jsx";
import ForYouTab from "./ForYouTab.jsx";
import LeadersTab from "./LeadersTab.jsx";
import NewTab from "./NewTab.jsx";

/**
 * Registry of tab type -> component.
 * Add more mappings as you implement new tab types.
 */
const REGISTRY = {
  actual: ActualTab,
  comments: CommentsTab,
  "for-you": ForYouTab,
  leaders: LeadersTab,
  new: NewTab,
};

export function getTabComponent(type) {
  const key = String(type || "").toLowerCase();
  return REGISTRY[key] || null;
}