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
import { navigate } from "../../routing/hashRouter.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import { dbg } from "../../utils/debug.js"; 

function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class={props.class || "w-5 h-5"} fill="currentColor">
      <path d="M20.71,3.29a2.91,2.91,0,0,0-2.2-.84,3.25,3.25,0,0,0-2.17,1L9.46,10.29s0,0,0,0a.62.62,0,0,0-.11.17,1,1,0,0,0-.1.18l0,0,L8,14.72A1,1,0,0,0,9,16a.9.9,0,0,0,.28,0l4-1.17,0,0,.18-.1a.62.62,0,0,0,.17-.11l0,0,6.87-6.88a3.25,3.25,0,0,0,1-2.17A2.91,2.91,0,0,0,20.71,3.29Z"></path>
      <path d="M20,22H4a2,2,0,0,1-2-2V4A2,2,0,0,1,4,2h8a1,1,0,0,1,0,2H4V20H20V12a1,1,0,0,1,2,0v8A2,2,0,0,1,20,22Z"></path>
    </svg>
  );
}

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
  const [isPreparing, setIsPreparing] = createSignal(false);

  const isAuthor = createMemo(() => {
    const userAddr = app.authorizedUser()?.address?.toLowerCase();
    const authorAddr = comment()?.author?.address?.toLowerCase();
    return !!userAddr && userAddr === authorAddr;
  });

  const localizedPreview = createMemo(() => {
    const locales = comment().savva_content?.locales;
    if (!locales) return "";
    const lang = app.lang();
    if (locales[lang]?.text_preview) return locales[lang].text_preview;
    if (locales.en?.text_preview) return locales.en.text_preview;
    const firstKey = Object.keys(locales)[0];
    return firstKey ? locales[firstKey].text_preview : "";
  });

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

  const needsTruncation = createMemo(() => {
    const preview = localizedPreview();
    return preview.endsWith("...");
  });

  const ipfsBaseUrl = createMemo(() => {
    const c = comment();
    if (!c) return "";
    const dataCid = getPostContentBaseCid(c);
    if (!dataCid) return "";
    
    let bestGateway;
    if (app.localIpfsEnabled() && app.localIpfsGateway()) {
      bestGateway = app.localIpfsGateway();
    } else if (Array.isArray(c.gateways) && c.gateways.length > 0) {
      bestGateway = c.gateways[0];
    } else {
      bestGateway = app.remoteIpfsGateways()[0] || "https://ipfs.io/";
    }
    
    const gatewayUrl = bestGateway.endsWith("/") ? bestGateway : `${bestGateway}/`;
    return `${gatewayUrl}ipfs/${dataCid}`;
  });

  const markdownPlugins = createMemo(() => [
    [rehypeRewriteLinks, { base: ipfsBaseUrl() }]
  ]);

  const handleReply = (e) => {
    e.stopPropagation();
    const commentCid = comment()?.savva_cid;
    if (commentCid) {
      navigate(`/editor/new-comment/${commentCid}`);
    }
  };

  const handleEdit = async (e) => {
    e.stopPropagation();
    setIsPreparing(true);
    try {
      dbg.log("CommentCard:handleEdit", "Original comment object:", comment()); // <<< ADD THIS LINE
      await preparePostForEditing(comment(), app);
      navigate(`/editor/comment/${comment().savva_cid}`);
    } catch (err) {
      pushErrorToast(err, { context: "Failed to prepare comment for editing." });
    } finally {
      setIsPreparing(false);
    }
  };

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
        
        <div class="text-sm prose prose-sm max-w-none">
          <Switch>
            <Match when={isExpanded() && fullContent.loading}>
              <div class="flex items-center justify-center h-24">
                <Spinner />
              </div>
            </Match>
            <Match when={isExpanded() && fullContent()}>
              <MarkdownView markdown={fullContent()} rehypePlugins={markdownPlugins()} />
            </Match>
            <Match when={!isExpanded()}>
              <MarkdownView markdown={localizedPreview()} rehypePlugins={markdownPlugins()} />
            </Match>
          </Switch>
        </div>

        <div class="mt-2 flex items-center justify-between">
          <PostInfo item={{ _raw: comment() }} hideTopBorder={true} />
          <div class="flex items-center gap-4 text-xs font-semibold">
            <Show when={isAuthor()}>
              <button class="p-1" onClick={handleEdit} disabled={isPreparing()} title="Edit Comment">
                <Show when={isPreparing()} fallback={<EditIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" />}>
                  <Spinner class="w-4 h-4" />
                </Show>
              </button>
            </Show>
            <Show when={needsTruncation() || isExpanded()}>
              <button class="hover:underline" onClick={() => setIsExpanded(!isExpanded())}>
                {isExpanded() ? "Show Less" : "Show More"}
              </button>
            </Show>
            <button class="hover:underline" onClick={handleReply}>Reply</button>
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