// src/components/widgets/HtmlBlock.jsx
import { createMemo, createResource } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { loadAssetResource } from "../../utils/assetLoader";

/**
 * Selects the best path from a block's locale object.
 * Logic: current lang -> '*' -> 'en' -> first available.
 */
function getLocalizedPath(block, currentLang) {
  if (!block || typeof block !== 'object') return null;
  
  if (block[currentLang]) return block[currentLang];
  if (block['*']) return block['*'];
  if (block.en) return block.en;
  
  // Fallback to the first key that isn't 'type'
  const fallbackKey = Object.keys(block).find(k => k !== 'type');
  return fallbackKey ? block[fallbackKey] : null;
}

export default function HtmlBlock(props) {
  const app = useApp();
  const path = createMemo(() => getLocalizedPath(props.block, app.lang()));
  
  const [htmlContent] = createResource(path, async (p) => {
    if (!p) return "";
    try {
      return await loadAssetResource(app, p, { type: 'text' });
    } catch (e) {
      console.error(`Failed to load HTML block from ${p}`, e);
      return `<p class="text-red-500">Error loading content.</p>`;
    }
  });

  return (
    <div class="p-3 text-sm space-y-2" innerHTML={htmlContent() || ""} />
  );
}