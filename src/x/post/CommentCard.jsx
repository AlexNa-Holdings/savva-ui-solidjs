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
import { navigate } from "../../routing/smartRouter.js";
import { rehypeRewriteLinks } from "../../docs/rehype-rewrite-links.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import { EditIcon, TrashIcon } from "../ui/icons/ActionIcons.jsx";
import { useDeleteAction } from "../../hooks/useDeleteAction.js";
import ReactionInput from "./ReactionInput.jsx";
import useUserProfile, { selectField } from "../profile/userProfileStore.js";
import { canDecryptPost, decryptPostMetadata } from "../crypto/postDecryption.js";
import { setEncryptedPostContext, clearEncryptedPostContext, fetchBestWithDecryption } from "../../ipfs/encryptedFetch.js";
import { swManager } from "../crypto/serviceWorkerManager.js";
import { dbg } from "../../utils/debug.js";
import { loadNsfwPreference } from "../preferences/storage.js";

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

    if (!dataCidForContent || !dataPath) return localizedDescriptor?.text_preview || "";

    const fullIpfsPath = `${dataCidForContent}/${dataPath}`;
    const postGateways = descriptor?.gateways || [];

    // Use fetchBestWithDecryption to automatically decrypt encrypted comment content
    const { res: contentRes } = await fetchBestWithDecryption(app, fullIpfsPath, { postGateways });
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

  // Actor-aware: re-compute on actor switch (self/NPO)
  const actorAddress = createMemo(() => app.actorAddress?.() || app.authorizedUser?.()?.address || "");

  const [isExpanded, setIsExpanded] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);
  const [isPreparing, setIsPreparing] = createSignal(false);

  // Always have an object to write into; keep it synced with props, with default _raw
  const [comment, setComment] = createStore(props.comment ?? { _raw: {} });
  createEffect(() => {
    setComment(reconcile({ _raw: {}, ...(props.comment ?? {}) }));
  });

  // Encryption handling
  const isEncrypted = createMemo(() => !!(comment?.savva_content?.encrypted && !comment?._decrypted));
  const userAddress = createMemo(() => app.authorizedUser()?.address);

  const canDecrypt = createMemo(() => {
    if (!isEncrypted()) return false;
    const addr = userAddress();
    if (!addr) return false;
    const encData = comment?.savva_content?.encryption;
    if (!encData) return false;
    return canDecryptPost(addr, encData);
  });

  // Auto-decrypt if we have the key stored
  createEffect(async () => {
    if (!isEncrypted() || comment?._decrypted) return;
    if (!canDecrypt()) return;

    try {
      const addr = userAddress();
      const decrypted = await decryptPostMetadata(comment, addr);

      // Update the comment with decrypted data
      setComment(reconcile({ ...comment, ...decrypted, _decrypted: true }));

      // Set encrypted post context for image decryption (both blob-based and Service Worker)
      if (decrypted._postSecretKey) {
        const dataCid = getPostContentBaseCid(comment);
        if (dataCid) {
          // Set context for blob-based decryption fallback
          setEncryptedPostContext({
            dataCid,
            postSecretKey: decrypted._postSecretKey
          });

          // Also set context in Service Worker for streaming decryption of images
          swManager.setEncryptionContext(dataCid, decrypted._postSecretKey).catch(err => {
            console.warn('[CommentCard] Failed to set SW encryption context:', err);
            // Fallback to blob-based decryption will still work
          });

          dbg.log("CommentCard", "Set encrypted comment context for image decryption", { dataCid });
        }
      }

      console.log("Comment decrypted successfully");
    } catch (error) {
      console.error("Failed to auto-decrypt comment:", error);
    }
  });

  // Encrypted content cover
  const shouldCoverEncrypted = createMemo(() => isEncrypted() && !canDecrypt());

  // Live updates (author/post banned/unbanned, reactions)
  let lastPostUpdate;

  createEffect(() => {
    const update = app.postUpdate?.();
    if (!update || update === lastPostUpdate) return;
    lastPostUpdate = update;

    // Author-level updates
    if (update.type === "authorBanned" || update.type === "authorUnbanned") {
      const my = (comment.author?.address || comment?._raw?.author?.address || "").toLowerCase();
      const uaddr = String(update.author || "").toLowerCase();
      if (my && my === uaddr) {
        const v = update.type === "authorBanned";
        setComment("author_banned", v);
        setComment("_raw", (p) => ({ ...(p || {}), author_banned: v }));
      }
      return;
    }

    // Post-level updates (match by savva_cid/id, case-insensitive)
    const myCid = String(
      comment?.savva_cid || comment?.id || comment?._raw?.savva_cid || comment?._raw?.id || ""
    ).toLowerCase();
    const uCid = String(update.cid || "").toLowerCase();
    if (!myCid || uCid !== myCid) return;

    if (update.type === "postBanned") {
      setComment("banned", true);
      setComment("_raw", (p) => ({ ...(p || {}), banned: true }));
    } else if (update.type === "postUnbanned") {
      setComment("banned", false);
      setComment("_raw", (p) => ({ ...(p || {}), banned: false }));
    } else if (update.type === "reactionsChanged") {
      setComment("reactions", reconcile(update.data.reactions));
      if (app.authorizedUser()?.address?.toLowerCase() === update.data?.user?.toLowerCase()) {
        setComment("my_reaction", update.data.reaction);
      }
    }
  });

  const { showConfirm, openConfirm, closeConfirm, confirmDelete, modalProps } = useDeleteAction(() => comment);

  // Author check is actor-aware
  const isAuthor = createMemo(() => {
    const actor = actorAddress()?.toLowerCase() || "";
    const authorAddr = comment?.author?.address?.toLowerCase() || "";
    return !!actor && actor === authorAddr;
  });

  const localizedPreview = createMemo(() => {
    const locales = comment.savva_content?.locales;
    if (!locales) return "";
    const l = app.lang();
    if (locales[l]?.text_preview) return locales[l].text_preview;
    if (locales.en?.text_preview) return locales.en.text_preview;
    const firstKey = Object.keys(locales)[0];
    return firstKey ? locales[firstKey].text_preview : "";
  });

  const [fullContent] = createResource(
    () => ({ shouldFetch: isExpanded(), app, comment, lang: app.lang() }),
    async (params) => (params.shouldFetch ? fetchFullContent(params) : null)
  );

  const contextMenuItems = createMemo(() => (comment ? getPostAdminItems(comment, t) : []));
  const needsTruncation = createMemo(() => localizedPreview().endsWith("..."));

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
    const commentCid = comment?.savva_cid || comment?._raw?.savva_cid;
    if (commentCid) navigate(`/editor/new-comment/${commentCid}`);
  };

  const handleEdit = async (e) => {
    e.stopPropagation();
    setIsPreparing(true);
    try {
      await preparePostForEditing(comment, app);
      navigate(`/editor/comment/${comment.savva_cid || comment?._raw?.savva_cid}`);
    } catch (err) {
      pushErrorToast(err, { context: t("comment.prepareEditFailed") });
    } finally {
      setIsPreparing(false);
    }
  };

  // NSFW
  const nsfwPref = createMemo(() => loadNsfwPreference());
  const commentIsNsfw = createMemo(() => !!(comment?.nsfw || comment?.savva_content?.nsfw));
  const shouldHide = createMemo(() => commentIsNsfw() && nsfwPref() === "h");
  const shouldWarn = createMemo(() => commentIsNsfw() && nsfwPref() === "w");
  const [revealed, setRevealed] = createSignal(false);

  // Banned flags (render)
  const isBanned = createMemo(() => !!(comment?.banned || comment?._raw?.banned));
  const isAuthorBanned = createMemo(
    () => !!(comment?.author_banned || comment?._raw?.author_banned || comment?.author?.banned || comment?._raw?.author?.banned)
  );

  return (
    <div
      class="relative flex flex-col"
      style={{ "padding-left": level() > 0 ? "1.5rem" : "0" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Show when={app.authorizedUser()?.isAdmin && contextMenuItems().length > 0}>
        <div class="pointer-events-none absolute top-2 right-2 z-40">
          <div class="pointer-events-auto">
            <Show when={isHovered()}>
              <ContextMenu
                items={contextMenuItems()}
                positionClass="relative z-40"
                buttonClass="p-1 rounded-md bg-[hsl(var(--background))]/80 backdrop-blur-[2px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
              />
            </Show>
          </div>
        </div>
      </Show>

      {/* NSFW hard-hide */}
      <Show when={shouldHide()}>
        <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <h3 class="font-semibold">{t("post.nsfw.hidden.title")}</h3>
          <p class="text-sm mt-1 text-[hsl(var(--muted-foreground))]">{t("post.nsfw.hidden.message")}</p>
        </div>
      </Show>

      {/* Normal / warn */}
      <Show when={!shouldHide()}>
        <div class="p-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div class="mb-2">
            <UserCard author={comment.author} compact={false} />
          </div>

          {/* BANNED banner */}
          <Show when={isBanned() || isAuthorBanned()}>
            <div class="mb-2 rounded-md border border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] px-3 py-2 text-xs sm:text-sm font-semibold">
              {isBanned() && isAuthorBanned()
                ? `${t("post.bannedPost")} • ${t("post.bannedAuthor")}`
                : isBanned()
                ? t("post.bannedPost")
                : t("post.bannedAuthor")}
            </div>
          </Show>

          <div class="text-sm prose prose-sm max-w-none relative rounded-[inherit]">
            {/* Encrypted content cover */}
            <Show when={shouldCoverEncrypted()}>
              <div class="absolute inset-0 rounded-[inherit] z-30 flex items-center justify-center">
                <div class="absolute inset-0 rounded-[inherit] bg-[hsl(var(--card))]/90 backdrop-blur-md" />
                <div class="relative z-10 flex flex-col items-center gap-3 text-center px-4">
                  <svg class="w-10 h-10 text-[hsl(var(--muted-foreground))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div class="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {t("comment.encrypted.title") || "Encrypted Comment"}
                  </div>
                  <div class="text-xs text-[hsl(var(--muted-foreground))]">
                    {t("comment.encrypted.description") || "You don't have access to view this comment"}
                  </div>
                </div>
              </div>
            </Show>

            {/* NSFW soft-cover */}
            <Show when={shouldWarn() && !revealed() && !shouldCoverEncrypted()}>
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
            {/* Make PostInfo re-render on actor change and hide actions for comment header */}
            <PostInfo item={{ _raw: comment }} hideTopBorder={true} timeFormat="long" hideActions={true} actorAddr={actorAddress()} />
            <div class="flex items-center gap-2 text-xs font-semibold flex-shrink-0 whitespace-nowrap">
              {/* ReactionInput should also reflect the current actor */}
              <Show when={!!actorAddress()}>
                <ReactionInput post={comment} actorAddr={actorAddress()} />
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
