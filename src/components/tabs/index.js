// src/components/tabs/index.js
import LeadersTab from "./LeadersTab";
import ActualTab from "./ActualTab";
import CommentsTab from "./CommentsTab";
import NewTab from "./NewTab";
import ForYouTab from "./ForYouTab";

const REGISTRY = {
  leaders: LeadersTab,
  actual: ActualTab,
  comments: CommentsTab,
  new: NewTab,
  "for-you": ForYouTab,
  foryou: ForYouTab,
};

export function getTabComponent(type) {
  const key = String(type || "").toLowerCase();
  return REGISTRY[key] || null;
}
