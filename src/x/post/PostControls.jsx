// src/x/post/PostControls.jsx
import { createSignal, Show, createMemo } from "solid-js";
import { useApp } from "../../context/AppContext.jsx";
import { navigate } from "../../routing/smartRouter.js";
import { preparePostForEditing } from "../../editor/postImporter.js";
import { pushErrorToast } from "../../ui/toast.js";
import PostInfo from "./PostInfo.jsx";
import Spinner from "../ui/Spinner.jsx";
import ConfirmModal from "../modals/ConfirmModal.jsx";
import PromotePostModal from "../modals/PromotePostModal.jsx";
import { EditIcon, TrashIcon } from "../ui/icons/ActionIcons.jsx";
import { useDeleteAction } from "../../hooks/useDeleteAction.js";
import { dbg } from "../../utils/debug.js";

export default function PostControls(props) {
  const app = useApp();
  const { t } = app;

  // Actor-aware (updates when user switches self/NPO)
  const actorAddress = createMemo(() => app.actorAddress?.() || app.authorizedUser?.()?.address || "");

  const [isPreparing, setIsPreparing] = createSignal(false);
  const [showPromote, setShowPromote] = createSignal(false);

  const { showConfirm, openConfirm, closeConfirm, confirmDelete, modalProps } =
    useDeleteAction(() => props.post);

  const isAuthor = createMemo(() => {
    const actor = actorAddress()?.toLowerCase() || "";
    const postAuthor = props.post?.author?.address?.toLowerCase() || "";
    return !!actor && actor === postAuthor;
  });

  const handleEdit = async () => {
    setIsPreparing(true);
    dbg.log("PostControls", "handleEdit invoked", {
      postCid: props.post?.savva_cid,
      actorAddress: actorAddress(),
      isAuthor: isAuthor(),
    });
    try {
      await preparePostForEditing(props.post, app);
      dbg.log("PostControls", "preparePostForEditing completed", { postCid: props.post?.savva_cid });
      navigate(`/editor/edit/${props.post.savva_cid}`);
    } catch (e) {
      dbg.warn("PostControls", "preparePostForEditing failed", { error: String(e?.message || e) });
      pushErrorToast(e, { context: t("editor.errors.prepareForEdit") });
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <>
      <div class="mt-8 pt-4 border-t border-[hsl(var(--border))] flex items-center justify-between">
        <div class="flex-1 min-w-0">
          {/* Pass actorAddr so child re-renders on actor switch */}
          <PostInfo item={props.post} hideTopBorder={true} timeFormat="long" actorAddr={actorAddress()} />
        </div>

        <div class="pl-4">
          <Show when={isAuthor()}>
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleEdit}
                disabled={isPreparing()}
                class="p-2 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-60"
                title={t("post.edit")}
              >
                <Show when={isPreparing()} fallback={<EditIcon class="w-5 h-5" />}>
                  <Spinner class="w-5 h-5" />
                </Show>
              </button>

              <button
                onClick={openConfirm}
                disabled={modalProps().isDeleting}
                class="p-2 rounded text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive-foreground))] disabled:opacity-60"
                title={t("post.delete")}
              >
                <TrashIcon class="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowPromote(true)}
                class="px-4 py-2 text-sm rounded border border-[hsl(var(--input))] hover:bg-[hsl(var(--accent))]"
                title={t("post.promote")}
              >
                {t("post.promote")}
              </button>
            </div>
          </Show>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm()}
        onClose={closeConfirm}
        onConfirm={confirmDelete}
        {...modalProps()}
      />

      <PromotePostModal
        isOpen={showPromote()}
        onClose={() => setShowPromote(false)}
        post={props.post}
      />
    </>
  );
}
