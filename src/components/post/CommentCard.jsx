// src/components/post/CommentCard.jsx
import { For, Show, createMemo, createSignal, createResource, Switch, Match } from "solid-js";
import { useApp } from "../../context/AppContext";
import PostInfo from "../feed/PostInfo";
import UserCard from "../ui/UserCard";
import MarkdownView from "../docs/MarkdownView";
import { ipfs } from "../../ipfs";
import { getPostContentBaseCid } from "../../ipfs/utils";
import Spinner from "../ui/Spinner";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";

/**
 * Fetches the full content of a comment's prologue for a specific language.
 */
async function fetchFullContent(params) {
  const { app, comment, lang } = params;
  if (!comment || !lang) return "";

  const locales = comment.savva_content?.locales;
  const currentLocale = locales?.[lang] || locales?.en || locales?.[Object.keys(locales)[0]];
  
  const dataPath = currentLocale?.data_path;
  if (!dataPath) return currentLocale?.text_preview || ""; // Fallback to preview if no path

  const baseCid = getPostContentBaseCid(comment);
  if (!baseCid) return "";

  const fullIpfsPath = `${baseCid}/${dataPath}`;
  
  try {
    const { res } = await ipfs.fetchBest(app, fullIpfsPath, { postGateways: comment.gateways });
    return await res.text();
  } catch (e) {
    console.error("Failed to fetch full comment content:", e);
    return `Error: Could not load content.`;
  }
}

export default function CommentCard(props) {
  const app = useApp();
  const { t } = app;
  const comment = () => props.comment;
  const level = () => props.level || 0;
  
  const [isExpanded, setIsExpanded] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);

  // Memo for the truncated preview content
  const localizedPreview = createMemo(() => {
    const locales = comment().savva_content?.locales;
    if (!locales) return "";
    const lang = app.lang();
    if (locales[lang]?.text_preview) return locales[lang].text_preview;
    if (locales.en?.text_preview) return locales.en.text_preview;
    const firstKey = Object.keys(locales)[0];
    return firstKey ? locales[firstKey].text_preview : "";
  });

  // Resource to fetch full content only when expanded
  const [fullContent] = createResource(
    () => ({
      shouldFetch: isExpanded(),
      app: app,
      comment: comment(),
      lang: app.lang()
    }),
    async (params) => {
      if (!params.shouldFetch) return null;
      return fetchFullContent(params);
    }
  );

  const contextMenuItems = createMemo(() => {
    if (!comment()) return [];
    return getPostAdminItems(comment(), t);
  });

  // Determine if the "Show More" button should be visible
  const needsTruncation = createMemo(() => {
    const preview = localizedPreview();
    return preview.length > 280 || preview.endsWith("...");
  });

  return (
    <div
      class="relative flex flex-col"
      style={{ "padding-left": level() > 0 ? "1.5rem" : "0" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div class="mb-2">
          <UserCard author={comment().author} compact={false} />
        </div>
        
        <div 
          class="text-sm prose prose-sm max-w-none transition-all duration-300 overflow-hidden"
          classList={{ 
            "max-h-24": !isExpanded(), 
            "max-h-[1000px]": isExpanded() 
          }}
        >
          <Switch>
            <Match when={isExpanded() && fullContent.loading}>
              <div class="flex items-center justify-center h-24">
                <Spinner />
              </div>
            </Match>
            <Match when={isExpanded() && fullContent()}>
              <MarkdownView markdown={fullContent()} />
            </Match>
            <Match when={!isExpanded()}>
              <MarkdownView markdown={localizedPreview()} />
            </Match>
          </Switch>
        </div>

        <div class="mt-2 flex items-center justify-between">
          <PostInfo item={{ _raw: comment() }} hideTopBorder={true} />
          <div class="flex items-center gap-4 text-xs font-semibold">
            <Show when={needsTruncation() || isExpanded()}>
              <button class="hover:underline" onClick={() => setIsExpanded(!isExpanded())}>
                {isExpanded() ? "Show Less" : "Show More"}
              </button>
            </Show>
            <button class="hover:underline">Reply</button>
          </div>
        </div>
      </div>
      
      <Show when={app.authorizedUser()?.isAdmin && isHovered() && contextMenuItems().length > 0}>
        <div class="context-menu-container">
          <ContextMenu items={contextMenuItems()} />
        </div>
      </Show>
      
      <Show when={comment().children?.length > 0}>
        <div class="mt-3 space-y-3 border-l-2 border-[hsl(var(--border))]">
          <For each={comment().children}>
            {(reply) => <CommentCard comment={reply} level={level() + 1} />}
          </For>
        </div>
      </Show>
    </div>
  );
}