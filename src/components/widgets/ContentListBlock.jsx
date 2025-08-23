// src/components/widgets/ContentListBlock.jsx
import { createMemo, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader.js";

/**
 * Selects the best title string from a locale object.
 * Logic: current lang -> '*' -> 'en' -> first available.
 */
function getLocalizedTitle(titleData, currentLang) {
    if (!titleData || typeof titleData !== 'object') return "";
    
    // 1. Current language
    if (titleData[currentLang]) return titleData[currentLang];
    // 2. Wildcard fallback
    if (titleData['*']) return titleData['*'];
    // 3. English fallback
    if (titleData.en) return titleData.en;
    // 4. First available fallback
    const firstKey = Object.keys(titleData)[0];
    return firstKey ? titleData[firstKey] : "";
}

export default function ContentListBlock(props) {
  const app = useApp();

  // 1. Get the path to the content_lists module from the main domain config.
  const modulePath = createMemo(() => app.domainAssetsConfig?.()?.modules?.content_lists);

  // 2. Fetch and parse the content_lists module file.
  const [contentListModule] = createResource(modulePath, async (path) => {
    if (!path) return null;
    try {
      return await loadAssetResource(app, path, { type: 'yaml' });
    } catch (e) {
      console.error(`Failed to load content list module from ${path}`, e);
      return null;
    }
  });
  
  // 3. Find the specific list definition using the list_name from props.
  const listDefinition = createMemo(() => {
    const listName = props.block?.list_name;
    if (!listName) return null;
    return contentListModule()?.list?.[listName] || null;
  });

  // 4. Extract the localized title from the definition.
  const title = createMemo(() => {
    const def = listDefinition();
    return getLocalizedTitle(def?.title, app.lang());
  });

  return (
    <div class="p-3">
      <h4 class="font-semibold text-sm mb-2">{title() || props.block?.list_name}</h4>
      <div class="text-xs text-[hsl(var(--muted-foreground))]">
        Content feed placeholder...
      </div>
    </div>
  );
}