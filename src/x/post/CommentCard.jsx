// src/x/post/CommentCard.jsx
import { For, Show, createMemo, createSignal, createResource, Switch, Match, createEffect } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { useApp } from "../../context/AppContext.jsx";
import PostInfo from "./PostInfo.jsx";
import UserCard from "../ui/UserCard.jsx";
import MarkdownView from "../docs/MarkdownView.jsx";
import { ipfs } from "../../ipfs/index.js";
import { getPostContentBaseCid } from "../../ipfs/utils.js";
import { fetchDescriptorWithFallback } from "../../ipfs/fetchDescriptorWithFallback.js";
import Spinner from "../ui/Spinner.jsx";
import ContextMenu from "../ui/ContextMenu.jsx";
import { getPostAdminItems } from "../../ui/contextMenuBuilder.js";
import { navigate } from "../../routing/hashRouter.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { EditIcon, TrashIcon } from "../ui/icons/ActionIcons.jsx";
import { useDeleteAction } from "../../hooks/useDeleteAction.js";
import { parse } from "yaml";
import ReactionInput from "./ReactionInput.jsx";
import useUserProfile, { selectField } from "../profile/userProfileStore.js";

async function fetchFullContent(params) {
  const { app, comment, lang } = params;
  if (!comment || !lang) return "";

  try {
    const { descriptor } = await fetchDescriptorWithFallback(app, comment);
    if (!descriptor) throw new Error(app.t("comment.parseDescriptorFailed"));

    const dataCidForContent = getPostContentBaseCid(comment);
    const localizedDescriptor =
      descriptor.locales?.[lang] ||
      descriptor.locales?.en ||
      descriptor.locales?.[Object.keys(descriptor.locales || {})[0]];
    const dataPath = localizedDescriptor?.data_path;

    if (!dataCidForContent || !dataPath) {
      return localizedDescriptor?.text_preview || "";
    }

    const fullIpfsPath = `${dataCidForContent}/${dataPath}`;
    const postGateways = descriptor?.gateways || [];
    const { res: contentRes } = await ipfs.fetchBest(app, fullIpfsPath, { postGateways });
    return await contentRes.text();
  } catch (e) {
    console.error("Failed to fetch full comment content:", e);
    return `## ${app.t("docs.errorLoadingContent")}\n\n\`\`\`\n${e.message}\n\`\`\``;
  }
}

export default function CommentCard(props) {
  const app = useApp();
  const { t } = app;
  const level = () => props.level || 0;

  const [isExpanded, setIsExpanded] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const [isPreparing, setIsPreparing] = createSignal(false);

  const [comment, setComment] = createStore(props.comment);

  createEffect(() => {
    const update = app.postUpdate();
    if (!update || update.cid !== comment.savva_cid) return;

    if (update.type === "reactionsChanged") {
      setComment("reactions", reconcile(update.data.reactions));
      if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
        setComment("my_reaction", update.data.reaction);
      }
    }
  });

  const { showConfirm, openConfirm, closeConfirm, confirmDelete, modalProps } = useDeleteAction(() => comment);

  const isAuthor = createMemo(() => {
    const userAddr = app.authorizedUser()?.address?.toLowerCase();
    const authorAddr = comment?.author?.address?.toLowerCase();
    return !!userAddr && userAddr === authorAddr;
  });

  const localizedPreview = createMemo(() => {
    const locales = comment.savva_content?.locales;
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
      app,
      comment,
      lang: app.lang(),
    }),
    async (params) => (params.shouldFetch ? fetchFullContent(params) : null)
  );

  const contextMenuItems = createMemo(() => (comment ? getPostAdminItems(comment, t) : []));

  const needsTruncation = createMemo(() => {
    const preview = localizedPreview();
    return preview.endsWith("...");
  });

  const ipfsBaseUrl = createMemo(() => {
    if (!comment) return "";
    const dataCid = getPostContentBaseCid(comment);
    if (!dataCid) return "";

    let bestGateway;
    if (app.localIpfsEnabled() && app.localIpfsGateway()) bestGateway = app.localIpfsGateway();
    else if (Array.isArray(comment.gateways) && comment.gateways.length > 0) bestGateway = comment.gateways[0];
    else bestGateway = app.remoteIpfsGateways()[0] || "https://ipfs.io/";

    return ipfs.buildUrl(bestGateway, dataCid);
  });

  const markdownPlugins = createMemo(() => [[rehypeRewriteLinks, { base: ipfsBaseUrl() }]]);

  const handleReply = (e) => {
    e.stopPropagation();
    const commentCid = comment?.savva_cid;
    if (commentCid) navigate(`/editor/new-comment/${commentCid}`);
  };

  const handleEdit = async (e) => {
    e.stopPropagation();
    setIsPreparing(true);
    try {
      await preparePostForEditing(comment, app);
      navigate(`/editor/comment/${comment.savva_cid}`);
    } catch (err) {
      pushErrorToast(err, { context: t("comment.prepareEditFailed") });
    } finally {
      setIsPreparing(false);
    }
  };

  // --- NSFW (mirrors PostCard logic) ---
  const { dataStable: profile } = useUserProfile();
  const nsfwPref = createMemo(() => selectField(profile(), "nsfw") ?? selectField(profile(), "prefs.nsfw") ?? "h");  // default 'h'
  const commentIsNsfw = createMemo(() => !!(comment?.nsfw || comment?.savva_content?.nsfw));                        // flag from raw or content
  const shouldHide = createMemo(() => commentIsNsfw() && nsfwPref() === "h");
  const shouldWarn = createMemo(() => commentIsNsfw() && nsfwPref() === "w");
  const [revealed, setRevealed] = createSignal(false);

  return (
    <div
      class="relative flex flex-col"
      style={{ "padding-left": level() > 0 ? "1.5rem" : "0" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
        <div class="pointer-events-none absolute top-2 right-2 z-20">
          <div class="pointer-events-auto">
            <Show when={isHovered()}>
              <ContextMenu
                items={contextMenuItems()}
                positionClass="relative z-20"
                class="p-1 rounded-md bg-[hsl(var(--background))]/80 backdrop-blur-[2px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              />
            </Show>
          </div>
        </div>
      </Show>

      {/* Hard-hide state */}
      <Show when={shouldHide()}>
        <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <h3 class="font-semibold">{t("post.nsfw.hidden.title")}</h3>
          <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">{t("post.nsfw.hidden.message")}</p>
        </div>
      </Show>

      {/* Normal / warn states */}
      <Show when={!shouldHide()}>
        <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div class="mb-2">
            <UserCard author={comment.author} compact={false} />
          </div>

          <div class="text-sm prose prose-sm max-w-none relative rounded-[inherit]">
            {/* Image-free, center warning overlay covering the text block */}
            <Show when={shouldWarn() && !revealed()}>
              <div
                class="absolute inset-0 rounded-[inherit] z-20 flex items-center justify-center"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <div class="absolute inset-0 rounded-[inherit] bg-[hsl(var(--card))]/80 backdrop-blur-md" />
                <div class="relative z-10 flex flex-col items-center gap-3 text-center px-4">
                  <div class="text-sm text-[hsl(var(--muted-foreground))]">{t("nsfw.cover.warning")}</div>
                  <button
                    type="button"
                    class="px-3 py-1.5 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
                    onClick={() => setRevealed(true)}
                  >
                    {t("nsfw.cover.show")}
                  </button>
                </div>
              </div>
            </Show>

            <Switch>
              <Match when={isExpanded() && fullContent?.loading}>
                <div class="flex items-center justify-center h-24">
                  <Spinner />
                </div>
              </Match>
              <Match when={isExpanded() && fullContent()}>
                <MarkdownView markdown={fullContent() || ""} rehypePlugins={markdownPlugins()} />
              </Match>
              <Match when={!isExpanded()}>
                <MarkdownView markdown={localizedPreview()} rehypePlugins={markdownPlugins()} />
              </Match>
            </Switch>
          </div>

          <div class="mt-2 flex items-center justify-between">
            <PostInfo item={{ _raw: comment }} hideTopBorder={true} timeFormat="long" hideActions={true} />
            <div class="flex items-center gap-2 text-xs font-semibold flex-shrink-0 whitespace-nowrap">
              <Show when={app.authorizedUser()}>
                <ReactionInput post={comment} />
              </Show>
              <Show when={isAuthor()}>
                <button class="p-1" onClick={handleEdit} disabled={isPreparing()} title={t("comment.edit")}>
                  <Show
                    when={isPreparing()}
                    fallback={<EditIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]" />}
                  >
                    <Spinner class="w-4 h-4" />
                  </Show>
                </button>
                <button
                  class="p-1"
                  onClick={openConfirm}
                  disabled={modalProps().isDeleting}
                  title={t("comment.delete")}
                >
                  <TrashIcon class="w-4 h-4 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]" />
                </button>
              </Show>
              <Show when={needsTruncation() || isExpanded()}>
                <button class="hover:underline" onClick={() => setIsExpanded(!isExpanded())}>
                  {isExpanded() ? t("comment.showLess") : t("comment.showMore")}
                </button>
              </Show>
              <button class="hover:underline" onClick={handleReply}>{t("comment.reply")}</button>
            </div>
          </div>

          <Show when={comment.children?.length > 0}>
            <div class="mt-3 space-y-3 border-l-2 border-[hsl(var(--border))]">
              <For each={comment.children}>{(reply) => <CommentCard comment={reply} level={level() + 1} />}</For>
            </div>
          </Show>

          <ConfirmModal isOpen={showConfirm()} onClose={closeConfirm} onConfirm={confirmDelete} {...modalProps()} />
        </div>
      </Show>
    </div>
  );
}
