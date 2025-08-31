// src/hooks/useDomainCategories.js
import { createMemo, createResource } from "solid-js";
import { loadAssetResource } from "../utils/assetLoader.js";

export function useDomainCategories(app) {
  const cfg = () => app.domainAssetsConfig?.();
  const relPath = createMemo(() => cfg()?.modules?.categories || null);
  const lang = () => (app.lang?.() || "en").toLowerCase();
  const params = createMemo(() => ({ rel: relPath(), lang: lang() }));
  
  const [cats] = createResource(params, async ({ rel, lang }) => {
    if (!rel) return [];
    try {
      const data = await loadAssetResource(app, rel, { type: "yaml" });
      const listByLang = data?.locales?.[lang] || data?.locales?.en || [];
      return (Array.isArray(listByLang) ? listByLang : []).map(String);
    } catch (err) {
      console.error(`Failed to load categories from ${rel}:`, err);
      return [];
    }
  });
  return cats;
}